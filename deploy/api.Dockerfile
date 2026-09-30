# Cavman API + worker image (one image, two commands).
#
# Isolation note: the worker executes candidate checks under Bubblewrap, which
# needs unprivileged user namespaces *inside* the container. Docker's default
# seccomp profile blocks them, so the worker container must run with a seccomp
# profile that permits user-namespace creation (see deploy/README.md). Cavman
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
ENV CAVMAN_NODE_ROOT=/opt/node

# The sandbox binds /usr/bin/bwrap and /usr/bin/prlimit by absolute path.
RUN test -x /usr/bin/bwrap && test -x /usr/bin/prlimit

RUN useradd --create-home --uid 10001 cavman
WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
# The Manager's doctrine is loaded from the checkout at runtime.
COPY AGENTS.md ./
COPY doctrine ./doctrine

RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/venv/bin/pip install --no-cache-dir -e '.[e2b,sentry]'

ENV PATH=/opt/venv/bin:$PATH \
    CAVMAN_DATA_DIR=/data \
    CAVMAN_ENV=production \
    PYTHONUNBUFFERED=1

RUN mkdir -p /data && chown cavman:cavman /data
USER cavman
VOLUME ["/data"]
EXPOSE 8000

# `cavman api --host 0.0.0.0` for the API container; `cavman worker` for workers.
CMD ["cavman", "api", "--host", "0.0.0.0", "--port", "8000"]
