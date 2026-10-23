// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getKoaIndexTemplate, koaBackendProvider } from "./koa.js";

describe("koaBackendProvider", () => {
  it("describes the Bun + Koa backend provider", () => {
    expect(koaBackendProvider.id).toBe("koa");
    expect(koaBackendProvider.label).toBe("Bun + Koa");
    expect(koaBackendProvider.dependencies).toEqual({ koa: "^3.0.0" });
    expect(koaBackendProvider.devDependencies).toEqual({ "@types/koa": "^3.0.0" });
    expect(koaBackendProvider.createIndex).toBe(getKoaIndexTemplate);
  });
});

describe("getKoaIndexTemplate", () => {
  const serviceName = "auth-service";
  const template = getKoaIndexTemplate(serviceName);

  it("imports Koa without requiring external router dependencies", () => {
    expect(template).toContain("import Koa from 'koa';");
    expect(template).toContain("const app = new Koa();");
  });

  it("handles health check and root routes in middleware", () => {
    expect(template).toContain("if (ctx.path === '/health') {");
    expect(template).toContain("ctx.body = { status: 'ok', service: 'auth-service' };");
    expect(template).toContain("if (ctx.path === '/health/live') {");
    expect(template).toContain("ctx.body = { status: 'alive', timestamp: Date.now() };");
    expect(template).toContain("if (ctx.path === '/') {");
    expect(template).toContain("service: 'auth-service'");
    expect(template).toContain("version: '1.0.0'");
    expect(template).toContain("endpoints: ['/health', '/health/live']");
  });

  it("returns 404 for unknown endpoints", () => {
    expect(template).toContain("ctx.status = 404;");
    expect(template).toContain("ctx.body = { error: 'not_found' };");
  });

  it("binds to port and 0.0.0.0", () => {
    expect(template).toContain("const port = Number(process.env.PORT || 3000);");
    expect(template).toContain("app.listen(port, '0.0.0.0', () => {");
    expect(template).toContain(
      "console.log('\\n🚀 auth-service running on http://localhost:' + port);",
    );
    expect(template).toContain(
      "console.log('📊 Health check: http://localhost:' + port + '/health\\n');",
    );
  });
});
