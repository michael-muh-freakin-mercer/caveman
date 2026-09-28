# Contributing to Caveman

Welcome to the cave. Grab a rock.

Caveman is pre-1.0 and the architecture still shifts under your feet, so the
most useful things you can bring right now are bug reports with reproductions
and work against the *Now* section of the [roadmap](docs/ROADMAP.md). Big
redesign ideas are welcome too, but open an issue first so nobody burns a
weekend on something that collides with what's already moving.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md) (short
version: don't be a jerk). Security holes go through [SECURITY.md](SECURITY.md),
never a public issue.

## Setup

You need Linux with Bubblewrap and libseccomp, Python 3.11+ and Node 22+; see
[Build it yourself](README.md#build-it-yourself). The sandbox fails closed
without its isolation backend, so on a host without it the sandbox tests can't
run at all. That's on purpose.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
(cd web && npm ci)
```

Provider config lives in a gitignored `.env`: copy `.env.example` and set
`OPENROUTER_API_KEY`, or use `CAVEMAN_EXECUTOR=scripted` and spend nothing.
Never commit a real key. Config rejects the placeholder and CI scans for
secrets, but neither can save you from a sufficiently enthusiastic `git add .`.

## Proving your change works

Backend (Python):

```bash
python -m pytest -q                                 # offline suite; no credits spent
python evals/runner.py                              # orchestration scenarios, scripted fakes
walter run readiness-demo                           # real Bubblewrap, real worktree, offline
WALTER_LIVE_SMOKE=1 python -m pytest -q -m live     # opt-in, spends real provider credits
```

Web app (`web/`):

```bash
npm run typecheck && npm run lint && npm test       # types, ESLint, unit + component tests
npm run build                                       # production build
npx playwright test                                 # end-to-end journeys on the real stack
```

Python has no linter, formatter or typechecker configured, so match the style
around you instead of reformatting the neighborhood. CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of the above,
except the money-spending smoke test, on every push and pull request.

One trap: `test_adapter.py`, `test_runtime.py`, `test_usage_model.py` and
`test_live_smoke.py` call `pytest.importorskip("agents")`. If the Agents SDK is
missing from your environment, those tests quietly vanish and your green run is
lying to you.

## Pull requests

- One change per pull request. Tell us *why*; the diff already says what.
- Commit subjects in the imperative, about behavior, not files
  ("Let specialists run their checks by name", not "update adapter.py").
- Tests for behavior you change, and a dated [CHANGELOG.md](CHANGELOG.md) entry
  for anything a user or operator would notice.
- CI green. Never skip, disable or loosen a test to get there. We will notice,
  and the kernel would be disappointed in you.

## House rules (the code enforces these)

- **Doctrine and code move together.** `doctrine/SYSTEM_PROMPT.md` is loaded into
  the Manager at runtime; `doctrine/TOOLS.md`, `doctrine/PERMISSIONS.md` and
  `doctrine/OPERATING_MODEL.md` describe behavior the kernel implements. If you
  change what's enforced without changing the doc, or the doc without the
  enforcement, that's a bug.
- **Safety paths are sacred.** The doctrine files and control-plane modules in
  `SAFETY_PATHS` (`src/walter/sandbox.py`) are write-denied to every ordinary
  candidate grant. Editing them by hand is fine. Quietly widening that set, the
  usage budget, the worker contract or the `walter` entrypoint is not.
  Protection is by exact path, so moving a protected file means updating the
  list (a test will yell at you otherwise).
- **Never fake the receipts.** Validation results, review verdicts and approval
  decisions come from trusted executors and humans. A test that forges one to
  make a gate pass defeats the entire point of this project.
- **Write down the big decisions.** `CHANGELOG.md` has dated entries explaining
  *why* behavior changed, and `docs/IMPLEMENTATION_STATE.md` tracks what's
  verified versus what's a known gap. Keep both honest. A documented failure
  beats an undocumented success every time.
- **Other people's projects stay in their own repos.** Work Caveman does on
  another codebase doesn't belong in this one.

## Something broke?

Use the [bug report form](https://github.com/who-is-michael-mercer/caveman/issues/new?template=bug_report.yml).
Include the request you gave Caveman, the run ID, and the output of
`walter run inspect <run_id>` and `walter run events <run_id>`. Those two
commands are the durable record of what actually happened, and they beat a
screenshot of a chat every single time. Redact anything sensitive from the
request first, because run snapshots include task text.
