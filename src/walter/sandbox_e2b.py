"""E2B execution backend: every ExecutionSpec runs in a fresh, throwaway microVM.

Bubblewrap isolates candidate code with Linux namespaces on the worker host. This
backend gives each execution its own E2B sandbox (a Firecracker microVM) instead,
so candidate code never runs on the worker host at all. It honours the same
``ExecutionSpec`` contract:

- Mounts are copied, not bound. Read-only sources are uploaded, owned by root and
  made unwritable; the command runs as the unprivileged ``user`` account, so it
  cannot change them. Writable sources are uploaded, owned by ``user``, and copied
  back to the host after the command (additions and changes; deletions are not
  propagated). The monitored scratch directory is the exception: it is measured
  and then discarded with the VM. Copy-back goes through ``tarfile``'s ``data`` filter, so a
  hostile VM cannot write outside the target or plant absolute links.
- The runtimes (``/opt/walter-env`` and ``/opt/node``) come from the sandbox
  template, not the host: see ``scripts/e2b_template.py``. The host's resolver,
  CA and proxy settings describe the worker's network, not the VM's, so they are
  not copied in.
- ``network=False`` creates the VM with internet access denied. The command runs
  with a cleared environment under ``timeout`` and ``prlimit`` with the spec's
  limits. Aggregate memory is bounded by the template's VM size, and scratch
  usage is measured after the run.
- The VM is killed after every execution, whatever happened.

Anything unexpected from E2B fails closed with ``SandboxUnavailable``; there is
never a host fallback.
"""
from __future__ import annotations

import logging
import os
import shlex
import tarfile
import tempfile
import time
from collections.abc import Callable
from pathlib import Path, PurePosixPath
from typing import Any

from .sandbox import (
    MAX_OUTPUT_BYTES,
    MAX_SCRATCH_BYTES,
    PROXY_ENVIRONMENT,
    CommandResult,
    ExecutionSpec,
    SandboxUnavailable,
    SandboxViolation,
)

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE = "caveman-sandbox"
# Provided by the template (scripts/e2b_template.py) rather than uploaded.
TEMPLATE_RUNTIMES = frozenset({"/opt/walter-env", "/opt/node"})
# Host network configuration; meaningless inside a remote VM.
HOST_ONLY_TARGETS = frozenset({"/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/ssl",
                               "/etc/caveman-extra-ca.pem"})
HOST_ONLY_ENVIRONMENT = frozenset(PROXY_ENVIRONMENT) | {"NODE_EXTRA_CA_CERTS"}
RUN_USER = "user"
TRANSFER = "/var/caveman"
MAX_COPY_BACK_BYTES = 1_000_000_000
# E2B's Hobby tier caps a sandbox's lifetime at one hour.
MAX_LIFETIME_SECONDS = 3600
SETUP_SECONDS = 300
TEMPLATE_MISSING = 90

SandboxFactory = Callable[..., Any]


def _target(path: str) -> str:
    target = PurePosixPath(path)
    if not target.is_absolute() or ".." in target.parts or str(target) == "/":
        raise SandboxViolation(f"Unsafe mount target for E2B execution: {path}")
    return str(target)


def _pack(mounts: list[tuple[str, str]], archive: Path) -> None:
    def owned_by_root(info: tarfile.TarInfo) -> tarfile.TarInfo:
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        return info

    with tarfile.open(archive, "w:gz") as bundle:
        for source, target in mounts:
            bundle.add(source, arcname=target.lstrip("/"), recursive=True, filter=owned_by_root)


def _unpack(archive: Path, destination: Path) -> None:
    try:
        with tarfile.open(archive, "r:gz") as bundle:
            bundle.extractall(destination, filter="data")
    except (tarfile.TarError, OSError) as exc:
        raise SandboxViolation(f"E2B sandbox returned unsafe or unreadable output: {exc}") from exc


