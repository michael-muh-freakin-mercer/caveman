## Why

<!-- The problem this solves or the behavior it changes. The diff already says what; tell us why. -->

## What changed

-

## Receipts

<!-- How you know it works: commands you ran and what they showed. "Works on my machine" is a start, not a finish. -->

- [ ] `python -m pytest -q`
- [ ] `python evals/runner.py`
- [ ] `web/`: `npm run typecheck && npm run lint && npm test`
- [ ] `web/`: `npx playwright test` (for user-facing or cross-service changes)

## Before you hit the button

- [ ] Doctrine and code still agree (`doctrine/` updated if enforcement changed)
- [ ] No protected path (`SAFETY_PATHS`), budget or authority boundary widened without saying so above
- [ ] Dated `CHANGELOG.md` entry for anything a user or operator would notice
- [ ] No secrets, real keys or personal data in the diff (double-check; we all have that one story)
