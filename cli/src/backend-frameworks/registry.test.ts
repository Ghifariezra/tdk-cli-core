// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { resolveAgentRuntime } from "../agent-runtimes/registry.js";
import { getBackendIndexTemplate } from "../backend-languages/bun.js";
import { TdkError } from "../utils/errors.js";
import { elysiaBackendProvider } from "./elysia.js";
import { expressBackendProvider } from "./express.js";
import { fastifyBackendProvider } from "./fastify.js";
import { h3BackendProvider } from "./h3.js";
import { koaBackendProvider } from "./koa.js";
import { mcpBackendProvider } from "./mcp.js";
import { nestBackendProvider } from "./nestjs.js";
import {
  BACKEND_FRAMEWORKS,
  DEFAULT_BACKEND_FRAMEWORK,
  getBackendFramework,
  honoBackendProvider,
  listBackendFrameworks,
  resolveBackendFramework,
} from "./registry.js";

describe("backend framework registry constants", () => {
  it("defines hono as the default backend framework", () => {
    expect(DEFAULT_BACKEND_FRAMEWORK).toBe("hono");
  });

  it("describes the default Bun + Hono backend provider", () => {
    expect(honoBackendProvider.id).toBe("hono");
    expect(honoBackendProvider.label).toBe("Bun + Hono");
    expect(honoBackendProvider.dependencies).toEqual({ hono: "^4.0.0" });
    expect(honoBackendProvider.devDependencies).toEqual({});
    expect(honoBackendProvider.createIndex).toBe(getBackendIndexTemplate);
  });

  it("registers all supported backend framework providers", () => {
    expect(BACKEND_FRAMEWORKS).toEqual({
      hono: honoBackendProvider,
      express: expressBackendProvider,
      elysia: elysiaBackendProvider,
      fastify: fastifyBackendProvider,
      h3: h3BackendProvider,
      koa: koaBackendProvider,
      nestjs: nestBackendProvider,
    });
  });
});

describe("getBackendFramework", () => {
  it("defaults to hono when frameworkId is undefined", () => {
    expect(getBackendFramework()).toBe(honoBackendProvider);
  });

  it("resolves each registered framework by id", () => {
    expect(getBackendFramework("hono")).toBe(honoBackendProvider);
    expect(getBackendFramework("express")).toBe(expressBackendProvider);
    expect(getBackendFramework("elysia")).toBe(elysiaBackendProvider);
    expect(getBackendFramework("fastify")).toBe(fastifyBackendProvider);
    expect(getBackendFramework("h3")).toBe(h3BackendProvider);
    expect(getBackendFramework("koa")).toBe(koaBackendProvider);
    expect(getBackendFramework("nestjs")).toBe(nestBackendProvider);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(getBackendFramework("  Express  ")).toBe(expressBackendProvider);
    expect(getBackendFramework("NESTJS")).toBe(nestBackendProvider);
    expect(getBackendFramework(" ELYSIA ")).toBe(elysiaBackendProvider);
  });

  it("rejects unknown frameworks with helpful suggestions", () => {
    let error: unknown;
    try {
      getBackendFramework("django");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TdkError);
    const tdkError = error as TdkError;
    expect(tdkError.message).toBe(
      'Unknown backend framework "django". Supported frameworks: hono, express, elysia, fastify, h3, koa, nestjs.',
    );
    expect(tdkError.suggestions).toEqual([
      "Use one of: hono, express, elysia, fastify, h3, koa, nestjs",
      "Omit --framework to use hono",
    ]);
  });
});

describe("listBackendFrameworks", () => {
  it("lists all registered frameworks with bun compatibility by default", () => {
    const list = listBackendFrameworks();
    expect(list).toHaveLength(7);

    for (const entry of list) {
      expect(entry.languages).toContain("bun");
      expect(entry.compatible).toBe(true);
      expect(entry.command).toBe(`flisk resource <name> --type backend --framework ${entry.id}`);
    }
  });

  it("marks frameworks as incompatible when queried against a runtime-owning language like python", () => {
    const list = listBackendFrameworks("python");
    expect(list).toHaveLength(7);

    for (const entry of list) {
      expect(entry.compatible).toBe(false);
      expect(entry.command).toBe("flisk resource <name> --type backend --language python");
    }
  });

  it("includes language flag in command when explicit bun language is specified", () => {
    const list = listBackendFrameworks("bun");
    expect(list).toHaveLength(7);

    for (const entry of list) {
      expect(entry.compatible).toBe(true);
      expect(entry.command).toBe(
        `flisk resource <name> --type backend --framework ${entry.id} --language bun`,
      );
    }
  });
});

describe("resolveBackendFramework", () => {
  describe("resourceType === 'mcp'", () => {
    it("returns mcpBackendProvider when valid", () => {
      const provider = resolveBackendFramework("mcp");
      expect(provider).toBe(mcpBackendProvider);
    });

    it("rejects --framework when combined with mcp", () => {
      expect(() => resolveBackendFramework("mcp", "express")).toThrow(
        "--framework cannot be combined with --type mcp.",
      );
    });

    it("rejects custom language with createFiles when combined with mcp", () => {
      expect(() =>
        resolveBackendFramework("mcp", undefined, { id: "python", createFiles: () => {} }),
      ).toThrow("--language python cannot be combined with --type mcp.");
    });
  });

  describe("resourceType === 'agent'", () => {
    it("returns agent runtime when framework is omitted", () => {
      expect(resolveBackendFramework("agent")).toEqual(resolveAgentRuntime());
    });

    it("accepts framework === 'custom' for agent", () => {
      expect(resolveBackendFramework("agent", "custom")).toEqual(resolveAgentRuntime());
    });

    it("rejects non-custom framework when combined with agent", () => {
      expect(() => resolveBackendFramework("agent", "express")).toThrow(
        "--framework cannot be combined with --type agent.",
      );
    });

    it("rejects custom language with createFiles when combined with agent", () => {
      expect(() =>
        resolveBackendFramework("agent", undefined, { id: "go", createFiles: () => {} }),
      ).toThrow("--language go cannot be combined with --type agent.");
    });
  });

  describe("other resource types", () => {
    it("returns undefined for non-backend resource types even if framework is specified", () => {
      expect(resolveBackendFramework("frontend", "express")).toBeUndefined();
      expect(resolveBackendFramework("database", "fastify")).toBeUndefined();
    });

    it("returns undefined for backend when frameworkId is omitted", () => {
      expect(resolveBackendFramework("backend")).toBeUndefined();
      expect(resolveBackendFramework("backend", undefined)).toBeUndefined();
    });
  });

  describe("resourceType === 'backend' with frameworkId", () => {
    it("resolves the specified framework when language does not own runtime", () => {
      expect(resolveBackendFramework("backend", "express")).toBe(expressBackendProvider);
      expect(resolveBackendFramework("backend", "fastify", { id: "bun" })).toBe(
        fastifyBackendProvider,
      );
    });

    it("rejects combination with a language that owns its runtime", () => {
      let error: unknown;
      try {
        resolveBackendFramework("backend", "elysia", { id: "rust", createFiles: () => {} });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(TdkError);
      const tdkError = error as TdkError;
      expect(tdkError.message).toBe("--framework cannot be combined with --language rust.");
      expect(tdkError.suggestions).toEqual([
        "The rust provider owns its runtime and framework",
        "Drop --framework, or use --language bun",
      ]);
    });

    it("throws when unknown framework is specified", () => {
      expect(() => resolveBackendFramework("backend", "sinatra")).toThrow(
        'Unknown backend framework "sinatra".',
      );
    });
  });
});
