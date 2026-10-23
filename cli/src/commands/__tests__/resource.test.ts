// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_TEMPLATE,
  createByoServiceJson,
  createPackageJson,
  createResourceTsconfig,
  createServiceJson,
  DRIZZLE_CONFIG_TEMPLATE,
  DRIZZLE_DB_TEMPLATE,
  DRIZZLE_SCHEMA_TEMPLATE,
  getBackendIndexTemplate,
  getDockerfileTemplate,
  getDrizzleBackendIndexTemplate,
  getWorkerIndexTemplate,
  PRISMA_CONFIG_TEMPLATE,
  PRISMA_SCHEMA_TEMPLATE,
  parseExistingServiceJson,
  parseResourceType,
  TSCONFIG_TEMPLATE,
  TYPE_SPECIFIC,
} from "../../commands/resource.js";
import {
  FRONTEND_FRAMEWORKS,
  getFrontendFramework,
  resolveFrontendFramework,
} from "../../frontend-frameworks/registry.js";
import { CREATABLE_RESOURCE_TYPES, isCreatableResourceType } from "../../types/index.js";
import { TdkError } from "../../utils/errors.js";
import { discoverResourcesFromRoot } from "../../utils/services.js";
import { KEBAB_CASE_REGEX } from "../../utils/validation.js";

