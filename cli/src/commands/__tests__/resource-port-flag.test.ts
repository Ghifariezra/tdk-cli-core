// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveResourcePort, resourceCommand } from "../../commands/resource.js";
import { captureExit } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

const originalCwd = process.cwd();

describe("--port for every port-assigned resource type", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tdk-port-flag-test-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".tdk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
        optional_infra: {
          monitoring: false,
          elk: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/**"] },
      }),
    );
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Command errors exit the process; capture the message instead of ending the test run.
  async function refuse(name: string, type: string, args: string[]): Promise<string> {
    const errors: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.map(String).join(" "));
    });
    const { exit } = captureExit();
    try {
      await createResource(name, type, args).catch(() => {});
      expect(exit).toHaveBeenCalledWith(1);
      return errors.join("\n");
    } finally {
      error.mockRestore();
      exit.mockRestore();
      clearDiscoveryCache();
    }
  }

  async function createResource(name: string, type: string, args: string[] = []): Promise<string> {
    await resourceCommand.parseAsync(
      ["node", "flisk", name, "--type", type, "--stack", "shop", "--yes", ...args],
      { from: "node" },
    );
    return join(tempDir, "services", "shop", name, "service.json");
  }

  it.each([
    ["backend", "api", 4100],
    ["frontend", "web", 3100],
    ["worker", "jobs", 6100],
  ])("stores the requested %s port in service.json", async (type, name, port) => {
    const serviceJson = await createResource(name, type, ["--port", String(port)]);
    expect(JSON.parse(readFileSync(serviceJson, "utf-8")).port).toBe(port);
  });

  it("applies the type's own range: a worker port outside 6000-6999 is refused", async () => {
    const message = await refuse("jobs", "worker", ["--port", "4100"]);
    expect(message).toContain("--port must be an integer from 6000 through 6999");
  });

  it("refuses --port for sdk resources", async () => {
    const message = await refuse("client", "sdk", ["--port", "4100"]);
    expect(message).toContain("--port does not apply to --type sdk");
  });

  it("keeps the BYO wording and range for bring-your-own", () => {
    expect(() => resolveResourcePort("bring-your-own", "3999", 4000, [])).toThrow(
      "BYO --port must be an integer from 4000 through 5999.",
    );
  });

  it("refuses a port another resource already has, regardless of type", () => {
    expect(() =>
      resolveResourcePort("backend", "4100", 4000, [{ config: { port: 4100 } }]),
    ).toThrow("Port 4100 is already assigned to another resource.");
  });

  it("falls back to the next free port when --port is absent", () => {
    expect(resolveResourcePort("worker", undefined, 6005, [])).toBe(6005);
    expect(resolveResourcePort("backend", "", 4005, [])).toBe(4005);
  });

  describe("resolveResourcePort across all types and boundaries", () => {
    it.each([
      ["frontend", "3000", 3000],
      ["frontend", "3999", 3999],
      ["backend", "4000", 4000],
      ["backend", "4999", 4999],
      ["worker", "6000", 6000],
      ["worker", "6999", 6999],
      ["agent", "4500", 4500],
      ["mcp", "4800", 4800],
      ["bring-your-own", "5000", 5000],
    ] as const)("accepts valid port %s for %s", (type, portStr, expected) => {
      expect(resolveResourcePort(type, portStr, 4000, [])).toBe(expected);
    });

    it("refuses out-of-boundary ports for frontend", () => {
      expect(() => resolveResourcePort("frontend", "2999", 3000, [])).toThrow(
        "--port must be an integer from 3000 through 3999.",
      );
      expect(() => resolveResourcePort("frontend", "4000", 3000, [])).toThrow(
        "--port must be an integer from 3000 through 3999.",
      );
    });

    it("refuses out-of-boundary ports for backend", () => {
      expect(() => resolveResourcePort("backend", "3999", 4000, [])).toThrow(
        "--port must be an integer from 4000 through 4999.",
      );
      expect(() => resolveResourcePort("backend", "5000", 4000, [])).toThrow(
        "--port must be an integer from 4000 through 4999.",
      );
    });

    it("refuses out-of-boundary ports for agent and mcp", () => {
      expect(() => resolveResourcePort("agent", "3999", 4000, [])).toThrow(
        "--port must be an integer from 4000 through 5999.",
      );
      expect(() => resolveResourcePort("agent", "6000", 4000, [])).toThrow(
        "--port must be an integer from 4000 through 5999.",
      );
      expect(() => resolveResourcePort("mcp", "3999", 4000, [])).toThrow(
        "--port must be an integer from 4000 through 5999.",
      );
      expect(() => resolveResourcePort("mcp", "6000", 4000, [])).toThrow(
        "--port must be an integer from 4000 through 5999.",
      );
    });

    it("refuses out-of-boundary ports for worker", () => {
      expect(() => resolveResourcePort("worker", "5999", 6000, [])).toThrow(
        "--port must be an integer from 6000 through 6999.",
      );
      expect(() => resolveResourcePort("worker", "7000", 6000, [])).toThrow(
        "--port must be an integer from 6000 through 6999.",
      );
    });

    it("rejects non-digit strings, floats and whitespace-padded port numbers", () => {
      for (const invalid of ["abc", "4000.5", "-4000", " 4000 ", "4000px", "NaN"]) {
        expect(() => resolveResourcePort("backend", invalid, 4000, [])).toThrow(
          "--port must be an integer from 4000 through 4999.",
        );
      }
    });

    it("reports BYO-specific collision wording when conflicting with another resource", () => {
      expect(() =>
        resolveResourcePort("bring-your-own", "4500", 4000, [{ config: { port: 4500 } }]),
      ).toThrow("BYO port 4500 is already assigned to another resource.");
    });

    it("safely handles resources without config or with undefined ports during collision checks", () => {
      const existing = [
        {},
        { config: undefined },
        { config: { port: undefined } },
        { config: { port: 4200 } },
      ];
      expect(resolveResourcePort("backend", "4100", 4000, existing)).toBe(4100);
      expect(() => resolveResourcePort("backend", "4200", 4000, existing)).toThrow(
        "Port 4200 is already assigned to another resource.",
      );
    });
  });
});
