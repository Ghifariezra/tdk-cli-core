#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Records one pilot measurement of a Flisk project in a form teams can compare:
# machine and versions, time until every service health URL that `flisk up` prints
# answers HTTP 200, and the memory/CPU of the containers `flisk up` started. Fields only a person can fill in (setup steps,
# questions, CI flakes) are left blank in the record.
#
# Usage: scripts/pilot-scorecard.sh [-p project_root] [-s stack] [-c cold|warm] [-t timeout_s] [-i idle_s]
#   -p  project root containing .tdk/project.json (default: .)
#   -s  stack to start with `flisk up <stack>` (default: all, plain `flisk up`)
#   -c  cache state you set up before the run: cold (images removed) or warm (default: unknown).
#       The script never clears caches itself.
#   -t  seconds to wait for a healthy stack (default 900)
#   -i  seconds between the two memory samples (default 30)
# Writes pilot-scorecard-results/<timestamp>.md under the project root and runs `flisk down` at the end.
set -euo pipefail

project_root="." stack="" cache="unknown" timeout_s=900 idle_s=30
while getopts "p:s:c:t:i:" opt; do
  case "$opt" in
    p) project_root="$OPTARG" ;;
    s) stack="$OPTARG" ;;
    c) cache="$OPTARG" ;;
    t) timeout_s="$OPTARG" ;;
    i) idle_s="$OPTARG" ;;
    *) sed -n '2,15p' "$0" >&2; exit 2 ;;
  esac
done
case "$cache" in cold|warm|unknown) ;; *) echo "-c must be cold, warm or unknown" >&2; exit 2 ;; esac

project_root="$(cd "$project_root" && pwd)"
[[ -f "$project_root/.tdk/project.json" ]] || { echo "No .tdk/project.json in $project_root" >&2; exit 2; }
command -v flisk >/dev/null 2>&1 || { echo "flisk must be on PATH" >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "docker must be on PATH" >&2; exit 2; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
results_dir="$project_root/pilot-scorecard-results"
record="$results_dir/$timestamp.md"
run_dir="$(mktemp -d "${TMPDIR:-/tmp}/tdk-pilot.XXXXXX")"
mkdir -p "$results_dir"
up_pid=""

# `flisk down` removes the containers but leaves the `tilt up` process running, so
# stop this project's Tilt (matched by its Tiltfile path) as well.
stop_stack() {
  pkill -f "tilt up -f $project_root/.tdk/.tdk-out/Tiltfile" 2>/dev/null || true
  sleep 1
  (cd "$project_root" && flisk down) >/dev/null 2>&1 || true
  if [[ -n "$up_pid" ]] && kill -0 "$up_pid" 2>/dev/null; then
    kill "$up_pid" 2>/dev/null || true
    wait "$up_pid" 2>/dev/null || true
  fi
  up_pid=""
}

cleanup() {
  [[ -n "$up_pid" ]] && stop_stack
  rm -rf "$run_dir"
}
trap cleanup EXIT INT TERM

version_of() { if command -v "${1%% *}" >/dev/null 2>&1; then bash -c "$1" 2>&1 | head -n 1 || true; else echo "not installed"; fi; }
to_mib() {
  awk -v v="$1" 'BEGIN { n = v + 0
    if (v ~ /GiB$/) n *= 1024; else if (v ~ /MiB$/) n = n; else if (v ~ /KiB$/) n /= 1024; else if (v ~ /[0-9]B$/) n /= 1048576
    printf "%.1f", n }'
}

