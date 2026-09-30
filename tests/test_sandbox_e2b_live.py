"""The E2B backend against the real service (opt-in: spends E2B credit).

    CAVMAN_E2B_LIVE=1 E2B_API_KEY=... python -m pytest -q -m e2b

Needs the template built by scripts/e2b_template.py (CAVMAN_E2B_TEMPLATE
overrides its name). CI runs this in the "E2B sandbox" workflow.
"""
import os
import subprocess
import sys

import pytest

from walter.sandbox import ExecutionSpec, SandboxViolation, WorkspaceManager, _detect_node_root

pytestmark = [
    pytest.mark.e2b,
    pytest.mark.skipif(os.environ.get("CAVMAN_E2B_LIVE") != "1" or not os.environ.get("E2B_API_KEY"),
                       reason="set CAVMAN_E2B_LIVE=1 and E2B_API_KEY to run against E2B"),
]

TEMPLATE = os.environ.get("CAVMAN_E2B_TEMPLATE", "cavman-sandbox")

CONNECT = """import socket
try:
    socket.create_connection(("1.1.1.1", 443), timeout=5).close()
except OSError as exc:
    print("blocked", type(exc).__name__)
else:
    print("connected")
"""


@pytest.fixture
def backend():
    pytest.importorskip("e2b")
    from walter.sandbox_e2b import E2BBackend
    return E2BBackend(template=TEMPLATE)


@pytest.fixture
def workspace(tmp_path, backend):
    repo = tmp_path / "project"
    (repo / "tests").mkdir(parents=True)
    (repo / "hello.py").write_text("VALUE = 1\n")
    (repo / "tests/test_hello.py").write_text("from hello import VALUE\n\ndef test_value(): assert VALUE == 1\n")
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "i"],
                   check=True)
    manager = WorkspaceManager(repo, backend=backend)
    return manager, manager.create_candidate("run", "task", "author"), repo


def python_spec(tmp_path, code, *, network=False, timeout=60.0):
    scratch = tmp_path / "scratch"
    scratch.mkdir(exist_ok=True)
    return ExecutionSpec(argv=("/opt/walter-env/bin/python", "-c", code), workdir="/tmp",
                         readonly_mounts=((sys.prefix, "/opt/walter-env"),),
                         writable_mounts=((str(scratch), "/tmp"),), environment=(("PATH", "/usr/bin:/bin"),),
                         network=network, timeout=timeout, monitor_scratch=str(scratch))


def test_isolation_probe_passes_in_a_real_vm(backend):
    from cavman.sandbox_probe import probe_execution
    usable, detail = probe_execution(backend)
    assert usable, detail


def test_candidate_pytest_runs_in_e2b_and_failures_are_reported(workspace):
    manager, grant, repo = workspace
    passed = manager.run_command(grant.id, "test", ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider",
                                                    "tests/test_hello.py"], worker_id="author")
    assert passed.returncode == 0, passed.stderr
    assert "1 passed" in passed.stdout
    manager.write_file(grant.id, "hello.py", "VALUE = 2\n", worker_id="author")
    failed = manager.run_command(grant.id, "test", ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider",
                                                    "tests/test_hello.py"], worker_id="author")
    assert failed.returncode == 1
    assert "1 failed" in failed.stdout
    assert (repo / "hello.py").read_text() == "VALUE = 1\n"


def test_network_is_denied_unless_the_spec_allows_it(backend, tmp_path):
    denied = backend.run(python_spec(tmp_path, CONNECT))
    assert denied.stdout.startswith("blocked"), denied.stdout + denied.stderr
    allowed = backend.run(python_spec(tmp_path, CONNECT, network=True))
    assert allowed.stdout.strip() == "connected", allowed.stdout + allowed.stderr


def test_environment_is_cleared_and_runtime_is_read_only(backend, tmp_path):
    code = ("import os, pathlib\n"
            "print(sorted(k for k in os.environ if k not in {'PATH', 'LC_CTYPE'}))\n"
            "print(os.getuid() != 0)\n"
            "import subprocess\n"
            "print(subprocess.run(['sudo', '-n', 'true'], capture_output=True).returncode != 0)\n"
            "for p in ('/opt/walter-env/x', '/opt/node/x', '/usr/x'):\n"
            "    try: pathlib.Path(p).write_text('x')\n"
            "    except OSError: print('denied', p)\n")
    result = backend.run(python_spec(tmp_path, code))
    lines = result.stdout.splitlines()
    assert lines[0] == "[]", result.stdout + result.stderr
    assert lines[1] == "True"
    assert lines[2] == "True"  # no sudo, even passwordless
    assert lines[3:] == ["denied /opt/walter-env/x", "denied /opt/node/x", "denied /usr/x"]


def test_wall_time_is_enforced(backend, tmp_path):
    with pytest.raises(SandboxViolation, match="wall-time"):
        backend.run(python_spec(tmp_path, "import time; time.sleep(30)", timeout=3))


@pytest.mark.skipif(_detect_node_root() is None, reason="host Node 22+ needed for the Node templates")
def test_npm_install_and_node_tests_run_in_e2b(workspace):
    manager, grant, _ = workspace
    manager.write_file(grant.id, "package.json",
                       '{"name": "probe", "version": "1.0.0", "type": "module",'
                       ' "dependencies": {"is-number": "7.0.0"}}\n', worker_id="author")
    manager.write_file(grant.id, "number.test.mjs",
                       "import test from 'node:test';\nimport assert from 'node:assert';\n"
                       "import isNumber from 'is-number';\n"
                       "test('is-number', () => assert.equal(isNumber(5), true));\n", worker_id="author")
    modules = manager.node_dependencies(grant.id, worker_id="author")
    assert (modules / "is-number/package.json").is_file()
    result = manager.run_command(grant.id, "test", ["node", "--test", "number.test.mjs"], worker_id="author",
                                 node_modules=modules, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "pass 1" in result.stdout
