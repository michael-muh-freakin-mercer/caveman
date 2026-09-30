"""Check that the configured isolation backend is actually usable here.

Bubblewrap: file presence is not enough; in many containers ``bwrap`` exists
but cannot create user namespaces or mount ``/proc``. E2B: the health check only
confirms the SDK and key are present (it must not start a VM on every scrape);
a worker starting with E2B runs the full isolation probe in a real VM. A worker
that cannot isolate candidate code would fail every executable check, so it
refuses to start.
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from walter.sandbox import ISOLATION_PROBE, ExecutionSpec, SandboxUnavailable, SandboxViolation, _loader_dir_target

_cache: tuple[float, str, bool, str] | None = None


def probe(*, max_age: float = 60.0, backend: str = "bubblewrap") -> tuple[bool, str]:
    global _cache
    now = time.monotonic()
    if _cache is not None and _cache[1] == backend and now - _cache[0] < max_age:
        return _cache[2], _cache[3]
    if backend == "e2b":
        if importlib.util.find_spec("e2b") is None:
            result = (False, "E2B is selected but the e2b package is not installed (pip install 'cavman[e2b]').")
        elif not os.environ.get("E2B_API_KEY", "").strip():
            result = (False, "E2B is selected but E2B_API_KEY is not set.")
        else:
            result = (True, "E2B is configured; candidate code runs in E2B microVMs.")
    elif not Path("/usr/bin/bwrap").exists():
        result = (False, "Bubblewrap is not installed at /usr/bin/bwrap.")
    elif not Path("/usr/bin/prlimit").exists():
        result = (False, "prlimit (util-linux) is not installed at /usr/bin/prlimit.")
    else:
        argv = ["/usr/bin/bwrap", "--unshare-all", "--die-with-parent", "--ro-bind", "/usr", "/usr",
                "--symlink", "usr/bin", "/bin", "--symlink", "usr/lib", "/lib",
                "--symlink", _loader_dir_target(), "/lib64",
                "--proc", "/proc", "--dev", "/dev", "--clearenv", "/usr/bin/true"]
        try:
            completed = subprocess.run(argv, capture_output=True, text=True, timeout=15)
            ok = completed.returncode == 0
            detail = "Bubblewrap isolation is usable." if ok else (
                "Bubblewrap cannot create an isolated namespace here: "
                + (completed.stderr.strip() or f"exit {completed.returncode}"))
            result = (ok, detail)
        except (OSError, subprocess.TimeoutExpired) as exc:
            result = (False, f"Bubblewrap could not be executed: {exc}")
    _cache = (now, backend, *result)
    return result


# ISOLATION_PROBE's connect() to a reserved address fails even with open
# internet, so a remote backend must also show that sockets cannot be created.
SOCKETS_DENIED = """import socket
try:
    socket.socket()
except PermissionError:
    pass
else:
    raise AssertionError('network available: socket() succeeded')
"""


def probe_execution(execution_backend) -> tuple[bool, str]:
    """Run the isolation probe through a real backend (used when a worker starts with E2B)."""
    with tempfile.TemporaryDirectory(prefix="cavman-probe-") as temporary:
        workspace, scratch = Path(temporary) / "workspace", Path(temporary) / "scratch"
        workspace.mkdir(); scratch.mkdir()
        spec = ExecutionSpec(
            argv=("/opt/walter-env/bin/python", "-c", SOCKETS_DENIED + ISOLATION_PROBE), workdir="/workspace",
            readonly_mounts=((str(workspace), "/workspace"), (sys.prefix, "/opt/walter-env")),
            writable_mounts=((str(scratch), "/tmp"),), environment=(("PATH", "/usr/bin:/bin"),),
            network=False, timeout=60, monitor_scratch=str(scratch))
        try:
            completed = execution_backend.run(spec)
        except (SandboxUnavailable, SandboxViolation) as exc:
            return False, f"{execution_backend.name} isolation probe failed: {exc}"
    if completed.returncode != 0 or completed.stdout.strip() != "isolated":
        return False, (f"{execution_backend.name} isolation probe failed: "
                       + (completed.stderr.strip() or completed.stdout.strip())[-500:])
    return True, f"{execution_backend.name} isolation probe passed."