describe("resource command", () => {
  describe("resource name validation", () => {
    it("should accept valid kebab-case names using KEBAB_CASE_REGEX", () => {
      const validNames = ["my-service", "service123", "api-gateway", "a", "test-123-abc"];

      for (const name of validNames) {
        expect(KEBAB_CASE_REGEX.test(name)).toBe(true);
      }
    });

    it("should reject invalid names using KEBAB_CASE_REGEX", () => {
      const invalidNames = [
        "MyService", // camelCase
        "my_service", // underscore
        "my service", // space
        "service.name", // dot
        "Service-Name", // uppercase
        "", // empty
      ];

      for (const name of invalidNames) {
        expect(KEBAB_CASE_REGEX.test(name)).toBe(false);
      }
    });
  });

  describe("service.json template", () => {
    it("should create valid backend service.json using createServiceJson", () => {
      const name = "test-backend";
      const type = "backend";
      const stack = "main";
      const port = 3001;

      const serviceJson = createServiceJson(name, type, stack, port);

      expect(serviceJson).toHaveProperty("name", name);
      expect(serviceJson).toHaveProperty("type", type);
      expect(serviceJson).toHaveProperty("port", port);
      expect(serviceJson).toHaveProperty("stack", stack);
      expect(serviceJson).toHaveProperty("healthCheckPath", "/health");
      expect(serviceJson).not.toHaveProperty("framework");
      expect(serviceJson).toHaveProperty("dependsOn");
      expect(serviceJson).toHaveProperty("build");
      expect(serviceJson).toHaveProperty("dev");
      expect(serviceJson.$schema).toBe("https://flisk.sh/schema.service.json");
    });

    it("adds the Prisma feature to the service manifest when requested", () => {
      const serviceJson = createServiceJson("orders-api", "backend", "main", 3001, ["prisma"]);
      expect(serviceJson.featuresEnabled).toContain("prisma");
      expect(serviceJson.dependsOn).toEqual([]);
    });

    it("adds the Drizzle feature to the service manifest when requested", () => {
      const serviceJson = createServiceJson("orders-api", "backend", "main", 3001, ["drizzle"]);
      expect(serviceJson.featuresEnabled).toContain("drizzle");
      expect(serviceJson.featuresEnabled).not.toContain("prisma");
    });

    it("should create valid frontend service.json using createServiceJson", () => {
      const name = "test-frontend";
      const type = "frontend";
      const stack = "main";
      const port = 3002;

      const serviceJson = createServiceJson(name, type, stack, port);

      expect(serviceJson).toHaveProperty("name", name);
      expect(serviceJson).toHaveProperty("type", type);
      expect(serviceJson).toHaveProperty("port", port);
      expect(serviceJson.dev.watch).toContain("public/**/*");
      expect(serviceJson).toHaveProperty("framework", "react");

      const explicitlySelected = createServiceJson(name, type, stack, port, [], "react");
      expect(explicitlySelected).toHaveProperty("framework", "react");
    });

    it("should create valid worker service.json using createServiceJson", () => {
      const name = "test-worker";
      const type = "worker";
      const stack = "main";
      const port = 0;

      const serviceJson = createServiceJson(name, type, stack, port);

      expect(serviceJson).toHaveProperty("name", name);
      expect(serviceJson).toHaveProperty("type", type);
      expect(serviceJson.port).toBe(0); // Workers may not need ports
      expect(serviceJson.dev.command).toBe("bun run worker");
    });

    it("creates agent service.json with durability and custom runtime", () => {
      const serviceJson = createServiceJson(
        "research-agent",
        "agent",
        "ai",
        4200,
        [],
        undefined,
        undefined,
        { runtime: "custom", durability: "postgres" },
      );
      expect(serviceJson.appName).toBe("research-agent");
      expect(serviceJson.appType).toBe("agent");
      expect(serviceJson.agent).toEqual({ runtime: "custom", durability: "postgres" });
      expect(serviceJson.healthCheckPath).toBe("/health");
      expect(serviceJson.port).toBe(4200);
    });

    it("creates mcp service.json without backend framework pollution", () => {
      const serviceJson = createServiceJson("tools-server", "mcp", "ai", 4300);
      expect(serviceJson.appName).toBe("tools-server");
      expect(serviceJson.appType).toBe("mcp");
      expect(serviceJson).not.toHaveProperty("framework");
      expect(serviceJson.healthCheckPath).toBe("/health");
    });

    it("omits Prisma feature when non-Bun backend language is selected", () => {
      const serviceJson = createServiceJson(
        "py-api",
        "backend",
        "main",
        4100,
        [],
        undefined,
        "python",
      );
      expect(serviceJson.language).toBe("python");
      expect(serviceJson.featuresEnabled).not.toContain("prisma");
    });

    it("should have correct TYPE_SPECIFIC extensions for each resource type", () => {
      expect(TYPE_SPECIFIC.backend).toHaveProperty("healthCheckPath", "/health");
      expect(TYPE_SPECIFIC.frontend.dev?.watch).toContain("public/**/*");
      expect(TYPE_SPECIFIC.worker.dev?.command).toBe("bun run worker");
    });

    it("should have correct BASE_TEMPLATE structure", () => {
      expect(BASE_TEMPLATE).toHaveProperty("port", 0);
      expect(BASE_TEMPLATE).toHaveProperty("dependsOn");
      expect(BASE_TEMPLATE).toHaveProperty("build");
      expect(BASE_TEMPLATE).toHaveProperty("dev");
      expect(BASE_TEMPLATE.build).toHaveProperty("dockerfile", "Dockerfile");
    });
  });

  describe("createByoServiceJson", () => {
    it("creates standard BYO service manifest with Dockerfile and default settings", () => {
      const manifest = createByoServiceJson("cache-service", "infra", 4500, {
        healthCheckPath: "/health",
        dockerfile: "Dockerfile.custom",
      });
      expect(manifest.appName).toBe("cache-service");
      expect(manifest.appType).toBe("bring-your-own");
      expect(manifest.stack).toBe("infra");
      expect(manifest.port).toBe(4500);
      expect(manifest.healthCheckPath).toBe("/health");
      expect((manifest as Record<string, unknown>).dockerfile).toBe("Dockerfile.custom");
      expect(manifest).not.toHaveProperty("image");
      expect(manifest).not.toHaveProperty("exposeViaProxy");
      expect(manifest).not.toHaveProperty("restart");
      expect(manifest.$schema).toMatch(/schema\.service\.json$/);
    });

    it("creates BYO service manifest with image instead of dockerfile", () => {
      const manifest = createByoServiceJson("redis-db", "data", 4501, {
        healthCheckPath: "/ready",
        dockerfile: "",
        image: "redis:7-alpine",
      });
      expect(manifest.appName).toBe("redis-db");
      expect((manifest as Record<string, unknown>).image).toBe("redis:7-alpine");
      expect(manifest).not.toHaveProperty("dockerfile");
      expect(manifest.healthCheckPath).toBe("/ready");
    });

    it("creates BYO service manifest with exposeViaProxy false and custom restart policy", () => {
      const manifest = createByoServiceJson("nats-mq", "infra", 4502, {
        healthCheckPath: "/healthz",
        dockerfile: "Dockerfile",
        exposeViaProxy: false,
        restart: "always",
      });
      expect(manifest.exposeViaProxy).toBe(false);
      expect(manifest.restart).toBe("always");
    });
  });

  describe("package.json template", () => {
    it("pins Prisma 7 packages when Prisma is enabled", () => {
      const service = createPackageJson("orders-api", "backend", undefined, true);
      expect(service.dependencies).toMatchObject({
        prisma: "^7.5.0",
        "@prisma/client": "^7.5.0",
        "@prisma/adapter-pg": "^7.5.0",
        pg: "^8.13.0",
      });
      expect(service.scripts.start).toBe("bun run dist/index.js");
    });

    it("uses the Prisma 7 client generator and generated config shape", () => {
      expect(PRISMA_SCHEMA_TEMPLATE).toContain('provider = "prisma-client"');
      expect(PRISMA_SCHEMA_TEMPLATE).toContain('output   = "../generated/prisma"');
      expect(PRISMA_SCHEMA_TEMPLATE).not.toContain("url");
      expect(PRISMA_CONFIG_TEMPLATE).toContain("process.env.DATABASE_URL");
    });
    it("should create backend package.json with Hono using createPackageJson", () => {
      const name = "test-backend";
      const type = "backend";

      const packageJson = createPackageJson(name, type);

      expect(packageJson.name).toBe(`@project/${name}`);
      expect(packageJson).toHaveProperty("dependencies");
      expect(packageJson.dependencies).toHaveProperty("hono");
      expect(packageJson.dependencies).not.toHaveProperty("vite");
      expect(packageJson.scripts.dev).toBe("bun run --watch src/index.ts");
    });

    it("guards the frontend dev/build scripts with a clear message when the generated Vite config is missing", () => {
      const scripts = createPackageJson("test-frontend", "frontend").scripts as Record<
        string,
        string
      >;
      expect(scripts.prebuild).toContain("vite.config.build.autogenerated.ts");
      expect(scripts.predev).toContain("vite.config.frontend.autogenerated.ts");
      // Backends and workers have no generated Vite config, so no guard.
      expect(createPackageJson("api", "backend").scripts).not.toHaveProperty("prebuild");

      const hasBun = spawnSync("bun", ["--version"], { encoding: "utf-8" }).status === 0;
      if (!hasBun) return;

      const dir = mkdtempSync(join(tmpdir(), "tdk-frontend-guard-"));
      try {
        let stderr = "";
        try {
          execSync(scripts.prebuild as string, { cwd: dir, stdio: "pipe" });
          throw new Error("prebuild should have failed");
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? error);
        }
        expect(stderr).toContain("flisk up");
        expect(stderr).toContain(".autogenerated/vite.config.build.autogenerated.ts");

        mkdirSync(join(dir, ".autogenerated"));
        writeFileSync(join(dir, ".autogenerated/vite.config.build.autogenerated.ts"), "");
        execSync(scripts.prebuild as string, { cwd: dir, stdio: "pipe" });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("should create frontend package.json with Vite using createPackageJson", () => {
      const name = "test-frontend";
      const type = "frontend";

      const packageJson = createPackageJson(name, type);

      expect(packageJson.name).toBe(`@project/${name}`);
      expect(packageJson.dependencies).not.toHaveProperty("hono");
      expect(packageJson.devDependencies).toHaveProperty("vite");
      expect(packageJson.devDependencies).toHaveProperty("@vitejs/plugin-react");
      expect(packageJson.dependencies).toHaveProperty("react");
      expect(packageJson.dependencies).toHaveProperty("react-dom");
      expect(packageJson.scripts.dev).toBe(
        "vite --config .autogenerated/vite.config.frontend.autogenerated.ts",
      );
    });

    it("keeps frontend framework dependencies out of backend packages", () => {
      const packageJson = createPackageJson("test-backend", "backend");

      expect(packageJson.dependencies).not.toHaveProperty("react");
      expect(packageJson.devDependencies).not.toHaveProperty("@vitejs/plugin-react");
    });

    it("should create worker package.json using createPackageJson", () => {
      const name = "test-worker";
      const type = "worker";

      const packageJson = createPackageJson(name, type);

      expect(packageJson.name).toBe(`@project/${name}`);
      expect(packageJson.dependencies).toHaveProperty("hono");
      expect(packageJson.scripts.build).toBe("tsc");
    });
  });

  describe("tsconfig template", () => {
    it("should have correct TSCONFIG_TEMPLATE structure", () => {
      expect(TSCONFIG_TEMPLATE).toHaveProperty("compilerOptions");
      expect(TSCONFIG_TEMPLATE.compilerOptions).toHaveProperty("target", "ES2022");
      expect(TSCONFIG_TEMPLATE.compilerOptions).toHaveProperty("module", "ESNext");
      expect(TSCONFIG_TEMPLATE.compilerOptions).toHaveProperty("strict", true);
      expect(TSCONFIG_TEMPLATE).toHaveProperty("include");
      expect(TSCONFIG_TEMPLATE.include).toContain("src/**/*");
    });

    it("adds JSX settings through the React provider while keeping the base framework-neutral", () => {
      expect(TSCONFIG_TEMPLATE.compilerOptions).not.toHaveProperty("jsx");
      expect(createResourceTsconfig("frontend").compilerOptions).toHaveProperty("jsx", "react-jsx");
      expect(createResourceTsconfig("backend").compilerOptions).not.toHaveProperty("jsx");
    });

    it("lists node types for non-frontend resources (TS7 does not auto-include @types)", () => {
      for (const type of ["backend", "worker", "mcp", "agent"] as const) {
        expect(createResourceTsconfig(type).compilerOptions.types).toEqual(["node"]);
      }
      expect(createResourceTsconfig("frontend").compilerOptions).not.toHaveProperty("types");
    });

    it("handles all creatable resource types when generating tsconfig", () => {
      for (const type of ["backend", "worker", "mcp", "agent", "bring-your-own"] as const) {
        const config = createResourceTsconfig(type);
        expect(config.compilerOptions.target).toBe("ES2022");
        expect(config.compilerOptions.strict).toBe(true);
        expect(config.include).toContain("src/**/*");
      }
    });
  });

  describe("frontend framework providers", () => {
    it("uses React when the framework is omitted, normalizes case, and rejects unknown ids", () => {
      expect(getFrontendFramework().id).toBe("react");
      expect(getFrontendFramework("vue").id).toBe("vue");
      expect(getFrontendFramework("svelte").id).toBe("svelte");
      expect(getFrontendFramework("preact").id).toBe("preact");
      expect(getFrontendFramework("lit").id).toBe("lit");
      expect(getFrontendFramework("vanilla").id).toBe("vanilla");
      expect(getFrontendFramework("solid").id).toBe("solid");
      expect(getFrontendFramework("qwik").id).toBe("qwik");
      expect(() => getFrontendFramework("angular")).toThrow(
        /Supported frameworks: react, vue, svelte, preact, lit, solid, qwik, vanilla, tanstack-router/,
      );
      expect(() => getFrontendFramework("__proto__")).toThrow(/Unknown frontend framework/);
      expect(getFrontendFramework("React").id).toBe("react");
      expect(getFrontendFramework(" VUE ").id).toBe("vue");
      expect(() => getFrontendFramework("angular")).toThrow(TdkError);
      expect(() => getFrontendFramework("")).toThrow(/Unknown frontend framework/);
    });

    it("rejects framework selection for resources that take no framework", () => {
      for (const resourceType of ["worker", "sdk"]) {
        expect(() => resolveFrontendFramework(resourceType, "react")).toThrow(
          /only be used with --type frontend or --type backend/,
        );
      }
    });

    it("leaves backend framework ids to the backend registry", () => {
      expect(resolveFrontendFramework("backend", "express")).toBeUndefined();
    });

    it("keeps the existing React entry and component output under the provider", () => {
      const provider = getFrontendFramework();
      const files = provider.createFiles("sample-web");

      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
      ]);
      expect(files[0]?.content).toContain("<title>sample-web</title>");
      expect(files[0]?.content).toContain("/src/main.tsx");
      expect(files[1]?.content).toContain("ReactDOM.createRoot");
      expect(files[2]?.content).toContain("Frontend resource created with Flisk");
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });

    it("keeps Vue source and dependencies in its provider", () => {
      const provider = getFrontendFramework("vue");
      const files = provider.createFiles("sample-web");

      expect(provider.dependencies).toHaveProperty("vue");
      expect(provider.devDependencies).toHaveProperty("@vitejs/plugin-vue");
      expect(provider.devDependencies).not.toHaveProperty("@vitejs/plugin-react");
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.ts",
        "src/App.vue",
        "src/vite-env.d.ts",
      ]);
      expect(files[0]?.content).toContain("/src/main.ts");
      expect(files[1]?.content).toContain("createApp(App).mount('#app')");
      expect(files[2]?.content).toContain('<script setup lang="ts">');
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });

    it("keeps Svelte source and dependencies in its provider", () => {
      const provider = getFrontendFramework("svelte");
      const files = provider.createFiles("sample-web");

      expect(provider.dependencies).toHaveProperty("svelte");
      expect(provider.devDependencies).toHaveProperty("@sveltejs/vite-plugin-svelte");
      expect(provider.devDependencies).not.toHaveProperty("@vitejs/plugin-react");
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.ts",
        "src/App.svelte",
        "src/vite-env.d.ts",
      ]);
      expect(files[0]?.content).toContain("/src/main.ts");
      expect(files[1]?.content).toContain("mount(App");
      expect(files[2]?.content).toContain('<script lang="ts">');
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });

    it("keeps Preact source and dependencies in its provider", () => {
      const provider = getFrontendFramework("preact");
      const files = provider.createFiles("sample-web");

      expect(provider.dependencies).toHaveProperty("preact");
      expect(provider.dependencies).not.toHaveProperty("react");
      expect(provider.devDependencies).toHaveProperty("@preact/preset-vite");
      expect(provider.devDependencies).not.toHaveProperty("@vitejs/plugin-react");
      expect(provider.compilerOptions).toEqual({ jsx: "react-jsx", jsxImportSource: "preact" });
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
      ]);
      expect(files[0]?.content).toContain("/src/main.tsx");
      expect(files[1]?.content).toContain("from 'preact'");
      expect(files[2]?.content).toContain("Frontend resource created with Flisk");
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });
  });

  describe("lit provider", () => {
    it("keeps Lit source and dependencies in its provider", () => {
      const provider = getFrontendFramework("lit");
      const files = provider.createFiles("sample-web");

      expect(provider.dependencies).toHaveProperty("lit");
      expect(provider.dependencies).not.toHaveProperty("react");
      expect(provider.devDependencies).toEqual({});
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.ts",
        "src/app-root.ts",
      ]);
      expect(files[0]?.content).toContain("<app-root></app-root>");
      expect(files[2]?.content).toContain("from 'lit'");
      expect(files[2]?.content).toContain("Frontend resource created with Flisk");
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });

    it("keeps Vanilla TypeScript source in its provider, with no framework dependency", () => {
      const provider = getFrontendFramework("vanilla");
      const files = provider.createFiles("sample-web");

      expect(provider.dependencies).toEqual({});
      expect(provider.devDependencies).toEqual({});
      expect(provider.compilerOptions).toEqual({});
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.ts",
        "src/app.ts",
      ]);
      expect(files[0]?.content).toContain('<div id="app"></div>');
      expect(files[1]?.content).toContain("from './app'");
      expect(files[2]?.content).toContain("Frontend resource created with Flisk");
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });

    it("keeps Solid source and dependencies in its provider", () => {
      const provider = getFrontendFramework("solid");
      const files = provider.createFiles("sample-web");

      expect(provider.dependencies).toHaveProperty("solid-js");
      expect(provider.dependencies).not.toHaveProperty("react");
      expect(provider.devDependencies).toHaveProperty("vite-plugin-solid");
      expect(provider.devDependencies).not.toHaveProperty("@vitejs/plugin-react");
      expect(provider.compilerOptions).toEqual({ jsx: "preserve", jsxImportSource: "solid-js" });
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
      ]);
      expect(files[1]?.content).toContain("from 'solid-js/web'");
      expect(files[2]?.content).toContain("Frontend resource created with Flisk");
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });

    it("keeps TanStack Router source and dependencies in its provider", () => {
      const provider = getFrontendFramework("tanstack-router");
      const files = provider.createFiles("sample-web");

      expect(provider.id).toBe("tanstack-router");
      expect(provider.dependencies).toHaveProperty("@tanstack/react-router");
      expect(provider.dependencies).toHaveProperty("react");
      expect(provider.devDependencies).toHaveProperty("@vitejs/plugin-react");
      expect(provider.compilerOptions).toEqual({ jsx: "react-jsx" });
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.tsx",
        "src/router.tsx",
      ]);
      // The app is served under /<name>/, so the router must take Vite's base as its basepath.
      expect(files[1]?.content).toContain("RouterProvider");
      expect(files[2]?.content).toContain("basepath: import.meta.env.BASE_URL");
      // `tsc` fails the image build on import.meta.env without the Vite client types (seen in a real flisk up).
      expect(files[2]?.content).toContain('/// <reference types="vite/client" />');
      expect(files[2]?.content).toContain("createRoute");
      expect(files[2]?.content).toContain("Frontend resource created with Flisk");
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });

    it("keeps Qwik source and dependencies in its provider", () => {
      const provider = getFrontendFramework("qwik");
      const files = provider.createFiles("sample-web");

      expect(provider.dependencies).toHaveProperty("@builder.io/qwik");
      expect(provider.dependencies).not.toHaveProperty("react");
      expect(provider.devDependencies).not.toHaveProperty("@vitejs/plugin-react");
      expect(provider.compilerOptions).toEqual({
        jsx: "react-jsx",
        jsxImportSource: "@builder.io/qwik",
      });
      expect(files.map(({ filename }) => filename)).toEqual([
        "index.html",
        "src/main.tsx",
        "src/App.tsx",
      ]);
      expect(files[1]?.content).toContain("render(document.getElementById('app')");
      expect(files[2]?.content).toContain("component$");
      expect(files[2]?.content).toContain("Frontend resource created with Flisk");
      expect(files.some(({ filename }) => filename === "vite.config.ts")).toBe(false);
    });
  });

  describe("legacy frontend service metadata", () => {
    it("discovers a frontend without framework without rewriting service.json", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "tdk-legacy-frontend-"));
      try {
        const serviceDir = join(projectRoot, "apps", "legacy-web");
        mkdirSync(serviceDir, { recursive: true });
        const servicePath = join(serviceDir, "service.json");
        const original = '{"appName":"legacy-web","appType":"frontend","stack":"main"}\n';
        writeFileSync(servicePath, original);

        const resources = discoverResourcesFromRoot(projectRoot);

        expect(resources).toHaveLength(1);
        expect(resources[0]?.config).not.toHaveProperty("framework");
        expect(readFileSync(servicePath, "utf-8")).toBe(original);
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    });
  });

  describe("dockerfile template", () => {
    it("follows the service port and health path", () => {
      const dockerfile = getDockerfileTemplate(4123, "/health");
      expect(dockerfile).toContain("FROM oven/bun:1.2");
      expect(dockerfile).toContain("WORKDIR /app");
      expect(dockerfile).toContain("EXPOSE 4123");
      expect(dockerfile).toContain("ENV PORT=4123");
      expect(dockerfile).toContain("HEALTHCHECK");
      expect(dockerfile).toContain("http://localhost:4123/health");
      expect(dockerfile).not.toContain("3000");
      expect(dockerfile).not.toContain("curl");
    });

    it("does not require a per-service bun.lock", () => {
      expect(getDockerfileTemplate(4000)).toContain("COPY package.json bun.lock* ./");
    });

    it("omits the health check when the service declares no health path", () => {
      expect(getDockerfileTemplate(6000)).not.toContain("HEALTHCHECK");
    });

    it("says that flisk up does not use it", () => {
      expect(getDockerfileTemplate(4000)).toMatch(/flisk up. does NOT build this file/);
    });
  });

  describe("drizzle feature templates", () => {
    it("adds drizzle-orm and pg to dependencies and drizzle-kit to devDependencies", () => {
      const packageJson = createPackageJson(
        "orders-api",
        "backend",
        undefined,
        false,
        undefined,
        true,
      );

      expect(packageJson.dependencies).toMatchObject({
        "drizzle-orm": "^0.44.7",
        pg: "^8.13.0",
        hono: "^4.0.0",
      });
      expect(packageJson.devDependencies).toMatchObject({
        "drizzle-kit": "^0.31.8",
        "@types/pg": "^8.11.0",
      });
    });

    it("leaves the Drizzle dependencies out unless the feature is enabled", () => {
      const packageJson = createPackageJson("orders-api", "backend");

      expect(packageJson.dependencies).not.toHaveProperty("drizzle-orm");
      expect(packageJson.devDependencies).not.toHaveProperty("drizzle-kit");
      expect(packageJson.dependencies).not.toHaveProperty("pg");
    });

    it("reads DATABASE_URL in the Drizzle client and the drizzle-kit config", () => {
      expect(DRIZZLE_DB_TEMPLATE).toContain("process.env.DATABASE_URL");
      expect(DRIZZLE_DB_TEMPLATE).toContain("drizzle(pool)");
      expect(DRIZZLE_CONFIG_TEMPLATE).toContain("process.env.DATABASE_URL");
      expect(DRIZZLE_CONFIG_TEMPLATE).toContain("dialect: 'postgresql'");
      expect(DRIZZLE_SCHEMA_TEMPLATE).toContain("export {}");
    });

    it("adds /health/db only to the Drizzle variant of the Bun backend template", () => {
      const withDrizzle = getDrizzleBackendIndexTemplate("orders-api");

      expect(withDrizzle).toContain("app.get('/health/db'");
      expect(withDrizzle).toContain("import { db } from './db.js';");
      expect(withDrizzle).toContain("db.execute(sql`select 1`)");
      expect(withDrizzle).toContain("'/health/db'");
      expect(withDrizzle).toContain("service: 'orders-api'");

      const plain = getBackendIndexTemplate("orders-api");
      expect(plain).not.toContain("/health/db");
      expect(plain).not.toContain("drizzle");
    });
  });

  describe("backend index.ts template", () => {
    it("should have health check endpoints via getBackendIndexTemplate", () => {
      const name = "test-service";
      const indexContent = getBackendIndexTemplate(name);

      expect(indexContent).toContain("app.get('/health'");
      expect(indexContent).toContain("app.get('/health/live'");
      expect(indexContent).toContain("app.get('/health/ready'");
      expect(indexContent).toContain("async (c)");
      expect(indexContent).toContain(`service: '${name}'`);
    });

    it("should have root endpoint with service info", () => {
      const name = "test-service";
      const indexContent = getBackendIndexTemplate(name);

      expect(indexContent).toContain("app.get('/',");
      expect(indexContent).toContain("endpoints:");
    });
  });

  describe("worker index.ts template", () => {
    it("should have worker configuration via getWorkerIndexTemplate", () => {
      const name = "test-worker";
      const workerContent = getWorkerIndexTemplate(name);

      expect(workerContent).toContain("WORKER_POLL_INTERVAL");
      expect(workerContent).toContain("WORKER_MAX_RETRIES");
      expect(workerContent).toContain("WORKER_BATCH_SIZE");
      expect(workerContent).toContain("interface Job");
      expect(workerContent).toContain("async function main()");
    });

    it("does not reference CLI-internal types the scaffolded project cannot resolve (#588)", () => {
      const workerContent = getWorkerIndexTemplate("test-worker");

      // JsonValue exists only inside the CLI (cli/src/types); the generated worker has no import for it.
      expect(workerContent).not.toContain("JsonValue");
      expect(workerContent).toContain("payload: Record<string, unknown>;");
    });

    it("should have graceful shutdown handling", () => {
      const name = "test-worker";
      const workerContent = getWorkerIndexTemplate(name);

      expect(workerContent).toContain("process.on('SIGTERM'");
      expect(workerContent).toContain("process.on('SIGINT'");
      expect(workerContent).toContain("shutting down gracefully");
    });
  });

  describe("resource type validation", () => {
    it("should only accept valid resource types via isCreatableResourceType", () => {
      const validTypes = ["backend", "frontend", "worker", "mcp", "bring-your-own"];
      const invalidTypes = ["api", "microservice", "service", "app", "library", "sdk"];

      for (const type of validTypes) {
        expect(isCreatableResourceType(type)).toBe(true);
      }

      for (const type of invalidTypes) {
        expect(isCreatableResourceType(type)).toBe(false);
      }
    });

    it("should have correct CREATABLE_RESOURCE_TYPES", () => {
      expect(CREATABLE_RESOURCE_TYPES).toContain("backend");
      expect(CREATABLE_RESOURCE_TYPES).toContain("frontend");
      expect(CREATABLE_RESOURCE_TYPES).toContain("worker");
      expect(CREATABLE_RESOURCE_TYPES).toContain("mcp");
      expect(CREATABLE_RESOURCE_TYPES).toContain("agent");
      expect(CREATABLE_RESOURCE_TYPES).toContain("bring-your-own");
      expect(CREATABLE_RESOURCE_TYPES).toHaveLength(6);
    });
  });
});