# Sums memory and CPU over the given container ids; prints "<mib> <cpu_pct>".
sample() {
  local ids="$1" mem=0 cpu=0 line
  local -a ids_array
  [[ -n "$ids" ]] || { echo "0.0 0.0"; return; }
  ids="${ids//$'\n'/ }"
  read -r -a ids_array <<< "$ids"
  while read -r line; do
    mem="$(awk -v a="$mem" -v b="$(to_mib "$(echo "$line" | awk '{print $2}')")" 'BEGIN { printf "%.1f", a + b }')"
    cpu="$(awk -v a="$cpu" -v b="${line%%\%*}" 'BEGIN { printf "%.1f", a + b }')"
  done < <(docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' "${ids_array[@]}")
  echo "$mem $cpu"
}

before_ids="$(docker ps -q | sort)"
tdk_version="$(version_of 'flisk --version')"
{
  echo "# Flisk pilot scorecard - $timestamp"
  echo
  echo "## Conditions"
  echo "- Project: \`$(basename "$project_root")\` (commit \`$(git -C "$project_root" rev-parse --short HEAD 2>/dev/null || echo unknown)\`)"
  echo "- Stack: \`${stack:-all}\`"
  echo "- Machine: \`$(uname -srm)\`, $(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo '?') CPUs"
  echo "- Flisk: \`$tdk_version\`; Docker \`$(version_of 'docker version --format {{.Server.Version}}')\`; Tilt \`$(version_of 'tilt version')\`"
  echo "- Image cache: $cache (set by you; not verified)"
  echo "- Containers already running before the run: $(echo "$before_ids" | grep -c . || true)"
  echo
  echo "## Measured by this script"
} > "$record"

if ! (cd "$project_root" && flisk doctor --no-ping) >"$run_dir/doctor.log" 2>&1; then
  { echo "- Outcome: blocked by \`flisk doctor\`"; echo; echo '```text'; cat "$run_dir/doctor.log"; echo '```'; } >> "$record"
  echo "Recorded failure in $record"; exit 1
fi

started="$SECONDS"
(cd "$project_root" && flisk up ${stack:+"$stack"}) >"$run_dir/up.log" 2>&1 &
up_pid=$!
while (( SECONDS - started < timeout_s )); do
  grep -q '^Flisk is up\.' "$run_dir/up.log" && break
  kill -0 "$up_pid" 2>/dev/null || break
  sleep 1
done
if ! grep -q '^Flisk is up\.' "$run_dir/up.log"; then
  { echo "- Outcome: \`flisk up\` failed or did not start within ${timeout_s}s"; echo; echo '```text'; tail -n 60 "$run_dir/up.log"; echo '```'; } >> "$record"
  echo "Recorded failure in $record"; exit 1
fi
tilt_seconds=$((SECONDS - started))

# `Flisk is up.` only means Tilt started, and `flisk doctor` passes while no service
# is running yet (it skips the ping), so neither says the stack is ready. Poll
# the health URLs `flisk up` printed until every one answers 200.
urls=()
while IFS= read -r line; do urls+=("$line"); done < <(sed -nE 's#^  - [^:]+: (https?://[^ ]+)$#\1#p' "$run_dir/up.log")
if (( ${#urls[@]} == 0 )); then
  { echo "- Outcome: \`flisk up\` printed no service URLs to check, so readiness cannot be measured"; echo; echo '```text'; head -n 30 "$run_dir/up.log"; echo '```'; } >> "$record"
  echo "Recorded failure in $record"; exit 1
fi
pending=("${urls[@]}")
while (( ${#pending[@]} > 0 && SECONDS - started < timeout_s )); do
  still=()
  for u in "${pending[@]}"; do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$u" 2>/dev/null)" == "200" ]] || still+=("$u")
  done
  pending=(${still[@]+"${still[@]}"})
  (( ${#pending[@]} == 0 )) && break
  kill -0 "$up_pid" 2>/dev/null || break
  sleep 3
done
ready_seconds=$((SECONDS - started))
if (( ${#pending[@]} > 0 )); then
  { echo "- Tilt started after ${tilt_seconds}s, but these URLs never answered 200 within ${timeout_s}s:"; printf '  - %s\n' "${pending[@]}"; echo; echo '```text'; tail -n 40 "$run_dir/up.log"; echo '```'; } >> "$record"
  echo "Recorded failure in $record"; exit 1
fi

new_ids="$(comm -13 <(echo "$before_ids") <(docker ps -q | sort) | tr '\n' ' ')"
count="$(echo "$new_ids" | wc -w | tr -d ' ')"
read -r mem1 cpu1 < <(sample "$new_ids")
sleep "$idle_s"
read -r mem2 cpu2 < <(sample "$new_ids")
{
  echo "- Tilt started (\`Flisk is up.\`): ${tilt_seconds}s"
  echo "- Every service health URL answered 200 (${#urls[@]} checked): ${ready_seconds}s"
  echo "- Containers started by this run: $count"
  echo "- Memory of those containers: ${mem1} MiB at ready, ${mem2} MiB after ${idle_s}s idle"
  echo "- CPU of those containers (sum of docker stats %): ${cpu1}% at ready, ${cpu2}% after ${idle_s}s idle"
  echo
  echo "## Fill in by hand"
  echo "- Steps in our current \"get started\" page that Flisk removes (count them from the page): "
  echo "- Steps Flisk added: "
  echo "- Questions a new teammate asked in chat during onboarding: "
  echo "- CI: runs of \`flisk config verify\` / \`flisk up\` and how many failed for reasons unrelated to the change: "
  echo "- Decision (adopt / extend pilot / stop) and the main reason: "
} >> "$record"

stop_stack
# Containers this run started that `flisk down` did not stop: report, then remove them.
left=()
for id in $new_ids; do
  name="$(docker ps --filter "id=$id" --format '{{.Names}}')"
  [[ -n "$name" ]] && left+=("$name")
done
{
  echo
  echo "## After \`flisk down\`"
  if (( ${#left[@]} > 0 )); then
    echo "- Still running from this run (removed by the script):$(printf " \`%s\`" "${left[@]}")"
    docker rm -f "${left[@]}" >/dev/null 2>&1 || true
  else
    echo "- Nothing from this run was left running"
  fi
} >> "$record"
echo "Recorded: $record"
