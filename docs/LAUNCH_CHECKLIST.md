# Caveman launch checklist

Everything between today and a consumer-ready hosted Caveman. Tick items as
they land and note the commit or PR.

Owner: 🧑 needs the project owner's decision, money or approval · 🤖 engineering
work that can be done now · 👥 needs outside people.

Approvals on record: live-model campaign spend up to **$50** (OpenRouter).

## P0: can't launch without these

### 1. Prove it works with real models
- [x] 🧑 OpenRouter key available to the environment (`OPENROUTER_API_KEY`) and `openrouter.ai` allowed by its network policy; spend approved up to $50
- [x] 🤖 Campaign: ~10 prompts across Python, TypeScript and documents; record success rate, cost and failure causes (`docs/live-campaign/`: 10/10 complete, median $0.09)
- [x] 🤖 Tune planner and specialist prompts, turn limits and recovery from the results. Bar: ≥70% complete, median cost under the $5 default budget (met: 100%, $0.09)
- [x] 🤖 Confirm OpenRouter reports cost on this path so USD budgets enforce real numbers (matches OpenRouter's usage counter within $0.005)
- [ ] 🤖 Opt-in, budget-capped live smoke in CI

### 2. Stronger isolation for untrusted code
- [x] 🧑 Choose a microVM or managed sandbox: E2B (free plan to start; upgrade before public launch for longer sandbox lifetimes and more concurrency)
- [x] 🤖 Implement it behind `ExecutionBackend`, keeping the fail-closed sandbox tests (`CAVEMAN_SANDBOX_BACKEND=e2b`, template in `scripts/e2b_template.py`, live tests in the E2B sandbox workflow)
- [ ] 🧑 Build the E2B template once and set `CAVEMAN_SANDBOX_BACKEND=e2b` and `E2B_API_KEY` on the workers
- [ ] 🤖 If workers stay in containers, replace `seccomp=unconfined` with a hardened profile

### 3. Deployment
- [x] 🧑 Approve infrastructure: DigitalOcean (one 8 GB / 4 vCPU Droplet, managed Postgres, block storage volume, Caddy for TLS); domain still to choose
- [x] 🤖 Step-by-step DigitalOcean guide and production Compose overlay ([DEPLOY_DIGITALOCEAN.md](DEPLOY_DIGITALOCEAN.md))
- [ ] 🤖 Verify `deploy/web.Dockerfile` and `deploy/compose.yaml` end to end
- [ ] 🤖 Verify Better Auth on Postgres
- [ ] 🤖 Verify a multi-host deployment on Postgres (`CAVEMAN_DATABASE_URL`)
- [x] 🤖 SQLite → Postgres data migration tool (`caveman ops migrate-to-postgres`, auth included)
- [ ] 🧑 Approve the first deploy

### 4. Security review
- [ ] 👥 External review or pen test: sandbox, browser-to-API proxy and CSP, authentication, repository import, GitHub token handling, account deletion
- [x] 🤖 Secret scanning in CI (`scripts/check_secrets.py`, `.secrets.baseline`)
- [x] 🤖 Written threat model in the docs (`docs/THREAT_MODEL.md`)

### 5. Email
- [ ] 🧑 Resend account, sending domain verified (SPF and DKIM)
- [ ] 🤖 Require email verification in hosted mode; test reset and verification against the real provider

### 6. Legal
- [ ] 🧑👥 Terms of service, privacy policy, acceptable-use policy
- [ ] 🧑👥 List of third parties processing user data (OpenRouter and model providers, email, hosting)
- [ ] 🧑👥 Data retention policy, cookie notice, minimum age
- [ ] 🤖 Pages and links in the app (data export and account deletion already exist)

### 7. Abuse and tenancy limits
- [x] 🤖 Per-user rate limits on starting builds, imports and continuations (only sign-in is rate limited today)
- [x] 🤖 Per-account caps: disk, projects, concurrent builds
- [x] 🤖 CAPTCHA or equivalent on sign-up (Cloudflare Turnstile on sign-up and password-reset requests; off until keys are set)
- [ ] 🧑 Create a Turnstile widget in Cloudflare and set `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` on the web app
- [x] 🤖 Authenticated GitHub requests for imports (anonymous limit is 60 per hour per IP)
- [ ] 🧑 Prompt and content policy: what gets refused

### 8. Operations
- [x] 🤖 Scheduled cleanup of finished runs' worktrees and stale dependency caches (delivery archives are kept; they count toward the account's disk cap)
- [ ] 🤖 Dashboards and alerts: queue age, failed jobs, sandbox health, spend (metrics endpoint exists)
- [ ] 🧑 Choose error reporting (e.g. Sentry) and log hosting
- [ ] 🤖 Integrate them
- [x] 🤖 Runbook: stuck runs, worker outage, restore from backup (`docs/RUNBOOK.md`)
- [ ] 🤖 Autoscale workers from queue depth
- [ ] 🧑 Backups for Postgres and the shared volume
- [ ] 🤖 Tested restore drill

