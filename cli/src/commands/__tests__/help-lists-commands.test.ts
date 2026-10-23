// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/// <reference types="vite/client" />

import * as fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import pkg from "../../../package.json" with { type: "json" };
import { createTempDir, runFlisk } from "../../test-support/index.js";
import { listedCommandNames, showHelp } from "../help.js";
import { getRegisteredCommands } from "../registry.js";

// Commands that exist for maintainers of this repository, not for people using Flisk.
const NOT_LISTED = new Set(["maintainers"]);

describe("flisk --help", () => {
  it("lists every command that the CLI registers", () => {
    const commands = getRegisteredCommands();
    expect(commands.length).toBeGreaterThan(15);

    const listed = new Set(listedCommandNames());
    const missing = commands
      .map((command) => command.name())
      .filter((name) => !NOT_LISTED.has(name) && !listed.has(name));

    expect(missing, "add a row to COMMAND_GROUPS in commands/help.ts").toEqual([]);
  });

  it("renders formatted banner, groups, global options, and quick start", () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      showHelp();
      const output = logs.join("\n");
      expect(output).toContain("flisk");
      expect(output).toContain(pkg.version);
      expect(output).toContain("Project Level");
      expect(output).toContain("Stack Level");
      expect(output).toContain("Resource Level");
      expect(output).toContain("Lifecycle");
      expect(output).toContain("Networking");
      expect(output).toContain("Utilities");
      expect(output).toContain("Global Options:");
      expect(output).toContain("-v, --version");
      expect(output).toContain("-h, --help");
      expect(output).toContain("--verbose");
      expect(output).toContain("Quick start:");
      expect(output).toContain("Examples:");
      expect(output).toContain("https://github.com/flisk-sh/flisk");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects unknown commands with exit code 1", () => {
    const dir = createTempDir("tdk-unknown-cmd-");
    try {
      const res = runFlisk(["unknown-command-xyz"], { cwd: dir });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("error: unknown command 'unknown-command-xyz'");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown command target passed to help with exit code 1", () => {
    const dir = createTempDir("tdk-unknown-help-");
    try {
      const res = runFlisk(["help", "unknown-target-xyz"], { cwd: dir });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("error: unknown command 'unknown-target-xyz'");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
