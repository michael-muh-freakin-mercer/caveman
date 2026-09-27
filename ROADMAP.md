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
- A bounded model-facing read path, so Manager context no longer grows with
  candidate size.
- Verification: offline suite green, 3/3 eval scenarios, readiness demo against
  real Bubblewrap, and one measured live run on an external repository that
  completed on the first attempt — 27 model calls, 156k tokens, both predeclared
  checks and an independent review passed, live checkout untouched
  ([docs/baseline-2026-09-27.md](docs/baseline-2026-09-27.md)).

### A note on the live evidence

The measured baseline above is the only live datapoint that reflects current
code. The earlier numbers — an end-to-end run that completed for ~$0.38 in 16
model calls, and an external-repository run that failed honestly — were both
recorded on 2026-09-20 and predate the 2026-09-22 worker tool-calling fix and
the 2026-09-21 split of the `pytest` validation scopes. One of those runs
declared a check named `unittest`, which no longer exists. They are kept as
history, not as claims about today. Establishing a fresh
baseline is the second item under *Now*.

---

## Now — worker reliability and loop cost

The next release is about the Manager's own cost.

Ordered by evidence. The 2026-09-27 baseline completed a single-task objective
in 27 model calls, of which the Manager spent 12 and ~105k tokens — two thirds
of total spend, and twice the ≤6-call target for work that size. Worker
reliability is no longer the bottleneck on that evidence: the worker iterated
with its tools across 12 calls and passed both predeclared checks on the first
attempt.

- **Bounded Manager reads.** *Shipped 2026-09-27.* `inspect_run` returned the
  whole run snapshot, including artifact bodies and workspace diffs, so Walter's
  own context grew with exactly the material Walter exists to keep out of
  context windows. The read path is now a projection with explicit drill-down;
  the full snapshot stays on the CLI.
- **A measured live baseline.** *Shipped 2026-09-27.* See
  [docs/baseline-2026-09-27.md](docs/baseline-2026-09-27.md).
- **Fewer Manager turns.** 12 Manager calls for one task is the open cost
  problem. The next step is to establish where they go — turn-level accounting
  of which tool each Manager call invoked — before optimizing, since guessing is
  what produced the two stale roadmap items above.
- **Pre-flight rejection of no-op candidates.** *Shipped 2026-09-27.* A developer
  lane that changed nothing is handed straight back against the trusted diff,
  before a sandbox execution and the Manager turns spent discovering why.
- **Cost as a tested invariant.** Offline evals cannot measure chattiness — the
  scripted steps dictate the call count — so the offline assertion is a bound on
  Manager tool payload size as a run grows. Model calls per accepted artifact is
  a live-only metric. Target: ≤6 median for a single-task objective; currently 12.

## Next — autonomy that earns the name

- **Kernel-decided replan materiality.** *Shipped 2026-09-27.* A replan that only
  reopens work which never reached `ACCEPTED` now applies on Walter's own
  authority; adding or removing tasks, rewiring dependencies, or superseding
  accepted work stays gated. The kernel decides structurally and re-derives the
  assessment at apply time, so the model's own risk wording never moves the gate.
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
