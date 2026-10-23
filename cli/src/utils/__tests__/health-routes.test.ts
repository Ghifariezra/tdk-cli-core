// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  checkHealthRoutes,
  findMissingHealthRoutes,
  resolveHealthPaths,
} from "../doctor-runtime.js";

describe("checkHealthRoutes", () => {
  let root: string;

  function service(name: string, config: Record<string, unknown>, files: Record<string, string>) {
    const dir = join(root, "services", "shop", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "service.json"),
      JSON.stringify({ appName: name, stack: "shop", port: 4000, ...config }),
    );
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      writeFileSync(join(dir, file), content);
    }
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tdk-health-routes-"));
    mkdirSync(join(root, ".tdk"), { recursive: true });
    writeFileSync(
      join(root, ".tdk", "project.json"),
      JSON.stringify({ project: { name: "shop" } }),
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("passes when the backend defines /health", () => {
    service(
      "orders-api",
      { appType: "backend" },
      {
        "src/index.ts": "app.get('/health', (c) => c.json({ status: 'ok' }));",
      },
    );
    const result = checkHealthRoutes(root);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("1 backend define");
  });

  it("fails and names the backend when the route is missing", () => {
    service(
      "orders-api",
      { appType: "backend" },
      {
        "src/index.ts": 'app.get("/orders", (c) => c.json([]));',
      },
    );
    const result = checkHealthRoutes(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('orders-api: no "/health" route');
    expect(result.message).toContain("404");
    expect(result.fix).toContain('app.get("/health"');
  });

  it("uses healthCheckPath from service.json", () => {
    service(
      "orders-api",
      { appType: "backend", healthCheckPath: "/status" },
      {
        "src/index.ts": "app.get('/health', h); // old path",
      },
    );
    const missing = checkHealthRoutes(root);
    expect(missing.didPass).toBe(false);
    expect(missing.message).toContain('no "/status" route');

    writeFileSync(
      join(root, "services", "shop", "orders-api", "src", "index.ts"),
      "router.get(`/status`, h);",
    );
    expect(checkHealthRoutes(root).didPass).toBe(true);
  });

  it("checks traefik.healthCheck separately from healthCheckPath", () => {
    service(
      "orders-api",
      { appType: "backend", traefik: { healthCheck: "/ready" } },
      {
        "src/index.ts": "app.get('/health', h);",
      },
    );
    const missing = checkHealthRoutes(root);
    expect(missing.didPass).toBe(false);
    expect(missing.message).toContain(
      'no "/ready" route in src/ (probed by the Traefik healthcheck)',
    );
    expect(missing.message).not.toContain('"/health" route');

    writeFileSync(
      join(root, "services", "shop", "orders-api", "src", "index.ts"),
      "app.get('/health', h); app.get('/ready', h);",
    );
    expect(checkHealthRoutes(root).didPass).toBe(true);
  });

  it("names both probes when both paths are missing", () => {
    service(
      "orders-api",
      { appType: "backend", healthCheckPath: "/status", traefik: { healthCheck: "/ready" } },
      {
        "src/index.ts": "app.get('/orders', h);",
      },
    );
    const result = checkHealthRoutes(root);
    expect(result.message).toContain(
      '"/status" route in src/ (probed by the container healthcheck)',
    );
    expect(result.message).toContain('"/ready" route in src/ (probed by the Traefik healthcheck)');
  });

  it("finds the route in a nested file", () => {
    service(
      "orders-api",
      { appType: "backend" },
      {
        "src/index.ts": "import { routes } from './http/routes';",
        "src/http/routes.ts": 'if (url.pathname === "/health") return ok();',
      },
    );
    expect(checkHealthRoutes(root).didPass).toBe(true);
  });

  it("does not count a mention in a test file", () => {
    service(
      "orders-api",
      { appType: "backend" },
      {
        "src/index.ts": "app.get('/orders', h);",
        "src/index.test.ts": "await fetch('/health');",
      },
    );
    expect(checkHealthRoutes(root).didPass).toBe(false);
  });

  it("skips when there are no backends, and ignores frontends", () => {
    service("storefront", { appType: "frontend" }, { "src/main.ts": "render();" });
    const result = checkHealthRoutes(root);
    expect(result.isSkipped).toBe(true);
    expect(result.message).toBe("No backend services to check");
  });

  it("skips gracefully when resource discovery throws", () => {
    const invalidPath = join(root, "nonexistent-dir-for-doctor");
    const result = checkHealthRoutes(invalidPath);
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("Could not read services");
  });

  it("checks mcp service type and flags missing health route", () => {
    service(
      "docs-mcp",
      { appType: "mcp" },
      {
        "src/index.ts": "export const server = new Server();",
      },
    );
    const result = checkHealthRoutes(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('docs-mcp: no "/health" route');

    writeFileSync(
      join(root, "services", "shop", "docs-mcp", "src", "index.ts"),
      "export const server = new Server(); router.get('/health', h);",
    );
    expect(checkHealthRoutes(root).didPass).toBe(true);
  });

  it("checks agent service type and flags missing health route", () => {
    service(
      "triage-agent",
      { appType: "agent" },
      {
        "src/index.ts": "export const agent = new Agent();",
      },
    );
    const result = checkHealthRoutes(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('triage-agent: no "/health" route');

    writeFileSync(
      join(root, "services", "shop", "triage-agent", "src", "index.ts"),
      "export const agent = new Agent(); router.get('/health', h);",
    );
    expect(checkHealthRoutes(root).didPass).toBe(true);
  });

  it("lists multiple missing backends in failure output", () => {
    service(
      "orders-api",
      { appType: "backend" },
      { "src/index.ts": "app.get('/orders', handler);" },
    );
    service(
      "catalog-api",
      { appType: "backend", healthCheckPath: "/ping" },
      { "src/index.ts": "app.get('/products', handler);" },
    );
    const result = checkHealthRoutes(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('orders-api: no "/health" route');
    expect(result.message).toContain('catalog-api: no "/ping" route');
    expect(result.fix).toContain("app.get(");
  });

  it("passes when multiple backends all define their health route", () => {
    service(
      "orders-api",
      { appType: "backend" },
      { "src/index.ts": "app.get('/health', handler);" },
    );
    service(
      "catalog-api",
      { appType: "backend", healthCheckPath: "/status" },
      { "src/index.ts": "app.get('/status', handler);" },
    );
    const result = checkHealthRoutes(root);
    expect(result.didPass).toBe(true);
    expect(result.message).toBe("All 2 backends define their health route");
  });
});

describe("resolveHealthPaths", () => {
  const base = { appName: "a", appType: "backend" as const };

  it("defaults both probes to /health", () => {
    expect(resolveHealthPaths({ ...base })).toEqual({ container: "/health", traefik: "/health" });
    expect(resolveHealthPaths(undefined)).toEqual({ container: "/health", traefik: "/health" });
  });

  it("makes Traefik follow healthCheckPath unless traefik.healthCheck overrides it", () => {
    expect(resolveHealthPaths({ ...base, healthCheckPath: "/status" })).toEqual({
      container: "/status",
      traefik: "/status",
    });
    expect(
      resolveHealthPaths({
        ...base,
        healthCheckPath: "/status",
        traefik: { healthCheck: "/ready" },
      }),
    ).toEqual({ container: "/status", traefik: "/ready" });
    expect(resolveHealthPaths({ ...base, traefik: { healthCheck: "/ready" } })).toEqual({
      container: "/health",
      traefik: "/ready",
    });
  });

  it("handles nested custom paths like /api/v1/healthz", () => {
    expect(resolveHealthPaths({ ...base, healthCheckPath: "/api/v1/healthz" })).toEqual({
      container: "/api/v1/healthz",
      traefik: "/api/v1/healthz",
    });
  });
});

describe("findMissingHealthRoutes", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tdk-missing-health-"));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("skips resources without a src directory", () => {
    const res: DiscoveredResource = {
      name: "no-src",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: { appName: "no-src", appType: "backend" },
    };
    expect(findMissingHealthRoutes([res])).toEqual([]);
  });

  it("skips resources when src directory has no source files", () => {
    const src = join(tempDir, "src");
    mkdirSync(src, { recursive: true });
    const res: DiscoveredResource = {
      name: "empty-src",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: { appName: "empty-src", appType: "backend" },
    };
    expect(findMissingHealthRoutes([res])).toEqual([]);
  });

  it("skips non-API resource types like workers or libraries", () => {
    const src = join(tempDir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.ts"), "console.log('worker');");
    const worker: DiscoveredResource = {
      name: "job-worker",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: { appName: "job-worker", appType: "worker" },
    };
    expect(findMissingHealthRoutes([worker])).toEqual([]);
  });

  it("detects missing route for container and traefik when neither matches", () => {
    const src = join(tempDir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.ts"), "app.get('/api/users', () => {});");
    const res: DiscoveredResource = {
      name: "api",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: { appName: "api", appType: "backend", healthCheckPath: "/custom-health" },
    };
    const missing = findMissingHealthRoutes([res]);
    expect(missing).toEqual([
      {
        name: "api",
        healthPath: "/custom-health",
        usedBy: "container and Traefik healthchecks",
      },
    ]);
  });

  it("detects when container healthcheck matches but traefik healthcheck is missing", () => {
    const src = join(tempDir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.ts"), 'app.get("/health", handler);');
    const res: DiscoveredResource = {
      name: "api",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: {
        appName: "api",
        appType: "backend",
        traefik: { healthCheck: "/traefik-ready" },
      },
    };
    const missing = findMissingHealthRoutes([res]);
    expect(missing).toEqual([
      {
        name: "api",
        healthPath: "/traefik-ready",
        usedBy: "Traefik healthcheck",
      },
    ]);
  });

  it("recognizes a health route declaration quoted in backticks, single quotes, or double quotes", () => {
    const src = join(tempDir, "src");
    mkdirSync(src, { recursive: true });

    const resSingle: DiscoveredResource = {
      name: "api-single",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: { appName: "api-single", appType: "backend" },
    };

    // Single quotes
    writeFileSync(join(src, "single.ts"), "app.get('/health', (c) => c.json({ status: 'ok' }));");
    expect(findMissingHealthRoutes([resSingle])).toEqual([]);

    // Double quotes
    writeFileSync(join(src, "single.ts"), 'app.get("/health", (c) => c.json({ status: "ok" }));');
    expect(findMissingHealthRoutes([resSingle])).toEqual([]);

    // Backticks
    writeFileSync(join(src, "single.ts"), "app.get(`/health`, (c) => c.json({ status: `ok` }));");
    expect(findMissingHealthRoutes([resSingle])).toEqual([]);

    // Unquoted mention of the path is not a route declaration
    writeFileSync(join(src, "single.ts"), "const probe = healthCheckPath; // defaults to /health");
    expect(findMissingHealthRoutes([resSingle])).toEqual([
      {
        name: "api-single",
        healthPath: "/health",
        usedBy: "container and Traefik healthchecks",
      },
    ]);
  });

  it("includes agent and mcp services in route validation", () => {
    const src = join(tempDir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.ts"), "console.log('no route');");

    const mcpRes: DiscoveredResource = {
      name: "my-mcp",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: { appName: "my-mcp", appType: "mcp" },
    };
    expect(findMissingHealthRoutes([mcpRes])).toEqual([
      {
        name: "my-mcp",
        healthPath: "/health",
        usedBy: "container and Traefik healthchecks",
      },
    ]);

    const agentRes: DiscoveredResource = {
      name: "my-agent",
      path: tempDir,
      configPath: join(tempDir, "service.json"),
      config: { appName: "my-agent", appType: "agent" },
    };
    expect(findMissingHealthRoutes([agentRes])).toEqual([
      {
        name: "my-agent",
        healthPath: "/health",
        usedBy: "container and Traefik healthchecks",
      },
    ]);
  });
});
