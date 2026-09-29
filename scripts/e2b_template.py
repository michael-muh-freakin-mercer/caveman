"""Build the E2B sandbox template that Caveman's E2B backend runs candidate code in.

    E2B_API_KEY=... python scripts/e2b_template.py [--name caveman-sandbox]

The template mirrors what the Bubblewrap backend binds from the worker host:
a Python environment with pytest at /opt/walter-env and Node 22 (with npm) at
/opt/node, both owned by root so candidate code cannot change them. Candidate
code runs as ``sandbox``, an account with no sudo (E2B's default ``user`` has
passwordless sudo, so it is never used for candidate code). Offline checks load
a network-deny seccomp filter through the base image's libseccomp. E2B caches
unchanged layers, so rebuilding after a small change is quick.

Rebuild when this file changes; workers pick the new build up on their next
sandbox (set CAVEMAN_E2B_TEMPLATE if you use a name other than the default).
"""
from __future__ import annotations

import argparse
import os
import sys

# Candidate checks run pytest from this environment (same bound as pyproject.toml).
PYTEST = "pytest>=9.1.1,<10"
NODE_LINE = "latest-v22.x"
CPU_COUNT = 2
# Above the sandbox's 1 GiB aggregate-RSS budget, with room for the OS and envd.
MEMORY_MB = 2048


def template():
    from e2b import Template

    node = (
        f"cd /tmp && curl -fsSLO https://nodejs.org/dist/{NODE_LINE}/SHASUMS256.txt"
        " && FILE=$(grep -o 'node-v22\\.[0-9.]*-linux-x64\\.tar\\.xz' SHASUMS256.txt | head -1)"
        f" && curl -fsSLO https://nodejs.org/dist/{NODE_LINE}/$FILE"
        " && grep \" $FILE\\$\" SHASUMS256.txt | sha256sum -c -"
        " && mkdir -p /opt/node && tar -xJf $FILE -C /opt/node --strip-components=1"
        " && rm -f $FILE SHASUMS256.txt && /opt/node/bin/node --version"
    )
    return (
        Template()
        .from_ubuntu_image("24.04")
        .set_user("root")
        .apt_install(["python3", "python3-venv", "util-linux", "coreutils", "tar", "gzip", "xz-utils",
                      "curl", "ca-certificates", "libseccomp2"], no_install_recommends=True)
        .run_cmd(node)
        .run_cmd(["python3 -m venv /opt/walter-env",
                  f"/opt/walter-env/bin/pip install --no-cache-dir '{PYTEST}'",
                  "/opt/walter-env/bin/python -m pytest --version"])
        .run_cmd(["useradd --system --user-group --no-create-home --shell /usr/sbin/nologin sandbox",
                  "! id -nG sandbox | grep -qw sudo",
                  "chown -R root:root /opt/node /opt/walter-env",
                  "chmod -R go-w /opt/node /opt/walter-env",
                  "test -x /usr/bin/prlimit && test -x /usr/bin/timeout && test -x /usr/bin/env",
                  "test -x /usr/bin/setpriv && test -x /usr/bin/python3"])
        .set_user("user")
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--name", default="caveman-sandbox", help="E2B template name (default: caveman-sandbox)")
    parser.add_argument("--skip-cache", action="store_true", help="rebuild every layer")
    args = parser.parse_args(argv)
    if not os.environ.get("E2B_API_KEY"):
        print("E2B_API_KEY is not set.", file=sys.stderr)
        return 2
    from e2b import Template
    info = Template.build(template(), args.name, cpu_count=CPU_COUNT, memory_mb=MEMORY_MB,
                          skip_cache=args.skip_cache, on_build_logs=lambda entry: print(entry, flush=True))
    print(f"Built {info.name} (template {info.template_id}, build {info.build_id})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
