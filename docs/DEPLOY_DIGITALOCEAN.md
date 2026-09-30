# Deploying Caveman on DigitalOcean

One Droplet runs everything (web app, API, worker, and Caddy for HTTPS), backed
by a managed PostgreSQL cluster and a block storage volume. Generated code never
runs on the Droplet: every check runs in an E2B microVM.

Expected cost: about $65 a month (8 GB / 4 vCPU Droplet, 1 GB managed Postgres,
50 GB volume), plus model spend on OpenRouter and sandbox time on E2B.

**Never paste a key, token or password into chat, an issue or a commit.** Every
secret below goes straight into a file on the server (or a GitHub secret) and
nowhere else.

## Before you start

- These PRs must be merged first: the E2B sandbox backend (the worker in this
  setup has no other isolation). Signup CAPTCHA should be merged before signups
  open to anyone you don't know.
- Build the production E2B template once: GitHub → Actions → **E2B sandbox** →
  **Run workflow** with **publish** ticked. It runs the live E2B tests first.
- Have a domain you can point at the server (for example `app.yourdomain.com`).
  HTTPS certificates are issued automatically once it points at the Droplet.

## 1. SSH key

On your own computer (skip if you already have `~/.ssh/id_ed25519.pub`):

```bash
ssh-keygen -t ed25519 -C "caveman-deploy"
cat ~/.ssh/id_ed25519.pub
```

In DigitalOcean: **Settings → Security → SSH Keys → Add SSH Key**, paste the
`.pub` line (the public half only; the file without `.pub` never leaves your
computer).

## 2. Droplet

**Create → Droplets**:

- Region: the one closest to your users (keep everything below in the same region).
- Image: **Ubuntu 24.04 (LTS) x64**.
- Size: **Basic → Regular, 8 GB / 4 vCPUs**.
- Authentication: **SSH Key** (the one from step 1). No password.
- Enable **Monitoring**.
- Hostname: `caveman-1`.

## 3. Block storage volume

**Create → Volumes**: 50 GB, same region, attach to `caveman-1`,
**Automatically Format & Mount**, ext4. It mounts at
`/mnt/<volume_name>`; step 7 links it to `/mnt/caveman-data`.

## 4. Managed PostgreSQL

**Create → Databases → PostgreSQL 16**, same region, **Basic, 1 GB RAM / 1 vCPU**.

When it is ready:

- **Settings → Trusted Sources**: add the `caveman-1` Droplet (and nothing else).
- **Users & Databases**: create a database named `caveman`.
- **Overview → Connection details**: choose the `caveman` database, copy the
  **Connection string**, and **Download CA certificate**. You'll put both on the
  server in step 8, and nowhere else.
- Change the end of the connection string from `?sslmode=require` to
  `?sslmode=verify-full&sslrootcert=/etc/caveman/postgres-ca.crt`, so the app
  checks it is talking to your real database. It then looks like
  `postgresql://doadmin:…@…ondigitalocean.com:25060/caveman?sslmode=verify-full&sslrootcert=/etc/caveman/postgres-ca.crt`.

## 5. Cloud firewall

**Networking → Firewalls → Create Firewall**, apply to `caveman-1`:

| Inbound | Port | Sources |
| --- | --- | --- |
| SSH | 22 | your home/office IP only |
| HTTP | 80 | all (Caddy redirects to HTTPS and answers certificate challenges) |
| HTTPS | 443 (TCP and UDP) | all |

Leave outbound open (OpenRouter, E2B, GitHub and npm are all outbound HTTPS).

## 6. DNS

Create an **A record** for your domain pointing at the Droplet's public IPv4
address (at your registrar, or in **Networking → Domains** if DigitalOcean hosts
your DNS).

## 7. Prepare the server

```bash
ssh root@<droplet-ip>

apt-get update && apt-get -y upgrade
curl -fsSL https://get.docker.com | sh          # Docker Engine + Compose plugin
ln -s /mnt/<volume_name> /mnt/caveman-data      # the volume from step 3
chown 10001:10001 /mnt/<volume_name>            # the app's user inside the containers
git clone https://github.com/michael-muh-freakin-mercer/caveman.git /opt/caveman
cd /opt/caveman
```

## 8. Configuration and secrets (on the server only)

Generate the two random secrets on the server:

```bash
openssl rand -hex 32   # use for CAVEMAN_API_TOKEN
openssl rand -hex 32   # use for BETTER_AUTH_SECRET
```

`/opt/caveman/.env` (API and worker; `nano .env`):

```bash
CAVEMAN_ENV=production
CAVEMAN_API_TOKEN=<first random value>
CAVEMAN_DATABASE_URL=<Postgres connection string from step 4, verify-full form>
CAVEMAN_EXECUTOR=provider
OPENROUTER_API_KEY=<your OpenRouter key>
WALTER_MODEL_PROVIDER=openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
WALTER_MODEL=<manager model>
WALTER_WORKER_MODEL=<specialist model>
CAVEMAN_SANDBOX_BACKEND=e2b
E2B_API_KEY=<your E2B key>
CAVEMAN_ACCOUNT_MONTHLY_BUDGET_USD=3
CAVEMAN_METRICS_TOKEN=<optional: a third random value>
CAVEMAN_DOMAIN=<your domain, for Caddy's HTTPS certificate>
```

