# Contributing

Thanks for looking. Walter is pre-1.0 and the architecture is still moving, so
the most useful contributions right now are bug reports with reproductions, and
work against the *Now* section of [ROADMAP.md](ROADMAP.md).

## Setup

Requires Linux with Bubblewrap and libseccomp — see
[Requirements](README.md#requirements). Candidate execution fails closed without
them, so the sandbox tests cannot run at all on a host that lacks them.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
```

Provider configuration lives in a gitignored `.env`; copy `.env.example` and set
`OPENROUTER_API_KEY`. Never commit a real key — configuration rejects the
placeholder value, but nothing stops a careless `git add`.

## Verifying a change

```bash
python -m pytest -q                                 # offline suite; no credits spent
python evals/runner.py                              # orchestration scenarios, scripted fakes
walter run readiness-demo                           # real Bubblewrap, real worktree, offline
WALTER_LIVE_SMOKE=1 python -m pytest -q -m live     # opt-in, spends provider credits
```

`pytest` is the only configured gate — there is no lint, format, or typecheck
tooling, so match the surrounding style rather than reformatting. CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the offline suite
and the eval scenarios on every push and pull request.

Be aware that `test_adapter.py`, `test_runtime.py`, `test_usage_model.py`, and
`test_live_smoke.py` call `pytest.importorskip("agents")`. If the Agents SDK is
missing from your environment those tests vanish silently and a green run means
much less than it looks like.

## Ground rules that the code actually enforces

- **Doctrine and code move together.** `SYSTEM_PROMPT.md` is loaded into the
  Manager at runtime; `TOOLS.md`, `PERMISSIONS.md`, and `OPERATING_MODEL.md`
  describe behavior the kernel implements. Changing enforcement without updating
  the corresponding document — or the reverse — is a defect.
- **Safety paths are deliberate.** The doctrine files and the control-plane
  modules listed in `SAFETY_PATHS` (`sandbox.py`) are write-denied to every
  ordinary candidate grant. Editing them by hand is fine; quietly widening the
  set, the usage budget, the worker contract, or the `walter` entrypoint is not.
- **Never manufacture evidence.** Validation results, review verdicts, and
  approval decisions come from trusted executors and humans. A test that fakes
  one to make a gate pass defeats the only thing this project is really for.
- **Record consequential decisions.** `CHANGELOG.md` carries dated entries
  explaining *why* behavior changed, and `docs/IMPLEMENTATION_STATE.md` tracks
  verified capability against known gaps. Keep both honest; a documented failure
  is worth more than an undocumented success.
- **Target-project artifacts stay in their target repositories.** Work Walter
  performs on another codebase does not belong in this one.

## Reporting problems

Open an issue with the objective you gave Walter, the run ID, and the output of
`walter run inspect <run_id>` and `walter run events <run_id>`. Those two
commands are the durable record of what actually happened, and they are far more
useful than a transcript. Redact anything sensitive from the objective first —
run snapshots include task text.
