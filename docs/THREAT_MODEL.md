# Caveman threat model

The starting point for the external security review (launch checklist item 4).
It describes the system as built and names the risks that remain.

## Assets

| Asset | Where it lives |
| --- | --- |
| Model provider key (`OPENROUTER_API_KEY`) | Worker environment only |
| Service token (`CAVEMAN_API_TOKEN`) | Web server and API |
| Auth secret, user sessions, password hashes | Web server and auth database |
| Users' GitHub OAuth tokens (for publishing) | Auth database, encrypted at rest (`encryptOAuthTokens`) |
| Users' projects: prompts, generated code, deliveries | Operational database and data volume |
| Evidence integrity: validation results, reviews, acceptance, approvals | Kernel store, written only through `walter.orchestration` |
| Spending: provider credit | Bounded per run, per account and per month |

## Actors

1. **Anonymous internet user**: can reach the public web pages and the auth endpoints.
2. **Signed-in user**: can use their own projects and runs through the web app.
3. **Malicious user**: a signed-in user who tries to reach other users' data, escape the sandbox, forge evidence or run up costs.
4. **Generated code**: untrusted by definition. It may be written by a model steered by a hostile prompt, or come from an imported repository.
5. **Model output**: untrusted text and tool calls. The model proposes; the kernel authorizes.
6. **Imported repository content**: untrusted files from a public GitHub repository.
7. **Operator**: trusted, with host and database access.

## Trust boundaries

```
Browser ──(session cookie, same-origin JSON)──▶ Web server ──(service token + user id)──▶ API ──▶ databases
                                                                                         Worker ──▶ provider (key)
                                                                                           │
                                                                                           ▼
                                                                        Sandbox (Bubblewrap): generated code
```

- **Browser → web.** Better Auth sessions. A nonce CSP allows only the page's
  own scripts, and `frame-ancestors 'none'` blocks framing. The API proxy
  accepts an allowlisted path set only; state-changing requests must be
  same-origin JSON. Forms cannot submit before hydration, so field values never
  reach a URL.
- **Web → API.** The API is on a private network and requires the service
  token. The web server forwards the verified session's user id only, and every
  project and run lookup is filtered by owner.
- **API/worker → kernel.** Only the kernel records validation, review,
  acceptance, approvals and completion. The platform has no write path for them
  and the browser has none either.
- **Worker → sandbox.** Candidate code runs in Bubblewrap with unshared
  namespaces, no network (seccomp), a cleared environment, resource limits and
  a read-only snapshot; credential-shaped paths are withheld and unwritable.
  If isolation is unavailable the worker refuses to start and validation fails
  closed; there is no host fallback.
- **npm install jail.** Network access is allowed, but install scripts are off,
  the environment is cleared and only the manifest is visible. The result is
  mounted read-only into the no-network jail.

## Threats and mitigations

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| A user reads or changes another user's project or run | Owner filter on every lookup; ids are unguessable (UUIDv4); tests cover cross-user access | A missed owner check in a new endpoint. The reviewer should enumerate endpoints |
| A browser forges evidence (validation, review, acceptance, approval scope) | No platform or browser write path; approval decisions must echo the exact `scope_digest` shown | None known |
| A sandbox escape by generated code | Bubblewrap, seccomp network deny, cleared environment, resource limits, no secrets in the jail | **Shared kernel**: a kernel exploit escapes. Checklist item 2 (microVM or managed sandbox) addresses this |
| Generated code or model output exfiltrates the provider key | The key exists only in the worker process environment; sandboxed commands run with a cleared environment and no network | A worker-process compromise, which is outside the sandbox boundary |
| Prompt injection makes a model misbehave | Models only propose. Plans are validated, checks are trusted commands chosen by the kernel, reviews are independent, and capability changes need human approval | Low-quality or wrong code that passes its own tests. Mitigated by review, not eliminated |
| An imported repository attacks the host | HTTPS-only shallow clone from github.com; no hooks, templates, submodules or credentials; tree inspected before checkout; symlinks, submodules and special entries refused; secret-looking files dropped | Resource exhaustion inside the size and time limits; git parser bugs |
| A GitHub OAuth token leaks | Encrypted at rest; read server-side only for one publish; passed to git through environment config; redacted from errors; never stored by the API | Web server compromise |
| Publishing overwrites user repositories | Only newly created repositories are pushed to, on explicit confirmation of name and visibility | None known |
| Cost abuse | Per-run USD and call ceilings; monthly account caps; builds per hour; concurrent-build, project and disk caps; 429 with `Retry-After`; campaign-level guards | Provider cost not reported for some calls (shown as incomplete, bounded by call caps) |
| Account takeover | Better Auth password hashing and sessions; reset links expire in 1 hour; sessions revoked on reset; optional required email verification | No 2FA yet (checklist item 14); no CAPTCHA yet (item 7) |
| Denial of service | Rate limits and caps per account; leased jobs; one job per project | No global rate limiting at the edge; to be provided by the hosting platform |
| Data retention and privacy | Export and deletion in Settings; deletion erases kernel history, sessions, repositories and archives; orphan purge | Backups keep deleted data until they expire. Must be stated in the privacy policy |
| Operator mistakes | Runbook; the kernel refuses unauthorized transitions; fail-closed sandbox | Direct database edits bypass all of this. The runbook forbids them |

## For the reviewer

- Endpoint inventory: `src/caveman/api.py` and the proxy allowlist in
  `web/app/api/caveman/[...path]/route.ts`.
- The sandbox: `src/walter/sandbox.py` (`BubblewrapBackend`, command templates,
  `_excluded`, `node_dependencies`) and `tests/test_sandbox.py`.
- Import: `src/caveman/importer.py`. Publish: `src/caveman/publish.py` and
  `web/app/api/publish/[runId]/route.ts`.
- Auth configuration: `web/lib/auth.ts`. CSP: `web/proxy.ts`.
- Erasure: `src/caveman/erasure.py`.
