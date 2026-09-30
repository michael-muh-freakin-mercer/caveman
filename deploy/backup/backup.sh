#!/usr/bin/env bash
# Nightly off-server backup for the single-server deployment
# (docs/DEPLOY_DIGITALOCEAN.md, "Backups").
#
# Dumps the PostgreSQL database behind CAVEMAN_DATABASE_URL (and
# AUTH_DATABASE_URL when it names a different one), archives the data volume
# (project repositories and delivery archives), encrypts every file to
# BACKUP_AGE_RECIPIENT, uploads the set to S3-compatible storage (DigitalOcean
# Spaces) under a UTC timestamp, then deletes sets older than
# BACKUP_RETENTION_DAYS. The age private key never lives on the server, so the
# server cannot read its own backups.
#
# Usage (from /opt/caveman, normally via caveman-backup.timer):
#   deploy/backup/backup.sh
#
# Settings: deploy/backup/backup.env (see backup.env.example). The database
# URLs are read from .env and web/.env.local, which are never sourced: their
# connection strings contain '&'.
set -euo pipefail

root=${CAVEMAN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
set -a
# shellcheck disable=SC1090 # plain KEY=value settings, see backup.env.example
. "${BACKUP_ENV_FILE:-$root/deploy/backup/backup.env}"
set +a

: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT in backup.env}"
: "${SPACES_BUCKET:?set SPACES_BUCKET in backup.env}"
: "${SPACES_ENDPOINT:?set SPACES_ENDPOINT in backup.env}"
: "${SPACES_KEY:?set SPACES_KEY in backup.env}"
: "${SPACES_SECRET:?set SPACES_SECRET in backup.env}"
retention=${BACKUP_RETENTION_DAYS:-14}
data_dir=${BACKUP_DATA_DIR:-/mnt/caveman-data}
pg_image=${BACKUP_PG_IMAGE:-postgres:16}
ca=${BACKUP_PG_CA:-$root/deploy/postgres-ca.crt}

# The privacy policy promises backups are gone within 30 days; 0 would delete
# the set just uploaded.
if ! [[ $retention =~ ^[0-9]+$ ]] || (( retention < 1 || retention > 30 )); then
  echo "BACKUP_RETENTION_DAYS must be 1-30, got '$retention'" >&2; exit 2
fi
[ -d "$data_dir/" ] || { echo "data directory $data_dir not found" >&2; exit 2; }

setting() { # last value assigned to $1 in env file $2, surrounding quotes removed
  [ -f "$2" ] || return 0
  sed -n "s/^$1=//p" "$2" | tail -n1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
core_url=${BACKUP_CORE_URL:-$(setting CAVEMAN_DATABASE_URL "$root/.env")}
auth_url=${BACKUP_AUTH_URL:-$(setting AUTH_DATABASE_URL "$root/web/.env.local")}
for url in "$core_url" "$auth_url"; do
  case $url in
    postgres://*|postgresql://*) ;;
    *) echo "CAVEMAN_DATABASE_URL and AUTH_DATABASE_URL must both be PostgreSQL URLs" >&2; exit 2 ;;
  esac
done

# shellcheck source=remote.sh
source "$root/deploy/backup/remote.sh"

umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d "${TMPDIR:-/var/tmp}/caveman-backup.XXXXXX")
trap 'rm -rf "$work"' EXIT

dump() { # $1 connection string, $2 output file
  local mounts=()
  [ -f "$ca" ] && mounts=(-v "$ca:/etc/caveman/postgres-ca.crt:ro")
  # The URL travels in the environment, not argv, so it stays out of `ps`.
  # shellcheck disable=SC2016 # $PGURL expands inside the container
  PGURL=$1 docker run --rm --network host -e PGURL "${mounts[@]}" "$pg_image" \
    sh -c 'exec pg_dump --format=custom --no-owner --no-privileges --dbname="$PGURL"' \
    | age -r "$BACKUP_AGE_RECIPIENT" > "$2"
}

dump "$core_url" "$work/db-core.dump.age"
if [ "$auth_url" != "$core_url" ]; then
  dump "$auth_url" "$work/db-auth.dump.age"
fi

# Services keep running, so a file can change mid-read; tar exits 1 for that
# and the next night's set catches up. Anything worse still fails the backup.
{ tar -C "$data_dir/" --warning=no-file-changed -cf - . || [ $? -eq 1 ]; } \
  | age -r "$BACKUP_AGE_RECIPIENT" > "$work/data.tar.age"

(cd "$work" && sha256sum -- *.age > SHA256SUMS)

remote copy /work "spaces:$SPACES_BUCKET/$stamp"
remote delete "spaces:$SPACES_BUCKET" --min-age "${retention}d"
remote rmdirs "spaces:$SPACES_BUCKET" --leave-root

echo "backup $stamp uploaded to $SPACES_BUCKET ($(du -sh "$work" | cut -f1)); sets older than ${retention} days removed"
if [ -n "${BACKUP_PING_URL:-}" ]; then
  curl -fsS -m 10 -o /dev/null "$BACKUP_PING_URL" || echo "warning: BACKUP_PING_URL did not answer" >&2
fi
