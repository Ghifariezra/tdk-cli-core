// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { elysiaBackendProvider, getElysiaIndexTemplate } from "./elysia.js";

describe("elysiaBackendProvider", () => {
  it("describes the Bun + Elysia backend provider", () => {
    expect(elysiaBackendProvider.id).toBe("elysia");
    expect(elysiaBackendProvider.label).toBe("Bun + Elysia");
    expect(elysiaBackendProvider.dependencies).toEqual({ elysia: "^1.3.0" });
    expect(elysiaBackendProvider.devDependencies).toEqual({});
    expect(elysiaBackendProvider.createIndex).toBe(getElysiaIndexTemplate);
  });
});

describe("getElysiaIndexTemplate", () => {
  const serviceName = "user-service";
  const template = getElysiaIndexTemplate(serviceName);

  it("imports Elysia framework", () => {
    expect(template).toContain("import { Elysia } from 'elysia';");
  });

  it("reads port from environment variable with fallback to 3000", () => {
    expect(template).toContain("const port = Number(process.env.PORT || 3000);");
  });

  it("registers required health check endpoints with the service name", () => {
    expect(template).toContain(
      ".get('/health', () => ({ status: 'ok', service: 'user-service' }))",
    );
    expect(template).toContain(
      ".get('/health/live', () => ({ status: 'alive', timestamp: Date.now() }))",
    );
    expect(template).toContain(".get('/health/ready', ({ set }) => {");
    expect(template).toContain("set.status = allReady ? 200 : 503;");
  });

  it("serves the root service discovery metadata endpoint", () => {
    expect(template).toContain(".get('/', () => ({");
    expect(template).toContain("service: 'user-service'");
    expect(template).toContain("version: '1.0.0'");
    expect(template).toContain("endpoints: ['/health', '/health/live', '/health/ready']");
  });

  it("listens on all network interfaces (0.0.0.0) for container networking", () => {
    expect(template).toContain(".listen({ port, hostname: '0.0.0.0' });");
  });

  it("logs startup confirmation and health check URLs", () => {
    expect(template).toContain(
      "console.log('\\n🚀 user-service running on http://localhost:' + app.server?.port);",
    );
    expect(template).toContain(
      "console.log('📊 Health check: http://localhost:' + app.server?.port + '/health\\n');",
    );
  });
});
