# Caveman API + worker image (one image, two commands).
#
# Isolation note: the worker executes candidate checks under Bubblewrap, which
# needs unprivileged user namespaces *inside* the container. Docker's default
# seccomp profile blocks them, so the worker container must run with a seccomp
# profile that permits user-namespace creation (see deploy/README.md). Caveman
# fails closed if the sandbox is unusable; it never falls back to host execution.
#
# The distribution interpreter is used deliberately: the sandbox binds /usr into
# an environment-cleared namespace, so the interpreter must be self-contained
# under /usr (the same reason CI uses it).
FROM ubuntu:24.04

RUN apt-get update \
 && apt-get install --yes --no-install-recommends python3 python3-venv bubblewrap libseccomp2 util-linux git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Node 22 for the sandboxed Node/TypeScript toolchain (Ubuntu's package is too
# old). Only the runtime and npm are copied; the sandbox binds them read-only.
COPY --from=node:22-slim /usr/local/bin/node /opt/node/bin/node
COPY --from=node:22-slim /usr/local/lib/node_modules/npm /opt/node/lib/node_modules/npm
ENV CAVEMAN_NODE_ROOT=/opt/node

# The sandbox binds /usr/bin/bwrap and /usr/bin/prlimit by absolute path.
RUN test -x /usr/bin/bwrap && test -x /usr/bin/prlimit

RUN useradd --create-home --uid 10001 caveman
WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
# The Manager's doctrine is loaded from the checkout at runtime.
COPY SYSTEM_PROMPT.md AGENTS.md CHARTER.md OPERATING_MODEL.md PERMISSIONS.md AGENT_CREATION.md \
     TASK_PROTOCOL.md QA_PROTOCOL.md FAILURE_RECOVERY.md MEMORY.md TOOLS.md STATE_MODEL.md ./

RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/venv/bin/pip install --no-cache-dir -e .

ENV PATH=/opt/venv/bin:$PATH \
    CAVEMAN_DATA_DIR=/data \
    CAVEMAN_ENV=production \
    PYTHONUNBUFFERED=1

RUN mkdir -p /data && chown caveman:caveman /data
USER caveman
VOLUME ["/data"]
EXPOSE 8000

# `caveman api --host 0.0.0.0` for the API container; `caveman worker` for workers.
CMD ["caveman", "api", "--host", "0.0.0.0", "--port", "8000"]
