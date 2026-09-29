"""The E2B backend against a recording fake; the real service is exercised in test_sandbox_e2b_live.py."""
import io
import subprocess
import tarfile
import time
from pathlib import Path

import pytest

from walter.sandbox import (
    MAX_SCRATCH_BYTES,
    SAFETY_PATHS,
    ExecutionSpec,
    SandboxUnavailable,
    SandboxViolation,
    WorkspaceManager,
)
from walter.sandbox_e2b import E2BBackend


class CommandExit(Exception):
    def __init__(self, exit_code, stderr=""):
        super().__init__(f"exit {exit_code}")
        self.exit_code, self.stdout, self.stderr = exit_code, "", stderr


class TimeoutException(Exception):
    """Named like the SDK's timeout error, which the backend recognises by name."""


def tar_bytes(members):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as bundle:
        for info, data in members:
            bundle.addfile(info, io.BytesIO(data) if data is not None else None)
    return buffer.getvalue()


def file_member(name, data=b"x"):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    return info, data


class FakeSandbox:
    """Records what the backend asks of E2B; ``respond`` scripts command outcomes."""

    def __init__(self, respond=None, stdout=b"", stderr=b"", outputs=None):
        self.respond = respond or (lambda command, user: "")
        self.stdout, self.stderr = stdout, stderr
        self.outputs = outputs or {}
        self.commands_run: list[tuple[str, str]] = []
        self.uploads: dict[str, bytes] = {}
        self.killed = False
        self.commands = self
        self.files = _Files(self)

    def run(self, command, user=None, timeout=None):
        self.commands_run.append((command, user))
        result = self.respond(command, user)
        return type("Result", (), {"stdout": result or "", "stderr": "", "exit_code": 0})()

    def kill(self):
        self.killed = True

    def uploaded_names(self):
        with tarfile.open(fileobj=io.BytesIO(self.uploads["/var/caveman/in.tgz"]), mode="r:gz") as bundle:
            return set(bundle.getnames())


class _Files:
    def __init__(self, sandbox):
        self.sandbox = sandbox

    def write(self, path, data, user=None):
        self.sandbox.uploads[path] = data.read() if hasattr(data, "read") else data

    def read(self, path, format="text", user=None):
        if path.endswith("/stdout"):
            return self.sandbox.stdout
        if path.endswith("/stderr"):
            return self.sandbox.stderr
        data = self.sandbox.outputs[path]
        return iter([data[:10], data[10:]])


def backend_for(sandbox, created=None):
    def factory(**kwargs):
        if created is not None:
            created.append(kwargs)
        return sandbox
    return E2BBackend(api_key="e2b_test", sandbox_factory=factory)


def spec_for(tmp_path, *, network=False, timeout=30.0, writable=None, environment=()):
    workspace = tmp_path / "workspace"
    workspace.mkdir(exist_ok=True)
    (workspace / "hello.py").write_text("VALUE = 1\n")
    scratch = tmp_path / "scratch"
    scratch.mkdir(exist_ok=True)
    return ExecutionSpec(
        argv=("/opt/walter-env/bin/python", "-m", "pytest", "-q"), workdir="/workspace",
        readonly_mounts=((str(workspace), "/workspace"), (str(tmp_path), "/opt/walter-env"),
                         ("/etc/hosts", "/etc/hosts")),
        writable_mounts=writable or ((str(scratch), "/tmp"),),
        environment=(("PATH", "/opt/walter-env/bin:/usr/bin:/bin"), *environment),
        network=network, timeout=timeout, address_space=1024 ** 3, monitor_scratch=str(scratch))


def test_execution_uploads_candidate_bytes_and_runs_unprivileged_in_a_denied_network(tmp_path):
    created = []
    sandbox = FakeSandbox(respond=lambda command, user: "10\n" if command.startswith("du ") else "",
                          stdout=b"1 passed\n")
    result = backend_for(sandbox, created).run(spec_for(
        tmp_path, environment=(("HTTPS_PROXY", "http://127.0.0.1:3128"), ("HOME", "/tmp"))))

    assert result.returncode == 0 and result.stdout == "1 passed\n"
    assert created[0]["allow_internet_access"] is False
    assert created[0]["template"] == "caveman-sandbox"
    names = sandbox.uploaded_names()
    assert "workspace/hello.py" in names and "tmp" in names
    # Runtimes come from the template; host network files never enter the VM.
    assert not any(name.startswith(("opt/", "etc/")) for name in names)
    setup, _ = sandbox.commands_run[0]
    assert "test -e /opt/walter-env" in setup
    assert "chown -R root:root /workspace && chmod -R a-w /workspace" in setup
    assert "chown -R user:user /tmp" in setup
    command, user = sandbox.commands_run[1]
    assert user == "user"
    assert "/usr/bin/env -i" in command and "HOME=/tmp" in command
    assert "HTTPS_PROXY" not in command
    assert "/usr/bin/timeout --kill-after=2 30" in command
    assert f"--as={1024 ** 3}" in command and "--nproc=32" in command
    assert sandbox.killed


