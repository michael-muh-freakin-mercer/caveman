#!/usr/bin/env python3
"""Build deploy/seccomp-worker.json from Docker's default seccomp profile.

A worker container running Bubblewrap needs the handful of system calls that
create and populate a user namespace, which Docker's default profile reserves
for CAP_SYS_ADMIN. This adds exactly those to the default and nothing else, so
the worker keeps the rest of Docker's filter instead of running unconfined.

Usage: scripts/worker_seccomp.py path/to/docker/default.json > deploy/seccomp-worker.json

Docker's profile: https://github.com/moby/profiles/blob/main/seccomp/default.json
Regenerate when Docker's default changes; tests/test_worker_seccomp.py checks
the result still denies by default and allows no more than NAMESPACE_SYSCALLS.
"""
import json
import sys

# What bwrap calls to build its sandbox: clone() with namespace flags (clone3
# stays ENOSYS, so libc falls back to clone), unshare() for the nested user and
# cgroup namespaces, and mount/umount2/pivot_root/sethostname inside them. The
# kernel still checks each against the caller's namespace: outside a user
# namespace the unprivileged worker gets EPERM from all but clone and unshare.
NAMESPACE_SYSCALLS = ["clone", "mount", "pivot_root", "sethostname", "umount2", "unshare"]
COMMENT = "Caveman worker: lets Bubblewrap create and populate a user namespace"


def build(default: dict) -> dict:
    profile = json.loads(json.dumps(default))
    profile["syscalls"].append({"names": NAMESPACE_SYSCALLS, "action": "SCMP_ACT_ALLOW", "comment": COMMENT})
    return profile


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as handle:
        json.dump(build(json.load(handle)), sys.stdout, indent="\t")
    sys.stdout.write("\n")
