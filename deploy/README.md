# Deploying Caveman

Step-by-step for the chosen host: [docs/DEPLOY_DIGITALOCEAN.md](../docs/DEPLOY_DIGITALOCEAN.md)
(one Droplet with `compose.prod.yaml` and Caddy, managed Postgres, E2B sandboxes).

Nothing here deploys anything by itself. These files describe a deployable
topology; running them against real infrastructure is an explicit operator step.

```
Browser ──TLS──▶ Caveman Web (Next.js)  ── private network ──▶ Caveman API (FastAPI)
                  auth, sessions, proxy                         │   ownership, approvals, reads
                                                                ▼
                                                     shared volume: CAVEMAN_DATA_DIR
                                                                ▲
                                          Caveman Worker(s) ────┘  Manager + specialists,
                                          Bubblewrap sandbox       leased durable jobs
```

## Components

| Component | Where | Notes |
| --- | --- | --- |
| Web | Vercel or any Node 22 host | Needs `CAVEMAN_API_URL`, `CAVEMAN_API_TOKEN`, `BETTER_AUTH_*`, `AUTH_DATABASE_URL`. |
| Auth database | Managed Postgres (recommended) | `AUTH_DATABASE_URL=postgres://...`. Tables are created on first use unless `CAVEMAN_AUTH_AUTO_MIGRATE=0`. |
| API | Linux container, private network | Never executes generated code; runs fine under Docker's default security profile. Needs outbound HTTPS to `api.github.com` and `github.com` only if repository import is enabled (`CAVEMAN_IMPORT_MAX_MB=0` disables it). |
| Worker(s) | Linux VM or container; user namespaces only for Bubblewrap | Holds the provider key. Refuses to start if its isolation backend is unusable: Bubblewrap on the host (default) or E2B microVMs (`CAVEMAN_SANDBOX_BACKEND=e2b`, needs `E2B_API_KEY` and outbound HTTPS to E2B). |
| Operational state | Managed Postgres (several hosts) or the shared volume (one host) | `CAVEMAN_DATABASE_URL=postgres://...` puts the kernel's runs/events and the platform tables in schemas `<CAVEMAN_DATABASE_SCHEMA>_ops` and `_platform` (default `caveman`), created on first use. Unset: SQLite in WAL mode on the volume. |
| Files | Persistent volume shared by API and workers | Project repositories (git) and delivery archives under `CAVEMAN_DATA_DIR`. |

## Verified here

- `deploy/api.Dockerfile` builds (Ubuntu 24.04, distribution Python, Bubblewrap).
- Inside the container, as the unprivileged `caveman` user with `--network none`,
  a full scripted build ran real sandboxed pytest (a failing first candidate,
  recovery, a passing revision), acceptance and delivery — **only** with
  `seccomp=unconfined`, `apparmor=unconfined` and `systempaths=unconfined`.
- Under Docker's default profile Bubblewrap cannot create a namespace. Caveman
  failed closed: validation errored, acceptance was refused, nothing was marked
  done. The worker now refuses to start in that situation.

- The same image ran a TypeScript build (sandboxed `node_test`) and a parallel
  build with a stale-base retry and integration, under the same options.

Not verified here: `deploy/web.Dockerfile`, `compose.yaml` end to end, Vercel,
and Postgres-backed auth (the SQLite path is what the tests exercise).

## Isolation requirements (do not skip)

Candidate code runs under Bubblewrap with unshared namespaces, a cleared
environment, a network-deny seccomp filter and `prlimit` resource limits. The
worker host must allow unprivileged user namespaces:

- **VM (preferred):** Ubuntu 24.04 with `kernel.apparmor_restrict_unprivileged_userns=0`
  (as CI does), `apt install bubblewrap libseccomp2 util-linux git python3-venv`.
- **Container:** see the `worker` service in `compose.yaml`. The options listed
  there relax the container's outer seccomp filter; a tighter alternative is a
  profile derived from Docker's default that additionally allows
  `unshare`/`clone` with `CLONE_NEWUSER`.

Never set up a worker without isolation. There is no host-execution fallback.

### E2B instead of Bubblewrap

With `CAVEMAN_SANDBOX_BACKEND=e2b` candidate code never runs on the worker host:
every check and every npm install gets a fresh E2B microVM that is killed
afterwards. The worker then needs no user namespaces and can run under Docker's
default security profile (drop the `security_opt` lines from the `worker`
service), but it does need outbound HTTPS to E2B.

1. Build the template once, and again whenever `scripts/e2b_template.py` changes:
   `E2B_API_KEY=... python scripts/e2b_template.py` (Python 3.11+, `pip install '.[e2b]'`).
2. On the workers set `CAVEMAN_SANDBOX_BACKEND=e2b` and `E2B_API_KEY` (and
   `CAVEMAN_E2B_TEMPLATE` if you built it under another name). Set them on the
   API too so its health check reports the same backend.
3. Start a worker. It runs the isolation probe in a real VM and refuses to start
   if the key, template or network policy is wrong.

The same limits apply as under Bubblewrap: read-only candidate snapshot, an
unprivileged user, a cleared environment, `prlimit` limits, a wall-time budget,
and no network except for dependency installs. Aggregate memory is bounded by
the template's VM size (2 GiB) and scratch space is measured after each check.
The live tests (`tests/test_sandbox_e2b_live.py`) run in the "E2B sandbox" GitHub
workflow when the `E2B_API_KEY` secret is set.

## Durability

- Runs execute in workers, never in HTTP requests. Closing a browser has no effect.
- Jobs are leased. If a worker dies, its lease expires and the next worker turns
  the job into a recovery job that uses the core's own interruption recovery.
- Restarting the API loses nothing: all state is on the shared volume.
- With `CAVEMAN_DATABASE_URL`, run and job state is in PostgreSQL. Writers to
  each store are serialized with a transaction-scoped advisory lock (the same
  single-writer semantics as SQLite), reads of a run use one repeatable-read
  snapshot, and the job queue hands each job to exactly one worker across hosts.
  Project repositories and archives remain files on the shared volume (NFS/EFS
  is fine for them; SQLite on a network filesystem is not, which is why
  multi-host deployments should use PostgreSQL).
- Existing SQLite state is not migrated automatically; switch before launch or
  export/import deliberately.

## Operations

- `GET /api/metrics` (Prometheus text) is enabled by `CAVEMAN_METRICS_TOKEN` and
  requires it as a bearer token: jobs by status and outcome, age of the oldest
  queued job, expired leases, runs, deliveries and sandbox availability.
- `CAVEMAN_LOG_FORMAT=json` writes one JSON object per log line.
- `caveman ops list [--attention]`, `caveman ops requeue RUN_ID` and
  `caveman ops abandon RUN_ID --reason ...` act on durable state across all
  accounts without spending credits; abandon uses the kernel's rules.
- `caveman ops purge-orphans` removes data no account owns any more (left if an
  account deletion was interrupted); anything younger than an hour is kept.

## Secrets

- `OPENROUTER_API_KEY` belongs to workers only. Sandboxed commands run with a
  cleared environment and never see it; credential-shaped files are excluded
  from candidate snapshots and cannot be written by specialists.
- `CAVEMAN_API_TOKEN` is shared by web and API only. Browsers never see it.
- `BETTER_AUTH_SECRET` belongs to the web app only.
