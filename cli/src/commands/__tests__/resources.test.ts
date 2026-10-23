// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit, parseEnvelope } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { resourcesCommand } from "../resources.js";

const originalCwd = process.cwd();

describe("resources command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-resources-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    clearDiscoveryCache();
    vi.restoreAllMocks();
  });

  function setupProject(
    resources: Array<{ name: string; type: string; stack?: string; port?: number }>,
  ) {
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".tdk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test-proj", version: "1.0.0" },
        phases: {
          alpha: { name: "alpha", description: "", enabledStacks: ["shop", "core"] },
        },
        discovery: { paths: ["services/**"] },
      }),
    );

    for (const r of resources) {
      const resourceDir = r.stack
        ? join(tempDir, "services", r.stack, r.name)
        : join(tempDir, "services", r.name);
      mkdirSync(resourceDir, { recursive: true });
      writeFileSync(
        join(resourceDir, "service.json"),
        JSON.stringify({
          name: r.name,
          appName: r.name,
          type: r.type,
          appType: r.type,
          runtime: "bun",
          stack: r.stack,
          port: r.port,
        }),
      );
    }
  }

  it("rejects when not in a Flisk project", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      resourcesCommand.parseAsync(["node", "flisk"], { from: "node" }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("emits machine error when invoked with --json outside project", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      resourcesCommand.parseAsync(["node", "flisk", "--json"], { from: "node" }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalled();
    const firstCall = logSpy.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    const envelope = JSON.parse(String(firstCall));
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.errors[0]?.code).toBe("COMMAND_FAILED");
    expect(envelope.errors[0]?.message).toContain(
      "Could not find project root (no .tdk/project.json found)",
    );
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("rejects invalid resource type with error", async () => {
    setupProject([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      resourcesCommand.parseAsync(["node", "flisk", "--type", "invalid-type"], { from: "node" }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
  });

  it("exits when requested stack does not exist", async () => {
    setupProject([{ name: "api", type: "backend", stack: "shop", port: 4000 }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      resourcesCommand.parseAsync(["node", "flisk", "--stack", "nonexistent"], { from: "node" }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
  });

  it("emits JSON machine error when requested stack does not exist with --json", async () => {
    setupProject([{ name: "api", type: "backend", stack: "shop", port: 4000 }]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      resourcesCommand.parseAsync(["node", "flisk", "--stack", "nonexistent", "--json"], {
        from: "node",
      }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalled();
    const firstCall = logSpy.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    const envelope = JSON.parse(String(firstCall));
    expect(envelope.errors[0]?.message).toContain('Stack "nonexistent" not found');
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("returns empty resources array in JSON envelope for empty project", async () => {
    setupProject([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resourcesCommand.parseAsync(["node", "flisk", "--json"], { from: "node" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const envelope = parseEnvelope(output);
    expect(envelope.data.resources).toEqual([]);
    logSpy.mockRestore();
  });

  it("lists all resources across stacks in JSON format", async () => {
    setupProject([
      { name: "orders", type: "backend", stack: "shop", port: 4001 },
      { name: "web", type: "frontend", stack: "shop", port: 3000 },
      { name: "worker", type: "worker", stack: "core", port: 6001 },
      { name: "orphan", type: "backend", port: 4002 },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resourcesCommand.parseAsync(["node", "flisk", "--json"], { from: "node" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const envelope = parseEnvelope(output);
    expect(envelope.data.resources).toHaveLength(4);
    const names = envelope.data.resources.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(["orders", "orphan", "web", "worker"]);
    logSpy.mockRestore();
  });

  it("filters resources by type in JSON output", async () => {
    setupProject([
      { name: "orders", type: "backend", stack: "shop", port: 4001 },
      { name: "web", type: "frontend", stack: "shop", port: 3000 },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resourcesCommand.parseAsync(["node", "flisk", "--type", "frontend", "--json"], {
      from: "node",
    });

    const envelope = parseEnvelope(logSpy.mock.calls.map((c) => c.join(" ")).join("\n"));
    expect(envelope.data.resources).toHaveLength(1);
    expect(envelope.data.resources[0].name).toBe("web");
    logSpy.mockRestore();
  });

  it("filters resources by stack in JSON output", async () => {
    setupProject([
      { name: "orders", type: "backend", stack: "shop", port: 4001 },
      { name: "core-api", type: "backend", stack: "core", port: 4002 },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resourcesCommand.parseAsync(["node", "flisk", "--stack", "shop", "--json"], {
      from: "node",
    });

    const envelope = parseEnvelope(logSpy.mock.calls.map((c) => c.join(" ")).join("\n"));
    expect(envelope.data.resources).toHaveLength(1);
    expect(envelope.data.resources[0].name).toBe("orders");
    logSpy.mockRestore();
  });

  it("filters unassigned resources with --no-stack in JSON output", async () => {
    setupProject([
      { name: "orders", type: "backend", stack: "shop", port: 4001 },
      { name: "standalone", type: "backend", port: 4005 },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resourcesCommand.parseAsync(["node", "flisk", "--no-stack", "--json"], { from: "node" });

    const envelope = parseEnvelope(logSpy.mock.calls.map((c) => c.join(" ")).join("\n"));
    expect(envelope.data.resources).toHaveLength(1);
    expect(envelope.data.resources[0].name).toBe("standalone");
    logSpy.mockRestore();
  });

  it("formats human-readable output with --ports and --verbose", async () => {
    setupProject([{ name: "orders", type: "backend", stack: "shop", port: 4001 }]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resourcesCommand.parseAsync(["node", "flisk", "--ports", "--verbose"], { from: "node" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("orders");
    expect(output).toContain("Port: 4001");
    expect(output).toContain("Type: backend");
    expect(output).toContain("Path:");
    logSpy.mockRestore();
  });

  it("warns about unassigned resources when listing without filters", async () => {
    setupProject([
      { name: "orders", type: "backend", stack: "shop", port: 4001 },
      { name: "orphan", type: "backend", port: 4002 },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resourcesCommand.parseAsync(["node", "flisk"], { from: "node" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("1 resource not assigned to any stack");
    expect(output).toContain("resources --no-stack");
    logSpy.mockRestore();
  });
});
