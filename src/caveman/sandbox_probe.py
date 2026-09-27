"""Check that the Bubblewrap isolation backend is actually usable here.

File presence is not enough: in many containers ``bwrap`` exists but cannot
create user namespaces or mount ``/proc``. A worker that cannot isolate
candidate code would fail every executable check, so it refuses to start.
"""
from __future__ import annotations

import subprocess
import time
from pathlib import Path

from walter.sandbox import _loader_dir_target

_cache: tuple[float, bool, str] | None = None


def probe(*, max_age: float = 60.0) -> tuple[bool, str]:
    global _cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < max_age:
        return _cache[1], _cache[2]
    if not Path("/usr/bin/bwrap").exists():
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
    _cache = (now, *result)
    return result
