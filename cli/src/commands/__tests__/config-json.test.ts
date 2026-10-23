// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

const verifyProject = (name: string) => ({
  version: "1.0",
  project: { name, version: "1.0.0" },
  phases: Object.fromEntries(
    ["pre_alpha", "alpha", "beta", "out_of_scope"].map((phase) => [
      phase,
      { name: phase, description: "", enabledStacks: [] },
    ]),
  ),
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
  },
  discovery: { paths: ["services/*/*"] },
});

const runVerify = (projectRoot: string) =>
  runFlisk(["config", "verify", "--json"], { cwd: projectRoot });

// Each case spawns the built CLI. Under the parallel suite and a loaded machine that exceeds 20-30s, so the budget is 120s.
describe("flisk config verify --json", () => {
  it("prints one JSON report and exits 1 for drift without Commander diagnostics", () => {
    const projectRoot = createTempProject({ projectJson: verifyProject("verify-json") });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const report = parseEnvelope(result.stdout);
    expect(report).toMatchObject({
      schemaVersion: 1,
      data: { valid: false },
      errors: [],
    });
    expect(report.data.errors).toContain(
      "Missing file: .tdk/.tdk-out/Tiltfile (run 'flisk config regenerate')",
    );
    expect(
      report.data.diffs.find((diff: { file: string }) => diff.file.endsWith("Tiltfile"))?.diff,
    ).toContain("+++ b/.tdk/.tdk-out/Tiltfile");
  }, 120_000);

  it("emits a structured INTERNAL error and exits 2 for invalid project JSON", () => {
    const projectRoot = createTempProject({ projectJson: "{invalid\n" });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(2);
    expect(parseEnvelope(result.stdout)).toMatchObject({
      schemaVersion: 1,
      data: null,
      errors: [{ code: "INTERNAL" }],
    });
    expect(result.stderr).toContain("JSON");
  }, 120_000);

  it("names a malformed service.json in the single JSON report and exits 1", () => {
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-bad-service"),
      resources: { "shop/api": "{invalid\n" },
    });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    // The CLI may also warn on stderr about the skipped manifest; only stdout has to stay machine-readable.
    const report = parseEnvelope(result.stdout);
    expect(report).toMatchObject({ schemaVersion: 1, data: { valid: false }, errors: [] });
    expect(report.data.errors).toContainEqual(
      expect.stringMatching(/^services\/shop\/api\/service\.json: invalid JSON \(/),
    );
  }, 120_000);
});