`/opt/caveman/web/.env.local` (web app):

```bash
CAVEMAN_API_TOKEN=<same first random value>
BETTER_AUTH_SECRET=<second random value>
BETTER_AUTH_URL=https://<your domain>
AUTH_DATABASE_URL=<same Postgres connection string, verify-full form>
# After the CAPTCHA PR is merged, for signups and password resets:
# TURNSTILE_SITE_KEY=<Cloudflare Turnstile site key>
# TURNSTILE_SECRET_KEY=<Cloudflare Turnstile secret key>
# Invite-only: only these emails (or "@domain" entries) can create accounts.
# Also requires email verification, so set up Resend (RESEND_API_KEY) first.
# CAVEMAN_SIGNUP_ALLOWLIST=<you@example.com,friend@example.com>
```

`/opt/caveman/deploy/postgres-ca.crt`: the CA certificate you downloaded in
step 4 (open it on your computer, copy the text, `nano deploy/postgres-ca.crt`,
paste). It is public, not a secret, but the app refuses to connect without it.

Lock the secrets down: `chmod 600 .env web/.env.local`. The web image build
leaves `web/.env.local` out (`web/.dockerignore`); the app reads it only at runtime.

## 9. Start it

```bash
cd /opt/caveman
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d --build
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml ps
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml logs worker | tail
```

The worker log should say `e2b isolation probe passed.`; if the probe fails the
worker refuses to start and the log says why (key, template or network). Then
open `https://<your domain>`, create your account, and run a small build.

## Updating

```bash
cd /opt/caveman && git pull
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d --build
```

Runs survive restarts: jobs are leased, and an interrupted job is recovered by
the next worker (see [RUNBOOK.md](RUNBOOK.md)).

## Backups

- **Postgres, inside DigitalOcean:** daily backups with 7-day point-in-time
  recovery, included with the managed cluster.
- **Postgres and the volume, off the server:** `deploy/backup/backup.sh` runs
  nightly from a systemd timer. It stops the API and workers for the seconds
  it takes to capture a consistent copy (the web app stays up; interrupted
  jobs are recovered), dumps the database, archives the volume
  (project repositories and delivery archives), encrypts both with
  [age](https://age-encryption.org) to a key the server never holds, uploads
  them to a private Spaces bucket under a UTC timestamp, and deletes sets older
  than `BACKUP_RETENTION_DAYS` (14; at most 30, as the privacy policy promises).
- **Secrets:** keep a copy of `.env`, `web/.env.local` and
  `deploy/backup/backup.env` in your password manager, next to the age private key.

### Set up the nightly backup (once)

1. **Spaces:** Create → Spaces Object Storage, region NYC3, name it
   `caveman-backups`, and leave the file listing restricted. Then Spaces
   Object Storage → **Access Keys** → Create, limited to that bucket with
   Read/Write/Delete. About $5 a month.
2. **Encryption key, on your computer, not the server:** install age
   (`sudo apt install age`, `brew install age` or `pacman -S age`), run
   `age-keygen -o caveman-backup.key`, and put the file in your password
   manager. Its `# public key: age1...` line is the recipient for step 3.
   Without this key the backups cannot be read by anyone, you included.
3. **On the Droplet:**

   ```bash
   apt-get install -y age
   cd /opt/caveman
   cp deploy/backup/backup.env.example deploy/backup/backup.env
   chmod 600 deploy/backup/backup.env
   nano deploy/backup/backup.env      # Spaces key and secret, age1... recipient
   cp deploy/backup/caveman-backup.{service,timer} /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now caveman-backup.timer
   systemctl start caveman-backup.service   # first backup now
   journalctl -u caveman-backup.service -n 20
   ```

   The last line should read `backup <timestamp> uploaded to caveman-backups`.
4. **Run a restore drill** (below) and record it in the runbook.

### Restore drill

The drill restores the newest set into a throwaway Postgres container and a
scratch directory, runs `caveman ops list` against the restored copy, and
removes everything afterwards. Production is not touched.

```bash
# from your computer: copy the private key over for the drill only
scp caveman-backup.key root@<droplet-ip>:/root/drill.key
ssh root@<droplet-ip> 'cd /opt/caveman && deploy/backup/restore-drill.sh /root/drill.key; status=$?; shred -u /root/drill.key; exit $status'
```

It ends with `== drill passed for <timestamp>`. A real restore follows
[RUNBOOK.md](RUNBOOK.md#restore).

## Where each secret lives

| Secret | Server file | Also in |
| --- | --- | --- |
| `CAVEMAN_API_TOKEN` | `.env` and `web/.env.local` | — |
| `CAVEMAN_DATABASE_URL` / `AUTH_DATABASE_URL` | `.env` / `web/.env.local` | — |
| `OPENROUTER_API_KEY` | `.env` | GitHub secret (live smoke workflow) |
| `E2B_API_KEY` | `.env` | GitHub secret (E2B sandbox workflow) |
| `BETTER_AUTH_SECRET` | `web/.env.local` | — |
| `TURNSTILE_*` | `web/.env.local` | — |
