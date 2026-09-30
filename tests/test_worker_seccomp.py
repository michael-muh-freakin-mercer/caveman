"""The worker container's seccomp profile: Docker's default plus user namespaces, no more."""
import importlib.util
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROFILE = json.loads((REPO / "deploy" / "seccomp-worker.json").read_text())

_spec = importlib.util.spec_from_file_location("worker_seccomp", REPO / "scripts" / "worker_seccomp.py")
worker_seccomp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(worker_seccomp)


def _unconditionally_allowed() -> set[str]:
    return {name for rule in PROFILE["syscalls"]
            if rule["action"] == "SCMP_ACT_ALLOW" and not rule.get("includes") and not rule.get("args")
            for name in rule["names"]}


def test_profile_denies_by_default_and_adds_only_the_namespace_calls():
    assert PROFILE["defaultAction"] == "SCMP_ACT_ERRNO"
    *docker_default, added = PROFILE["syscalls"]
    assert added == {"names": worker_seccomp.NAMESPACE_SYSCALLS, "action": "SCMP_ACT_ALLOW",
                     "comment": worker_seccomp.COMMENT}
    assert worker_seccomp.NAMESPACE_SYSCALLS == ["clone", "mount", "pivot_root", "sethostname", "umount2", "unshare"]
    # The committed file is exactly what the script builds from the rules before it.
    assert worker_seccomp.build({**PROFILE, "syscalls": docker_default}) == PROFILE


def test_profile_still_refuses_what_unconfined_would_allow():
    allowed = _unconditionally_allowed()
    for name in ("bpf", "perf_event_open", "kexec_load", "kexec_file_load", "open_by_handle_at", "setns",
                 "init_module", "finit_module", "delete_module", "userfaultfd", "fsopen", "move_mount",
                 "open_tree", "reboot", "swapon", "acct", "iopl", "clone3"):
        assert name not in allowed, name


def test_compose_worker_uses_the_profile_not_unconfined_seccomp():
    compose = (REPO / "deploy" / "compose.yaml").read_text()
    assert "- seccomp=seccomp-worker.json" in compose
    assert "- seccomp=unconfined" not in compose
