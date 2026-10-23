// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getNestIndexTemplate, nestBackendProvider } from "./nestjs.js";

describe("nestBackendProvider", () => {
  it("describes the Bun + NestJS backend provider with required decorator options", () => {
    expect(nestBackendProvider.id).toBe("nestjs");
    expect(nestBackendProvider.label).toBe("Bun + NestJS");
    expect(nestBackendProvider.dependencies).toEqual({
      "@nestjs/common": "^11.0.0",
      "@nestjs/core": "^11.0.0",
      "@nestjs/platform-express": "^11.0.0",
      "reflect-metadata": "^0.2.2",
      rxjs: "^7.8.1",
    });
    expect(nestBackendProvider.devDependencies).toEqual({});
    expect(nestBackendProvider.compilerOptions).toEqual({
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    });
    expect(nestBackendProvider.createIndex).toBe(getNestIndexTemplate);
  });
});

describe("getNestIndexTemplate", () => {
  const serviceName = "payment-svc";
  const template = getNestIndexTemplate(serviceName);

  it("imports reflect-metadata and NestJS decorators", () => {
    expect(template).toContain("import 'reflect-metadata';");
    expect(template).toContain("import { Controller, Get, Module } from '@nestjs/common';");
    expect(template).toContain("import { NestFactory } from '@nestjs/core';");
  });

  it("declares Controller with health check endpoints and root metadata", () => {
    expect(template).toContain("@Controller()");
    expect(template).toContain("class AppController {");
    expect(template).toContain("@Get('health')");
    expect(template).toContain("return { status: 'ok', service: 'payment-svc' };");
    expect(template).toContain("@Get('health/live')");
    expect(template).toContain("return { status: 'alive', timestamp: Date.now() };");
    expect(template).toContain("@Get()");
    expect(template).toContain(
      "return { service: 'payment-svc', version: '1.0.0', endpoints: ['/health', '/health/live'] };",
    );
  });

  it("configures AppModule and bootstraps NestFactory", () => {
    expect(template).toContain("@Module({ controllers: [AppController] })");
    expect(template).toContain("class AppModule {}");
    expect(template).toContain(
      "const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });",
    );
  });

  it("binds to port and 0.0.0.0", () => {
    expect(template).toContain("const port = Number(process.env.PORT || 3000);");
    expect(template).toContain("await app.listen(port, '0.0.0.0');");
    expect(template).toContain(
      "console.log('\\n🚀 payment-svc running on http://localhost:' + port);",
    );
    expect(template).toContain(
      "console.log('📊 Health check: http://localhost:' + port + '/health\\n');",
    );
  });
});
