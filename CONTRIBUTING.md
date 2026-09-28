# Contributing to Caveman

Thanks for looking. Caveman is pre-1.0 and the architecture is still moving, so
the most useful contributions right now are bug reports with reproductions, and
work against the *Now* section of the [roadmap](docs/ROADMAP.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues go through [SECURITY.md](SECURITY.md), never a public issue.

## Setup

Requires Linux with Bubblewrap and libseccomp, Python 3.11+ and Node 22+; see
[Quick start](README.md#quick-start). Candidate execution fails closed without
the isolation backend, so the sandbox tests cannot run at all on a host that
lacks it.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
(cd web && npm ci)
```

Provider configuration lives in a gitignored `.env`; copy `.env.example` and set
`OPENROUTER_API_KEY`, or use `CAVEMAN_EXECUTOR=scripted` to work without one.
Never commit a real key: configuration rejects the placeholder value, and CI
scans for secrets, but nothing stops a careless `git add`.

## Verifying a change

Backend (Python):

```bash
python -m pytest -q                                 # offline suite; no credits spent
python evals/runner.py                              # orchestration scenarios, scripted fakes
walter run readiness-demo                           # real Bubblewrap, real worktree, offline
WALTER_LIVE_SMOKE=1 python -m pytest -q -m live     # opt-in, spends provider credits
```

Web app (`web/`):

```bash
npm run typecheck && npm run lint && npm test       # types, ESLint, unit + component tests
npm run build                                       # production build
npx playwright test                                 # end-to-end journeys on the real stack
```

Python has no lint, format or typecheck tooling configured, so match the
surrounding style rather than reformatting. CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of the above
except the live smoke test on every push and pull request.

Be aware that `test_adapter.py`, `test_runtime.py`, `test_usage_model.py`, and
`test_live_smoke.py` call `pytest.importorskip("agents")`. If the Agents SDK is
missing from your environment those tests vanish silently and a green run means
much less than it looks like.

## Pull requests

- Keep each pull request to one change, and explain *why* in its description;
  the diff already says what.
- Write commit subjects in the imperative, describing the behavior change
  ("Let specialists run their checks by name"), not the files touched.
- Add or update tests for behavior you change, and a dated
  [CHANGELOG.md](CHANGELOG.md) entry for anything a user or operator would notice.
- CI must be green. Never skip, disable or loosen a test to get there.

## Ground rules that the code actually enforces

- **Doctrine and code move together.** `doctrine/SYSTEM_PROMPT.md` is loaded into
  the Manager at runtime; `doctrine/TOOLS.md`, `doctrine/PERMISSIONS.md`, and
  `doctrine/OPERATING_MODEL.md` describe behavior the kernel implements. Changing
  enforcement without updating the corresponding document, or the reverse, is a
  defect.
- **Safety paths are deliberate.** The doctrine files and the control-plane
  modules listed in `SAFETY_PATHS` (`src/walter/sandbox.py`) are write-denied to
  every ordinary candidate grant. Editing them by hand is fine; quietly widening
  the set, the usage budget, the worker contract, or the `walter` entrypoint is
  not. Protection is by exact path, so moving a protected file means updating
  the list (a test fails otherwise).
- **Never manufacture evidence.** Validation results, review verdicts, and
  approval decisions come from trusted executors and humans. A test that fakes
  one to make a gate pass defeats the only thing this project is really for.
- **Record consequential decisions.** `CHANGELOG.md` carries dated entries
  explaining *why* behavior changed, and `docs/IMPLEMENTATION_STATE.md` tracks
  verified capability against known gaps. Keep both honest; a documented failure
  is worth more than an undocumented success.
- **Target-project artifacts stay in their target repositories.** Work Caveman
  performs on another codebase does not belong in this one.

## Reporting problems

Use the [bug report form](https://github.com/who-is-michael-mercer/caveman/issues/new?template=bug_report.yml).
Include the request you gave Caveman, the run ID, and the output of
`walter run inspect <run_id>` and `walter run events <run_id>`. Those two
commands are the durable record of what actually happened, and they are far more
useful than a transcript. Redact anything sensitive from the request first:
run snapshots include task text.
