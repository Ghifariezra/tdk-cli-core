// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("layer-eval.sh", import.meta.url)), "utf8");
const start = source.indexOf('marker="$(mktemp');
const end = source.indexOf("\ntests=pass", start);
assert.ok(start >= 0 && end > start, "benchmark-result guard must precede the test phase");
const benchmarkGuard = source.slice(start, end);

function runScenario(mode) {
  const root = mkdtempSync(join(tmpdir(), "flisk-layer-eval-test-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    mkdirSync(join(root, "tmp"));
    mkdirSync(join(root, "benchmarks", "results"), { recursive: true });
    const mockBun = join(bin, "bun");
    writeFileSync(mockBun, '#!/usr/bin/env bash\ncase "$MODE" in\n  failure) exit 7 ;;\n  success) sleep 0.05; echo \'{}\' > benchmarks/results/container-scale-current.json ;;\n  no-result|stale) exit 0 ;;\nesac\n');
    chmodSync(mockBun, 0o755);
    if (mode === "stale") {
      const path = join(root, "benchmarks/results/container-scale-old.json");
      writeFileSync(path, "{}");
      utimesSync(path, new Date(0), new Date(0));
    }
    const harness = join(root, "harness.sh");
    writeFileSync(harness, "#!/usr/bin/env bash\nset -uo pipefail\n" + benchmarkGuard + "\nprintf \'RESULT:%s\\n\' \"$result\"\n");
    const proc = spawnSync("bash", [harness], {
      cwd: root,
      env: { ...process.env, MODE: mode, SAMPLE: "20", TMPDIR: join(root, "tmp"), PATH: bin + ":" + process.env.PATH },
      encoding: "utf8",
    });
    return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("benchmark failure stops evaluation", () => {
  const result = runScenario("failure");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /status: crash \(container benchmark\)/);
});

test("successful benchmark with no result reports crash", () => {
  const result = runScenario("no-result");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /no fresh benchmark result/);
});

test("stale results are not mistaken for a fresh benchmark result", () => {
  const result = runScenario("stale");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /no fresh benchmark result/);
});

test("fresh result is selected on success", () => {
  const result = runScenario("success");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RESULT:benchmarks\/results\/container-scale-current\.json/);
});
