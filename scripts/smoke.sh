#!/usr/bin/env bash
# A quick check that a deployed Taperday works end to end, the way a runner would first meet it: the website loads and
# may call its API, and the API answers from its database and builds a plan. deploy.yml runs it on staging before
# production goes, and on production after. Anonymous only: it signs nobody in and saves nothing.
# Usage: scripts/smoke.sh <website url> <api url>
set -euo pipefail

site="${1%/}"
api="${2%/}"
failed=0

pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failed=1; }

# Retries for up to ~3 minutes: a free database pauses when idle and takes a minute to wake, and a fresh deploy
# can still be warming up.
fetch() {
  local out="$1"; shift
  for _ in $(seq 1 18); do
    code=$(curl -s -o "$out" -w '%{http_code}' --max-time 60 "$@" || true)
    [ "$code" = "200" ] && return 0
    sleep 10
  done
  return 1
}

tmp=$(mktemp -d)

fetch "$tmp/ready" "$api/health/ready" && pass "API ready (database reachable)" || fail "API /health/ready never returned 200"

if fetch "$tmp/races" "$api/api/v1/races" && grep -q '"slug"' "$tmp/races"; then
  pass "race catalogue"
else
  fail "race catalogue (/api/v1/races)"
fi

race=$(date -u -d '+70 days' +%F)
today=$(date -u +%F)
plan="{\"raceName\":\"Smoke 10K\",\"distanceKm\":10,\"raceDate\":\"$race\",\"goalTime\":\"00:55:00\",\"runDays\":[\"Tuesday\",\"Thursday\",\"Sunday\"],\"longRunDay\":\"Sunday\",\"currentWeeklyKm\":20,\"planFrom\":\"$today\"}"
if fetch "$tmp/plan" -X POST -H 'Content-Type: application/json' -d "$plan" "$api/api/v1/plans" && grep -q '"weeks"' "$tmp/plan"; then
  pass "plan generation"
else
  fail "plan generation (POST /api/v1/plans)"
fi

if fetch "$tmp/index" -D "$tmp/headers" "$site/" && grep -q 'id="root"' "$tmp/index"; then
  pass "website loads"
  script=$(grep -o 'src="/assets/[^"]*\.js"' "$tmp/index" | head -1 | cut -d'"' -f2)
  if [ -n "$script" ] && fetch "$tmp/app.js" "$site$script"; then
    pass "app script loads"
    grep -q "$api" "$tmp/app.js" && pass "app is built for this API" || fail "app script doesn't point at $api"
  else
    fail "app script ($script)"
  fi
  grep -i '^content-security-policy' "$tmp/headers" | grep -q "connect-src[^;]*$api" \
    && pass "website may call the API (CSP)" || fail "CSP connect-src doesn't allow $api"
else
  fail "website ($site) never loaded"
fi

fetch "$tmp/logo" "$site/email/wordmark.png" && pass "email logo" || fail "email logo ($site/email/wordmark.png)"

rm -rf "$tmp"
[ "$failed" = 0 ] && echo "Smoke check passed." || { echo "Smoke check failed."; exit 1; }
