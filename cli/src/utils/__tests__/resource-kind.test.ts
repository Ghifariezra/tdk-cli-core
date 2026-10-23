// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getMcpIndexTemplate } from "../../backend-frameworks/mcp.js";
import type { DiscoveredResource } from "../../types/index.js";
import { findMissingHealthRoutes } from "../doctor-runtime.js";
import { isApiServiceType } from "../resource-kind.js";
import { buildAdvertisedTargets, buildHealthTargets, resolveServicePath } from "../service-urls.js";

const resource = (name: string, appType: string, path = `/tmp/${name}`): DiscoveredResource => ({
  name,
  path,
  configPath: `${path}/service.json`,
  config: { appName: name, appType } as DiscoveredResource["config"],
});

describe("isApiServiceType", () => {
  it("is true for backend, mcp, and agent services", () => {
    expect(isApiServiceType("backend")).toBe(true);
    expect(isApiServiceType("mcp")).toBe(true);
    expect(isApiServiceType("agent")).toBe(true);
  });

  it("is false for non-API resource types", () => {
    const nonApiTypes = ["frontend", "worker", "sdk", "library", "migrator", "bring-your-own"];
    for (const type of nonApiTypes) {
      expect(isApiServiceType(type)).toBe(false);
    }
  });

  it("is false for invalid, blank, or undefined inputs", () => {
    expect(isApiServiceType(undefined)).toBe(false);
    expect(isApiServiceType("")).toBe(false);
    expect(isApiServiceType("   ")).toBe(false);
    expect(isApiServiceType("database")).toBe(false);
    expect(isApiServiceType("redis")).toBe(false);
  });

  it("is case-sensitive and rejects mismatched casing", () => {
    expect(isApiServiceType("Backend")).toBe(false);
    expect(isApiServiceType("MCP")).toBe(false);
    expect(isApiServiceType("Agent")).toBe(false);
    expect(isApiServiceType("AGENT")).toBe(false);
  });
});

describe("mcp resource classification & routing", () => {
  it("is advertised on the API route, without the stack or -api suffix", () => {
    expect(resolveServicePath(resource("docs-mcp", "mcp"))).toBe("/api/docs-mcp");
    expect(resolveServicePath(resource("orders-api", "mcp"))).toBe("/api/orders");
  });

  it("gets a health target on the API host", () => {
    const targets = buildHealthTargets([resource("docs-mcp", "mcp"), resource("shop", "frontend")]);
    const mcp = targets.find((target) => target.name === "docs-mcp");
    expect(mcp).toBeDefined();
    expect(mcp?.url).toMatch(/^http:\/\/api\./);
    expect(mcp?.url).toMatch(/\/api\/docs-mcp\/health$/);
    expect(targets.find((target) => target.name === "shop")?.url).not.toMatch(/^http:\/\/api\./);
  });
});

describe("agent resource classification & routing", () => {
  it("routes an agent service under the API host like a backend", () => {
    expect(resolveServicePath(resource("support-agent", "agent"))).toBe("/api/support-agent");
    expect(resolveServicePath(resource("triage", "agent"))).toBe("/api/triage");
    expect(resolveServicePath(resource("orders-api", "agent"))).toBe("/api/orders");
  });

  it("creates health targets on the API host for agent resources", () => {
    const targets = buildHealthTargets([
      resource("support-agent", "agent"),
      resource("web", "frontend"),
    ]);
    const agentTarget = targets.find((t) => t.name === "support-agent");
    expect(agentTarget).toBeDefined();
    expect(agentTarget?.appType).toBe("agent");
    expect(agentTarget?.url).toMatch(/^http:\/\/api\./);
    expect(agentTarget?.url).toMatch(/\/api\/support-agent\/health$/);
  });

  it("builds advertised target without /health suffix for agent resources", () => {
    const targets = buildAdvertisedTargets([resource("support-agent", "agent")]);
    expect(targets).toHaveLength(1);
    expect(targets[0].url).toMatch(/\/api\/support-agent$/);
  });
});

describe("non-routable resources classification", () => {
  it("excludes workers, migrators, sdks, and libraries from health targets", () => {
    const nonRoutable = [
      resource("queue-worker", "worker"),
      resource("db-migrator", "migrator"),
      resource("client-sdk", "sdk"),
      resource("core-lib", "library"),
      resource("legacy-app", "bring-your-own"),
    ];
    const targets = buildHealthTargets(nonRoutable);
    expect(targets).toEqual([]);
  });
});

describe("doctor's health-route check on mcp and agent resources", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("finds the /health route in the generated mcp source", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-mcp-health-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), getMcpIndexTemplate("docs-mcp"));
    expect(findMissingHealthRoutes([resource("docs-mcp", "mcp", root)])).toEqual([]);
  });

  it("reports an mcp resource whose source has no /health route", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-mcp-nohealth-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), "console.log('no routes here');\n");
    expect(findMissingHealthRoutes([resource("docs-mcp", "mcp", root)]).map((m) => m.name)).toEqual(
      ["docs-mcp"],
    );
  });

  it("verifies health route detection in agent resources", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-agent-health-"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "index.ts"),
      "app.get('/health', (c) => c.json({ ok: true }));",
    );
    expect(findMissingHealthRoutes([resource("triage-agent", "agent", root)])).toEqual([]);

    writeFileSync(join(root, "src", "index.ts"), "export const agent = true;");
    expect(
      findMissingHealthRoutes([resource("triage-agent", "agent", root)]).map((m) => m.name),
    ).toEqual(["triage-agent"]);
  });
});