describe("service.json schema", () => {
  it("keeps framework open to every registered frontend provider", () => {
    const schemaPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../engine/schemas/service-schema.json",
    );
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

    // Unknown user fields are preserved and warned about rather than rejected.
    expect(schema.additionalProperties).toBe(true);
    expect(schema.required).toContain("schemaVersion");
    expect(schema.properties.schemaVersion).toMatchObject({ const: 1, type: "integer" });
    expect(schema.properties.appType.enum).toContain("bring-your-own");
    expect(schema.properties.stack.type).toBe("string");
    expect(schema.properties.stack.enum).toBeUndefined();
    expect(schema.properties.image.type).toBe("string");
    expect(schema.properties.exposeViaProxy.type).toBe("boolean");
    // The provider registry is the contract, so the schema stays open and every registered id fits.
    expect(schema.properties.framework.enum).toBeUndefined();
    const idPattern = new RegExp(schema.properties.framework.pattern);
    for (const id of Object.keys(FRONTEND_FRAMEWORKS)) expect(id).toMatch(idPattern);
    expect("Not_A_Provider").not.toMatch(idPattern);
    expect(schema.properties.sablier.properties.deferStart).toMatchObject({
      default: false,
      type: "boolean",
    });
    expect(createServiceJson("web", "frontend", "app", 3000, [], "vue").framework).toBe("vue");
    expect(createServiceJson("web", "frontend", "app", 3000).schemaVersion).toBe(1);
    expect(createServiceJson("web", "frontend", "app", 3000).$schema).toContain(
      "schema.service.json",
    );
  });
});

