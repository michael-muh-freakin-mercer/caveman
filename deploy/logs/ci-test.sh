#!/usr/bin/env bash
# CI exercise of the log shipper: starts the `alloy` service from
# compose.prod.yaml as production runs it (root, no capabilities, Docker's log
# directory read-only) next to a stand-in for Loki, and checks that it stays
# up, that a marked container's lines arrive with the right labels and
# credentials, and that a container without the marker is left out.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
deploy=$(dirname "$here")
compose=(docker compose -p cavman-logs-check -f "$deploy/compose.yaml" -f "$deploy/compose.prod.yaml"
  -f "$deploy/compose.logs-check.yaml" --profile logs)
other=cavman-logs-check-other
fail() { echo "FAIL: $*" >&2; exit 1; }
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then "${compose[@]}" logs --no-color --tail 100 || true; fi
  docker rm -f "$other" >/dev/null 2>&1 || true
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

export CAVMAN_DOMAIN=logs-check.invalid
# compose.prod.yaml falls back to the pre-rename CAVEMAN_DOMAIN with a required
# check, and the Compose on CI's runner evaluates that check even when
# CAVMAN_DOMAIN is set (Compose 5.5 does not). Setting both keeps it quiet.
export CAVEMAN_DOMAIN=$CAVMAN_DOMAIN
export GRAFANA_LOKI_URL=http://loki-standin:3100/loki/api/v1/push
export GRAFANA_LOKI_USER=12345
export GRAFANA_LOKI_TOKEN=ci-token-$RANDOM$RANDOM

# Something else on the host, logging with Docker's defaults: must not be shipped.
unmarked=unmarked-line-$RANDOM$RANDOM
docker run -d --name "$other" --log-driver json-file python:3.12-alpine \
  sh -c "echo $unmarked; sleep 600" >/dev/null

"${compose[@]}" up -d --no-deps alloy loki-standin

# Read into a variable before searching: `grep -q` on a pipe would end the
# producer early, which pipefail reports as a failure.
pushes=
for _ in $(seq 60); do
  pushes=$("${compose[@]}" logs --no-color --no-log-prefix loki-standin)
  if grep -q 'service=\\"alloy\\"' <<<"$pushes"; then break; fi
  sleep 2
done
grep -q 'service=\\"alloy\\"' <<<"$pushes" || fail "no lines from the alloy service arrived"
grep -q 'app=\\"cavman\\"' <<<"$pushes" || fail "pushes lack the app label"
grep -q '"path": "/loki/api/v1/push"' <<<"$pushes" || fail "pushes went to the wrong path"
auth=$(printf '%s:%s' "$GRAFANA_LOKI_USER" "$GRAFANA_LOKI_TOKEN" | base64 -w0)
grep -q "\"auth\": \"Basic $auth\"" <<<"$pushes" || fail "pushes lack the configured credentials"

# Give the shipper time to have read the unmarked container's file as well.
sleep 10
pushes=$("${compose[@]}" logs --no-color --no-log-prefix loki-standin)
if grep -q "$unmarked" <<<"$pushes"; then fail "a container without the marker was shipped"; fi
if grep -q 'filename=\\"\|ship=\\"' <<<"$pushes"; then fail "internal labels were shipped"; fi

id=$("${compose[@]}" ps -q alloy)
[ "$(docker inspect -f '{{.State.Running}} {{.RestartCount}}' "$id")" = "true 0" ] \
  || fail "the alloy service restarted or stopped"
echo "log shipping check passed"
