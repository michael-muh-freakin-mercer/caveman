# Changelog

## Unreleased — 2026-09-27

### Fixed
- **Sandboxed commands now work on Debian/Ubuntu hosts.** The sandbox root
  hardcoded `--symlink usr/lib /lib64`, which is Arch's layout; on Debian and
  Ubuntu the dynamic loader lives in `/usr/lib64` (itself a symlink into
  `/usr/lib/<multiarch>`), so every sandboxed command failed with
  `bwrap: execvp /usr/bin/prlimit: No such file or directory` — an error that
  names the binary rather than the unresolvable interpreter. The `/lib64` target
  is now derived from the host's own loader directory (`_loader_dir_target`), with
  the previous value as the fallback. Found by running the suite on an Ubuntu CI
  runner. Note that `src/walter/sandbox.py` is a safety-path module, so this
  change deserves the same review attention as any other control-plane edit.

### Added
- **Continuous integration** (`.github/workflows/ci.yml`): the offline suite and
  the offline eval scenarios on Python 3.11 and 3.14, with the isolation backend
  installed and verified before the tests run. The workflow is green on the
  default branch, so the README now publishes its status badge.
- **Bounded Manager drill-down tools.** `inspect_task` returns one task's packet,
  required checks, per-artifact validation and review verdicts, approval gates
  and failure evidence as bounded excerpts. `inspect_artifact` returns one
  candidate's content, truncated with the omitted length stated; the digest
  still covers the whole artifact.
- **`CONTRIBUTING.md`** covering only workflows this repository enforces: the
  editable install, the four verification commands, `pytest` as the sole
  configured gate, the `importorskip` caveat that makes a green run mean less
  than it looks, and the doctrine/safety-path rules.

### Changed
- **The model-facing read path is bounded by construction.** `inspect_run`
  returned the entire run snapshot — candidate bodies, task packets, approval
  scope documents, pytest logs and workspace diffs — so the Manager's context
  grew with exactly the material Walter exists to keep out of a context window.
  It now returns a projection: plan, completion criteria verbatim, per-task
  status/blocker/attempt budget, artifact status, accepted artifacts, open
  approval and capability gates, recent event kinds, and usage totals. Operators
  keep the unbounded snapshot through `walter run inspect`, and
  `DurableController.inspect()` stays full because trusted internals
  (`_receipt`, `delegate`, `candidate_scope`, readiness checks) depend on it.

  Measured on synthetic runs: 1,025 bytes versus 6,954 for one task with a
  2k-character candidate (6.8x), 1,497 versus 55,275 at three tasks (37x), and
  2,202 versus 253,755 at six tasks with 20k-character candidates (115x). The
  bounded read grows sub-linearly in candidate size; the snapshot does not.

  This partially reverses the 2026-09-20 resolution of gap-report finding 5,
  which introduced compact receipts and designated `inspect_run` "the full-truth
  read". Those receipts fixed the mutation path and left the read path
  unbounded, which is where the cost actually was: run
  `a892546081ce4ab1bf62c4778d832988` spent 19 Manager calls against 2 worker
  calls — 90% of the spend on orchestration overhead — for a single-task
  objective that accepted nothing.
- **Manager doctrine names the new read path.** `DURABLE_INSTRUCTIONS` tells the
  Manager that `inspect_run` is bounded, to drill down only when a decision
  needs it, and not to re-read after a successful mutation because every
  mutating tool already returns current status. `TOOLS.md` records the boundary.
- **Live evidence is no longer presented as current capability.** Every
  live-model datapoint in this repository was recorded on 2026-09-20 and
  predates both the 2026-09-22 worker tool-calling fix and the 2026-09-21
  `pytest` scope split; one stale run declared a check named `unittest`, which no
  longer exists. `ROADMAP.md` and `docs/IMPLEMENTATION_STATE.md` mark those
  numbers as history, and a fresh measured baseline is tracked as outstanding
  work.

### Operational
- The three remaining `active` runs from 2026-09-20 were closed offline. Each
  required its pending gate to be denied first — a `promote_candidate` gate on a
  readiness fixture, and a stale `replan` proposal written against a check name
  the current kernel would reject. Five candidate worktrees and branches were
  retired with `walter run cleanup`. The ledger holds 12 abandoned runs and 1
  completed run, with no orphan worktrees.

## Unreleased — 2026-09-22 rehearsal follow-ups

### Added
- **Offline run abandonment:** `walter run abandon <run_id> --reason "<why>"` (kernel `Orchestrator.abandon`) closes an active run that holds no in-flight task, no pending approval, and no pending capability request, without any provider call. Every other terminal route needs the Manager model or demands accepted artifacts, so such runs previously stayed `active` forever. The transition records `run.abandoned` with the reason and local operator principal, preserves all durable history, and is refused with the exact blocking task or gate named.

### Changed
- **Replan proposals are validated before they bind an approval gate (follow-up 1):** `Orchestrator.validate_replan` runs the same structural rules application enforces — unknown reopen/remove/dependency references, non-fresh or id-colliding additions, capability/executable-check violations, a dependency map that breaks the resulting plan graph, and an exhausted replan budget — and reports every defect in one message. `DurableController.propose_replan` validates before `request_approval`, so a kernel-invalid proposal no longer consumes a human review round-trip, and `apply_replan` re-validates against current state because upstream facts can move while the gate is open.
- **`finish_run` rejection names the accepted evidence shape (follow-up 3):** the completion gate now states that `criterion_evidence` maps each completion criterion verbatim to nonempty arrays of accepted artifact IDs, and echoes the required keys, the available accepted artifact IDs, and an example instead of failing once per mis-formatted attempt.
- **Read-only lanes are reviewable (follow-up 2):** `repo_reader` candidates cannot change files, so their diff is empty by construction and the "reviewer inspected no candidate file" rule failed every scout lane. That rule now applies only to lanes that can change files; a read-only lane is reviewed on its reported content, verified against the repository with the same read-only tools, and the reviewer's instructions say so.

