# Deploying Caveman

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
| API | Linux container, private network | Never executes generated code; runs fine under Docker's default security profile. |
| Worker(s) | Linux VM or container with user namespaces | Holds the provider key. Refuses to start if Bubblewrap isolation is unusable. |
| Operational state | Persistent volume shared by API and workers | SQLite in WAL mode (`caveman-operations.db`, `caveman-platform.db`). |

## Verified here

- `deploy/api.Dockerfile` builds (Ubuntu 24.04, distribution Python, Bubblewrap).
- Inside the container, as the unprivileged `caveman` user with `--network none`,
  a full scripted build ran real sandboxed pytest (a failing first candidate,
  recovery, a passing revision), acceptance and delivery — **only** with
  `seccomp=unconfined`, `apparmor=unconfined` and `systempaths=unconfined`.
- Under Docker's default profile Bubblewrap cannot create a namespace. Caveman
  failed closed: validation errored, acceptance was refused, nothing was marked
  done. The worker now refuses to start in that situation.

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

## Durability

- Runs execute in workers, never in HTTP requests. Closing a browser has no effect.
- Jobs are leased. If a worker dies, its lease expires and the next worker turns
  the job into a recovery job that uses the core's own interruption recovery.
- Restarting the API loses nothing: all state is on the shared volume.
- Postgres for *operational* state is not implemented: the orchestration core's
  store is SQLite. API and workers therefore need a shared POSIX volume
  (single host, or a volume with reliable file locking).

## Secrets

- `OPENROUTER_API_KEY` belongs to workers only. Sandboxed commands run with a
  cleared environment and never see it; credential-shaped files are excluded
  from candidate snapshots and cannot be written by specialists.
- `CAVEMAN_API_TOKEN` is shared by web and API only. Browsers never see it.
- `BETTER_AUTH_SECRET` belongs to the web app only.
