// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BACKEND_FRAMEWORKS,
  DEFAULT_BACKEND_FRAMEWORK,
  getBackendFramework,
  listBackendFrameworks,
  resolveBackendFramework,
} from "../../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES } from "../../backend-languages/registry.js";

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

describe("backend framework registry", () => {
  it("keeps Hono the default and registers exactly hono, express, elysia, fastify, nestjs, koa, h3", () => {
    expect(DEFAULT_BACKEND_FRAMEWORK).toBe("hono");
    expect(Object.keys(BACKEND_FRAMEWORKS).sort()).toEqual([
      "elysia",
      "express",
      "fastify",
      "h3",
      "hono",
      "koa",
      "nestjs",
    ]);
  });

  it("normalizes case and rejects unknown ids, including prototype keys", () => {
    expect(getBackendFramework(" Express ").id).toBe("express");
    expect(() => getBackendFramework("sinatra")).toThrow(
      /Supported frameworks: hono, express, elysia, fastify, h3, koa, nestjs/,
    );
    expect(() => getBackendFramework("__proto__")).toThrow(/Unknown backend framework/);
  });

  it("only applies to backends, and not to a language that owns its runtime", () => {
    expect(resolveBackendFramework("backend")).toBeUndefined();
    expect(resolveBackendFramework("frontend", "express")).toBeUndefined();
    expect(resolveBackendFramework("backend", "express")?.id).toBe("express");
    expect(() =>
      resolveBackendFramework("backend", "express", { id: "python", createFiles: () => [] }),
    ).toThrow(/cannot be combined with --language python/);
  });

  it("keeps Express source and dependencies in its provider", () => {
    const provider = getBackendFramework("express");
    const index = provider.createIndex("orders-api");

    expect(provider.dependencies).toHaveProperty("express");
    expect(provider.dependencies).not.toHaveProperty("hono");
    expect(provider.devDependencies).toHaveProperty("@types/express");
    expect(index).toContain("from 'express'");
    expect(index).toContain("app.get('/health'");
    expect(index).toContain("process.env.PORT");
    // Traefik reaches the container over the Docker network, so loopback-only would be unreachable.
    expect(index).toContain("'0.0.0.0'");
    expect(index).not.toContain("hono");
  });

  it("keeps Elysia source and dependencies in its provider", () => {
    const provider = getBackendFramework("elysia");
    const index = provider.createIndex("orders-api");

    expect(provider.dependencies).toHaveProperty("elysia");
    expect(provider.dependencies).not.toHaveProperty("hono");
    expect(provider.dependencies).not.toHaveProperty("express");
    expect(index).toContain("from 'elysia'");
    expect(index).toContain(".get('/health'");
    expect(index).toContain("process.env.PORT");
    expect(index).toContain("hostname: '0.0.0.0'");
    expect(index).not.toContain("hono");
  });

  it("keeps Fastify source and dependencies in its provider", () => {
    const provider = getBackendFramework("fastify");
    const index = provider.createIndex("orders-api");

    expect(provider.dependencies).toHaveProperty("fastify");
    expect(provider.dependencies).not.toHaveProperty("hono");
    expect(provider.dependencies).not.toHaveProperty("express");
    expect(index).toContain("from 'fastify'");
    expect(index).toContain("app.get('/health'");
    expect(index).toContain("process.env.PORT");
    expect(index).toContain("host: '0.0.0.0'");
    expect(index).not.toContain("hono");
  });

  it("keeps NestJS source, dependencies and decorator options in its provider", () => {
    const provider = getBackendFramework("nestjs");
    const index = provider.createIndex("orders-api");

    expect(provider.dependencies).toHaveProperty("@nestjs/core");
    expect(provider.dependencies).toHaveProperty("@nestjs/platform-express");
    expect(provider.dependencies).toHaveProperty("reflect-metadata");
    expect(provider.dependencies).not.toHaveProperty("hono");
    expect(provider.compilerOptions).toEqual({
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    });
    expect(index).toContain("import 'reflect-metadata';");
    expect(index).toContain("@Get('health')");
    expect(index).toContain("process.env.PORT");
    expect(index).toContain("'0.0.0.0'");
    expect(index).not.toContain("hono");
  });

  it("keeps Koa source and dependencies in its provider", () => {
    const provider = getBackendFramework("koa");
    const index = provider.createIndex("orders-api");

    expect(provider.dependencies).toHaveProperty("koa");
    expect(provider.dependencies).not.toHaveProperty("hono");
    expect(provider.devDependencies).toHaveProperty("@types/koa");
    expect(index).toContain("from 'koa'");
    expect(index).toContain("ctx.path === '/health'");
    expect(index).toContain("process.env.PORT");
    expect(index).toContain("'0.0.0.0'");
    expect(index).not.toContain("hono");
  });

  it("keeps h3 source and a pinned 1.x dependency in its provider", () => {
    const provider = getBackendFramework("h3");
    const index = provider.createIndex("orders-api");

    expect(provider.dependencies).toEqual({ h3: "^1.15.0" });
    expect(index).toContain("toNodeListener(app)");
    expect(index).toContain("router.get('/health'");
    expect(index).toContain("process.env.PORT");
    expect(index).toContain("'0.0.0.0'");
    expect(index).not.toContain("hono");
  });

  it("does not add generated-service dependencies to the CLI package", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "cli", "package.json"), "utf-8"));
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(all).not.toContain("express");
    expect(all).not.toContain("@types/express");
    expect(all).not.toContain("elysia");
    expect(all).not.toContain("fastify");
    expect(all).not.toContain("@nestjs/core");
    expect(all).not.toContain("koa");
  });

  it("keeps the service schema open to every registered framework id", () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, "engine", "schemas", "service-schema.json"), "utf-8"),
    );
    expect(schema.properties.framework.enum).toBeUndefined();
    const idPattern = new RegExp(schema.properties.framework.pattern);
    for (const id of Object.keys(BACKEND_FRAMEWORKS)) expect(id).toMatch(idPattern);
  });
});