## Unreleased — 2026-09-21 decisions

### Changed
- **Strict validation evidence (Decision 2):** a recorded check failure on the current candidate bytes permanently blocks that candidate; re-running to green no longer supersedes it. Correction requires a revised candidate.
- **Split pytest scopes (Decision 1):** new `pytest_candidate` (candidate's changed tests; `pytest` remains as its legacy alias) and `pytest_regression` (the pre-existing suite the candidate did not touch), so breaking existing tests can no longer hide behind new green ones. Regression records an honest failure when there is nothing to run or the suite exceeds the sandbox budget.
- **Dirty-workspace retries (Decision 3):** grants now carry a `used` marker set when an attempt begins; the escalation workspace-reuse branch fires only for never-executed candidates, so a retry after a failed attempt gets a fresh isolated workspace as `replace_workspace` contracts.
- **Interactive mode continuity (Decision 4):** follow-up messages continue the open run instead of spawning an orphan run per input line; `:new` explicitly starts a fresh run.
- **Sandbox inventory limits raised (Decision 5):** 2 MB / 10k files → 50 MB / 100k files (256 MB snapshot cap); `list_files`, `status`, and `changed_paths` no longer read every file's bytes. Symlinks remain forbidden pending a dedicated security design.
- **Operator-collision UX (Decision 7):** a cross-process `ConcurrentUpdate` reaching a Manager tool is retried once for atomic mutations and otherwise translated into a plain-language `concurrent_update` result instead of an opaque tool error.

### Fixed
- **Nested agents never called their tools (found by the 2026-09-22 live rehearsal):** with the SDK's `output_type` structured output, the OpenRouter chat-completions path suppresses tool calling entirely, so every worker/reviewer answered directly without invoking its granted tools. `_invoke` now requests schema-shaped JSON in prose and validates it client-side; verified live that workers then use their tools.

### Reserved
- **Safety-boundary grant path (Decision 6):** `create_safety_candidate` is formally a reserved facility — no Manager tool, CLI command, or construction site injects an approval verifier, so the shipped runtime can only deny. Wiring it requires a fresh security design review (see TOOLS.md).

## Unreleased

### Added

- Durable orchestration models, atomic SQLite operational state/events, artifact lineage, scoped approvals, bounded recovery/replanning, and guarded run inspection/resume/approval commands.
- Enforceable capability profiles, isolated candidate worktrees, fail-closed Bubblewrap checks, trusted validation, independent review, and an offline self-build-readiness fixture that stops at human promotion approval.
- Schema-v2 approval lifecycle/gates with transactional v1 backups and explicit legacy-gate recovery; assignment-bound submissions; audited revision workspaces; trusted current-candidate approval scope; and one-use, exactly scoped safety-boundary grants.
- Assignment-bound typed capability requests with partial-result preservation, exact Manager-created repository workspaces, atomic/idempotent restart-safe application, cleanup on rejection, profile-correct redelegation, and mandatory executable checks for developer plans/replans/changes.
- Stale workspace-grant reconciliation that closes grants whose signed manifest no longer matches the host environment.
- Forward-compatible durable snapshot loading that prunes unknown fields and emits clear diagnostics instead of failing.
- Env-configurable per-run usage budget (`WALTER_MAX_MODEL_CALLS`, `WALTER_MAX_INPUT_TOKENS`, `WALTER_MAX_OUTPUT_TOKENS`, `WALTER_MAX_TOTAL_TOKENS`) with clean exhaustion reporting.
- Live end-to-end verification on 2026-09-20: a model-driven run planned, delegated, validated, independently reviewed, accepted, and completed within its token budget.

### Changed

- Scoped developer validation to the candidate's changed/added test files: `pytest` now runs only those files inside the isolated sandbox and requires the candidate to add or modify at least one test file; removed the non-functional `unittest` check.
- Adopted the Master Blueprint's canonical task lifecycle and acceptance-only dependency semantics throughout executable doctrine and templates.
- Separated Agents SDK conversation sessions from authoritative operational state and documented the current OpenRouter hosted-web limitation.
- Guarded new CLI runs with a completion-criteria sentinel, provider preflight, deterministic resource closure, and OS-derived local operator audit identity.
- Kept the legacy trace-sensitive option as an honest no-op: provider trace export and sensitive payloads remain disabled, and displayed workflow identifiers are explicitly local.
- Made the durable store safe across Agents SDK tool-dispatch threads.
- Fixed CLI session cleanup and Manager output surfacing.

### Safety boundary

- Self-build readiness does not authorize real autonomous self-development, merge, push, deploy, or candidate promotion.

## 1.0.1 — 2026-09-14

### Changed

- Renamed the Manager identity from `Agent Manager` to **Walter**.
- Updated Codex entry instructions, charter, system prompt, and README to use Walter as the agent/product name while retaining `Manager` as the functional role.
- Standardized the recommended local installation path as `~/Projects/Walter`.

## 1.0.0 — 2026-09-14

Initial v1 specification.

### Includes

- general-purpose Manager charter;
- high-autonomy exception-based escalation;
- centralized worker creation;
- one-agent-one-lane delegation;
- dependency-aware execution graph;
- minimum-sufficient context and least-privilege tools;
- risk-based independent QA;
- failure classification and recovery;
- canonical state/memory promotion rules;
- worker, reviewer, scoping, and adjudication prompts;
- task/result/state/decision/failure templates;
- initial orchestration evaluation suite.