## P1: needed for a good launch

### 9. Billing (if paid)
- [ ] 🧑 Pricing and plans; approve a Stripe account
- [ ] 🤖 Checkout, metering tied to account caps, invoices, billing page in Settings

### 10. Setting expectations about what Caveman can build
- [x] 🤖 Say in the UI which stacks get real tests (Python, Node/TypeScript) and which are reviewed code only
- [x] 🤖 Warn before mobile or unsupported-stack builds
- [ ] 🤖 Run project build scripts (`npm run build`), not just tests
- [ ] 🤖 Cost estimate before a build starts

### 11. Talking with a build
- [ ] 🤖 Clarifying questions as first-class "Caveman needs your input" requests
- [ ] 🤖 Instructions mid-run (workflow mode rejects messages today)
- [ ] 🤖 Email when a build finishes or needs an approval

### 12. GitHub
- [ ] 🤖 Publish flow end to end against github.com, including the scope upgrade (tested against a stand-in only)
- [ ] 🤖 Import a real public repository (tested against a local copy only)
- [ ] 🤖 Private repository import with the user's token
- [ ] 🤖 Push updates to an existing repository as a pull request

### 13. Safe previews of built web apps
- [ ] 🧑 Approve a separate preview domain and isolated preview cluster
- [ ] 🤖 Isolated, time-limited, credential-free previews in a sandboxed frame or link

### 14. Account
- [x] 🤖 Session management (see and revoke signed-in devices)
- [x] 🤖 Change password in Settings
- [ ] 🤖 Change email in Settings (needs the email provider to verify the new address)
- [ ] 🤖 Optional two-factor authentication

### 15. Quality
- [ ] 🤖 Accessibility audit to WCAG AA
- [ ] 🤖 Mobile layout check
- [ ] 🤖 Firefox and Safari (only Chromium is tested)
- [ ] 🤖 Load test: concurrent builds and live-update connections
- [ ] 🤖 Pagination on run and project lists; streamed export for large accounts

### 16. Onboarding and support
- [ ] 🤖 First-run guidance, empty states, help/FAQ, pricing page
- [ ] 🧑 Support contact channel

## P2: soon after launch
- [ ] 🤖 Keep or retire manager mode (its conversation sessions are still local SQLite)
- [ ] 🤖 More sandbox stacks (Go, Rust, Java)
- [ ] 🤖 Compare Budget / Balanced / Maximum Quality with real models
- [ ] 🤖 Dependency update automation (e.g. Renovate)
- [ ] 🤖 Plan the CI runner move from Ubuntu 24.04 deliberately
- [ ] 🧑 Privacy-respecting product analytics for the sign-up → first build funnel

## Suggested order
1. Live-model campaign (1)
2. Tenancy limits and ops basics (7, 8) and the 🤖 parts of 10 and 12
3. Isolation and deployment decisions (2, 3)
4. Email and legal (5, 6)
5. Security review (4)
6. Private beta
7. Billing and previews (9, 13)
8. Public launch
