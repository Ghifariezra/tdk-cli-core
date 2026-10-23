// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BACKEND_FRAMEWORKS, resolveBackendFramework } from "../../backend-frameworks/registry.js";
import { CREATABLE_RESOURCE_TYPES } from "../../types/index.js";
import {
  PORT_RANGES,
  REQUIRED_PACKAGE_SCRIPTS,
  VALID_RESOURCE_TYPES,
} from "../../utils/constants.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = join(repoRoot, "cli", "bin", "tdk.js");

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function flisk(args: string[], cwd: string, input = "y\n"): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cliBin, ...args],
      { cwd, encoding: "utf-8", env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot } },
      (error, stdout, stderr) => {
        const status = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ status, stdout, stderr });
      },
    );
    child.stdin?.end(input);
  });
}

describe("the mcp resource type", () => {
  it("is a known, creatable type with the scripts and port range of an HTTP service", async () => {
    expect(CREATABLE_RESOURCE_TYPES).toContain("mcp");
    expect(VALID_RESOURCE_TYPES).toContain("mcp");
    expect(REQUIRED_PACKAGE_SCRIPTS.mcp).toEqual(["dev", "build", "start"]);
    expect(PORT_RANGES.mcp).toMatchObject({ min: 4000, max: 5999 });
  });

  it("is not a backend --framework choice", async () => {
    expect(Object.keys(BACKEND_FRAMEWORKS)).not.toContain("mcp");
    expect(() => resolveBackendFramework("backend", "mcp")).toThrow(/Unknown backend framework/);
  });

  it("has a fixed scaffold: no framework or language choice", async () => {
    expect(resolveBackendFramework("mcp")?.id).toBe("mcp");
    expect(() => resolveBackendFramework("mcp", "express")).toThrow(
      /cannot be combined with --type mcp/,
    );
    expect(() =>
      resolveBackendFramework("mcp", undefined, { id: "python", createFiles: [] }),
    ).toThrow(/cannot be combined with --type mcp/);
  });

  it("is accepted by the service schema, and the engine runs it as a backend", async () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, "engine", "schemas", "service-schema.json"), "utf-8"),
    );
    expect(schema.properties.appType.enum).toContain("mcp");

    // Every backend code path in the engine keys off appType == 'backend', so an mcp manifest is normalised once, where
    // service.json is loaded. This pins that, because nothing else would notice it going missing until `flisk up`.
    const loader = readFileSync(
      join(repoRoot, "engine", "topologies", "tilt", "manifest", "loader.star"),
      "utf-8",
    );
    expect(loader).toContain('manifest.get("appType") == "mcp"');
    expect(loader).toContain('manifest["appType"] = "backend"');
    expect(loader).toContain('manifest["mcp"] = True');

    const constants = readFileSync(
      join(repoRoot, "engine", "topologies", "tilt", "manifest", "constants.star"),
      "utf-8",
    );
    expect(constants).toMatch(/"mcp",\n\s+"bring-your-own"/);
  });
});

describe.concurrent("flisk resource --type mcp", () => {
  let projectRoot = "";

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-mcp-"));
    execFileSync(process.execPath, [cliBin, "project", "--yes"], {
      cwd: projectRoot,
      env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
    });
  }, 30000);

  afterAll(() => {
    if (projectRoot.startsWith(tmpdir())) rmSync(projectRoot, { recursive: true, force: true });
  }, 15000);

  const dir = (name: string) => join(projectRoot, "services", "shop", name);
  const json = (name: string, file: string) =>
    JSON.parse(readFileSync(join(dir(name), file), "utf-8"));

  it("scaffolds a Model Context Protocol server on the shared Bun image", async () => {
    const result = await flisk(
      ["resource", "docs-mcp", "--type", "mcp", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    const service = json("docs-mcp", "service.json");
    expect(service).toMatchObject({
      appType: "mcp",
      type: "mcp",
      stack: "shop",
      healthCheckPath: "/health",
    });
    // Not a backend framework, no language, and no backend-only features such as Prisma.
    expect(service).not.toHaveProperty("framework");
    expect(service).not.toHaveProperty("language");
    expect(service.featuresEnabled).toEqual([]);
    expect(service.port).toBeGreaterThanOrEqual(4000);
    expect(service.port).toBeLessThanOrEqual(5999);

    const pkg = json("docs-mcp", "package.json");
    expect(pkg.dependencies).toHaveProperty("@modelcontextprotocol/sdk");
    expect(pkg.dependencies).toHaveProperty("zod");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    expect(pkg.scripts).toMatchObject({
      dev: expect.any(String),
      build: "tsc",
      start: expect.any(String),
    });

    // The shared Bun Dockerfile and tsconfig are kept, like any Bun backend.
    expect(existsSync(join(dir("docs-mcp"), "Dockerfile"))).toBe(true);
    expect(existsSync(join(dir("docs-mcp"), "tsconfig.json"))).toBe(true);

    const index = readFileSync(join(dir("docs-mcp"), "src", "index.ts"), "utf-8");
    expect(index).toContain("StreamableHTTPServerTransport");
    expect(index).toContain("registerTool");
    expect(index).toContain("path === '/health'");
    expect(index).toContain("path === '/mcp'");
    expect(index).toContain("process.env.PORT");
    expect(index).toContain("'0.0.0.0'");
    expect(index).toContain("name: 'docs-mcp'");
    expect(index).not.toContain("hono");
  }, 30000);

  it("rejects --framework and --language, which have no meaning for an mcp resource", async () => {
    const framework = await flisk(
      ["resource", "bad-fw", "--type", "mcp", "--framework", "express", "--stack", "shop"],
      projectRoot,
    );
    expect(framework.status).not.toBe(0);
    expect(`${framework.stdout}${framework.stderr}`).toMatch(
      /cannot be combined with --type mcp|--framework can only be used/,
    );
    expect(existsSync(dir("bad-fw"))).toBe(false);

    const language = await flisk(
      ["resource", "bad-lang", "--type", "mcp", "--language", "python", "--stack", "shop"],
      projectRoot,
    );
    expect(language.status).not.toBe(0);
    expect(existsSync(dir("bad-lang"))).toBe(false);
  }, 60000);
});
