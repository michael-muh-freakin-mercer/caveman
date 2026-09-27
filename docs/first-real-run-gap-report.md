# T044 — First real external-repository run: gap report

Date: 2026-09-20. Run `04976c30a16c4b82aefa5a9da1894d59` (scratch repo outside
the Walter checkout: one `calc.py`, one `test_calc.py`). Manager:
`moonshotai/kimi-k3`. Workers: `deepseek/deepseek-v4-flash` (attempts 1–2),
`qwen/qwen3.7-flash` (attempt 3). Objective: add `multiply(a, b)` with tests.

## Outcome

Run did **not** complete; it is active and precisely gated: task `dev-multiply`
is `FAILED` with attempts exhausted (3/3), so only the REPLAN recovery route
remains. Stopped there to bound credits (42 model calls, ~625k tokens total,
capped by `WALTER_MAX_TOTAL_TOKENS`; the budget gate fired cleanly and honestly).

The objective was achieved in evidence terms: the durable kernel, approval and
replan gates, recovery taxonomy, usage accounting, and budget enforcement all
worked against real models across three resume cycles, and every failure was
honest. No evidence was manufactured at any point.

## Timeline

1. Manager planned one `developer_sandbox` task with predeclared `pytest`
   check — and declared `required_inputs: [calc.py, test_calc.py]`.
2. Delegation was kernel-gated 4× (`Worker, readiness or attempt gate failed`)
   because nothing had registered those inputs; the Manager diagnosed this
   correctly from durable state, proposed a replan, and **recommended the
   operator deny it** (the replacement task would have lost its
   `developer_sandbox` capability and `pytest` check — see gap 3).
3. Operator denied the replan and registered the inputs via the kernel
   (`input.registered` events). Delegation gate cleared.
4. Attempt 1 (DeepSeek): worker returned an intent statement, no work →
   `BAD_OUTPUT` → REVISE.
5. Attempt 2 (DeepSeek): empty workspace diff; trusted pytest validation
   failed ("No candidate test files were added or changed") →
   `REPEATED_BAD_OUTPUT` → REPLACE. Bad artifact rejected, provenance kept.
6. Operator approved the Manager's reopen replan (capability/checks preserved).
7. Attempt 3 (Qwen): worker burned its 12-turn budget without returning a
   structured `WorkerResult` → `MaxTurnsExceeded` → `TOOL_FAILURE`. Attempts
   exhausted; task `FAILED`.

## Gaps found (candidates for new tasks; nothing fixed in situ)

1. **`required_inputs` soft-lock (highest priority).** Declaring repo files as
   `required_inputs` makes a task undelegatable unless inputs are registered,
   but the CLI exposes no way to register them (only a kernel call), and the
   planning tool gives no warning. Worse, the stuck task cannot be classified
   (`PLANNED → FAILED` is illegal), so `recover_task` is unavailable and replan
   is the only route. Consider: adapter/CLI auto-registers target-repo files at
   run start, or `plan_tasks` rejects unregistered input declarations, or the
   kernel allows failing a `PLANNED` task whose inputs can never resolve.
   **Resolved 2026-09-20:** new `register_repository_inputs` Manager tool
   (trusted code reads each repo file and registers a `sha256:` digest with the
   kernel) plus plan-time validation that rejects unresolvable
   `required_inputs` with a precise, actionable error. The soft-lock can no
   longer arise through the tool surface; covered by adapter tests.
2. **Opaque delegation-gate error.** `Worker, readiness or attempt gate failed`
   conflates inputs, readiness, workspace, approval, and attempt-budget gates.
   The Manager spent ~13 calls diagnosing what one precise error (`missing
   registered inputs: calc.py, test_calc.py`) would have settled immediately.
   **Resolved 2026-09-20:** the kernel now names the precise blocker —
   `Task is not ready: Required input is unavailable: <name>`,
   `Input task is not accepted: <name> (<status>)`,
   `Attempt budget exhausted (n/max)`, or `Worker identity is not delegatable` —
   via a shared `_readiness_blocker` used by the delegate gate. Pinned by
   `test_delegate_gate_names_the_precise_blocker`.
