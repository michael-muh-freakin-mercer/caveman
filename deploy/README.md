# Deploying Cavman

Step-by-step for the chosen host: [docs/DEPLOY_DIGITALOCEAN.md](../docs/DEPLOY_DIGITALOCEAN.md)
(one Droplet with `compose.prod.yaml` and Caddy, managed Postgres, E2B sandboxes).

Nothing here deploys anything by itself. These files describe a deployable
topology; running them against real infrastructure is an explicit operator step.

```
Browser ──TLS──▶ Cavman Web (Next.js)  ── private network ──▶ Cavman API (FastAPI)
                  auth, sessions, proxy                         │   ownership, approvals, reads
                                                                ▼
                                                     shared volume: CAVMAN_DATA_DIR
                                                                ▲
                                          Cavman Worker(s) ────┘  Manager + specialists,
                                          Bubblewrap sandbox       leased durable jobs
```

## Components

| Component | Where | Notes |
| --- | --- | --- |
| Web | Vercel or any Node 22 host | Needs `CAVMAN_API_URL`, `CAVMAN_API_TOKEN`, `BETTER_AUTH_*`, `AUTH_DATABASE_URL`. Hosted: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for the sign-up CAPTCHA (needs outbound HTTPS to `challenges.cloudflare.com`). |
| Auth database | Managed Postgres (recommended) | `AUTH_DATABASE_URL=postgres://...`. Tables are created on first use unless `CAVMAN_AUTH_AUTO_MIGRATE=0`. |
| API | Linux container, private network | Never executes generated code; runs fine under Docker's default security profile. Needs outbound HTTPS to `api.github.com` and `github.com` only if repository import is enabled (`CAVMAN_IMPORT_MAX_MB=0` disables it). |
| Worker(s) | Linux VM or container; user namespaces only for Bubblewrap | Holds the provider key. Refuses to start if its isolation backend is unusable: Bubblewrap on the host (default) or E2B microVMs (`CAVMAN_SANDBOX_BACKEND=e2b`, needs `E2B_API_KEY` and outbound HTTPS to E2B). |
| Operational state | Managed Postgres (several hosts) or the shared volume (one host) | `CAVMAN_DATABASE_URL=postgres://...` puts the kernel's runs/events and the platform tables in schemas `<CAVMAN_DATABASE_SCHEMA>_ops` and `_platform` (default `cavman`), created on first use. Unset: SQLite in WAL mode on the volume. |
| Files | Persistent volume shared by API and workers | Project repositories (git) and delivery archives under `CAVMAN_DATA_DIR`. |

## Verified here

- `deploy/api.Dockerfile` builds (Ubuntu 24.04, distribution Python, Bubblewrap).
- Inside the container, as the unprivileged `cavman` user with `--network none`,
  a full scripted build ran real sandboxed pytest (a failing first candidate,
  recovery, a passing revision), acceptance and delivery — **only** with
  `seccomp=unconfined`, `apparmor=unconfined` and `systempaths=unconfined`.
  Since 2026-09-30 `compose.yaml` replaces the first with `seccomp-worker.json`;
  the CI job `deploy` runs the journeys under it and checks the filter is loaded.
- Under Docker's default profile Bubblewrap cannot create a namespace. Cavman
  failed closed: validation errored, acceptance was refused, nothing was marked
  done. The worker now refuses to start in that situation.

- The same image ran a TypeScript build (sandboxed `node_test`) and a parallel
  build with a stale-base retry and integration, under the same options.

- `deploy/e2e.sh` (CI job `deploy`) builds both images and starts `compose.yaml`
  with `compose.e2e.yaml` layered on: Postgres for Better Auth and for
  operational state, and two worker containers sharing one job queue. All 15
  web journeys pass against it (sign-up, builds with approvals and recovery,
  password reset, export and deletion, follow-ups, sessions), and both workers
  took leases during the run. The journeys also pass with the local dev stack
  on Postgres (`AUTH_DATABASE_URL` and `CAVMAN_DATABASE_URL` set to
  `postgres://` URLs before `npx playwright test`).

