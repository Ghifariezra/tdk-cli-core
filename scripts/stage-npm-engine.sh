#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Stages the free Flisk Tilt extension (Tiltfile, engine/, discovery/, specs/,
# ext/) into cli/ before `npm publish`.
#
# npm's `files` field can only package files inside the package directory
# (cli/), but those directories live at the repo root - the same directories
# scripts/release-binaries.sh bundles as tdk-cli/ next to the compiled
# binaries. Staging them here lets findSelfContainedEngineRoot() in
# template-engine.ts (vendorTdkExtension) find them for an npm/bun-installed
# package the same way it already does for a plain git clone: Tiltfile and
# engine/ sitting next to each other.
#
# Cleaned up by --clean (also gitignored, so a forgotten copy never lands in
# a commit).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR
readonly CLI_DIR="${ROOT_DIR}/cli"
readonly DIRS=(engine discovery specs ext)

if [[ "${1:-}" == "--clean" ]]; then
  rm -f "${CLI_DIR}/Tiltfile"
  for d in "${DIRS[@]}"; do
    rm -rf "${CLI_DIR:?}/${d}"
  done
  echo "Cleaned staged engine files from cli/"
  exit 0
fi

cp "${ROOT_DIR}/Tiltfile" "${CLI_DIR}/Tiltfile"
for d in "${DIRS[@]}"; do
  rm -rf "${CLI_DIR:?}/${d}"
  cp -R "${ROOT_DIR}/${d}" "${CLI_DIR}/${d}"
done

echo "Staged Tiltfile, ${DIRS[*]} into cli/ for npm publish"