def test_network_spec_creates_an_internet_enabled_vm(tmp_path):
    created = []
    sandbox = FakeSandbox(respond=lambda command, user: "0" if command.startswith("du ") else "")
    backend_for(sandbox, created).run(spec_for(tmp_path, network=True))
    assert created[0]["allow_internet_access"] is True


def test_nonzero_exit_is_returned_not_raised(tmp_path):
    def respond(command, user):
        if user == "user":
            raise CommandExit(1)
        return "0" if command.startswith("du ") else ""
    sandbox = FakeSandbox(respond=respond, stdout=b"1 failed\n")
    result = backend_for(sandbox).run(spec_for(tmp_path))
    assert result.returncode == 1 and result.stdout == "1 failed\n"
    assert sandbox.killed


def test_wall_time_breaches_are_violations_and_the_vm_is_always_killed(tmp_path):
    def slow(command, user):
        if user == "user":
            time.sleep(0.05)
            raise CommandExit(124)
        return "0"
    sandbox = FakeSandbox(respond=slow)
    with pytest.raises(SandboxViolation, match="wall-time"):
        backend_for(sandbox).run(spec_for(tmp_path, timeout=0.01))
    assert sandbox.killed

    def stalled(command, user):
        if user == "user":
            raise TimeoutException("stream deadline")
        return "0"
    sandbox = FakeSandbox(respond=stalled)
    with pytest.raises(SandboxViolation, match="wall-time"):
        backend_for(sandbox).run(spec_for(tmp_path))
    assert sandbox.killed


def test_a_program_exiting_124_quickly_is_not_a_timeout(tmp_path):
    def respond(command, user):
        if user == "user":
            raise CommandExit(124)
        return "0"
    result = backend_for(FakeSandbox(respond=respond)).run(spec_for(tmp_path))
    assert result.returncode == 124


def test_scratch_over_budget_is_a_violation(tmp_path):
    sandbox = FakeSandbox(respond=lambda command, user: f"{MAX_SCRATCH_BYTES + 1}\n"
                          if command.startswith("du ") else "")
    with pytest.raises(SandboxViolation, match="scratch-storage"):
        backend_for(sandbox).run(spec_for(tmp_path))
    assert sandbox.killed


def install_spec(tmp_path, work, cache):
    return ExecutionSpec(
        argv=("/opt/node/bin/node", "npm-cli.js", "ci"), workdir="/work",
        readonly_mounts=(("/opt/node", "/opt/node"),),
        writable_mounts=((str(work), "/work"), (str(cache), "/npm-cache")),
        environment=(), network=True, timeout=300, address_space=None, file_size=None, processes=None)


def test_writable_mounts_are_copied_back_through_the_data_filter(tmp_path):
    work, cache = tmp_path / "work", tmp_path / "cache"
    work.mkdir(); cache.mkdir()
    (work / "package.json").write_text("{}")
    link = tarfile.TarInfo("./node_modules/.bin/tool")
    link.type, link.linkname = tarfile.SYMTYPE, "../tool/cli.js"
    outputs = {"/var/caveman/out-0.tgz": tar_bytes([file_member("./node_modules/tool/cli.js", b"ok"),
                                                     (link, None)]),
               "/var/caveman/out-1.tgz": tar_bytes([file_member("./_cacache/index", b"i")])}
    sandbox = FakeSandbox(respond=lambda command, user: "100" if command.startswith("du ") else "",
                          outputs=outputs)
    result = backend_for(sandbox).run(install_spec(tmp_path, work, cache))
    assert result.returncode == 0
    assert (work / "node_modules/tool/cli.js").read_bytes() == b"ok"
    assert (work / "node_modules/.bin/tool").resolve() == (work / "node_modules/tool/cli.js").resolve()
    assert (work / "package.json").read_text() == "{}"
    assert (cache / "_cacache/index").read_bytes() == b"i"
    # The template's runtime is not uploaded, it is checked for.
    assert "test -e /opt/node" in sandbox.commands_run[0][0]
    assert not any(name.startswith("opt/") for name in sandbox.uploaded_names())


