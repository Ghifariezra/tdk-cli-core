// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BACKEND_FRAMEWORKS } from "../../backend-frameworks/registry.js";
import { FRONTEND_FRAMEWORKS, listFrontendFrameworks } from "../../frontend-frameworks/registry.js";
import { runFlisk } from "../../test-support/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * The inventory is a CLI contract, so the test runs the real binary through the shared `runFlisk`
 * helper (no color, a real exit status). A spawned process also keeps commander's option state per
 * run: an in-process parse keeps the previous run's `--type` source.
 */
function flisk(args: readonly string[]) {
  return runFlisk(args, { cwd: repoRoot, env: { TDK_EXTENSION_SOURCE: repoRoot } });
}

/** The listing is tab separated, one framework per row. */
function rows(output: string): string[][] {
  return output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t"));
}

describe("flisk resource --frameworks", () => {
  it("lists the frontend frameworks when no --type is given", () => {
    const result = flisk(["resource", "--frameworks"]);

    expect(result.status, result.stderr).toBe(0);
    const listed = rows(result.stdout);
    expect(listed.map((row) => row[0])).toEqual(Object.keys(FRONTEND_FRAMEWORKS));
    // The historical columns stay: id, label, kind, verification, command.
    const verified = new Map(listFrontendFrameworks().map((entry) => [entry.id, entry.verified]));
    for (const row of listed) {
      expect(row).toHaveLength(5);
      expect(row[2]).toBe("vite-spa");
      // The verification comes from the registry, so an unverified provider does not break the test.
      expect(row[3]).toBe(verified.get(row[0]) ? "verified" : "unverified");
      expect(row[4]).toBe(`flisk resource <name> --type frontend --framework ${row[0]}`);
    }
  });

  it("lists the same frontend frameworks for --type frontend", () => {
    const result = flisk(["resource", "--type", "frontend", "--frameworks"]);

    expect(result.status, result.stderr).toBe(0);
    expect(rows(result.stdout)).toEqual(rows(flisk(["resource", "--frameworks"]).stdout));
  });

  it("keeps the frontend listing when --language is given without --type", () => {
    const result = flisk(["resource", "--language", "python", "--frameworks"]);

    // `--language` is a backend option: without an explicit `--type` the listing stays the
    // historical frontend one and exits successfully, as it did before the listing was type aware.
    expect(result.status, result.stderr).toBe(0);
    expect(rows(result.stdout)).toEqual(rows(flisk(["resource", "--frameworks"]).stdout));
  });

  it("lists every registered backend framework with its language and command", () => {
    const result = flisk(["resource", "--type", "backend", "--frameworks"]);

    expect(result.status, result.stderr).toBe(0);
    const listed = rows(result.stdout);
    expect(listed.map((row) => row[0])).toEqual(Object.keys(BACKEND_FRAMEWORKS));
    for (const row of listed) {
      const provider = BACKEND_FRAMEWORKS[row[0]];
      expect(row).toHaveLength(5);
      // The display name, the language (and runtime) it is scaffolded with, and its compatibility.
      expect(row[1]).toBe(provider.label);
      expect(row[2]).toBe("bun");
      expect(row[3]).toBe("compatible with bun");
      expect(row[4]).toBe(`flisk resource <name> --type backend --framework ${row[0]}`);
    }
  });

  it("marks a framework that cannot be combined with the requested language", () => {
    const result = flisk(["resource", "--type", "backend", "--language", "python", "--frameworks"]);

    expect(result.status, result.stderr).toBe(0);
    const listed = rows(result.stdout);
    expect(listed.map((row) => row[0])).toEqual(Object.keys(BACKEND_FRAMEWORKS));
    for (const row of listed) {
      // Python owns its runtime, so no framework can be combined with it.
      expect(row[2]).toBe("bun");
      expect(row[3]).toBe("incompatible with --language python");
      // The command creates the resource in the requested language: that language owns its runtime,
      // so it has no framework to pick.
      expect(row[4]).toBe("flisk resource <name> --type backend --language python");
    }
  });

  it("keeps a language that can be combined with a framework compatible", () => {
    const result = flisk(["resource", "--type", "backend", "--language", "bun", "--frameworks"]);

    expect(result.status, result.stderr).toBe(0);
    for (const row of rows(result.stdout)) {
      expect(row[3]).toBe("compatible with bun");
      // The requested language is named, so a copied row scaffolds the language that was asked about.
      expect(row[4]).toBe(
        `flisk resource <name> --type backend --framework ${row[0]} --language bun`,
      );
    }
  });

  it("fails for a resource type that has no frameworks", () => {
    const result = flisk(["resource", "--type", "worker", "--frameworks"]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(
      /No frameworks are registered for --type worker/,
    );
  });

  it("fails for an unknown type or language", () => {
    const unknownType = flisk(["resource", "--type", "not-a-type", "--frameworks"]);
    expect(unknownType.status).not.toBe(0);
    expect(`${unknownType.stdout}${unknownType.stderr}`).toMatch(/Unknown resource type/);

    const unknownLanguage = flisk([
      "resource",
      "--type",
      "backend",
      "--language",
      "cobol",
      "--frameworks",
    ]);
    expect(unknownLanguage.status).not.toBe(0);
    expect(`${unknownLanguage.stdout}${unknownLanguage.stderr}`).toMatch(
      /Unknown backend language "cobol"/,
    );
  });

  it("rejects a language on a type that does not own one", () => {
    const result = flisk([
      "resource",
      "--type",
      "frontend",
      "--language",
      "python",
      "--frameworks",
    ]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(
      /--language can only be used with --type backend/,
    );
  });

  it("documents the backend listing in the help text", () => {
    const result = flisk(["resource", "--help"]);

    expect(result.status, result.stderr).toBe(0);
    const help = result.stdout.replace(/\s+/g, " ");
    expect(help).toContain(
      "List registered frameworks for the resource type and exit (--type frontend, --type backend)",
    );
  });
});
