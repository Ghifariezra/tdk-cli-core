// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("pilot-scorecard.sh", import.meta.url));
const source = readFileSync(scriptPath, "utf8");
const helpersStart = source.indexOf("to_mib() {");
const helpersEnd = source.indexOf("\nbefore_ids=", helpersStart);
assert.notEqual(helpersStart, -1, "pilot scorecard helpers must exist");
assert.notEqual(helpersEnd, -1, "pilot scorecard main body must follow its helpers");
const helpers = source.slice(helpersStart, helpersEnd);

function sampledIds(ids) {
  const workDir = mkdtempSync(join(tmpdir(), "flisk-pilot-scorecard-"));
  const harness = join(workDir, "sample.sh");
  const captured = join(workDir, "ids.txt");
  writeFileSync(
    harness,
    `#!/usr/bin/env bash
set -euo pipefail
${helpers}
docker() {
  printf '%s\\n' "\${@:5}" > "$CAPTURED_IDS"
}
sample "$IDS" >/dev/null
`,
  );
  try {
    execFileSync("/bin/bash", [harness], {
      env: { ...process.env, CAPTURED_IDS: captured, IDS: ids },
    });
    return existsSync(captured) ? readFileSync(captured, "utf8").trimEnd().split("\n").filter(Boolean) : [];
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

test("sample preserves container IDs across supported whitespace forms", async (t) => {
  await t.test("empty input calls no Docker command", () => {
    assert.deepEqual(sampledIds(""), []);
  });

  await t.test("single-line input", () => {
    assert.deepEqual(sampledIds("alpha beta"), ["alpha", "beta"]);
  });

  await t.test("multiline input", () => {
    assert.deepEqual(sampledIds("alpha\nbeta\ngamma"), ["alpha", "beta", "gamma"]);
  });

  await t.test("mixed whitespace-separated input", () => {
    assert.deepEqual(sampledIds("alpha beta\tgamma\n delta"), ["alpha", "beta", "gamma", "delta"]);
  });
});