describe("backend framework inventory", () => {
  it("lists every registered framework with the language it is scaffolded with", () => {
    const list = listBackendFrameworks();

    expect(list.map((entry) => entry.id)).toEqual(Object.keys(BACKEND_FRAMEWORKS));
    for (const entry of list) {
      expect(entry.label).toBe(BACKEND_FRAMEWORKS[entry.id].label);
      // A language that owns its runtime (python, go, rust, node) cannot be combined with a framework.
      expect(entry.languages).toEqual(["bun"]);
      expect(entry.compatible).toBe(true);
      expect(entry.command).toBe(`flisk resource <name> --type backend --framework ${entry.id}`);
    }
  });

  it("marks a framework incompatible with a language that owns its runtime", () => {
    const runtimeOwningLanguages = Object.values(BACKEND_LANGUAGES)
      .filter((language) => language.createFiles)
      .map((language) => language.id);
    expect(runtimeOwningLanguages.sort()).toEqual(["go", "node", "python", "rust"]);

    for (const languageId of runtimeOwningLanguages) {
      for (const entry of listBackendFrameworks(languageId)) {
        expect(entry.languages).not.toContain(languageId);
        expect(entry.compatible).toBe(false);
        // The command creates the resource in the requested language; that language owns its runtime,
        // so no framework applies to it.
        expect(entry.command).toBe(`flisk resource <name> --type backend --language ${languageId}`);
      }
    }
  });

  it("keeps a framework compatible with a language it can be combined with", () => {
    for (const entry of listBackendFrameworks("bun")) {
      expect(entry.languages).toContain("bun");
      expect(entry.compatible).toBe(true);
      // The requested language is named, so a copied row scaffolds the language that was asked about.
      expect(entry.command).toBe(
        `flisk resource <name> --type backend --framework ${entry.id} --language bun`,
      );
    }
  });

  it("rejects an unknown language instead of listing an empty inventory", () => {
    expect(() => listBackendFrameworks("cobol")).toThrow(/Unknown backend language "cobol"/);
  });
});

