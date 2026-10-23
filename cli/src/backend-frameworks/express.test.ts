// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { expressBackendProvider, getExpressIndexTemplate } from "./express.js";

describe("expressBackendProvider", () => {
  it("describes the Bun + Express backend provider", () => {
    expect(expressBackendProvider.id).toBe("express");
    expect(expressBackendProvider.label).toBe("Bun + Express");
    expect(expressBackendProvider.dependencies).toEqual({ express: "^5.1.0" });
    expect(expressBackendProvider.devDependencies).toEqual({ "@types/express": "^5.0.0" });
    expect(expressBackendProvider.createIndex).toBe(getExpressIndexTemplate);
  });
});

describe("getExpressIndexTemplate", () => {
  const serviceName = "billing-api";
  const template = getExpressIndexTemplate(serviceName);

  it("imports Express", () => {
    expect(template).toContain("import express from 'express';");
    expect(template).toContain("const app = express();");
  });

  it("registers required health check endpoints", () => {
    expect(template).toContain("app.get('/health', (_req, res) => {");
    expect(template).toContain("res.json({ status: 'ok', service: 'billing-api' });");
    expect(template).toContain("app.get('/health/live', (_req, res) => {");
    expect(template).toContain("res.json({ status: 'alive', timestamp: Date.now() });");
    expect(template).toContain("app.get('/health/ready', async (_req, res) => {");
    expect(template).toContain("res.status(allReady ? 200 : 503).json({ status, dependencies });");
  });

  it("serves service metadata at the root endpoint", () => {
    expect(template).toContain("app.get('/', (_req, res) => {");
    expect(template).toContain("service: 'billing-api'");
    expect(template).toContain("version: '1.0.0'");
    expect(template).toContain("endpoints: ['/health', '/health/live', '/health/ready']");
  });

  it("reads port from process.env.PORT with fallback to 3000", () => {
    expect(template).toContain("const port = Number(process.env.PORT || 3000);");
  });

  it("binds to 0.0.0.0 for container networking", () => {
    expect(template).toContain("app.listen(port, '0.0.0.0', () => {");
    expect(template).toContain(
      "console.log('\\n🚀 billing-api running on http://localhost:' + port);",
    );
    expect(template).toContain(
      "console.log('📊 Health check: http://localhost:' + port + '/health\\n');",
    );
  });
});
