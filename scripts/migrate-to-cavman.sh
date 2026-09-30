#!/usr/bin/env bash
# One-time upgrade of a server set up before the Caveman -> Cavman rename.
#
#   scripts/migrate-to-cavman.sh            # from the repository root
#
# Rewrites .env and web/.env.local to the new CAVMAN_* setting names (each file
# is copied to <file>.pre-cavman first) and pins what an existing install
# already uses, so nothing moves:
#   - CAVMAN_DATABASE_SCHEMA=caveman   the PostgreSQL schemas holding your runs
#   - CAVMAN_E2B_TEMPLATE=caveman-sandbox   until the cavman-sandbox template is built
#   - CAVMAN_DATA_MOUNT=/mnt/caveman-data   when the block storage volume is mounted there
# Connection strings pointing at /etc/caveman/postgres-ca.crt move to
# /etc/cavman/postgres-ca.crt, and an EMAIL_FROM of "Caveman <...>" becomes
# "Cavman <...>". Running it again changes nothing. Old CAVEMAN_* names keep
# working without this script; it just finishes the rename.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)

has() { grep -qE "^(export )?$1=" "$2"; }

migrate() { # $1: env file, $2: "core" for the API/worker settings file
  local file=$1
  [ -f "$file" ] || { echo "skip: $file not found"; return 0; }
  if ! grep -qE '^(export )?CAVEMAN_|/etc/caveman/|^EMAIL_FROM=.*Caveman' "$file"; then
    echo "ok:   $file already uses the new names"
    return 0
  fi
  local legacy=0
  grep -qE '^(export )?CAVEMAN_' "$file" && legacy=1
  cp -p "$file" "$file.pre-cavman"
  sed -i -E \
    -e 's/^(export )?CAVEMAN_/\1CAVMAN_/' \
    -e 's#/etc/caveman/#/etc/cavman/#g' \
    -e '/^EMAIL_FROM=/s/Caveman/Cavman/g' \
    "$file"
  if [ "$2" = core ] && [ "$legacy" = 1 ]; then
    local pins=""
    has CAVMAN_DATABASE_SCHEMA "$file" || pins+=$'CAVMAN_DATABASE_SCHEMA=caveman\n'
    has CAVMAN_E2B_TEMPLATE "$file" || pins+=$'CAVMAN_E2B_TEMPLATE=caveman-sandbox\n'
    if ! has CAVMAN_DATA_MOUNT "$file" && [ -d /mnt/caveman-data/ ] && [ ! -e /mnt/cavman-data ]; then
      pins+=$'CAVMAN_DATA_MOUNT=/mnt/caveman-data\n'
    fi
    if [ -n "$pins" ]; then
      printf '\n# Pinned by scripts/migrate-to-cavman.sh: this install predates the rename.\n%s' "$pins" >> "$file"
    fi
  fi
  echo "done: $file (previous version saved as $file.pre-cavman)"
}

migrate "$root/.env" core
migrate "$root/web/.env.local" web
echo "Next: docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d --build"
