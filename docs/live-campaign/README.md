# Live-model campaigns

Real OpenRouter models driving real Cavman builds (`scripts/live_campaign.py`).
A small, budget-capped version runs on demand in CI: Actions → **Live smoke
(real models, spends credits)** → Run workflow.
Each report lists every request with its final state, tasks, failure classes,
model calls, provider-reported cost and time.

## 2026-09-28: first campaign

**Result: 10 of 10 builds completed** ([report](20260928T180959Z.md), [data](20260928T180959Z.json)).

- Models: `deepseek/deepseek-v4-pro` for planner and specialists (OpenRouter).
- Limits: $2 per build, $20 total, 150 model calls per build.
- Cost: $0.87 total; median $0.09 per build (range $0.04–$0.15).
- Time: median 5.5 minutes per build (range 1.8–11.3); median 22 model calls.
- Mix: 6 Python, 3 TypeScript (`node_test`), 1 specification plus code.
- Recoveries: two builds hit a `BAD_OUTPUT` failure once and completed after a
  kernel-routed revision.
- **Cost reporting confirmed.** OpenRouter's own usage counter rose by the same
  amount Cavman recorded, to within half a cent; every call reported its cost.
  USD budgets therefore enforce real spend.

Every accepted change passed trusted sandbox checks (compile, pytest or node:test)
and an independent model review before the kernel accepted it. The generated
code has not been reviewed by a person.

### What the smoke builds found before the campaign

Four single-prompt smoke builds ($0.95 in total) exposed problems that scripted
tests could not:

1. **Specialists could not run their own checks.** Every `run_check` call was
   refused by the sandbox's strict command templates, which the model was never
   told. It rewrote files blind until it ran out of steps. Specialists now name
   a check (`pytest`, `compile`, `node_test`, `tsc`) and the tool builds the
   template; output is trimmed to its tail.
2. **Most plans were rejected.** Planners wrote free text into `required_inputs`
   and put `pytest_regression` where nothing could run. The driver now
   normalizes both; planning retries three times and reports why it failed.
3. **Success on the last step was thrown away.** A specialist reached green
   checks on its final (24th) step. Specialists get 40 steps. A developer
   workspace with changes is submitted for validation and review when steps
   run out, labelled as a platform submission.

An operator-only trace (`WALTER_TOOL_TRACE=<file>`) of tool names and sizes made
the first problem visible.

### Not yet measured

- Larger multi-task builds (web apps with several components).
- Other models and the Budget / Balanced / Maximum Quality modes.
- Builds that need approvals or capability requests.
