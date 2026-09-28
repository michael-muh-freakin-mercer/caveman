# Security policy

Caveman runs untrusted, model-generated code, so isolation and authority bugs
are the most important bugs it can have. Thank you for reporting them
privately.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/who-is-michael-mercer/caveman/security/advisories/new).

Please include:

- what an attacker can do, and from which position (anonymous visitor, signed-in
  user, author of a build request, generated code inside the sandbox, operator);
- steps to reproduce, ideally with the build request or files involved;
- the commit you tested against, and your host setup if it concerns the sandbox
  (kernel version, container runtime, seccomp and AppArmor settings).

You can expect an acknowledgement within a few days. We will keep you informed
while we work on a fix, and credit you in the advisory unless you prefer
otherwise.

## Scope

Especially interesting:

- escaping the Bubblewrap sandbox, reaching the network from it, or reading
  host files, secrets or other projects from it;
- a candidate changing a protected path (`SAFETY_PATHS` in
  `src/walter/sandbox.py`) or getting work accepted without trusted checks and
  independent review;
- approvals applied to a scope other than the one the user was shown;
- reading or acting on another user's projects, runs or account;
- the API being reachable without the service token, or the web app forwarding
  an unverified user id;
- credential leaks: provider keys, the service token, auth secrets or GitHub
  tokens appearing in logs, events, deliveries or the browser.

Out of scope: denial of service by exhausting your own budget or rate limits,
findings that need a compromised operator host, and the behavior of generated
code outside Caveman (it is untrusted by design; see the README).

## Supported versions

Caveman is pre-1.0. Only the latest commit on the default branch receives
security fixes.

The design and its known residual risks are documented in
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