Not verified here: Vercel, and workers on separate machines sharing the data
volume over a network filesystem (the two workers above share one host).

## Isolation requirements (do not skip)

Candidate code runs under Bubblewrap with unshared namespaces, a cleared
environment, a network-deny seccomp filter and `prlimit` resource limits. The
worker host must allow unprivileged user namespaces:

- **VM (preferred):** Ubuntu 24.04 with `kernel.apparmor_restrict_unprivileged_userns=0`
  (as CI does), `apt install bubblewrap libseccomp2 util-linux git python3-venv`.
- **Container:** see the `worker` service in `compose.yaml`. It runs under
  `seccomp-worker.json`: Docker's default profile (moby/profiles `6fe7deb`,
  2026-09-17) plus `clone`, `unshare`, `mount`, `umount2`, `pivot_root` and
  `sethostname`, which Bubblewrap needs to build a user namespace. Everything
  else the default denies stays denied. `apparmor=unconfined` and
  `systempaths=unconfined` remain, because Bubblewrap mounts a fresh `/proc`.
  Rebuild the profile with `scripts/worker_seccomp.py` when Docker's default
  changes. `compose.prod.yaml` drops all three options: its workers use E2B.

Never set up a worker without isolation. There is no host-execution fallback.

### E2B instead of Bubblewrap

With `CAVMAN_SANDBOX_BACKEND=e2b` candidate code never runs on the worker host:
every check and every npm install gets a fresh E2B microVM that is killed
afterwards. The worker then needs no user namespaces and can run under Docker's
default security profile (drop the `security_opt` lines from the `worker`
service), but it does need outbound HTTPS to E2B.

1. Build the template once, and again whenever `scripts/e2b_template.py` changes:
   `E2B_API_KEY=... python scripts/e2b_template.py` (Python 3.11+, `pip install '.[e2b]'`).
2. On the workers set `CAVMAN_SANDBOX_BACKEND=e2b` and `E2B_API_KEY` (and
   `CAVMAN_E2B_TEMPLATE` if you built it under another name). Set them on the
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
- With `CAVMAN_DATABASE_URL`, run and job state is in PostgreSQL. Writers to
  each store are serialized with a transaction-scoped advisory lock (the same
  single-writer semantics as SQLite), reads of a run use one repeatable-read
  snapshot, and the job queue hands each job to exactly one worker across hosts.
  Project repositories and archives remain files on the shared volume (NFS/EFS
  is fine for them; SQLite on a network filesystem is not, which is why
  multi-host deployments should use PostgreSQL).
- Existing SQLite state is not migrated automatically. `cavman ops
  migrate-to-postgres` copies it, auth included, with everything stopped
  (`docs/RUNBOOK.md`, "Moving from SQLite to PostgreSQL").

## Operations

- `GET /api/metrics` (Prometheus text) is enabled by `CAVMAN_METRICS_TOKEN` and
  requires it as a bearer token: jobs by status and outcome, age of the oldest
  queued job, expired leases, runs, deliveries, sandbox availability, and this
  month's model spend and calls. `deploy/monitoring/` has alert rules, a
  scrape config and a Grafana dashboard for it.
- `CAVMAN_LOG_FORMAT=json` writes one JSON object per log line.
- `compose.prod.yaml` can ship container logs to Grafana Cloud Logs or any Loki
  (`deploy/logs/config.alloy`, off unless `COMPOSE_PROFILES=logs`).
- `cavman ops list [--attention]`, `cavman ops requeue RUN_ID` and
  `cavman ops abandon RUN_ID --reason ...` act on durable state across all
  accounts without spending credits; abandon uses the kernel's rules.
- `cavman ops purge-orphans` removes data no account owns any more (left if an
  account deletion was interrupted); anything younger than an hour is kept.

## Secrets

- `OPENROUTER_API_KEY` belongs to workers only. Sandboxed commands run with a
  cleared environment and never see it; credential-shaped files are excluded
  from candidate snapshots and cannot be written by specialists.
- `CAVMAN_API_TOKEN` is shared by web and API only. Browsers never see it.
- `BETTER_AUTH_SECRET` belongs to the web app only.
