# Implementation state

Current state of executable `main` (HEAD `c78f8f1`). This document replaces the
earlier bootstrap snapshot; it describes what the runtime actually does today and
where it is still incomplete.

## Verified current capabilities

- **Deterministic 12-state kernel.** Lifecycle across `PLANNED`, `READY`,
  `DELEGATED`, `RUNNING`, `SUBMITTED`, `REVIEWING`, `REVISION_REQUIRED`,
  `ACCEPTED`, `REPLACED`, `BLOCKED`, `FAILED`, and `CANCELLED`; accepted-only
  dependency satisfaction; artifact provenance and lineage validation; typed,
  scoped approvals; capability escalation; bounded recovery and explicit replan;
  and a completion gate that a new run cannot satisfy with its sentinel criterion.
- **Durable store.** Operational schema v2 with atomic snapshots and append-only
  events, optimistic concurrency, transactional v1→v2 migration with retained
  backups, forward-compatible snapshot loading that prunes unknown fields with a
  warning, and thread safety across Agents SDK tool dispatch.
- **Fail-closed Bubblewrap sandbox.** Isolation fails closed if the backend is
  missing or unusable. Signed grant manifests with stale-grant reconciliation,
  a path-aware secret policy, per-task candidate fingerprints and diffs, and
  template-bound commands with resource limits.
- **Agents SDK adapter.** Manager tools, doctrine loading from `doctrine/SYSTEM_PROMPT.md`,
  and worker/reviewer invocation using the configured worker model.
- **OpenRouter runtime.** OpenRouter is the configured provider, with an
  env-configurable per-run usage budget.

## Verified evidence

**Live evidence is historical.** Every live-model datapoint below was recorded on
2026-09-20 and predates two changes to the path it exercised: the 2026-09-22
worker tool-calling fix (`_invoke` no longer uses the SDK `output_type`) and the
2026-09-21 split of the `pytest` validation scopes. Run
`a892546081ce4ab1bf62c4778d832988` declared a check named `unittest`, which no
longer exists in `EXECUTABLE_DEVELOPER_CHECKS`. The current worker invocation
path therefore has no end-to-end live measurement. These records are retained as
history, not as claims about present capability; a fresh measured baseline is
tracked in `ROADMAP.md`.

- Offline suite and eval scenarios: green in CI on every push and pull request,
  with the real Bubblewrap sandbox exercised on the runner.
- Readiness demo passes against real Bubblewrap.
- Live provider smoke passes (2026-09-20).
- One live model-driven end-to-end run completed on 2026-09-20 (run
  `1b6affd4233446de9093d6c4a92b8c6c`): the Manager planned, delegated a real
  worker, trusted validation passed, an independent model review passed, the
  Manager accepted, and the run completed. The run used 16 model calls,
  ~299k tokens, and ~$0.38, within its 300k-token budget.
- Researcher probe (2026-09-20): the SDK hosted `WebSearchTool` is rejected by
  OpenRouter chat completions (`UserError: Hosted tools are not supported`);
  the durable path classified the failure honestly as `TOOL_FAILURE`.
- First real external-repository run (2026-09-20, run
  `04976c30a16c4b82aefa5a9da1894d59`, DeepSeek/Qwen workers): did not complete;
  blocked honestly with attempts exhausted after three worker failures.
  Full findings in `docs/first-real-run-gap-report.md`.
- Review against the plan (2026-09-30): reviewers rule on every plan item and
  the adapter fails a review with an unmet or unruled item or a high or critical
  finding. Verified offline with scripted reviewers and by a three-build live
  smoke (3 of 3 completed, $1.00). Known gaps: builds cost more than before and
  the cause is unmeasured, and a success criterion shared between tasks is not
  checked against the finished project.
- Eval runner (`evals/runner.py`): EVAL-001/002/003 pass offline against the
  durable runtime (3/3).
- 2026-09-22 rehearsal follow-ups landed offline: replan proposals are validated
  at authoring time so a kernel-invalid proposal never binds an approval gate,
  read-only (`repo_reader`) lanes are reviewable without a candidate diff, and
  `finish_run` rejections name the accepted evidence shape. Eight zero-cost
  zombie `active` runs in the main operational DB were closed with the new
  offline `walter run abandon` transition.
- Manager/worker cost split measured from run
  `a892546081ce4ab1bf62c4778d832988` (2026-09-20): 19 Manager calls against 2
  worker calls, 21 total, for a single-task objective that accepted nothing.
  Orchestration overhead, not worker execution, dominated the spend. Both worker
  calls were single-shot (~1.5k tokens each), consistent with the tool-calling
  defect fixed on 2026-09-22.
- 2026-09-27 operational hygiene: the three remaining `active` runs from
  2026-09-20 were closed offline (two readiness fixtures and the stuck
  development run, each requiring its pending gate to be denied first), and five
  candidate worktrees and branches were retired with `walter run cleanup`. The
  ledger now holds 12 abandoned runs and 1 completed run, with no orphan
  worktrees.

## Known gaps and limitations

- Only OpenRouter is supported as a provider.
- The `researcher` profile is unusable with the configured provider (hosted
  `WebSearchTool` rejected by chat completions; verified 2026-09-20).
- All six findings from `docs/first-real-run-gap-report.md` are resolved:
  trusted input registration plus plan-time validation; precise delegation-gate
  errors; capability/check-preserving replan add-path; configurable worker turn
  budget (`WALTER_WORKER_MAX_TURNS`, default 24); compact tool receipts with
  `inspect_run` as the full-truth read; placeholder API key rejected at
  configuration time.
- Usage budgets are per-run and cumulative across the run's model calls.
- The Manager loop is currently chatty: a small objective took ~13 Manager model calls.
- Most of `doctrine/` (all but `SYSTEM_PROMPT.md`), `docs/runbooks/`,
  `evals/`, and `.codex/` material is not loaded by the runtime and is retained as
  human reference.
- The adjudicator, domain-scoping, handoff, and result-packet mechanisms are not
  implemented.

## Decisions

- DEC-001: The Master Blueprint (`docs/walter-bootstrap-master-blueprint.md`)
  supersedes older bootstrap documents and lifecycle terminology.
- DEC-002: Extend the existing runtime; use a separate SQLite operational store,
  retaining conversation sessions.
- DEC-003: Process isolation must fail closed if its backend is unavailable;
  working-directory restrictions alone are insufficient.
- DEC-004 (2026-09-20): Schema-v1 support is dropped. The only operational
  database of value (`.local/walter-operations.db`) is `user_version 2`, so the
  deprecated compatibility fields (`WorkerResult.specialist_request`,
  `ApprovalRequest.reason` alias) are removed. The v1→v2 migration function is
  retained for now; its retirement is a separate later decision.
- DEC-005 (2026-09-22): An active run that holds no in-flight task, no pending
  approval, and no pending capability request may be closed offline with
  `walter run abandon <run_id> --reason "<why>"` (run and plan status
  `abandoned`, one `run.abandoned` event carrying the reason and the local
  operator principal). Abandonment is narrow by design — any live work or open
  gate refuses it with the blocker named — and it preserves accepted artifacts,
  failures, decisions, and events as history rather than erasing them.