// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import { TemplateEngine } from "../template-engine.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;
if (process.env.TDK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for the generated tech stack Starlark tests in CI.");
}

const config = {
  version: "1.0",
  project: { name: "tech-stack", version: "1.0.0" },
  discovery: { paths: ["services/*/*"] },
  optional_infra: {},
  phases: {
    pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["app"] },
    alpha: { name: "Alpha", description: "", enabledStacks: [] },
    beta: { name: "Beta", description: "", enabledStacks: [] },
    out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
  },
} as unknown as ProjectConfig;

const temporaryDirs: string[] = [];

/**
 * Runs the generated TILT_TECH_STACK.star in real Starlark. `fail(...)` carries the answer out, because tilt prints
 * it on stderr when the Tiltfile fails.
 */
function validate(configLiteral: string, strict: boolean, field: "errors" | "warnings"): string {
  const directory = mkdtempSync(join(tmpdir(), "tdk-tech-stack-"));
  temporaryDirs.push(directory);
  const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
  writeFileSync(
    join(directory, "TILT_TECH_STACK.star"),
    engine.generateAll(config)["TILT_TECH_STACK.star"],
  );
  writeFileSync(
    join(directory, "Tiltfile"),
    [
      'load("./TILT_TECH_STACK.star", "validate_tech_stack")',
      `r = validate_tech_stack(${configLiteral}, strict=${strict ? "True" : "False"})`,
      `fail("ANSWER=" + "|".join(r["${field}"]))`,
    ].join("\n"),
  );
  const result = spawnSync(
    "tilt",
    ["alpha", "tiltfile-result", "-f", join(directory, "Tiltfile")],
    {
      cwd: directory,
      encoding: "utf-8",
      timeout: 25000,
    },
  );
  const answer = /ANSWER=(.*)/.exec(`${result.stdout}${result.stderr}`);
  if (!answer) throw new Error(`Starlark did not return an answer: ${result.stderr}`);
  return answer[1] ?? "";
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(!hasTilt)("generated tech stack validation messages", { timeout: 40_000 }, () => {
  it("formats the whole strict error, with the real value and the real platform standard", () => {
    const message = validate('{"runtime": "definitely-not-a-runtime"}', true, "errors");
    expect(message).toMatch(
      /^❌ Tech Stack Error: runtime: 'definitely-not-a-runtime' is not supported\. Platform standard is '[^'{}]+'\. Use _override_reason to document exceptions\.$/,
    );
    expect(message).not.toContain("{}");
  });

  it("formats the whole non-strict warning", () => {
    const message = validate('{"runtime": "definitely-not-a-runtime"}', false, "warnings");
    expect(message).toMatch(
      /^⚠️ Tech Stack Warning: runtime: 'definitely-not-a-runtime' is not standard\. Platform standard is '[^'{}]+'\.$/,
    );
    expect(message).not.toContain("{}");
  });

  it("formats the override and optional-check messages too", () => {
    const override = validate(
      '{"runtime": "x", "_override_reason": "legacy service"}',
      true,
      "warnings",
    );
    expect(override).toBe("Override active: runtime='x' (Reason: legacy service)");
    const optional = validate('{"linting": "definitely-not-a-linter"}', false, "warnings");
    expect(optional).toMatch(
      /^⚠️ Tech Stack Warning: linting: 'definitely-not-a-linter' differs from standard '[^'{}]+'\.$/,
    );
  });

  it("validates strict errors across all strict platform fields: bundler, orm, messaging", () => {
    const bundlerError = validate('{"bundler": "webpack"}', true, "errors");
    expect(bundlerError).toContain("Tech Stack Error: bundler: 'webpack' is not supported");

    const ormError = validate('{"orm": "typeorm"}', true, "errors");
    expect(ormError).toContain("Tech Stack Error: orm: 'typeorm' is not supported");

    const messagingError = validate('{"messaging": "rabbitmq"}', true, "errors");
    expect(messagingError).toContain("Tech Stack Error: messaging: 'rabbitmq' is not supported");
  });

  it("performs case-insensitive validation for platform standards", () => {
    // Uppercase or mixed-case matching should pass with zero errors and zero warnings
    // Platform standards: runtime="bun", bundler="vite"
    const errors = validate('{"runtime": "BUN", "bundler": "Vite"}', true, "errors");
    expect(errors).toBe("");

    const warnings = validate('{"runtime": "BUN", "bundler": "Vite"}', false, "warnings");
    expect(warnings).toBe("");
  });

  it("accumulates multiple validation errors when multiple choices are unsupported", () => {
    // Platform standards: runtime="bun", bundler="vite", orm="prisma"
    const combinedErrors = validate(
      '{"runtime": "deno", "bundler": "rollup", "orm": "typeorm"}',
      true,
      "errors",
    );
    const splitErrors = combinedErrors.split("|");
    expect(splitErrors).toHaveLength(3);
    expect(combinedErrors).toContain("runtime: 'deno'");
    expect(combinedErrors).toContain("bundler: 'rollup'");
    expect(combinedErrors).toContain("orm: 'typeorm'");
  });

  it("returns zero errors and zero warnings for an empty config dictionary", () => {
    expect(validate("{}", true, "errors")).toBe("");
    expect(validate("{}", true, "warnings")).toBe("");
  });

  it("formats override warnings for multiple fields sharing the same override reason", () => {
    const overrides = validate(
      '{"runtime": "deno", "bundler": "rollup", "_override_reason": "migration in progress"}',
      true,
      "warnings",
    );
    expect(overrides).toContain("Override active: runtime='deno' (Reason: migration in progress)");
    expect(overrides).toContain(
      "Override active: bundler='rollup' (Reason: migration in progress)",
    );
  });

  it("formats optional-check warnings for non-standard testing tools", () => {
    const testingWarning = validate('{"testing": "jest"}', false, "warnings");
    expect(testingWarning).toMatch(
      /^⚠️ Tech Stack Warning: testing: 'jest' differs from standard '[^'{}]+'\.$/,
    );

    const testingOverride = validate(
      '{"testing": "jest", "_override_reason": "legacy test suite"}',
      true,
      "warnings",
    );
    expect(testingOverride).toBe("Override active: testing='jest' (Reason: legacy test suite)");
  });
});