@pytest.mark.parametrize("hostile", [
    file_member("../escape.txt"),
    (lambda info: (setattr(info, "type", tarfile.SYMTYPE), setattr(info, "linkname", "/etc/passwd"), (info, None))[2])(
        tarfile.TarInfo("./node_modules/evil")),
])
def test_hostile_copy_back_is_refused(tmp_path, hostile):
    work, cache = tmp_path / "work", tmp_path / "cache"
    work.mkdir(); cache.mkdir()
    outputs = {"/var/caveman/out-0.tgz": tar_bytes([hostile])}
    sandbox = FakeSandbox(respond=lambda command, user: "1" if command.startswith("du ") else "",
                          outputs=outputs)
    with pytest.raises(SandboxViolation, match="unsafe"):
        backend_for(sandbox).run(install_spec(tmp_path, work, cache))
    assert not (tmp_path / "escape.txt").exists()
    assert not (work / "node_modules/evil").exists()
    assert sandbox.killed


def test_absolute_copy_back_paths_stay_inside_the_mount(tmp_path):
    work, cache = tmp_path / "work", tmp_path / "cache"
    work.mkdir(); cache.mkdir()
    outputs = {"/var/caveman/out-0.tgz": tar_bytes([file_member("/etc/escape.txt")]),
               "/var/caveman/out-1.tgz": tar_bytes([])}
    sandbox = FakeSandbox(respond=lambda command, user: "1" if command.startswith("du ") else "",
                          outputs=outputs)
    backend_for(sandbox).run(install_spec(tmp_path, work, cache))
    assert (work / "etc/escape.txt").is_file()
    assert not Path("/etc/escape.txt").exists()


def test_oversized_copy_back_is_refused_before_download(tmp_path):
    work, cache = tmp_path / "work", tmp_path / "cache"
    work.mkdir(); cache.mkdir()
    sandbox = FakeSandbox(respond=lambda command, user: "2000000000" if command.startswith("du ") else "")
    with pytest.raises(SandboxViolation, match="copy-back"):
        backend_for(sandbox).run(install_spec(tmp_path, work, cache))
    assert not any(command.startswith("tar -czf") for command, _ in sandbox.commands_run)


def test_backend_failures_fail_closed(tmp_path, monkeypatch):
    monkeypatch.delenv("E2B_API_KEY", raising=False)
    with pytest.raises(SandboxUnavailable, match="E2B_API_KEY"):
        E2BBackend()

    def refuse(**_):
        raise RuntimeError("401 unauthorized")
    with pytest.raises(SandboxUnavailable, match="could not be created"):
        E2BBackend(api_key="e2b_test", sandbox_factory=refuse).run(spec_for(tmp_path))

    def no_runtime(command, user):
        if "test -e /opt/walter-env" in command:
            raise CommandExit(90, "template lacks /opt/walter-env")
        return "0"
    sandbox = FakeSandbox(respond=no_runtime)
    with pytest.raises(SandboxUnavailable, match="template is missing a runtime"):
        backend_for(sandbox).run(spec_for(tmp_path))
    assert sandbox.killed

    def broken(command, user):
        raise ConnectionError("envd unreachable")
    sandbox = FakeSandbox(respond=broken)
    with pytest.raises(SandboxUnavailable, match="envd unreachable"):
        backend_for(sandbox).run(spec_for(tmp_path))
    assert sandbox.killed


def test_unsafe_mount_targets_are_refused(tmp_path):
    spec = spec_for(tmp_path)
    for target in ("/", "relative", "/workspace/../etc"):
        bad = ExecutionSpec(**{**spec.__dict__, "readonly_mounts": ((str(tmp_path), target),)})
        with pytest.raises(SandboxViolation, match="Unsafe mount target"):
            backend_for(FakeSandbox()).run(bad)


def test_workspace_manager_runs_candidate_checks_through_e2b(tmp_path):
    repo = tmp_path / "project"
    repo.mkdir()
    (repo / "hello.py").write_text("VALUE = 1\n")
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "i"],
                   check=True)
    sandbox = FakeSandbox(respond=lambda command, user: "0" if command.startswith("du ") else "",
                          stdout=b"1 passed\n")
    manager = WorkspaceManager(repo, backend=backend_for(sandbox))
    grant = manager.create_candidate("run", "task", "author")
    manager.write_file(grant.id, "tests/test_hello.py",
                       "from hello import VALUE\ndef test_value(): assert VALUE == 1\n", worker_id="author")
    result = manager.run_command(grant.id, "test", ["python", "-m", "pytest", "-q", "tests/test_hello.py"],
                                 worker_id="author")
    assert result.stdout == "1 passed\n"
    assert {"workspace/hello.py", "workspace/tests/test_hello.py"} <= sandbox.uploaded_names()
    assert not any(".git" in name for name in sandbox.uploaded_names())
    assert "/opt/walter-env/bin/python -m pytest -q tests/test_hello.py" in sandbox.commands_run[1][0]