3. **`replan_tasks` add-path drops capability and checks.** `propose_replan`
   builds `TaskNode(packet=...)` with defaults (`model_only`, no checks), so a
   replacement developer task silently loses `developer_sandbox` and `pytest`.
   The Manager detected this and recommended denying its own proposal — good
   behavior working around a real tool defect.
   **Resolved 2026-09-20:** `replan_tasks`/`propose_replan` accept
   `add_capabilities`/`add_checks` (same validation as `plan_tasks`, via a
   shared `_task_nodes` builder), so added tasks keep their declared capability
   and predeclared checks. Pinned by adapter tests.
4. **Weak non-default workers.** Neither DeepSeek v4-flash nor Qwen3.7-flash
   drove the workspace tools to a real diff (two empty submissions, one
   12-turn exhaustion). Worker `max_turns=12` may also be tight for
   multi-step file work. Non-Kimi worker selection needs either stronger
   models or worker-loop tuning.
   **Resolved 2026-09-20 (tooling half):** worker/reviewer turn budget is now
   configurable via `WALTER_WORKER_MAX_TURNS` (default raised 12 → 24). The
   model-quality half is a selection concern, not code: flash-tier workers are
   not dependable for multi-step file work.
5. **Manager chattiness.** 28 Manager calls / ~625k tokens for a one-function
   objective (partly forced by gap 2). Prompt/tool-result economy is worth a
   look once the gate errors are precise.
   **Resolved 2026-09-20:** mutating Manager tools now return a compact durable
   receipt (task statuses, attempts, artifacts, pending approvals, failures,
   usage totals) instead of the full run snapshot; `inspect_run` remains the
   full-truth read. This removes the per-call full-JSON echo that dominated
   token spend.
6. **Placeholder `.env` hazard (minor).** A `.env` containing the example
   placeholder key passes config validation (non-empty) and produces a 401 on
   the first call, leaving an active orphan run (`4cd153c6…` in the scratch
   DB). Consider validating the key shape or failing fast on 401.
   **Resolved 2026-09-20:** `RuntimeConfig.from_env` rejects the
   `.env.example` placeholder value before any run is created.

## What worked (positive evidence)

- Durable resume across three `--execute` cycles with zero state corruption.
- Typed approvals: replan deny/approve flowed through the CLI with local
  operator identity recorded; the kernel enforced exact scope.
- Recovery taxonomy: REVISE → REPLACE → reopen-replan all behaved as designed.
- Trusted validation: pytest scoping caught the empty-diff candidate.
- Usage accounting: all 42 calls recorded with model/role identity, including
  failures; the total-token budget stopped the run cleanly at the cap.
- Manager doctrine: honest status, no manufactured evidence, correct
  escalation when autonomous routes were exhausted.

---

# Two-lane dependency run — accepted upstream artifacts are not materialized
into dependents' candidate worktrees

Date: 2026-09-23. Run `113f7ef20f824b31acd24492f64bcbf2`, fixture repo
`~/Projects/walter-fixture` (one `units.py`, one `test_units.py`, one commit).
Manager `deepseek/deepseek-v4.1-flash`; workers/reviewer `moonshotai/kimi-k3`.
Objective: Task A creates `temperature.py` (`celsius_to_fahrenheit`,
`fahrenheit_to_celsius`) with tests; Task B depends on A and creates `report.py`
(`format_temperature`) that calls A's converter. Both tasks predeclare `pytest`.

Purpose: this is the smallest project that exercises what a single-lane run
cannot — sentinel criteria replacement, accepted-only dependency gating, two
independent validations/reviews, and completion-criteria evidence mapping.

## Outcome

Phase 1 stopped at its usage budget (57 calls, 632,602 tokens,
`WALTER_MAX_TOTAL_TOKENS=600000`, $0.3178). The replan probe was then run on an
approved larger budget and stopped deliberately once it had answered the seeding
question, at a clean point (no in-flight assignment, no pending gate): final
totals for the run, 71 model calls, 858,447 tokens, $0.4442. The run is left
`active` with `task_b_report_v2` in `REVISION_REQUIRED`, resumable.

- `task_a_temperature` **ACCEPTED**. Candidate worktree
  `candidate-5aa1a966a3ac4ced975bb3b57cd4a36f` holds correct `temperature.py`
  and `test_temperature.py`; the trusted `pytest` check passed and a local rerun
  gives `5 passed`. Artifact `fcec69020f994a269c541a9f957260ed`, workspace
  `5aa1a966a3ac4ced975bb3b57cd4a36f`.
- `task_b_report` **REVISION_REQUIRED** after two identical failures —
  `MISSING_EVIDENCE`, then REVISE recovery, then the same blocker again.