describe("static tech stack and defaults generator contract", () => {
  it("renders TILT_TECH_STACK.star with no unrendered Handlebars tokens", () => {
    const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
    const files = engine.generateAll(config);
    const techStackStar = files["TILT_TECH_STACK.star"];

    expect(techStackStar).toBeDefined();
    expect(techStackStar).not.toContain("{{");
    expect(techStackStar).not.toContain("}}");
    expect(techStackStar).toContain("def get_tech_stack():");
    expect(techStackStar).toContain("def validate_tech_stack(config, strict=False):");
    expect(techStackStar).toContain("def assert_tech_stack(config, strict=False):");
  });

  it("exports complete public API in __all__ in TILT_TECH_STACK.star", () => {
    const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
    const techStackStar = engine.generateAll(config)["TILT_TECH_STACK.star"];

    const expectedExports = [
      "get_tech_stack",
      "validate_tech_stack",
      "assert_tech_stack",
      "BUNDLER",
      "RUNTIME",
      "ORM",
      "MESSAGING",
      "LINTING",
      "TESTING",
      "WEB_FRAMEWORK",
      "LANGUAGE",
      "TECH_STACK",
    ];

    for (const symbol of expectedExports) {
      expect(techStackStar).toContain(`"${symbol}"`);
    }
  });

  it("encodes strict validations for bundler, runtime, orm, and messaging", () => {
    const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
    const techStackStar = engine.generateAll(config)["TILT_TECH_STACK.star"];

    expect(techStackStar).toContain('"bundler":');
    expect(techStackStar).toContain('"runtime":');
    expect(techStackStar).toContain('"orm":');
    expect(techStackStar).toContain('"messaging":');
    expect(techStackStar).toContain("value.lower() != standard.lower()");
    expect(techStackStar).toContain("Override active:");
    expect(techStackStar).toContain("❌ Tech Stack Error:");
    expect(techStackStar).toContain("⚠️ Tech Stack Warning:");
  });

  it("renders TILT_RESOURCE_DEFAULTS.star with port allocation and validation rules", () => {
    const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
    const files = engine.generateAll(config);
    const defaultsStar = files["TILT_RESOURCE_DEFAULTS.star"];

    expect(defaultsStar).toBeDefined();
    expect(defaultsStar).not.toContain("{{");
    expect(defaultsStar).not.toContain("}}");
    expect(defaultsStar).toContain(
      "def get_resource_port(resource_type, stack_index=0, resource_index=0):",
    );
    expect(defaultsStar).toContain("def validate_resource_defaults(config):");
    expect(defaultsStar).toContain("Port {} is in reserved range (< 1024)");
    expect(defaultsStar).toContain("Port {} exceeds maximum (65535)");
    expect(defaultsStar).toContain("Health check path must start with /: {}");
  });

  it("renders health check and naming pattern defaults in TILT_RESOURCE_DEFAULTS.star", () => {
    const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
    const defaultsStar = engine.generateAll(config)["TILT_RESOURCE_DEFAULTS.star"];

    expect(defaultsStar).toContain("NAMING_PATTERNS = {");
    expect(defaultsStar).toContain('"backend_suffix":');
    expect(defaultsStar).toContain('"frontend_suffix":');
    expect(defaultsStar).toContain('"valid_separators":');
    expect(defaultsStar).toContain("TRAEFIK_CONFIG = {");
    expect(defaultsStar).toContain('"entrypoint":');
    expect(defaultsStar).toContain('"default_port":');
  });
});