def test_the_e2b_backend_is_a_protected_path():
    assert "src/walter/sandbox_e2b.py" in SAFETY_PATHS
    assert Path(__file__).resolve().parents[1].joinpath("src/walter/sandbox_e2b.py").is_file()


TOKEN = "t" * 40


def test_settings_select_the_backend_and_refuse_unknown_values(tmp_path, monkeypatch):
    from caveman.config import Settings, SettingsError
    base = {"CAVEMAN_API_TOKEN": TOKEN, "CAVEMAN_DATA_DIR": str(tmp_path)}
    assert Settings.from_env(base).sandbox_backend == "bubblewrap"
    assert Settings.from_env(base).execution_backend() is None
    chosen = Settings.from_env({**base, "CAVEMAN_SANDBOX_BACKEND": "E2B", "CAVEMAN_E2B_TEMPLATE": "caveman-sandbox:v2"})
    assert (chosen.sandbox_backend, chosen.e2b_template) == ("e2b", "caveman-sandbox:v2")
    monkeypatch.setenv("E2B_API_KEY", "e2b_test")
    backend = chosen.execution_backend()
    assert isinstance(backend, E2BBackend) and backend.template == "caveman-sandbox:v2"
    with pytest.raises(SettingsError, match="CAVEMAN_SANDBOX_BACKEND"):
        Settings.from_env({**base, "CAVEMAN_SANDBOX_BACKEND": "docker"})
    with pytest.raises(SettingsError, match="CAVEMAN_E2B_TEMPLATE"):
        Settings.from_env({**base, "CAVEMAN_SANDBOX_BACKEND": "e2b", "CAVEMAN_E2B_TEMPLATE": "bad name;rm"})


def test_health_probe_checks_e2b_configuration_without_starting_a_vm(monkeypatch):
    import caveman.sandbox_probe as sandbox_probe
    monkeypatch.setattr(sandbox_probe.importlib.util, "find_spec", lambda name: object())
    monkeypatch.delenv("E2B_API_KEY", raising=False)
    assert sandbox_probe.probe(max_age=0, backend="e2b") == (False, "E2B is selected but E2B_API_KEY is not set.")
    monkeypatch.setenv("E2B_API_KEY", "e2b_test")
    usable, detail = sandbox_probe.probe(max_age=0, backend="e2b")
    assert usable and "E2B microVMs" in detail
    monkeypatch.setattr(sandbox_probe.importlib.util, "find_spec", lambda name: None)
    usable, detail = sandbox_probe.probe(max_age=0, backend="e2b")
    assert not usable and "not installed" in detail


def test_worker_start_runs_the_isolation_probe_in_a_real_backend(tmp_path, monkeypatch):
    from caveman import worker as worker_module
    from caveman.config import Settings
    from caveman.sandbox_probe import probe_execution
    import caveman.sandbox_probe as sandbox_probe

    sandbox = FakeSandbox(respond=lambda command, user: "0" if command.startswith("du ") else "",
                          stdout=b"isolated\n")
    assert probe_execution(backend_for(sandbox)) == (True, "e2b isolation probe passed.")
    command = sandbox.commands_run[1][0]
    assert "/opt/walter-env/bin/python -c" in command and sandbox.killed

    leaky = FakeSandbox(respond=lambda command, user: "0" if command.startswith("du ") else "",
                        stderr=b"AssertionError: network available\n")
    usable, detail = probe_execution(backend_for(leaky))
    assert not usable and "network available" in detail

    settings = Settings(data_dir=tmp_path / "data", api_token=TOKEN, sandbox_backend="e2b")
    monkeypatch.setattr(sandbox_probe, "probe", lambda **_: (True, "configured"))
    monkeypatch.setattr(sandbox_probe, "probe_execution", lambda backend: (False, "e2b isolation probe failed: x"))
    monkeypatch.setenv("E2B_API_KEY", "e2b_test")
    with pytest.raises(SystemExit, match="refuses to start: e2b isolation probe failed"):
        worker_module.main(settings)