def _limits(spec: ExecutionSpec) -> list[str]:
    limits = ["/usr/bin/prlimit", f"--cpu={spec.cpu_seconds}", f"--nofile={spec.open_files}"]
    if spec.address_space is not None:
        limits.append(f"--as={spec.address_space}")
    if spec.file_size is not None:
        limits.append(f"--fsize={spec.file_size}")
    if spec.processes is not None:
        limits.append(f"--nproc={spec.processes}")
    return limits


def _script(*lines: str) -> str:
    return "set -eu\n" + "\n".join(lines)


class E2BBackend:
    """Run each execution in a fresh E2B microVM built from the Caveman template."""

    name = "e2b"

    def __init__(self, api_key: str | None = None, template: str = DEFAULT_TEMPLATE, *,
                 sandbox_factory: SandboxFactory | None = None):
        self._api_key = api_key if api_key is not None else os.environ.get("E2B_API_KEY", "")
        if not self._api_key.strip():
            raise SandboxUnavailable("E2B_API_KEY is not set; host fallback prohibited")
        self.template = template
        self._factory = sandbox_factory

    def _create(self, network: bool, lifetime: int):
        factory = self._factory
        if factory is None:
            try:
                from e2b import Sandbox
            except ImportError as exc:
                raise SandboxUnavailable(
                    "The e2b package is not installed (pip install 'caveman[e2b]'); "
                    "host fallback prohibited") from exc
            factory = Sandbox.create
        return factory(template=self.template, timeout=lifetime, allow_internet_access=network,
                       api_key=self._api_key, metadata={"service": "caveman"})

    def run(self, spec: ExecutionSpec) -> CommandResult:
        writable = [(source, _target(target)) for source, target in spec.writable_mounts]
        readonly = [(source, _target(target)) for source, target in spec.readonly_mounts]
        for source, target in writable:
            if not Path(source).is_dir():
                raise SandboxViolation(f"E2B execution supports directory writable mounts only: {target}")
        provided = [target for _, target in readonly if target in TEMPLATE_RUNTIMES]
        uploaded = [(source, target) for source, target in readonly
                    if target not in TEMPLATE_RUNTIMES and target not in HOST_ONLY_TARGETS]
        with tempfile.TemporaryDirectory(prefix="caveman-e2b-") as staging:
            archive = Path(staging) / "in.tgz"
            _pack(writable + uploaded, archive)
            lifetime = min(MAX_LIFETIME_SECONDS, int(spec.timeout) + SETUP_SECONDS)
            try:
                sandbox = self._create(spec.network, lifetime)
            except SandboxUnavailable:
                raise
            except Exception as exc:
                raise SandboxUnavailable(f"E2B sandbox could not be created: {exc}") from exc
            try:
                return self._execute(sandbox, spec, archive, Path(staging), writable,
                                     [target for _, target in uploaded], provided)
            except (SandboxViolation, SandboxUnavailable):
                raise
            except Exception as exc:
                raise SandboxUnavailable(f"E2B execution failed: {exc}") from exc
            finally:
                try:
                    sandbox.kill()
                except Exception:
                    logger.warning("Could not kill E2B sandbox; it expires on its own timeout",
                                   exc_info=True)

    @staticmethod
    def _root(sandbox, script: str, timeout: float = SETUP_SECONDS) -> str:
        """Run trusted setup or collection as root; any failure is a backend failure."""
        try:
            result = sandbox.commands.run(script, user="root", timeout=timeout)
        except Exception as exc:
            code = getattr(exc, "exit_code", None)
            if code == TEMPLATE_MISSING:
                raise SandboxUnavailable(
                    "E2B template is missing a runtime; rebuild it with scripts/e2b_template.py: "
                    + (getattr(exc, "stderr", "") or "").strip()) from exc
            if code is None:
                raise
            raise SandboxUnavailable(
                f"E2B sandbox step failed ({code}): {(getattr(exc, 'stderr', '') or '').strip()[-500:]}") from exc
        return result.stdout

    def _execute(self, sandbox, spec: ExecutionSpec, archive: Path, staging: Path,
                 writable: list[tuple[str, str]], readonly: list[str], provided: list[str]) -> CommandResult:
        q = shlex.quote
        with archive.open("rb") as handle:
            sandbox.files.write(f"{TRANSFER}/in.tgz", handle, user="root")
        setup = [f'test -e {q(target)} || {{ echo "template lacks {target}" >&2; exit {TEMPLATE_MISSING}; }}'
                 for target in provided]
        setup += [f"tar -xzf {TRANSFER}/in.tgz -C / --no-same-owner", f"rm -f {TRANSFER}/in.tgz"]
        setup += [f"chown -R {RUN_USER}:{RUN_USER} {q(target)}" for _, target in writable]
        setup += [f"chown -R root:root {q(target)} && chmod -R a-w {q(target)}" for target in readonly]
        setup += [f"install -d -o {RUN_USER} -m 700 {TRANSFER}/io", f"test -d {q(spec.workdir)}"]
        self._root(sandbox, _script(*setup))

        environment = [f"{name}={value}" for name, value in spec.environment
                       if name not in HOST_ONLY_ENVIRONMENT]
        inner = ["/usr/bin/env", "-i", *environment, "/usr/bin/timeout", "--kill-after=2",
                 f"{spec.timeout:g}", *_limits(spec), "--", *spec.argv]
        command = (f"cd {q(spec.workdir)} && {shlex.join(inner)} "
                   f">{TRANSFER}/io/stdout 2>{TRANSFER}/io/stderr")
        started = time.monotonic()
        try:
            sandbox.commands.run(command, user=RUN_USER, timeout=spec.timeout + 30)
            returncode = 0
        except Exception as exc:
            if type(exc).__name__ == "TimeoutException":
                raise SandboxViolation("Sandbox command exceeded wall-time budget") from exc
            returncode = getattr(exc, "exit_code", None)
            if returncode is None:
                raise
        if returncode in (124, 137) and time.monotonic() - started >= spec.timeout:
            raise SandboxViolation("Sandbox command exceeded wall-time budget")

        scratch = next((target for source, target in writable if source == spec.monitor_scratch), None)
        if scratch is not None:
            used = int(self._root(sandbox, f"du -sb {q(scratch)} | cut -f1").strip() or 0)
            if used > MAX_SCRATCH_BYTES:
                raise SandboxViolation("Sandbox aggregate scratch-storage limit exceeded")

        self._root(sandbox, _script(
            f"head -c {MAX_OUTPUT_BYTES} {TRANSFER}/io/stdout > {TRANSFER}/stdout",
            f"head -c {MAX_OUTPUT_BYTES} {TRANSFER}/io/stderr > {TRANSFER}/stderr"))
        stdout = bytes(sandbox.files.read(f"{TRANSFER}/stdout", format="bytes", user="root"))
        stderr = bytes(sandbox.files.read(f"{TRANSFER}/stderr", format="bytes", user="root"))

        budget = MAX_COPY_BACK_BYTES
        for index, (source, target) in enumerate(writable):
            if source == spec.monitor_scratch:
                continue  # private scratch: measured above, discarded with the VM
            size = int(self._root(sandbox, f"du -sb {q(target)} | cut -f1").strip() or 0)
            budget -= size
            if budget < 0:
                raise SandboxViolation("Sandbox output exceeds the copy-back limit")
            remote = f"{TRANSFER}/out-{index}.tgz"
            self._root(sandbox, f"tar -czf {remote} -C {q(target)} .")
            local = staging / f"out-{index}.tgz"
            with local.open("wb") as handle:
                for chunk in sandbox.files.read(remote, format="stream", user="root"):
                    handle.write(chunk)
            _unpack(local, Path(source))
        return CommandResult(returncode, stdout.decode(errors="replace"), stderr.decode(errors="replace"))