Cost per role: Manager 20 calls / 486,508 tokens (77% of all tokens), workers 34
calls / 138,078, reviewer 3 calls / 8,016.

## Gap 7 — no upstream artifact handoff into a dependent lane (blocking)

A task that depends on an accepted upstream task is gated on the upstream's
*status*, never on its *content*. Task B's candidate worktree was created from
HEAD and contained only `.gitignore`, `README.md`, `test_units.py`, `units.py` —
`temperature.py` was absent, so `report.py` fails at collection with
`ModuleNotFoundError: No module named 'temperature'`. Task A's files exist only
in Task A's own worktree (branch `walter-candidate/5aa1a966…`).

Source level: `WorkspaceManager._create_candidate` runs
`git worktree add -b walter-candidate/<id> <root> <base>` with
`base = base_revision or rev-parse HEAD`, and nothing afterwards writes accepted
artifact content into that tree. The kernel side
(`orchestration.py` `_validate_accepted_artifact`, the readiness gate at
`Input task is not accepted: <name> (<status>)`) validates provenance and status
only. So multi-lane work is composable in the plan graph but not in the
filesystem: a second lane can never build on the first lane's accepted output.

This is the concrete reproduction of the "handoff / result-packet mechanisms are
not implemented" line in `docs/IMPLEMENTATION_STATE.md`.

Worker behavior was correct throughout: it refused to create `temperature.py`
(declared out of its scope), reported `blocked` with the exact cause, and stated
that its `report.py` was spec-compliant and would pass once the upstream file
was present — which local inspection confirms. The Manager also diagnosed the
blocker correctly and classified it `MISSING_EVIDENCE` rather than blaming the
worker. Attempts used: 2 of 3 on `task_b_report`.

### Replan probe (operator-approved, plan revision 1)

The Manager's replan proposal was approved and applied (`plan.replan_applied`,
revision 1): `task_b_report` was invalidated/CANCELLED and replaced by
`task_b_report_v2`, whose packet describes it as a "Bounded Python developer in
an isolated candidate worktree seeded with the accepted Task A artifact". The
kernel has no such seeding step, so the replacement failed on its first attempt
with the identical blocker, now stated in its own words:

> Accepted Task A artifact `fcec69020f994a269c541a9f957260ed` (temperature.py
> with celsius_to_fahrenheit) was not seeded into the candidate worktree; only
> units.py, test_units.py, README.md, and .gitignore are present.

A replan cannot route around this gap: durable state can name an upstream
artifact as a dependency, but nothing materializes its content into a
dependent's worktree, and no model-authored packet text changes that. The
Manager's own risk note on the proposal anticipated exactly this failure, and the
run went on spending against a blocker no autonomous route can clear.

Candidate fix directions (not implemented): seed a dependent candidate worktree
from the accepted upstream artifact (apply the upstream diff to `base` before
delegation, recording the seeding in the workspace grant), or refuse at plan
time to create a dependency edge the runtime cannot materialize, so the Manager
learns immediately instead of burning a lane and two worker attempts.

## Gap 8 — Manager token dominance on a two-task objective

20 Manager calls / 486,508 tokens to plan and supervise two small tasks, 77% of
the run's token budget, against 138k tokens for the workers that actually wrote
the code. Gap 5's compact receipts helped call count on a single lane (13 calls
there, 20 here for two tasks) but Manager-side prompt/tool-result volume still
sets the run's cost. A second delegation against a structurally impossible lane
should also be refused by the kernel rather than rediscovered at full price.

## What worked

- Sentinel completion criteria were replaced with two measurable criteria before
  planning (`plan.criteria_defined`); the completion gate was never satisfiable
  by the sentinel.
- Dependency ordering was honored: `task_b_report` stayed `PLANNED` through A's
  RUNNING/SUBMITTED/REVIEWING and only became READY after `task.accepted`
  (event 52), so "accepted-only" gating is real at the state level.
- Fail-closed Bubblewrap candidate worktrees, trusted `pytest` validation,
  fresh independent review, and typed acceptance all behaved as designed.
- The failure was classified honestly with durable evidence, and the Manager
  authored a well-formed replan proposal (`70d4ca6fbbdb494c80093a15c7435eb9`)
  that named the structural cause and its own risk — a pending
  `runtime_replan` approval, never an autonomous bypass.
- Budget enforcement fired cleanly at the cap with an explicit message.
