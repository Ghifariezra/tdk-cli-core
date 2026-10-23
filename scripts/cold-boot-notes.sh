#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

project_root="$(cd "${1:-.}" && pwd)"
stack="${2:-shop}"
if [[ ! -f "$project_root/.tdk/project.json" ]]; then
  echo "Run this script from a Flisk project containing .tdk/project.json." >&2
  exit 2
fi
if ! command -v flisk >/dev/null 2>&1; then
  echo "flisk must be available on PATH." >&2
  exit 2
fi

results_dir="$project_root/cold-boot-results"
mkdir -p "$results_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
record="$results_dir/shop-cold-boot-$timestamp.md"
run_dir="$(mktemp -d "${TMPDIR:-/tmp}/tdk-cold-boot.XXXXXX")"
up_pid=""

# Invoked indirectly by the EXIT, INT, and TERM traps below.
# shellcheck disable=SC2329
cleanup() {
  if [[ -n "$up_pid" ]] && kill -0 "$up_pid" 2>/dev/null; then
    flisk down >/dev/null 2>&1 || true
    kill "$up_pid" 2>/dev/null || true
    wait "$up_pid" 2>/dev/null || true
  fi
  rm -rf "$run_dir"
}
trap cleanup EXIT INT TERM

run_checked_version() {
  local command="$1"
  if command -v "${command%% *}" >/dev/null 2>&1; then
    bash -c "$command" 2>&1 | head -n 1 || true
  else
    printf 'not installed\n'
  fi
}

commit="$(git -C "$project_root" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
os="$(uname -srm)"
tdk_version="$(flisk --version 2>&1 | head -n 1 || true)"
docker_version="$(run_checked_version 'docker version --format {{.Server.Version}}')"
compose_version="$(run_checked_version 'docker compose version --short')"
tilt_version="$(run_checked_version 'tilt version')"
bun_version="$(run_checked_version 'bun --version')"

{
  echo "# Shop cold-boot run — $timestamp"
  echo
  echo "- Project: \`$project_root\`"
  echo "- Stack: \`$stack\`"
  echo "- Commit: \`$commit\`"
  echo "- OS / architecture: \`$os\`"
  echo "- Flisk: \`$tdk_version\`"
  echo "- Docker Engine: \`$docker_version\`"
  echo "- Docker Compose: \`$compose_version\`"
  echo "- Tilt: \`$tilt_version\`"
  echo "- Bun: \`$bun_version\`"
  echo "- Cache state: record manually (the script does not clear caches)"
  echo
  echo "## Result"
  echo
} > "$record"

echo "Running flisk doctor; output: $run_dir/doctor-initial.log"
if ! (cd "$project_root" && flisk doctor --no-ping) >"$run_dir/doctor-initial.log" 2>&1; then
  cat "$run_dir/doctor-initial.log"
  {
    echo "- Outcome: blocked by initial \`flisk doctor\`"
    echo
    echo '```text'
    cat "$run_dir/doctor-initial.log"
    echo '```'
  } >> "$record"
  echo "Recorded failure in $record"
  exit 1
fi

started_at="$SECONDS"
(cd "$project_root" && flisk up "$stack") >"$run_dir/up.log" 2>&1 &
up_pid=$!
startup_deadline=$((SECONDS + 900))
while (( SECONDS < startup_deadline )); do
  if grep -q '^Flisk is up\.' "$run_dir/up.log"; then
    break
  fi
  if ! kill -0 "$up_pid" 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! grep -q '^Flisk is up\.' "$run_dir/up.log"; then
  cat "$run_dir/up.log"
  {
    echo "- Outcome: Tilt startup failed or timed out after 900 seconds"
    echo
    echo '```text'
    tail -n 100 "$run_dir/up.log"
    echo '```'
  } >> "$record"
  echo "Recorded failure in $record"
  exit 1
fi

tilt_seconds=$((SECONDS - started_at))
health_deadline=$((SECONDS + 900))
health_ready=false
while (( SECONDS < health_deadline )); do
  if (cd "$project_root" && flisk doctor --ping-timeout 2000) >"$run_dir/doctor-health.log" 2>&1; then
    health_ready=true
    break
  fi
  if ! kill -0 "$up_pid" 2>/dev/null; then
    break
  fi
  sleep 10
done

finished_seconds=$((SECONDS - started_at))
if [[ "$health_ready" == true ]]; then
  {
    echo "- Tilt startup: ${tilt_seconds}s"
    echo "- All doctor/service checks ready: ${finished_seconds}s"
    echo "- Outcome: ready"
  } >> "$record"
  result=0
else
  {
    echo "- Tilt startup: ${tilt_seconds}s"
    echo "- Readiness deadline: 900 seconds after Tilt startup"
    echo "- Outcome: services did not pass \`flisk doctor --ping-timeout 2000\`"
    echo
    echo '```text'
    tail -n 100 "$run_dir/doctor-health.log" 2>/dev/null || true
    echo '```'
  } >> "$record"
  result=1
fi

echo "Stopping the measured stack with flisk down."
(cd "$project_root" && flisk down) || result=1
up_pid=""
echo "Recorded result in $record"
exit "$result"
