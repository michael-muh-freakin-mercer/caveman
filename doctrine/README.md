# Doctrine

The rulebook. These are the written rules the orchestration core lives by, and
they are the source of truth for behavior: when the code and the doctrine
disagree, one of them has a bug (and it's usually the code).

Only [SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) is loaded into a model's prompt
automatically (as the Manager's instructions). Specialists with file tools can
still open the others like any file in the workspace, but nothing depends on a
model reading or obeying them: the kernel enforces them in plain code, and these
files say what it must enforce and why. Models get told the rules; the kernel
makes them stick.

> **Look, don't touch.** The specs below (except `MEMORY.md` and `AGENTS_SDK.md`)
> are on the sandbox's safety list (`SAFETY_PATHS` in `src/walter/sandbox.py`):
> agent-built candidates can read them but can't rewrite the rules they're
> judged by. Moving or renaming one means updating that list; a test fails if
> they drift apart.

## Specifications

| File | Contents |
| --- | --- |
| [SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) | Manager doctrine, loaded into the Manager agent |
| [CHARTER.md](CHARTER.md) | Identity, scope and non-goals |
| [OPERATING_MODEL.md](OPERATING_MODEL.md) | Control loop, canonical task lifecycle, acceptance authority |
| [TASK_PROTOCOL.md](TASK_PROTOCOL.md) | Task packet and result semantics |
| [PERMISSIONS.md](PERMISSIONS.md) | Authority chain, approval categories, exact-scope rules |
| [TOOLS.md](TOOLS.md) | Capability profiles, check semantics, sandbox policy |
| [QA_PROTOCOL.md](QA_PROTOCOL.md) | Validation and independent review standards |
| [FAILURE_RECOVERY.md](FAILURE_RECOVERY.md) | Failure taxonomy and recovery routes |
| [STATE_MODEL.md](STATE_MODEL.md) | Durable state shape |
| [AGENT_CREATION.md](AGENT_CREATION.md) | Who may create specialists, and how they are bounded |
| [MEMORY.md](MEMORY.md) | Canonical state versus provisional worker output |
| [AGENTS_SDK.md](AGENTS_SDK.md) | How the core sits on the OpenAI Agents SDK |

## Reference material

Not loaded by the runtime; kept as design reference. Files marked
"not implemented" describe mechanisms the runtime doesn't have yet, so treat
them as blueprints, not documentation.

- [prompts/](prompts/): worker, reviewer, adjudicator, domain-scoping and status prompt templates
- [protocols/](protocols/): delegation and reporting procedures
- [templates/](templates/): task packet, result packet, decision, failure, handoff and state records
