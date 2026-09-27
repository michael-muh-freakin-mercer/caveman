# Roadmap

Walter is a manager agent: it plans work, delegates each piece to a narrow
worker, and verifies the result before accepting it. This page states where the
project actually stands, what makes it different, and what we are building next.

Targets below are commitments about direction, not descriptions of current
behavior. Anything already working is listed under *Shipped*.

---

## Where it stands

Pre-1.0 (`0.1.0`). The orchestration kernel is the mature part of the system:
lifecycle, evidence rules, approvals, durable state, and fail-closed isolation
are implemented and covered by tests. The frontier is worker reliability — making
delegated agents produce deliverables that pass the gates on real repositories.

We are explicit about this because the gates already are. When Walter's first
real external-repository run failed, it produced no artifact and said so, and the
findings were written up in
[docs/first-real-run-gap-report.md](docs/first-real-run-gap-report.md) rather
than quietly dropped.

---

## What makes it different

Four properties that are enforced in code, not asked for in a prompt.

| Property | Where it lives |
| --- | --- |
| A worker's "done" is only a candidate. Acceptance requires recorded checks that passed against the candidate's exact content digest, plus a review by someone who never authored it. | `Orchestrator.accept` |
| One agent, one lane. A worker receives a task packet — objective, inputs, constraints, acceptance criteria, stop condition — and only the tools its capability profile grants, bound in closures it cannot reach past. It cannot spawn agents or widen its own scope. | `contracts.py`, `adapter.workspace_tools` |
| Operational truth is a database, not a transcript. Atomic snapshots and an append-only event log with optimistic concurrency; interrupted work resumes from durable state. | `store.py`, `Orchestrator.resume` |
| Candidate code executes in an isolated worktree under Bubblewrap with network-denying seccomp and hard resource limits, or it does not execute at all. There is no host fallback. | `sandbox.py` |

The design rule behind all four: **the model proposes, the kernel authorizes.**
No tool in the Manager's surface can grant an approval, fabricate check
evidence, promote code, or declare a run complete.

---

## What it is useful for today

Scoped honestly, because sandboxed execution currently admits Python templates
only:

- written deliverables — plans, analyses, comparisons, specifications — produced
  through a decomposed, reviewed, auditable process;
- small Python changes with tests, in a repository you point it at, verified by
  `compile`, candidate-scoped `pytest`, and regression `pytest` inside the
  sandbox;
- any workflow where you need to answer "why was this accepted?" months later
  from `walter run inspect` and `walter run events`, with per-run cost caps.

---

## Shipped

- Manager/worker orchestration end to end, driven by a live model, through
  planning, delegation, validation, independent review, acceptance, and a
  completion gate that requires every criterion to cite accepted artifacts.
- Twelve-state task lifecycle with accepted-only dependency satisfaction and
  artifact lineage verification.
- Typed, scope-digest-bound approvals; typed worker capability escalation with
  atomic, idempotent application.
- Bounded recovery routes over a typed failure taxonomy, and approval-gated
  replanning validated before it consumes a human review round-trip.
- Per-run usage budgets with clean exhaustion, and per-call usage accounting.
- Offline operator surface: list, inspect, events, resume, approve, abandon,
  cleanup, readiness demo.
- Continuous integration on every push and pull request, running the offline
  suite and the eval scenarios. The runner installs Bubblewrap and libseccomp and
  relaxes the AppArmor user-namespace restriction, so the sandbox tests execute
  for real instead of being skipped.
- Verification: offline suite green, 3/3 eval scenarios, readiness demo against
  real Bubblewrap.

### A note on the live evidence

Every live-model datapoint in this repository was recorded on 2026-09-20: the
end-to-end run that completed for ~$0.38 in 16 model calls, and the external-
repository run that failed honestly. Both predate two changes to the path they
exercised — the 2026-09-22 worker tool-calling fix, and the 2026-09-21 split of
the `pytest` validation scopes. One of those stale runs declared a check named
`unittest`, which no longer exists.

So the current worker invocation path has no end-to-end live measurement. Those
numbers are kept as history, not as claims about today. Establishing a fresh
baseline is the second item under *Now*.

---

## Now — worker reliability and loop cost

The next release is about the Manager's own cost, and then about establishing
what the current code actually does on a real objective.

Ordered by evidence. The last instrumented run spent 19 Manager calls against 2
worker calls — 90% of the spend went on orchestration overhead for a single-task
objective that accepted nothing. Worker reliability matters, but Manager
overhead dominates the bill, and unlike worker behavior it can be fixed and
measured without spending a cent.

- **Bounded Manager reads.** `inspect_run` returned the whole run snapshot,
  including artifact bodies and workspace diffs, so Walter's own context grew
  with exactly the material Walter exists to keep out of context windows. The
  read path is now a projection with explicit drill-down; the full snapshot
  stays on the CLI.
- **A measured live baseline.** One controlled run on a throwaway repository
  against current code, with a token cap, recording Manager calls, worker calls,
  tokens, cost, and outcome. Until that exists, every live number here is
  historical.
- **Pre-flight rejection of no-op candidates.** A developer lane that changed
  nothing should be handed straight back, not charged an attempt and put through
  validation.
- **Two-phase worker finalization.** Let a worker use its tools, then take its
  structured result in a separate tool-free call, so a worker that exhausts its
  turns does not lose the work it already did. Conditional: only warranted if the
  baseline shows single-call workers or turn-budget losses.
- **Cost as a tested invariant.** Offline evals cannot measure chattiness — the
  scripted steps dictate the call count — so the offline assertion is a bound on
  Manager tool payload size as a run grows. Model calls per accepted artifact is
  a live-only metric. Target: ≤6 median for a single-task objective.

## Next — autonomy that earns the name

- **Kernel-decided replan materiality.** Every model-authored replan is human-
  gated today, which contradicts the promise that Walter keeps going on its own.
  Let the kernel auto-apply reopen-only proposals that add no task, no
  capability, and no external effect, within the existing replan budget; keep
  everything else gated.
- **Separate Manager and worker model defaults,** and per-profile model
  selection. One model for both roles is the wrong default for two very
  different jobs.
- **A declared command surface beyond Python.** Per-project allowlisted check
  commands, so a JavaScript or Rust repository is a supported target rather than
  a dead end.
- **`walter run summary`** built on the same projection layer, for a readable run
  digest instead of raw JSON.

## Later

Multi-target ergonomics, a provider seam plus a second provider behind it, and a
usable research lane once a search tool exists that survives the chat-completions
path. The safety-boundary grant path stays unwired until someone wants the
security review it requires.

---

## How we will know it worked

- An external-repository Python task completes end to end, unassisted, twice in a
  row.
- Median model calls per accepted artifact at or below target, enforced in evals.
- Still zero manufactured evidence. This one is non-negotiable: we would rather
  ship a run that honestly produced nothing.

## Not on the roadmap

More lifecycle states. A provider matrix. A hosted service. Walter modifying its
own control plane. Each of those adds surface area to a system whose bottleneck
is elsewhere.
