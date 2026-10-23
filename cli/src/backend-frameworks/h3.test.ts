// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getH3IndexTemplate, h3BackendProvider } from "./h3.js";

describe("h3BackendProvider", () => {
  it("describes the Bun + h3 backend provider", () => {
    expect(h3BackendProvider.id).toBe("h3");
    expect(h3BackendProvider.label).toBe("Bun + h3");
    expect(h3BackendProvider.dependencies).toEqual({ h3: "^1.15.0" });
    expect(h3BackendProvider.devDependencies).toEqual({});
    expect(h3BackendProvider.createIndex).toBe(getH3IndexTemplate);
  });
});

describe("getH3IndexTemplate", () => {
  const serviceName = "gateway-app";
  const template = getH3IndexTemplate(serviceName);

  it("imports node:http and h3 core utilities", () => {
    expect(template).toContain("import { createServer } from 'node:http';");
    expect(template).toContain(
      "import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3';",
    );
  });

  it("registers required health check endpoints", () => {
    expect(template).toContain(
      "router.get('/health', defineEventHandler(() => ({ status: 'ok', service: 'gateway-app' })));",
    );
    expect(template).toContain(
      "router.get('/health/live', defineEventHandler(() => ({ status: 'alive', timestamp: Date.now() })));",
    );
  });

  it("serves service metadata at root endpoint", () => {
    expect(template).toContain("router.get('/', defineEventHandler(() => ({");
    expect(template).toContain("service: 'gateway-app'");
    expect(template).toContain("version: '1.0.0'");
    expect(template).toContain("endpoints: ['/health', '/health/live']");
  });

  it("binds HTTP server to port and 0.0.0.0 using node:http", () => {
    expect(template).toContain("const port = Number(process.env.PORT || 3000);");
    expect(template).toContain("createServer(toNodeListener(app)).listen(port, '0.0.0.0', () => {");
    expect(template).toContain(
      "console.log('\\n🚀 gateway-app running on http://localhost:' + port);",
    );
    expect(template).toContain(
      "console.log('📊 Health check: http://localhost:' + port + '/health\\n');",
    );
  });
});
