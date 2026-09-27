<div align="center">

# Caveman

**Type what you want. Caveman builds it.**

*So easy a caveman could do it.*

[![CI](https://github.com/who-is-michael-mercer/Walter/actions/workflows/ci.yml/badge.svg)](https://github.com/who-is-michael-mercer/Walter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: pre-1.0](https://img.shields.io/badge/status-pre--1.0-orange.svg)](ROADMAP.md)

</div>

---

Describe a software project in plain English. Caveman understands the goal,
breaks it into dependency-aware tasks, assigns specialist agents, validates
their work in an isolated sandbox, has it independently reviewed, retries or
replans when something fails, asks you only for genuinely consequential
decisions, and hands back a verified project.

You never manage agents. Behind the product is a durable orchestration core in
which **the model proposes and the kernel authorizes**: nothing counts as done
until trusted checks and an independent reviewer say so.

> **Naming.** Caveman was previously called Walter. The orchestration core keeps
> its internal package name (`src/walter/`) and the `walter` operator CLI for
> compatibility. Everything a user sees is Caveman.

## Architecture

```text
Browser
   ↓
Caveman Web            web/            Next.js · auth (Better Auth) · same-origin proxy
   ↓  service token + verified user id
Caveman API            src/caveman/    FastAPI · ownership · approvals · SSE · delivery
   ↓  reads kernel state; queues durable jobs
Orchestration Core     src/walter/     runs · tasks · gates · approvals · recovery · events
   ↓  executed by
Workers / Sandboxes    caveman worker  leased jobs · Manager + specialists · Bubblewrap
   ↓
Generated Project      per-project git repo → verified delivery archive
```

- **Core (`src/walter/`)** is authoritative for runs, plans, tasks, dependencies,
  artifacts, validation, review, acceptance, approvals, recovery, replanning and
  completion. See [docs/ENGINE.md](docs/ENGINE.md) for how it works.
- **API (`src/caveman/`)** never duplicates that state. It records who owns which
  project and run, queues execution as leased jobs, projects kernel state into
  honest user-facing views, and binds approval decisions to the exact scope
  digest the user was shown. It has no endpoint that can record a check, a
  review, an acceptance or a completion.
- **Worker** claims jobs, runs the Manager outside any HTTP request, heartbeats,
  and recovers orphaned jobs through the core's own interruption recovery.
- **Web (`web/`)** renders real state over server-sent events. The browser only
  observes and decides; closing it never affects a run.

## Quick start (local)

Requirements: Linux, Python 3.11+, Node 22+, `git`, and the isolation backend
(`bubblewrap`, `libseccomp2`, `util-linux` for `prlimit`) with unprivileged user
namespaces allowed. On Ubuntu 24.04:
`sudo apt install bubblewrap libseccomp2 util-linux python3-venv` and
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.

**1. Clone**

```bash
git clone https://github.com/who-is-michael-mercer/Walter.git caveman
cd caveman
```

**2. Install dependencies**

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
(cd web && npm ci)
```

Use the distribution `python3` (not a toolcache build): the sandbox binds `/usr`
into an environment-cleared namespace, so the interpreter must live under `/usr`.

**3. Configure**

```bash
cp .env.example .env                 # API + worker
cp web/.env.example web/.env.local   # web app
```

Set the same random `CAVEMAN_API_TOKEN` (`openssl rand -hex 32`) in both files,
a `BETTER_AUTH_SECRET` in `web/.env.local`, and either an `OPENROUTER_API_KEY`
(real models) or `CAVEMAN_EXECUTOR=scripted` (credit-free scripted models; see
[Testing](#testing)). Every variable is described in the example files.

**4. Run the API** (private; binds to localhost)

```bash
.venv/bin/caveman api --port 8000
```

**5. Run the web app**

```bash
cd web && npm run dev          # or: npm run build && npm start
```

Open http://localhost:3000, create an account, and describe what to build.

**6. Run a worker**

```bash
.venv/bin/caveman worker
```

The worker refuses to start if Bubblewrap isolation is not actually usable.
Run more workers for more parallel runs; jobs are leased, so they never collide.

## Testing

```bash
.venv/bin/python -m pytest -q                         # backend: core + API + worker (offline)
.venv/bin/python evals/runner.py                      # orchestration scenarios (offline)
cd web
npm run typecheck && npm run lint && npm test         # frontend checks, unit + component tests
npm run build                                         # production build
npx playwright test                                   # end-to-end journeys (starts API, worker, web)
```

The E2E suite starts the real API, a real worker and the production web build.
The worker uses the **scripted test executor** (`CAVEMAN_EXECUTOR=scripted`):
the Manager's *model* is scripted, but every state change still goes through the
kernel and every check really runs in the sandbox. Tags in the prompt choose a
scenario: none (plan, build, verify, deliver), `#approval`, `#fail-validation`.
Scripted runs are labelled in the UI, and the executor is refused when
`CAVEMAN_ENV=production`. The browser used by Playwright must match the pinned
`@playwright/test` version (`npx playwright install chromium`).

`WALTER_LIVE_SMOKE=1 .venv/bin/python -m pytest -q -m live` runs the opt-in,
credit-spending provider smoke test.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the backend suite
and evals, frontend typecheck, lint, unit tests and production build, and the
end-to-end journeys.

## What the product does today

- Plain-English build requests with optional stack, constraints, deployment
  target and budget; the prompt survives sign-up.
- Durable runs executed by workers, recoverable after worker loss, observable
  live; stop, continue (optionally with an instruction), and close.
- A run dashboard showing only real state: stage, tasks and specialists,
  attempts, dependencies, trusted check results (passed / failed / running /
  not run), independent reviews, artifacts with digests and workspace
  fingerprints, failures with classified recovery, replans, approvals, events,
  per-call model usage, provider-reported cost and budget.
- Exact-scope approvals: approve or reject a specific request; a changed request
  must be shown again.
- Budgets on by default: a USD ceiling on provider-reported cost plus a
  model-call ceiling, with a warning at 80% and a safe pause at the limit.
- Delivery: when the kernel completes a run, Caveman assembles a downloadable
  archive from exactly the accepted, fingerprint-verified files, plus a build
  report. Nothing is pushed or deployed on anyone's behalf.

## Security model

- Generated code is untrusted. It runs only in Bubblewrap with unshared
  namespaces, no network (seccomp), a cleared environment, resource limits and a
  read-only snapshot; credential-shaped files are excluded and unwritable.
  Missing isolation is a hard failure, never a host fallback.
- The API is private and authenticates the web server with a shared token; the
  web server verifies the user session and forwards only the user id. Every
  project and run lookup is owner-scoped. State-changing browser requests must
  be same-origin JSON.
- Provider keys live only with workers; the service token only with web and
  API; the auth secret only with the web app. Host paths and credential-shaped
  strings are redacted from everything shown to users.
- Generated apps are never rendered on the Caveman origin. Live previews are not
  implemented rather than implemented unsafely.

## Deployment

See [deploy/README.md](deploy/README.md): web on Vercel or any Node host, API and
workers on Linux with a shared volume, managed Postgres for authentication, and
the exact container options Bubblewrap needs (verified, with their trade-offs).
No deployment is performed by anything in this repository.

## Current limitations

- Sandboxed execution supports Python toolchains only (compile, pytest). Other
  stacks are produced as reviewed source and documents, without executable checks.
- OpenRouter is the only configured model provider (any tool-calling model on it,
  e.g. Kimi, DeepSeek, Qwen). Model modes beyond "Automatic" are not built yet.
- Operational state is SQLite on a shared volume; Postgres is used only for auth.
- No GitHub repository creation or push, and no live previews yet.
- Some providers do not report cost for every call; Caveman shows cost as
  incomplete instead of estimating it.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ENGINE.md](docs/ENGINE.md) | The orchestration core in depth: lifecycle, gates, recovery, sandbox, operator CLI |
| [deploy/README.md](deploy/README.md) | Deployment topology, isolation requirements, durability |
| [SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) | Manager doctrine loaded at runtime |
| [OPERATING_MODEL.md](OPERATING_MODEL.md), [PERMISSIONS.md](PERMISSIONS.md), [QA_PROTOCOL.md](QA_PROTOCOL.md), [FAILURE_RECOVERY.md](FAILURE_RECOVERY.md) | Authoritative specifications |
| [ROADMAP.md](ROADMAP.md), [CHANGELOG.md](CHANGELOG.md) | Direction and dated decisions |

## License

MIT. See [LICENSE](LICENSE).
