<div align="center">

# Walter

**A manager agent that delegates the work and verifies the result.**

*The model proposes. The kernel authorizes.*

[![CI](https://github.com/who-is-michael-mercer/Walter/actions/workflows/ci.yml/badge.svg)](https://github.com/who-is-michael-mercer/Walter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](pyproject.toml)
[![Status: pre-1.0](https://img.shields.io/badge/status-pre--1.0-orange.svg)](ROADMAP.md)

[Install](#install) · [Quick start](#quick-start) · [How it works](#how-a-goal-becomes-accepted-work) · [Architecture](#architecture) · [Roadmap](ROADMAP.md)

<sub>Requires Linux with Bubblewrap · runs against OpenRouter</sub>

</div>

---

You give Walter an objective. It decides what has to happen, hands each piece of
work to a narrow worker agent, and checks what comes back against criteria it
declared up front. It keeps going until the objective is met, until it genuinely
needs a human decision, or until a budget you set runs out.

Walter never writes the deliverable itself. It plans, assigns, validates,
reviews, accepts, recovers, and escalates. Everything a worker returns is a
*candidate* until Walter accepts it — and Walter cannot accept it without
programmatic check results and an independent review recorded against the exact
bytes of that candidate.

---

## How a goal becomes accepted work

```text
                goal
                 │
                 ▼
      ┌─────────────────────┐       the model proposes;
      │  Walter (Manager)   │       the kernel authorizes and persists
      └──────────┬──────────┘
                 │  one task · one worker · one inspectable deliverable
        ┌────────┼────────┐
        ▼        ▼        ▼
     worker    worker   worker      fresh context, only granted tools
        │        │        │
        └────────┴────────┘
                 │  candidate artifact (provisional, not done)
                 ▼
        trusted validation          predeclared checks run by Walter's code,
                 │                  not by the worker that wrote the candidate
                 ▼
        independent review          fresh read-only reviewer, never the author
                 │
                 ▼
        Manager acceptance ──────▶  gate fails? classify the failure, then
                 │                  retry / revise / replace / escalate / replan
                 ▼
             ACCEPTED               only this state unlocks dependent tasks
                 │
                 ▼
          completion gate ───────▶  every criterion must cite accepted artifacts
                 │
                 ▼
        result + durable audit trail
```

Every box after "Walter" is enforced by deterministic Python, not by prompt
instructions. The Manager model chooses *what* to do; `src/walter/orchestration.py`
decides whether that action is legal and records it.

The loop is model-driven rather than scheduled: each step above is one Manager
tool call. Independent tasks can be delegated in the same batch of tool calls,
and the kernel serializes durable mutations under that concurrency, but nothing
in Walter runs a task queue on its own.

---

## Why it is built this way

A single large agent that owns a whole objective tends to fail in predictable
ways: its context fills with detail from unrelated subproblems, it holds every
tool it might ever need, and it is the sole judge of its own output. When it goes
wrong, there is one long transcript to untangle and no natural unit to retry.

Walter splits those concerns apart.

| Problem with one big agent | What Walter does instead |
| --- | --- |
| Context accumulates until quality drops | Each worker gets one task packet: objective, inputs, constraints, acceptance criteria, stop condition |
| Every tool is available for every step | Capability profiles are per task; a worker's tools are bound in trusted closures it cannot reach past |
| The author grades its own work | A fresh reviewer, independent of every prior author of the candidate, records the verdict |
| "Done" is a claim in prose | "Done" is a set of recorded checks and a review against the candidate's content digest |
| A wrong turn is hard to isolate | A bad lane fails as one task, with a classified cause and a bounded recovery route |
| Losing the process loses the work | Run, task, artifact, approval, and event state lives in SQLite, not in the conversation |

The cost of this design is real: more model calls, more bookkeeping, and a
Manager that sometimes spends turns reading its own state. Walter trades
throughput for inspectability.

---

## Manager and workers

| | Manager (Walter) | Worker |
| --- | --- | --- |
| Scope | The whole objective | One lane of one task |
| Creates agents | Yes, exclusively | Never |
| Tools | 17 orchestration tools; no editor, no shell, no network | Only what its capability profile grants |
| Context | Durable run state, read through `inspect_run` | Its task packet and accepted upstream inputs |
| Output | Decisions, acceptance, escalation, final result | One provisional deliverable plus honest evidence |
| Can accept work | Yes, when every gate passes | Never, including its own |
| Can widen scope | Only through an approval-gated replan | Never; it may file a typed capability request |

Workers are temporary. A failing worker gets a bounded number of revision rounds
and is then replaced rather than coaxed. External content, repository files, and
worker output are all treated as data — they cannot redirect the Manager.

---

## Completion is not acceptance

A worker returning `status: "completed"` changes nothing except that a candidate
artifact now exists. `accept_task` refuses unless all of the following hold:

- every check in the task's `required_checks` is recorded **and** passed;
- no recorded check failed against the candidate's current content digest;
- an independent review passed, whenever review is required, the task is
  high-risk, or the capability is `developer_sandbox` — and the kernel refuses to
  record a review authored by anyone who worked the task;
- validation and review evidence matches the candidate's content digest and, for
  workspace tasks, its workspace fingerprint;
- the Manager's own identity appears nowhere in the evidence chain;
- declared inputs are still accepted and the candidate's recorded provenance
  matches them.

Checks are executed by Walter's own code, never reported by the worker. For
`developer_sandbox` lanes they run inside the sandbox: `compile` parses every
Python source, `pytest`/`pytest_candidate` runs the tests the candidate added or
changed, and `pytest_regression` runs the pre-existing suite the candidate did
*not* touch. A recorded failure against those exact bytes is permanent — the fix
is a revised candidate, not a re-run.

When a gate fails, the Manager classifies the cause and the kernel picks the
route:

| Failure class | Route |
| --- | --- |
| `PROVIDER_FAILURE`, `TIMEOUT` | `RETRY` |
| `BAD_OUTPUT`, `MISSING_EVIDENCE` | `REVISE` |
| `REPEATED_BAD_OUTPUT`, `CONSTRAINT_VIOLATION` | `REPLACE` |
| `CAPABILITY_UNAVAILABLE`, `UNSUPPORTED_CAPABILITY`, `TOOL_FAILURE` | `ESCALATE` |
| everything else, or an exhausted budget | `REPLAN` |

Attempts (3), revisions (2), and replans (3) are bounded per task and per plan.
An exhausted attempt budget downgrades a retry to a replan; an exhausted revision
budget downgrades a revision to worker replacement.

---

## Requirements

Walter is Linux-only in practice, because candidate command execution fails
closed on a missing isolation backend rather than falling back to the host.

| Requirement | Why |
| --- | --- |
| Python 3.11+ | `StrEnum`, modern typing |
| `/usr/bin/bwrap` (Bubblewrap) | Sandboxed candidate execution; absence is a hard failure |
| `libseccomp.so.2` | Network-denial BPF profile applied to sandboxed commands |
| `/usr/bin/prlimit` (util-linux) | Per-command CPU, memory, file-size, and process limits |
| `git` | Candidate worktrees for `repo_reader` and `developer_sandbox` lanes |
| An OpenRouter API key | The only configured model provider |

Distributions disagree about where the dynamic loader lives — Arch keeps it in
`/usr/lib`, Debian and Ubuntu in `/usr/lib64` — so the sandbox probes for it and
reproduces whichever layout the host uses. Unprivileged user namespaces must be
permitted; Ubuntu 24.04 restricts them through AppArmor, which the CI workflow
relaxes explicitly.

---

## Install

Install editable from a checkout. The Manager's doctrine is loaded from the
checkout's `SYSTEM_PROMPT.md` at startup, so a non-editable install into
`site-packages` will not start.

```bash
git clone https://github.com/who-is-michael-mercer/Walter.git
cd Walter
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
```

Configure the provider in a gitignored `.env` (see `.env.example`) or in the
environment:

```bash
cp .env.example .env
$EDITOR .env      # set OPENROUTER_API_KEY
```

Verify the install without spending credits:

```bash
python -m pytest -q
walter run list
```

---

## Quick start

```bash
walter
```

```text
Walter ready. Session: main
Commands: :new starts a fresh run, :clear resets this conversation, :quit exits.
Follow-up messages continue the current run until it completes.
Operational state is durable. Provider trace export is disabled.

walter>
```

A good first objective is bounded, model-only, and easy to judge:

```text
walter> Compare three approaches to schema migration for a single-file SQLite
        application store, with explicit tradeoffs and one recommendation.
```

Expect Walter to define completion criteria, plan one or two narrow tasks,
delegate them, run the `result_schema` check, commission a reviewer, accept, and
finish. The exact decomposition is the model's call. Budget for several Manager
model calls per step; the bookkeeping costs credits.

One-shot mode takes the objective as an argument:

```bash
walter "Draft a migration plan for the operational store, with rollback steps"
```

Both modes accept the same flags:

```bash
walter --session project-a          # keep conversation history under a named session
walter --max-turns 60               # per-message Manager turn budget (default 30)
```

Interactive follow-ups continue the same durable run until it reaches a terminal
state; `:new` starts a fresh one.

Walter operates on the current working directory. It writes `.local/` there, and
`repo_reader`/`developer_sandbox` lanes create git worktrees from that
repository's `HEAD`. To point Walter at another project, run it from that
project's checkout.

---

## Operating runs

Conversation state and operational state are separate databases in `.local/`:

- `walter-sessions.db` — conversation history only. Clearing it erases no
  operational truth.
- `walter-operations.db` — authoritative runs, tasks, artifacts, approvals, events.

Everything below reads or mutates operational state directly. Only
`resume --execute` spends provider credits.

```bash
walter run list                                     # every run and its status
walter run inspect  RUN_ID                          # full durable snapshot as JSON
walter run events   RUN_ID                          # append-only event log
walter run resume   RUN_ID                          # offline interruption recovery
walter run resume   RUN_ID --execute                # then hand the run back to the model
walter run approve  RUN_ID APPROVAL_ID --reason "Reviewed exact scope"
walter run approve  RUN_ID APPROVAL_ID --deny --reason "Scope rejected"
walter run abandon  RUN_ID --reason "Superseded by a fresh run"
walter run cleanup  RUN_ID                          # retire worktrees/branches of a terminal run
walter run readiness-demo                           # offline end-to-end self-check
```

Notes that matter in practice:

- `resume` is offline. It converts interrupted `DELEGATED` and `RUNNING`
  assignments to `FAILED` with `TIMEOUT` evidence so recovery is an explicit
  decision. It never re-runs a worker on its own.
- `abandon` is the no-spend exit for an active run holding no in-flight task, no
  pending approval, and no pending capability request. It refuses otherwise, and
  names the exact blocker.
- `cleanup` removes only `walter-candidate/*` worktrees and branches for a
  terminal run. Durable snapshots and events are never touched.
- `approve` records the local OS principal (`local-os:<user>:uid:<uid>`) as the
  deciding authority. That is useful audit attribution on a single-user host, not
  authentication. Approving never performs the action.

---

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | — | Provider credential. The `.env.example` placeholder is rejected at startup. |
| `WALTER_MODEL_PROVIDER` | no | `openrouter` | Only `openrouter` is accepted; anything else fails configuration. |
| `OPENROUTER_BASE_URL` | no | `https://openrouter.ai/api/v1` | Must be an absolute HTTPS URL. |
| `WALTER_MODEL` | no | `moonshotai/kimi-k3` | Manager model. |
| `WALTER_WORKER_MODEL` | no | `moonshotai/kimi-k3` | Model for workers and reviewers. |
| `WALTER_WORKER_MAX_TURNS` | no | `24` | Turn budget for one worker or reviewer invocation. |
| `WALTER_MAX_MODEL_CALLS` | no | unlimited | Per-run cap on model calls. |
| `WALTER_MAX_INPUT_TOKENS` | no | unlimited | Per-run cumulative input tokens. |
| `WALTER_MAX_OUTPUT_TOKENS` | no | unlimited | Per-run cumulative output tokens. |
| `WALTER_MAX_TOTAL_TOKENS` | no | unlimited | Per-run cumulative total tokens. |

Budgets are cumulative across a run's model calls, including worker and reviewer
calls. Exhaustion stops the run and reports it cleanly instead of continuing. A
malformed budget value (non-integer or negative) fails configuration rather than
being ignored. Provider configuration is validated before any new provider-backed
run is created, so a misconfigured environment cannot strand a half-built run.

Provider trace export is disabled in code, and sensitive trace payloads are never
exported. The `--trace-sensitive` flag is a reserved compatibility no-op; CLI
output labels workflow IDs as local only.

---

## Models

OpenRouter is the only configured provider, reached through the Agents SDK's
chat-completions model class. Two roles are configurable: the Manager
(`WALTER_MODEL`) and everything it commissions (`WALTER_WORKER_MODEL`, used for
both workers and independent reviewers).

Both models must support tool calling. The Manager acts exclusively through
tools, and workspace lanes are useless without it. Worker and reviewer output is
requested as schema-shaped JSON in the prompt rather than through the SDK's
structured-output setting, because on the OpenRouter chat-completions path
`response_format` suppresses tool calling entirely — nested agents answered
directly and never touched their granted tools. Walter validates that JSON
client-side.

Per-call usage is recorded against the run (provider, model, role, task,
assignment, worker, token counts), which is what makes budgets and cost review
possible after the fact.

---

## What a run actually looks like

Take a concrete objective:

> Add a `multiply(a, b)` function to `calc.py` with tests.

Decomposition is decided by the Manager at runtime and is not deterministic, but a
representative shape is:

1. **Criteria.** `set_completion_criteria` replaces the sentinel criterion a new
   run starts with. Until that happens, planning and delegation are refused.
2. **Inputs.** `register_repository_inputs(["calc.py", "test_calc.py"])` — trusted
   code reads each file and records a `sha256:` digest. A declared
   `required_inputs` entry must resolve to a registered input, a task ID, or an
   accepted artifact ID; planning rejects anything else by name. Registered
   inputs are immutable.
3. **Plan.** `plan_tasks` adds one `developer_sandbox` task with
   `required_checks: ["pytest"]`. A developer task without a predeclared
   executable check is rejected at planning time.
4. **Delegate.** `delegate_task` creates a candidate git worktree, grants exactly
   `read_file`, `list_files`, `inspect_diff`, `workspace_status`, `write_file`,
   `delete_file`, `run_check`, and runs one fresh worker against the task packet.
5. **Validate.** `validate_task` spawns a separate read-only executor grant and
   runs pytest over the candidate's changed test files inside Bubblewrap. If the
   candidate changed no test file, the check fails — there is nothing to trust.
6. **Review.** `review_task` commissions a reviewer that has never authored on
   this task, with read-only workspace tools. A reviewer of a code lane that
   inspects no file is recorded as failed.
7. **Accept or recover.** `accept_task` applies the gates above. A failed gate
   becomes a classified failure and a bounded recovery route.
8. **Finish.** `finish_run` requires a JSON object mapping each completion
   criterion verbatim to a non-empty list of accepted artifact IDs. Prose is
   rejected. So is any remaining required approval.

The result is a completed run whose entire history — assignments, candidate
diffs, check output, review verdicts, acceptance decisions, approvals — is
readable with `walter run inspect` and `walter run events` long after the
conversation is gone.

---

## Architecture

```text
src/walter/
├── orchestration.py    deterministic kernel: transitions, readiness, gates,
│                       approvals, recovery routes, replans, completion
├── models.py           durable state: runs, plans, tasks, artifacts, approvals,
│                       capability requests, failures, usage records, events
├── store.py            atomic SQLite snapshots, append-only events, optimistic
│                       concurrency, transactional v1→v2 migration
├── contracts.py        the worker contract: TaskPacket in, WorkerResult out
├── adapter.py          Agents SDK boundary: the 17 Manager tools, worker and
│                       reviewer invocation, trusted validation execution
├── runtime.py          provider config, model construction, Manager assembly
├── cli.py              `walter` and `walter run ...`
├── sandbox.py          candidate worktrees, signed grants, fail-closed bwrap
├── usage.py            per-run usage budget accounting
├── usage_model.py      model wrapper that records usage and enforces budgets
├── readiness.py        offline end-to-end readiness fixture
└── pulse.py            pure metadata-only run summaries (library only, not
                        yet exposed through the CLI)
```

The single most important boundary is between `adapter.py` and
`orchestration.py`. Manager tools are thin: they parse arguments, then call the
kernel, which reloads the run snapshot, authorizes the transition, appends
events, and commits atomically. A tool cannot grant an approval, fabricate check
evidence, promote code, or complete a run.

Start reading at `DurableController.tools()` in `src/walter/adapter.py` for the
Manager's whole action surface, then `Orchestrator.accept` and
`Orchestrator.complete` in `src/walter/orchestration.py` for the gates that
actually decide outcomes.

The main path and its recovery branches, all enforced by the kernel's transition
table:

```text
PLANNED ─▶ READY ─▶ DELEGATED ─▶ RUNNING ─▶ SUBMITTED ─▶ REVIEWING ─▶ ACCEPTED
                                                              │
                                    REVISION_REQUIRED ◀────────┤
                                    REPLACED          ◀────────┤
                                    FAILED            ◀────────┘

REVISION_REQUIRED ─▶ DELEGATED | BLOCKED
FAILED ─▶ READY | REVISION_REQUIRED | REPLACED | BLOCKED
BLOCKED ─▶ READY | REPLACED
ACCEPTED, REPLACED and CANCELLED are terminal
```

Only `ACCEPTED` satisfies a dependency. A submitted, reviewed, or
nearly-finished task unlocks nothing.

---

## Capabilities and approvals

A task's capability profile is chosen by the Manager and constructed by trusted
code. Workers cannot select, request, or forge their own tools.

| Profile | Granted |
| --- | --- |
| `model_only` | No tools; typed reasoning output only |
| `repo_reader` | Read, list, diff, and status inside an isolated candidate worktree |
| `developer_sandbox` | Those reads plus bounded writes and allowlisted sandboxed commands |
| `reviewer` | Read-only candidate inspection; commissioned only by `review_task` |
| `researcher` | Hosted web search — **currently unusable** (see below) |

A worker that needs more authority returns a typed capability request with its
partial work preserved. The Manager may deny it, or bind it to an exact human
approval covering task, profile, and a Manager-created workspace ID. Approval is
intermediate: authority changes only when application succeeds atomically and the
request is recorded as `escalated`. Denial grants nothing and cleans up the
pending workspace.

Walter continues on its own through reversible orchestration choices inside the
accepted objective — decomposing, sequencing, assigning, requesting corrections,
commissioning reviews, classifying failures, accepting evidence-backed work. It
escalates to a human for:

- merge, push, release, deployment, or any promotion of candidate code;
- destructive or irreversible actions;
- spending, subscriptions, or binding commitments;
- external communication on the human's behalf;
- secrets, credentials, or privileged access;
- permission, sandbox, or safety-boundary changes;
- material scope change — a replan that adds or removes tasks, rewires
  dependencies, or would supersede accepted work. The kernel makes that call
  from the proposal's structure, not from the model's own risk assessment;
- capability escalation beyond standing Manager authority.

A replan that only reopens work which never reached `ACCEPTED` applies on
Walter's own authority, because it discards nothing you were shown. That
assessment is re-derived at apply time, so a proposal whose impact grew while it
waited is refused rather than applied on a stale judgement.

Approvals are lifecycle objects bound to one exact action and a canonical scope
digest. Change the artifact, branch, base revision, diff, target, or consequence
and the old approval no longer applies; a replacement request is required. For
candidate actions, scope is recomputed from current trusted state — accepted
artifact, workspace fingerprint, branch, base revision, diff digest, target —
immediately before authorization.

Walter has no merge, push, deploy, or promotion tool. Authorization confirms
permission; a separate mechanism outside Walter must perform the act.

---

## Durability and recovery

Operational truth is a snapshot plus an ordered event log, not a transcript.

- Each mutation reloads the run, applies one authorized operation, appends its
  events, and commits in a single transaction with an optimistic version check.
- A losing writer raises `ConcurrentUpdate`; single-step Manager tools retry once,
  multi-step tools return a plain-language `concurrent_update` result telling the
  Manager to re-read state. Approving from a second terminal during a live run is
  therefore safe.
- Kill the process mid-task and durable state survives. `walter run resume` marks
  the interrupted assignment `FAILED` with `TIMEOUT` evidence and waits for an
  explicit recovery decision.
- Artifacts carry version, predecessor, declared input artifact IDs, content
  digest, and workspace fingerprint. Acceptance re-verifies that whole lineage, so
  an artifact whose upstream stopped being canonical cannot silently stay
  accepted.
- Replans are persisted proposals. They are validated against the kernel's real
  rules *before* an approval gate exists — every defect named at once — and
  re-validated at application time because upstream facts move while a gate is
  open.
- Snapshots load forward-compatibly: unknown fields are pruned with a warning
  instead of bricking the database.

---

## Sandboxing

Candidate code runs in an isolated worktree, never in the live checkout.

- `git worktree add -b walter-candidate/<id>` under `.local/sandboxes/`, based on
  the repository's current `HEAD`. Grants are signed in `grants.json` with a
  local key; a grant whose binding no longer verifies is refused.
- Commands execute under Bubblewrap with user, PID, IPC, and UTS namespaces
  unshared, all capabilities dropped, a cleared environment, a read-only snapshot
  of the candidate at `/workspace`, a read-only Python environment at
  `/opt/walter-env`, and bounded writable scratch at `/tmp`.
- A seccomp BPF profile denies socket, connect, bind, listen, send, and receive
  syscalls, so sandboxed commands have no network regardless of namespace
  support.
- `prlimit` caps address space, CPU time, file size, open files, and processes.
  Walter additionally monitors wall time, aggregate process count, aggregate RSS,
  and scratch usage, and kills the process group on violation.
- Only Manager-defined command templates are admitted: Python invocation, an AST
  compile check, and pytest over selected files. Other toolchains are not
  supported — that is a deliberate boundary, not an oversight.
- Candidate snapshots exclude repository state (`.git`, `.local`, `.venv`,
  `node_modules`, caches) and credential-shaped paths (`.env`, `.ssh`, `.aws`,
  key and token files). Symlinks are refused outright.
- Walter's own doctrine files and control-plane modules are listed as safety
  paths: readable, diffable, and fingerprintable, but write-denied for every
  ordinary grant.

If Bubblewrap or libseccomp is missing or unusable, execution raises
`SandboxUnavailable`. There is no host fallback — a green result would otherwise
mean nothing.

---

## Testing

```bash
python -m pytest -q                                 # offline suite; no credits spent
python evals/runner.py                              # orchestration scenarios, scripted fakes
walter run readiness-demo                           # real Bubblewrap, real worktree, offline
WALTER_LIVE_SMOKE=1 python -m pytest -q -m live     # opt-in, spends provider credits
```

`pytest` is the only verification entrypoint; no lint, format, or typecheck
tooling is configured. Several modules — `test_adapter.py`, `test_runtime.py`,
`test_usage_model.py`, `test_live_smoke.py` — call
`pytest.importorskip("agents")`, so SDK-dependent coverage silently disappears if
the Agents SDK is not installed in the active environment.

[CI](.github/workflows/ci.yml) runs the offline suite and the eval scenarios on
every push and pull request. The runner installs Bubblewrap and libseccomp and
relaxes the AppArmor user-namespace restriction, so the sandbox tests execute for
real rather than being skipped.

The readiness demo is a harmless fixture, not an authorization. It drives one
candidate change through the real isolation backend, trusted validation,
independent review, Manager acceptance, durable reload, and a promotion approval
request, then stops with that human decision pending. The run therefore stays
`active` with a pending approval; deny it, then `walter run abandon` and
`walter run cleanup` to reclaim the worktree and close the record.

`evals/runner.py` runs offline against the durable runtime by default; set
`WALTER_EVALS_LIVE=1` for real models and `WALTER_EVALS_MAX_TURNS` to change the
turn ceiling. Scenario definitions live in `evals/cases/`.

---

## Status

Pre-1.0. The kernel, durable store, sandbox, and approval machinery are
substantial and covered by tests; the autonomous loop on real-world objectives is
the least mature part of the system. [ROADMAP.md](ROADMAP.md) states what we are
building next and how we will measure it.

**Working today**

- Manager/worker orchestration end to end, driven by a live model, through
  planning, delegation, validation, independent review, acceptance, and the
  completion gate.
- The 12-state task lifecycle with accepted-only dependency satisfaction,
  artifact provenance and lineage checks, and a completion gate a fresh run
  cannot satisfy.
- Durable SQLite operational state with append-only events, optimistic
  concurrency, and a transactional schema migration that retains source
  snapshots.
- Typed, scope-digest-bound approvals; typed worker capability escalation with
  atomic, idempotent application.
- Bounded recovery routes, and replanning gated on kernel-assessed materiality.
- A bounded model-facing read path, so Manager context does not grow with
  candidate size.
- No-op candidate refusal: a developer lane that changed no file is handed back
  before a sandbox execution is spent on it.
- Fail-closed Bubblewrap execution with signed workspace grants, candidate
  fingerprints, and template-bound commands.
- Per-run usage budgets with clean exhaustion reporting, and per-call usage
  accounting.
- Offline CLI operations: list, inspect, events, resume, approve, abandon,
  cleanup, readiness demo.

**Partial or rough**

- The Manager loop is chatty. A small objective has taken on the order of a dozen
  Manager model calls, which costs credits and turns.
- The first real external-repository run did not complete: it blocked honestly
  with attempts exhausted after three worker failures. The gates behaved
  correctly; worker reliability was the limit. Findings are in
  [docs/first-real-run-gap-report.md](docs/first-real-run-gap-report.md).
- The `researcher` profile is unusable with the configured provider. The SDK's
  hosted `WebSearchTool` is rejected by OpenRouter chat completions, and the
  runtime records that honestly as `TOOL_FAILURE` with no artifact created.
  Fixing it needs a search-capable chat-completions tool or a different provider
  path.
- Sandboxed commands cover Python only; no other toolchain is admitted.
- `pulse.py` produces run summaries but is not wired into the CLI.
- OpenRouter is the only provider.

**Deliberately not wired**

- The safety-boundary grant path is built and tested, but nothing injects an
  approval verifier, so it can only deny. Candidates cannot modify Walter's
  doctrine or control-plane files at all. Enabling it requires a security design
  review first.
- Adjudicator, domain-scoping, handoff, and result-packet mechanisms exist as
  written doctrine only.
- Self-build readiness is a demonstration. It authorizes no real
  self-development, merge, push, deploy, or promotion.

---

## Documentation

The specs are the source of truth for behavior; `SYSTEM_PROMPT.md` is the only
one loaded at runtime.

| Document | Contents |
| --- | --- |
| [ROADMAP.md](ROADMAP.md) | Where the project stands, what ships next, how it is measured |
| [SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) | Manager doctrine, loaded into the Manager agent |
| [OPERATING_MODEL.md](OPERATING_MODEL.md) | Control loop, canonical lifecycle, acceptance authority |
| [TASK_PROTOCOL.md](TASK_PROTOCOL.md) | Task packet and result semantics |
| [PERMISSIONS.md](PERMISSIONS.md) | Authority chain, approval categories, exact scope rules |
| [TOOLS.md](TOOLS.md) | Capability profiles, check semantics, sandbox policy |
| [QA_PROTOCOL.md](QA_PROTOCOL.md) | Validation and review standards |
| [FAILURE_RECOVERY.md](FAILURE_RECOVERY.md) | Failure taxonomy and recovery routes |
| [STATE_MODEL.md](STATE_MODEL.md) | Durable state shape |
| [CHARTER.md](CHARTER.md) | Scope and non-goals |
| [docs/IMPLEMENTATION_STATE.md](docs/IMPLEMENTATION_STATE.md) | Verified capabilities, gaps, decisions |
| [docs/walter-bootstrap-master-blueprint.md](docs/walter-bootstrap-master-blueprint.md) | Primary bootstrap specification |
| [CHANGELOG.md](CHANGELOG.md) | Dated decisions and behavior changes |

`prompts/`, `protocols/`, `templates/`, `runbooks/`, and `.codex/` are human
reference material and are not loaded by the runtime.

---

## License

MIT. See [LICENSE](LICENSE).