describe("parseResourceType", () => {
  it("accepts every creatable type, sdk and the byo alias", () => {
    for (const type of [...CREATABLE_RESOURCE_TYPES, "sdk"]) {
      expect(parseResourceType(type)).toBe(type);
    }
    expect(parseResourceType("byo")).toBe("bring-your-own");
  });

  it("rejects an unknown type with the supported list instead of prompting", () => {
    expect(() => parseResourceType("bogus")).toThrow(TdkError);
    expect(() => parseResourceType("bogus")).toThrow(
      /Unknown resource type "bogus"\. Supported types: backend, frontend/,
    );
    expect(() => parseResourceType("")).toThrow(/Unknown resource type/);
  });
});

const resourceCliPath = join(dirname(fileURLToPath(import.meta.url)), "../../../bin/tdk.js");

function createResourceProject(): string {
  const projectRoot = mkdtempSync(join(tmpdir(), "tdk-resource-cli-"));
  mkdirSync(join(projectRoot, ".tdk"), { recursive: true });
  writeFileSync(join(projectRoot, ".tdk", "project.json"), "{}\n");
  return projectRoot;
}

function runResourceCli(projectRoot: string, args: string[], input = "") {
  return spawnSync(process.execPath, [resourceCliPath, "resource", ...args], {
    cwd: projectRoot,
    input,
    encoding: "utf8",
  });
}

