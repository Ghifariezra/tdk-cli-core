// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { fastifyBackendProvider, getFastifyIndexTemplate } from "./fastify.js";

describe("fastifyBackendProvider", () => {
  it("describes the Bun + Fastify backend provider", () => {
    expect(fastifyBackendProvider.id).toBe("fastify");
    expect(fastifyBackendProvider.label).toBe("Bun + Fastify");
    expect(fastifyBackendProvider.dependencies).toEqual({ fastify: "^5.0.0" });
    expect(fastifyBackendProvider.devDependencies).toEqual({});
    expect(fastifyBackendProvider.createIndex).toBe(getFastifyIndexTemplate);
  });
});

describe("getFastifyIndexTemplate", () => {
  const serviceName = "inventory-service";
  const template = getFastifyIndexTemplate(serviceName);

  it("imports Fastify", () => {
    expect(template).toContain("import Fastify from 'fastify';");
    expect(template).toContain("const app = Fastify();");
  });

  it("registers required health check endpoints", () => {
    expect(template).toContain(
      "app.get('/health', async () => ({ status: 'ok', service: 'inventory-service' }));",
    );
    expect(template).toContain(
      "app.get('/health/live', async () => ({ status: 'alive', timestamp: Date.now() }));",
    );
    expect(template).toContain("app.get('/health/ready', async (_request, reply) => {");
    expect(template).toContain(
      "return reply.code(allReady ? 200 : 503).send({ status, dependencies });",
    );
  });

  it("serves service metadata at root", () => {
    expect(template).toContain("app.get('/', async () => ({");
    expect(template).toContain("service: 'inventory-service'");
    expect(template).toContain("version: '1.0.0'");
    expect(template).toContain("endpoints: ['/health', '/health/live', '/health/ready']");
  });

  it("binds to host 0.0.0.0 and port from environment", () => {
    expect(template).toContain("const port = Number(process.env.PORT || 3000);");
    expect(template).toContain("await app.listen({ port, host: '0.0.0.0' });");
  });

  it("logs startup confirmation and health check URL", () => {
    expect(template).toContain(
      "console.log('\\n🚀 inventory-service running on http://localhost:' + port);",
    );
    expect(template).toContain(
      "console.log('📊 Health check: http://localhost:' + port + '/health\\n');",
    );
  });
});
