# Security policy

Caveman's whole job is running code that a language model wrote, so isolation
and authority bugs are the worst bugs it can have. If you found one: first,
nice work. Second, please tell us before you tell the internet.

## Reporting a vulnerability

**Please don't open a public issue.** Use GitHub's private vulnerability
reporting instead:
[Report a vulnerability](https://github.com/who-is-michael-mercer/caveman/security/advisories/new).

Helpful things to include:

- what an attacker can do, and from where (anonymous visitor, signed-in user,
  author of a build request, generated code inside the sandbox, operator);
- steps to reproduce, ideally with the build request or files involved;
- the commit you tested, plus your host setup if it's a sandbox issue (kernel
  version, container runtime, seccomp and AppArmor settings).

You'll hear back within a few days. We'll keep you posted while we fix it and
credit you in the advisory, unless you'd rather stay a mysterious stranger.

## What we most want to hear about

- escaping the Bubblewrap sandbox, reaching the network from it, or reading
  host files, secrets or other projects from inside it;
- a candidate changing a protected path (`SAFETY_PATHS` in
  `src/walter/sandbox.py`), or getting work accepted without trusted checks and
  independent review;
- an approval being applied to a different scope than the one the user saw;
- reading or acting on another user's projects, runs or account;
- reaching the API without the service token, or the web app forwarding a user
  id it didn't verify;
- leaked credentials: provider keys, the service token, auth secrets or GitHub
  tokens showing up in logs, events, deliveries or the browser.

**Not in scope:** running out your own budget or rate limits, anything that
needs an already-compromised operator host, and the behavior of generated code
outside Caveman (it's untrusted by design; that's the raccoon policy in the
README).

## Supported versions

Caveman is pre-1.0. Security fixes land on the latest commit of the default
branch, and that's the only version we support.

The design and its known leftover risks are written up in
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