describe("resource command drizzle feature", () => {
  it("writes the Drizzle client, schema, config and /health/db route for a backend", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, [
        "api",
        "--type",
        "backend",
        "--yes",
        "--feature",
        "drizzle",
      ]);
      const serviceDir = join(projectRoot, "services", "main", "api");
      const serviceJson = JSON.parse(readFileSync(join(serviceDir, "service.json"), "utf8"));
      const packageJson = JSON.parse(readFileSync(join(serviceDir, "package.json"), "utf8"));

      expect(result.status).toBe(0);
      expect(serviceJson.featuresEnabled).toContain("drizzle");
      expect(serviceJson.dependsOn ?? []).toEqual([]);
      expect(packageJson.dependencies["drizzle-orm"]).toBe("^0.44.7");
      expect(packageJson.devDependencies["drizzle-kit"]).toBe("^0.31.8");
      expect(readFileSync(join(serviceDir, "src", "db.ts"), "utf8")).toContain("DATABASE_URL");
      expect(readFileSync(join(serviceDir, "src", "schema.ts"), "utf8")).toBe(
        DRIZZLE_SCHEMA_TEMPLATE,
      );
      expect(readFileSync(join(serviceDir, "drizzle.config.ts"), "utf8")).toBe(
        DRIZZLE_CONFIG_TEMPLATE,
      );
      expect(readFileSync(join(serviceDir, "src", "index.ts"), "utf8")).toContain(
        "app.get('/health/db'",
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not write Drizzle files or the /health/db route without the feature", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, ["api", "--type", "backend", "--yes"]);
      const serviceDir = join(projectRoot, "services", "main", "api");

      expect(result.status).toBe(0);
      expect(existsSync(join(serviceDir, "src", "db.ts"))).toBe(false);
      expect(existsSync(join(serviceDir, "drizzle.config.ts"))).toBe(false);
      expect(readFileSync(join(serviceDir, "src", "index.ts"), "utf8")).not.toContain("/health/db");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects --feature drizzle for non-backend resources before writing anything", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, [
        "jobs",
        "--type",
        "worker",
        "--yes",
        "--feature",
        "drizzle",
      ]);
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(1);
      expect(output).toContain("--feature drizzle is only supported for Bun backends");
      expect(existsSync(join(projectRoot, "services", "main", "jobs"))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("resource command non-interactive mode", () => {
  it("does not create a resource when a prompt receives no input", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, ["api", "--type", "backend"]);

      expect(result.status).toBe(1);
      expect(existsSync(join(projectRoot, "services", "main", "api", "service.json"))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("fails clearly when an SDK has no service.json to register", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, [
        "r-sdk",
        "--type",
        "sdk",
        "--stack",
        "shop",
        "--yes",
      ]);
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(1);
      expect(output).toContain("No service.json in packages/r-sdk");
      expect(output).toContain('Add one with "appType": "sdk", then run this again to register it');
      expect(existsSync(join(projectRoot, "packages", "r-sdk"))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("accepts confirmation input piped through stdin without --yes", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(
        projectRoot,
        ["api", "--type", "backend", "--stack", "shop"],
        "y\n",
      );
      const manifestPath = join(projectRoot, "services", "shop", "api", "service.json");

      expect(result.status).toBe(0);
      expect(existsSync(manifestPath)).toBe(true);
      expect(JSON.parse(readFileSync(manifestPath, "utf8")).stack).toBe("shop");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("requires a resource name with --yes instead of prompting", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, ["--type", "backend", "--yes"]);
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(1);
      expect(output).toContain("resource name is required");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("uses the default frontend framework with --yes instead of prompting", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, ["web", "--type", "frontend", "--yes"]);
      const manifestPath = join(projectRoot, "services", "main", "web", "service.json");

      expect(result.status).toBe(0);
      expect(existsSync(manifestPath)).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("uses the default main stack and creates a named resource with --yes", () => {
    const projectRoot = createResourceProject();
    try {
      const result = runResourceCli(projectRoot, ["api", "--type", "backend", "--yes"]);
      const manifestPath = join(projectRoot, "services", "main", "api", "service.json");

      expect(result.status).toBe(0);
      expect(existsSync(manifestPath)).toBe(true);
      expect(JSON.parse(readFileSync(manifestPath, "utf8")).stack).toBe("main");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("reuses the only existing stack with --yes", () => {
    const projectRoot = createResourceProject();
    try {
      const existingDir = join(projectRoot, "services", "team", "existing");
      mkdirSync(existingDir, { recursive: true });
      writeFileSync(
        join(existingDir, "service.json"),
        JSON.stringify(createServiceJson("existing-team", "backend", "team", 4100)),
      );

      const result = runResourceCli(projectRoot, ["new-api", "--type", "backend", "--yes"]);
      const manifestPath = join(projectRoot, "services", "team", "new-api", "service.json");

      expect(result.status).toBe(0);
      expect(existsSync(manifestPath)).toBe(true);
      expect(JSON.parse(readFileSync(manifestPath, "utf8")).stack).toBe("team");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("requires --stack rather than guessing when --yes finds multiple stacks", () => {
    const projectRoot = createResourceProject();
    try {
      for (const [index, stack] of ["alpha", "beta"].entries()) {
        const resourceDir = join(projectRoot, "services", stack, "existing");
        mkdirSync(resourceDir, { recursive: true });
        writeFileSync(
          join(resourceDir, "service.json"),
          JSON.stringify(createServiceJson(`existing-${stack}`, "backend", stack, 4100 + index)),
        );
      }

      const result = runResourceCli(projectRoot, ["new-api", "--type", "backend", "--yes"]);
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(1);
      expect(output).toContain("--stack");
      expect(existsSync(join(projectRoot, "services", "alpha", "new-api", "service.json"))).toBe(
        false,
      );
      expect(existsSync(join(projectRoot, "services", "beta", "new-api", "service.json"))).toBe(
        false,
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("wraps a malformed service.json in a TdkError naming the file during registration", () => {
    expect(() =>
      parseExistingServiceJson('{"appName": "broken",', "/tmp/services/main/broken/service.json"),
    ).toThrow(TdkError);
    expect(() =>
      parseExistingServiceJson('{"appName": "broken",', "/tmp/services/main/broken/service.json"),
    ).toThrow(/Could not parse service\.json at \/tmp\/services\/main\/broken\/service\.json:/);

    const projectRoot = createResourceProject();
    try {
      const resourceDir = join(projectRoot, "services", "main", "broken");
      const manifestPath = join(resourceDir, "service.json");
      mkdirSync(resourceDir, { recursive: true });
      writeFileSync(manifestPath, '{"appName": "broken",\n');

      const result = runResourceCli(projectRoot, [
        "broken",
        "--type",
        "backend",
        "--path",
        "services/main/broken",
        "--register-existing",
        "--yes",
      ]);
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(1);
      // The CLI reports the manifest path it actually read, which is the resolved
      // (symlink-free) path: on macOS the temporary directory is `/var/...` but the
      // spawned process sees `/private/var/...`.
      expect(output).toContain(`Could not parse service.json at ${realpathSync(manifestPath)}:`);
      expect(readFileSync(manifestPath, "utf8")).toBe('{"appName": "broken",\n');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
