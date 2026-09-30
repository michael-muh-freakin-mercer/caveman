#!/usr/bin/env bash
# CI exercise of backup.sh and restore-drill.sh: PostgreSQL from the job's
# service container, `rclone serve s3` standing in for Spaces. Seeds two databases and a
# data directory, backs up, checks that an expired set is pruned and a recent
# one kept, that nothing leaves the server unencrypted, then restores and
# checks the rows and files that came back.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
tmp=$(mktemp -d)
trap 'docker rm -f caveman-ci-s3 >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
sql() { # $1 database, rest: psql arguments
  local db=$1; shift
  docker run --rm -i --network host -e PGPASSWORD=caveman postgres:16 \
    psql -h 127.0.0.1 -U caveman -d "$db" -v ON_ERROR_STOP=1 -q "$@"
}

marker=plaintext-marker-$RANDOM$RANDOM
sql caveman <<SQL
create schema caveman_ops;
create table caveman_ops.runs (id text primary key, document jsonb);
insert into caveman_ops.runs values ('r1', '{"note":"$marker"}'), ('r2', '{}'), ('r3', '{}');
create schema caveman_platform;
create table caveman_platform.jobs (id text primary key, run_id text);
insert into caveman_platform.jobs values ('j1', 'r1'), ('j2', 'r2');
create database auth;
SQL
sql auth <<SQL
create table "user" (id text primary key, email text, "emailVerified" boolean);
insert into "user" values ('u1', '$marker@example.com', true);
SQL

mkdir -p "$tmp/data/projects/p1/repo" "$tmp/data/deliveries"
git -C "$tmp/data/projects/p1/repo" init -q
echo "$marker" > "$tmp/data/projects/p1/repo/README.md"
git -C "$tmp/data/projects/p1/repo" -c user.name=ci -c user.email=ci@example.com add -A
git -C "$tmp/data/projects/p1/repo" -c user.name=ci -c user.email=ci@example.com commit -qm seed
head -c 65536 /dev/urandom > "$tmp/data/deliveries/r1.tar.gz"

s3_key=ciuser s3_secret=ci-password-123
mkdir "$tmp/s3"
docker run -d --name caveman-ci-s3 -p 9000:9000 --user "$(id -u):$(id -g)" -v "$tmp/s3:/data" \
  "${BACKUP_RCLONE_IMAGE:-rclone/rclone:1.68}" serve s3 /data --addr :9000 --auth-key "$s3_key,$s3_secret" >/dev/null
for _ in $(seq 60); do curl -s -o /dev/null http://127.0.0.1:9000/ && break; sleep 1; done

age-keygen -o "$tmp/key" 2>/dev/null
cat > "$tmp/backup.env" <<ENV
SPACES_BUCKET=ci-backups
SPACES_ENDPOINT=http://127.0.0.1:9000
SPACES_PROVIDER=Rclone
SPACES_KEY=$s3_key
SPACES_SECRET=$s3_secret
BACKUP_AGE_RECIPIENT=$(age-keygen -y "$tmp/key")
BACKUP_RETENTION_DAYS=14
ENV
export CAVEMAN_ROOT=$repo BACKUP_ENV_FILE=$tmp/backup.env TMPDIR=$tmp
export BACKUP_DATA_DIR=$tmp/data
pg_user=caveman pg_password=caveman   # the job's service container
export BACKUP_CORE_URL=postgresql://$pg_user:$pg_password@127.0.0.1:5432/caveman
export BACKUP_AUTH_URL=postgresql://$pg_user:$pg_password@127.0.0.1:5432/auth

# shellcheck disable=SC1091
{ set -a; . "$tmp/backup.env"; set +a; }
work=$tmp
# shellcheck source=remote.sh
source "$here/remote.sh"
remote mkdir spaces:ci-backups
mkdir -p "$tmp/seed/20000101T000000Z" "$tmp/seed/20000102T000000Z"
echo old > "$tmp/seed/20000101T000000Z/SHA256SUMS"; touch -d '40 days ago' "$tmp/seed/20000101T000000Z/SHA256SUMS"
echo recent > "$tmp/seed/20000102T000000Z/SHA256SUMS"; touch -d '3 days ago' "$tmp/seed/20000102T000000Z/SHA256SUMS"
remote copy /work/seed spaces:ci-backups

echo "== retention outside 1-30 is refused"
if BACKUP_RETENTION_DAYS=0 "$here/backup.sh" 2>/dev/null; then fail "retention 0 accepted"; fi

echo "== backup"
"$here/backup.sh"
sets=$(remote lsf --dirs-only spaces:ci-backups)
echo "$sets"
grep -qx '20000101T000000Z/' <<<"$sets" && fail "expired set was not pruned"
grep -qx '20000102T000000Z/' <<<"$sets" || fail "recent set was pruned"
new=$(sort <<<"$sets" | tail -n1); new=${new%/}
[[ $new == 20[0-9][0-9]* && $new != 2000* ]] || fail "no new set uploaded"
mkdir "$tmp/uploaded"
remote copy "spaces:ci-backups/$new" /work/uploaded
ls "$tmp/uploaded"
for f in db-core.dump.age db-auth.dump.age data.tar.age SHA256SUMS; do
  [ -s "$tmp/uploaded/$f" ] || fail "$f missing from the uploaded set"
done
if grep -rqa "$marker" "$tmp/uploaded"; then fail "plaintext reached the bucket"; fi

echo "== restore drill"
DRILL_APP_IMAGE='' "$here/restore-drill.sh" "$tmp/key" | tee "$tmp/drill.log"
for expected in "== drill on backup set $new" "checksums: ok" "caveman_ops.runs 3" \
    "caveman_platform.jobs 2" "public.user 1" "project repositories passing git fsck: 1" "== drill passed for $new"; do
  grep -qF -- "$expected" "$tmp/drill.log" || fail "drill output lacks: $expected"
done
echo "backup and restore drill: ok"
