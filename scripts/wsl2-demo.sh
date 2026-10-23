#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The one-command demo flow, and the confirmation that what it started works.
#
# The demo is the shortest path to a running stack: it clones the starter, installs the CLI globally,
# installs the service dependencies and boots everything. Under WSL2 (the supported Windows path) it
# has to work end to end, so this script runs it the way a user runs it and then checks that what it
# left behind is actually working: every resource is ready, every routed service answers, and
# `flisk down` stops the stack again.
#
#   bash scripts/wsl2-demo.sh [EVIDENCE_DIRECTORY]
#
# The evidence directory holds the demo output, the status and networks reports and the per-service
# HTTP results. It is the artifact a Windows acceptance run links to.
set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "usage: bash scripts/wsl2-demo.sh [EVIDENCE_DIRECTORY]" >&2
  exit 2
fi

evidence_dir="${1:-${EVIDENCE_DIR:-/root/tdk-evidence}}"
mkdir -p "$evidence_dir"

demo_log="$evidence_dir/demo.log"
status_json="$evidence_dir/demo-status.json"
networks_json="$evidence_dir/demo-networks.json"
urls_file="$evidence_dir/demo-urls.tsv"
http_log="$evidence_dir/demo-http.log"

fail() {
  echo "WSL2 demo: $*" >&2
  exit 1
}

containers_before="$(docker ps --format '{{.Names}}' 2>/dev/null | sort || true)"

echo "Running the one-command demo (it clones the starter, installs the dependencies and builds the images)"
demo_status=0
flisk demo >"$demo_log" 2>&1 || demo_status=$?
cat "$demo_log"
if [ "$demo_status" -ne 0 ]; then
  fail "the demo exited with $demo_status; its output is in $demo_log"
fi
grep -q "The stack is up" "$demo_log" || fail "the demo did not report that the stack came up; see $demo_log"

# The demo puts the starter in the fixed directory it owns.
project_dir="$HOME/.flisk/flisk-demo"
[ -d "$project_dir" ] || fail "the demo did not create $project_dir"
cd "$project_dir"

flisk status --json >"$status_json" 2>"$evidence_dir/demo-status.err" || fail "flisk status --json failed; see $status_json"
# The single-quoted argument is JavaScript; its template literals expand in Node.
# shellcheck disable=SC2016
node -e '
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const resources = report?.data?.resources ?? [];
if (resources.length === 0) {
  console.error("the demo left no resources behind");
  process.exit(1);
}
for (const resource of resources) {
  console.log(`${resource.name}: ${resource.status}${resource.url ? " " + resource.url : ""}`);
}
const notReady = resources.filter((resource) => resource.status !== "ready");
if (notReady.length > 0) {
  console.error(
    `${notReady.length} resource(s) are not ready: ` +
      notReady.map((r) => `${r.name} (${r.status}: ${r.statusReason ?? "no reason"})`).join(", "),
  );
  process.exit(1);
}
' "$status_json" || fail "the demo left the stack in a state that is not ready; see $status_json"

flisk networks --json >"$networks_json" 2>"$evidence_dir/demo-networks.err" || fail "flisk networks --json failed; see $networks_json"
# The single-quoted argument is JavaScript; its template literals expand in Node.
# shellcheck disable=SC2016
node -e '
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const services = report?.data?.services ?? [];
if (services.length === 0) {
  console.error("the demo left no routed services behind");
  process.exit(1);
}
for (const service of services) {
  process.stdout.write(`${service.name}\t${service.url}\n`);
}
' "$networks_json" >"$urls_file" || fail "the demo left no routed services behind; see $networks_json"

# Every routed service has to answer. A backend serves its health endpoint under the routed base
# path, a frontend serves its page, so both the URL and its /health and /ready paths are tried.
# The hostname is resolved to the loopback address, because a router matches on the Host header and
# *.localhost does not resolve everywhere (the same trick the e2e library uses).
resolve_argument() {
  local url="$1" scheme authority host port
  scheme="$(printf '%s' "$url" | sed -E 's#^([a-z]+)://.*#\1#')"
  authority="$(printf '%s' "$url" | sed -E 's#^[a-z]+://([^/]+).*#\1#')"
  host="${authority%%:*}"
  if [[ "$authority" == *:* ]]; then
    port="${authority##*:}"
  else
    port=80
    [ "$scheme" = "https" ] && port=443
  fi
  printf '%s:%s:127.0.0.1' "$host" "$port"
}

: >"$http_log"
while IFS=$'\t' read -r name url; do
  [ -n "$name" ] || continue
  answered=""
  for suffix in "" "/health" "/ready"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$(resolve_argument "$url")" "${url}${suffix}" || true)"
    case "$code" in
      2?? | 3??)
        answered="${suffix:-/} (HTTP $code)"
        break
        ;;
    esac
  done
  if [ -z "$answered" ]; then
    cat "$http_log"
    fail "$name did not answer at $url"
  fi
  echo "$name: $url -> $answered" | tee -a "$http_log"
done <"$urls_file"

echo "Stopping the stack the demo started"
flisk down >"$evidence_dir/demo-down.log" 2>&1 || fail "flisk down failed; see $evidence_dir/demo-down.log"

containers_after="$(docker ps --format '{{.Names}}' 2>/dev/null | sort || true)"
leftovers="$(comm -13 <(printf '%s\n' "$containers_before") <(printf '%s\n' "$containers_after") || true)"
if [ -n "$leftovers" ]; then
  fail "the demo left containers running after flisk down: $(printf '%s' "$leftovers" | tr '\n' ' ')"
fi

echo "WSL2 demo passed: the demo started the stack, every service answered and flisk down stopped it"