describe.concurrent("flisk resource --framework on a backend", () => {
  let projectRoot = "";

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-backend-framework-"));
    execFileSync(process.execPath, [cliBin, "project", "--yes"], {
      cwd: projectRoot,
      env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
    });
  }, 15000);

  afterAll(() => {
    if (projectRoot.startsWith(tmpdir())) rmSync(projectRoot, { recursive: true, force: true });
  }, 15000);

  const dir = (name: string) => join(projectRoot, "services", "shop", name);
  const json = (name: string, file: string) =>
    JSON.parse(readFileSync(join(dir(name), file), "utf-8"));

  it("scaffolds Express with its own source and dependencies, on the shared Bun image", async () => {
    const result = await flisk(
      ["resource", "express-api", "--type", "backend", "--framework", "express", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    const root = dir("express-api");
    expect(json("express-api", "service.json")).toMatchObject({
      appType: "backend",
      framework: "express",
    });
    // Express runs on the same Bun image, so the shared Dockerfile and tsconfig are kept.
    expect(existsSync(join(root, "Dockerfile"))).toBe(true);
    expect(existsSync(join(root, "tsconfig.json"))).toBe(true);
    expect(json("express-api", "service.json").language).toBeUndefined();

    const pkg = json("express-api", "package.json");
    expect(pkg.dependencies).toHaveProperty("express");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    expect(pkg.devDependencies).toHaveProperty("@types/express");

    const index = readFileSync(join(root, "src", "index.ts"), "utf-8");
    expect(index).toContain("from 'express'");
    expect(index).not.toContain("Hono");
  }, 15000);

  it("scaffolds Elysia on the shared Bun image with its own source and dependencies", async () => {
    const result = await flisk(
      ["resource", "elysia-api", "--type", "backend", "--framework", "elysia", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    expect(json("elysia-api", "service.json")).toMatchObject({
      appType: "backend",
      framework: "elysia",
    });
    expect(existsSync(join(dir("elysia-api"), "Dockerfile"))).toBe(true);
    const pkg = json("elysia-api", "package.json");
    expect(pkg.dependencies).toHaveProperty("elysia");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    expect(readFileSync(join(dir("elysia-api"), "src", "index.ts"), "utf-8")).toContain(
      "from 'elysia'",
    );
  }, 15000);

  it("scaffolds Fastify on the shared Bun image with its own source and dependencies", async () => {
    const result = await flisk(
      ["resource", "fastify-api", "--type", "backend", "--framework", "fastify", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    expect(json("fastify-api", "service.json")).toMatchObject({
      appType: "backend",
      framework: "fastify",
    });
    expect(existsSync(join(dir("fastify-api"), "Dockerfile"))).toBe(true);
    const pkg = json("fastify-api", "package.json");
    expect(pkg.dependencies).toHaveProperty("fastify");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    expect(readFileSync(join(dir("fastify-api"), "src", "index.ts"), "utf-8")).toContain(
      "from 'fastify'",
    );
  }, 15000);

  it("scaffolds NestJS with decorator options in its tsconfig, on the shared Bun image", async () => {
    const result = await flisk(
      ["resource", "nest-api", "--type", "backend", "--framework", "nestjs", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    expect(json("nest-api", "service.json")).toMatchObject({
      appType: "backend",
      framework: "nestjs",
    });
    expect(existsSync(join(dir("nest-api"), "Dockerfile"))).toBe(true);
    const pkg = json("nest-api", "package.json");
    expect(pkg.dependencies).toHaveProperty("@nestjs/core");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    const tsconfig = json("nest-api", "tsconfig.json");
    expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
    expect(tsconfig.compilerOptions.emitDecoratorMetadata).toBe(true);
  }, 15000);

  it("scaffolds Koa on the shared Bun image with its own source and dependencies", async () => {
    const result = await flisk(
      ["resource", "koa-api", "--type", "backend", "--framework", "koa", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    expect(json("koa-api", "service.json")).toMatchObject({ appType: "backend", framework: "koa" });
    expect(existsSync(join(dir("koa-api"), "Dockerfile"))).toBe(true);
    const pkg = json("koa-api", "package.json");
    expect(pkg.dependencies).toHaveProperty("koa");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    expect(pkg.devDependencies).toHaveProperty("@types/koa");
    expect(readFileSync(join(dir("koa-api"), "src", "index.ts"), "utf-8")).toContain("from 'koa'");
  }, 15000);

  it("scaffolds h3 on the shared Bun image with its own source and dependency", async () => {
    const result = await flisk(
      ["resource", "h3-api", "--type", "backend", "--framework", "h3", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    expect(json("h3-api", "service.json")).toMatchObject({ appType: "backend", framework: "h3" });
    expect(existsSync(join(dir("h3-api"), "Dockerfile"))).toBe(true);
    const pkg = json("h3-api", "package.json");
    expect(pkg.dependencies).toHaveProperty("h3");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    expect(readFileSync(join(dir("h3-api"), "src", "index.ts"), "utf-8")).toContain("from 'h3'");
  }, 30000);

  it("persists an explicit hono selection and keeps the Hono source", async () => {
    const result = await flisk(
      ["resource", "hono-api", "--type", "backend", "--framework", "hono", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(json("hono-api", "service.json").framework).toBe("hono");
    expect(json("hono-api", "package.json").dependencies).toHaveProperty("hono");
    expect(readFileSync(join(dir("hono-api"), "src", "index.ts"), "utf-8")).toContain("new Hono()");
  }, 15000);

  it("leaves a backend without --framework on Hono with no framework field", async () => {
    const result = await flisk(
      ["resource", "plain-api", "--type", "backend", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status).toBe(0);
    expect(json("plain-api", "service.json")).not.toHaveProperty("framework");
    // Hono keeps the shared tsconfig without NestJS's decorator flags.
    expect(
      json("plain-api", "tsconfig.json").compilerOptions.experimentalDecorators,
    ).toBeUndefined();
    expect(json("plain-api", "package.json").dependencies).toHaveProperty("hono");
  }, 15000);

  it("rejects an unknown framework, Python, and other resource types before writing", async () => {
    const unknown = await flisk(
      ["resource", "bad-api", "--type", "backend", "--framework", "sinatra", "--stack", "shop"],
      projectRoot,
    );
    expect(unknown.status).not.toBe(0);
    expect(`${unknown.stdout}${unknown.stderr}`).toMatch(/Unknown backend framework "sinatra"/);
    expect(existsSync(dir("bad-api"))).toBe(false);

    const python = await flisk(
      [
        "resource",
        "py-express",
        "--type",
        "backend",
        "--language",
        "python",
        "--framework",
        "express",
        "--stack",
        "shop",
      ],
      projectRoot,
    );
    expect(python.status).not.toBe(0);
    expect(`${python.stdout}${python.stderr}`).toMatch(/cannot be combined with --language python/);
    expect(existsSync(dir("py-express"))).toBe(false);

    const worker = await flisk(
      ["resource", "job", "--type", "worker", "--framework", "express", "--stack", "shop"],
      projectRoot,
    );
    expect(worker.status).not.toBe(0);
    expect(`${worker.stdout}${worker.stderr}`).toMatch(/only be used with --type frontend or/);
    expect(existsSync(dir("job"))).toBe(false);
  }, 15000);
});
