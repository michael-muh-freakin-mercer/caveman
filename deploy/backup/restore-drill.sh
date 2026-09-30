#!/usr/bin/env bash
# Restore drill: fetch a backup set, check its checksums, decrypt it, restore
# the database into a throwaway PostgreSQL container and the data volume into
# a scratch directory, and report what came back. It touches nothing in
# production: no live database, volume, container or service.
#
# Usage (from /opt/caveman, or any machine with Docker, age and backup.env):
#   deploy/backup/restore-drill.sh IDENTITY_FILE [STAMP]
#
# IDENTITY_FILE is the age private key (kept off the server; copy it over for
# the drill and shred it afterwards). STAMP defaults to the newest set.
# With DRILL_APP_IMAGE (default deploy-api, the image compose builds), it also
# runs `caveman ops list` against the restored copy, so the drill proves the
# application can read it, not just PostgreSQL.
set -euo pipefail

identity=${1:?usage: restore-drill.sh IDENTITY_FILE [STAMP]}
[ -r "$identity" ] || { echo "cannot read $identity" >&2; exit 2; }
root=${CAVEMAN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
set -a
# shellcheck disable=SC1090 # plain KEY=value settings, see backup.env.example
. "${BACKUP_ENV_FILE:-$root/deploy/backup/backup.env}"
set +a
: "${SPACES_BUCKET:?}" "${SPACES_ENDPOINT:?}" "${SPACES_KEY:?}" "${SPACES_SECRET:?}"
pg_image=${BACKUP_PG_IMAGE:-postgres:16}
app_image=${DRILL_APP_IMAGE-deploy-api}

# shellcheck source=remote.sh
source "$root/deploy/backup/remote.sh"

umask 077
work=$(mktemp -d "${TMPDIR:-/var/tmp}/caveman-drill.XXXXXX")
name=caveman-drill-$$
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

stamp=${2:-$(remote lsf --dirs-only "spaces:$SPACES_BUCKET" | sort | tail -n1)}
stamp=${stamp%/}
[ -n "$stamp" ] || { echo "no backup sets in $SPACES_BUCKET" >&2; exit 1; }
echo "== drill on backup set $stamp"
mkdir "$work/set"
remote copy "spaces:$SPACES_BUCKET/$stamp" /work/set
(cd "$work/set" && sha256sum --quiet -c SHA256SUMS)
echo "checksums: ok"

docker network create "$name" >/dev/null
drill_password=drill-$$   # throwaway container, private network, removed on exit
docker run -d --name "$name" --network "$name" -e POSTGRES_PASSWORD="$drill_password" "$pg_image" >/dev/null
for _ in $(seq 60); do
  docker exec "$name" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done
docker exec "$name" pg_isready -U postgres -q

count_rows="select table_schema || '.' || table_name, (xpath('/row/c/text()',
  query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables
  where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
  order by 1"
for dump in "$work"/set/db-*.dump.age; do
  db=$(basename "$dump" .dump.age); db=${db#db-}
  docker exec "$name" createdb -U postgres "$db"
  age -d -i "$identity" "$dump" | docker exec -i "$name" pg_restore -U postgres --no-owner --no-privileges --exit-on-error -d "$db"
  echo "database $db restored; rows per table:"
  docker exec "$name" psql -U postgres -d "$db" -At -F ' ' -c "$count_rows" | sed 's/^/  /'
done

mkdir "$work/data"
age -d -i "$identity" "$work/set/data.tar.age" | tar -C "$work/data" -xf -
echo "data volume restored: $(find "$work/data" -type f | wc -l) files, $(du -sh "$work/data" | cut -f1)"
repos=0
for repo in "$work"/data/projects/*/repo; do
  [ -d "$repo" ] || continue
  git -c safe.directory='*' -C "$repo" fsck --no-progress --no-dangling >/dev/null
  repos=$((repos + 1))
done
echo "project repositories passing git fsck: $repos"

if [ -n "$app_image" ] && docker image inspect "$app_image" >/dev/null 2>&1; then
  # The app must own its data directory (it tightens the mode), so it runs as
  # whoever owns the scratch copy. Settings insist on a service token; this
  # one exists only for the drill.
  CAVEMAN_API_TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n') \
  docker run --rm --network "$name" --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$work/data:/data" -e CAVEMAN_DATA_DIR=/data -e CAVEMAN_API_TOKEN \
    -e CAVEMAN_DATABASE_URL="postgresql://postgres:$drill_password@$name:5432/core" \
    "$app_image" caveman ops list > "$work/ops-list.txt"
  echo "caveman ops list on the restored copy: $(grep -c '"run_id"' "$work/ops-list.txt" || true) runs readable"
elif [ -n "$app_image" ]; then
  echo "app check skipped: image $app_image not found (set DRILL_APP_IMAGE, or empty to silence)"
fi
echo "== drill passed for $stamp"
