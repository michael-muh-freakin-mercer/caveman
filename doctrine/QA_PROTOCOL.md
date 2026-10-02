# Quality Assurance Protocol

## Evidence chain

Worker output is always provisional. Acceptance requires evidence bound to the exact candidate content digest and, for workspace work, the frozen workspace fingerprint.

1. The worker submits a structured result and candidate artifact.
2. Trusted validators run every predeclared check.
3. A fresh reviewer evaluates the candidate and criteria when review is required.
4. The Manager records an acceptance decision only after all gates pass.
5. Only the accepted artifact may enter canonical state or unlock dependents.

The author cannot validate or review its own artifact. The reviewer must differ from the author, receives read-only access, and cannot alter or accept the candidate. A development reviewer must actually inspect candidate files. A read-only investigation lane (`repo_reader`) declares no file changes, so an empty diff is expected there: its reported content is reviewed against the repository, and inspecting no file is not by itself a defect. Changed candidate identity makes earlier evidence stale.

Submission is assignment-bound: task, assignment ID, and worker ID must match the current persisted assignment. Candidate action approval is constructed and later rechecked from trusted current workspace/artifact state; model-supplied branch, base, or diff identity is insufficient.

## Trusted checks

The current adapter supports `result_schema`, `compile`, `pytest` (legacy alias of `pytest_candidate`), `pytest_candidate`, and `pytest_regression`. `result_schema` verifies structured completion and a nonempty deliverable; it is not a claim of substantive quality. `compile` is Python syntax validation over candidate sources. Executable checks run through the isolated sandbox and record argv, return code, stdout, and stderr. A developer candidate must add or modify at least one `test_*.py`/`*_test.py` file; `pytest`/`pytest_candidate` validates only the candidate's changed test files inside the isolated sandbox and fails if none are present. `pytest_regression` runs the pre-existing suite (every test file the candidate did not touch) so a change that breaks existing tests cannot pass on its own new tests alone. A recorded validation failure on the current content bytes is final for that candidate (strict evidence rule, 2026-09-21): it cannot be re-run to green; correction requires a revised candidate.

## Review policy

Runtime-planned tasks require independent review; `developer_sandbox` tasks are marked high risk. Review should test every acceptance criterion and use artifact, validation, source/diff, and relevant upstream evidence. Security, safety, permission, and self-modifying work always require independent evaluation.

Review checks the candidate against the plan, not only against its tests (2026-09-30 decision). The adapter builds a numbered list of plan items from the persisted task packet: the planned deliverable, every acceptance criterion, every constraint, and, in workflow mode, each run success criterion that only this task is planned to satisfy. The reviewer receives that list with the user's request and must return one verdict per item. The reviewer's own `passed` is a claim: the adapter records the review as failed when any item has no verdict, any item is ruled unmet, or the reviewer reports a finding of high or critical severity. Reviewers are told to look for secrets taken as command-line arguments, printed, logged or stored in plain text, for user data saved in place, and for injection, path traversal, loose file permissions and silent data loss. A success criterion shared between several tasks is not yet checked as a whole at the end of a run.

The Manager checks deliverable existence, scope, criteria, contradictions, provenance, validation results, reviewer independence, and candidate identity. Manager acceptance is necessary but does not replace scoped human promotion approval.

## Rejection

Failed validation or review prevents acceptance. Correction routes through `REVISION_REQUIRED`, replacement, or explicit replan. Default maximum revisions with the same route are two; attempts and replans are separately bounded. Conflicting material judgments require targeted follow-up or adjudication, not averaging.

Adjudication is a design reference only: it is not an implemented mechanism in the
current runtime. Conflicting judgments currently route through targeted follow-up,
revision, replacement, or explicit replan.
