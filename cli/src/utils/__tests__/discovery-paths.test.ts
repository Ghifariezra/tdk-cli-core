// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chooseResourcePath, isPathDiscovered, readDiscoveryPaths } from "../discovery-paths.js";

describe("discovery paths", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tdk-discovery-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeProjectJson(paths: unknown) {
    mkdirSync(join(root, ".tdk"), { recursive: true });
    writeFileSync(join(root, ".tdk", "project.json"), JSON.stringify({ discovery: { paths } }));
  }

  function writeRawProjectJson(content: string) {
    mkdirSync(join(root, ".tdk"), { recursive: true });
    writeFileSync(join(root, ".tdk", "project.json"), content);
  }

  describe("readDiscoveryPaths", () => {
    it("falls back to services/*/* without a project.json", () => {
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);
    });

    it("falls back to services/*/* when project.json is malformed JSON", () => {
      writeRawProjectJson("{ invalid-json syntax");
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);
    });

    it("falls back to services/*/* when discovery key is missing or not an object", () => {
      writeRawProjectJson(JSON.stringify({ name: "my-project" }));
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeRawProjectJson(JSON.stringify({ discovery: null }));
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeRawProjectJson(JSON.stringify({ discovery: "string-value" }));
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);
    });

    it("falls back to services/*/* when discovery.paths is not an array", () => {
      writeProjectJson("not-an-array");
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeProjectJson(12345);
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeProjectJson({ path: "services/*/*" });
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeProjectJson(null);
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);
    });

    it("falls back to services/*/* when discovery.paths contains non-string items", () => {
      writeProjectJson(["services/*/*", 42]);
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeProjectJson([null, "apps/*"]);
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeProjectJson(["valid/path", true]);
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);

      writeProjectJson([{}]);
      expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);
    });

    it("returns empty array when discovery.paths is an empty array", () => {
      writeProjectJson([]);
      expect(readDiscoveryPaths(root)).toEqual([]);
    });

    it("returns valid array of string paths", () => {
      const customPaths = ["apps/*", "services/*/*", "workers/*", "agents/*"];
      writeProjectJson(customPaths);
      expect(readDiscoveryPaths(root)).toEqual(customPaths);
    });
  });

  describe("isPathDiscovered", () => {
    it("matches a resource dir like Tilt's glob + find -maxdepth 3 does", () => {
      const patterns = ["services/*/*"];
      expect(isPathDiscovered(root, "services/shop/orders-api", patterns)).toBe(true);
      // service.json up to two levels below a matched directory is still found
      expect(isPathDiscovered(root, "services/shop/orders-api/nested", patterns)).toBe(true);
      expect(isPathDiscovered(root, "services/shop/orders-api/nested/deeper", patterns)).toBe(true);
      // three levels below is not discovered
      expect(isPathDiscovered(root, "services/shop/orders-api/a/b/c", patterns)).toBe(false);
      expect(isPathDiscovered(root, "apps/storefront", patterns)).toBe(false);
      expect(isPathDiscovered(root, "services/shop", patterns)).toBe(false);
    });

    it("returns false when pattern list is empty", () => {
      expect(isPathDiscovered(root, "services/shop/orders-api", [])).toBe(false);
    });

    it("treats regex metacharacters in a pattern as literal text", () => {
      expect(isPathDiscovered(root, "apps/a+b", ["apps/a+b"])).toBe(true);
      expect(isPathDiscovered(root, "apps/aab", ["apps/a+b"])).toBe(false);
      expect(isPathDiscovered(root, "apps/a.b", ["apps/a.b"])).toBe(true);
      expect(isPathDiscovered(root, "apps/axb", ["apps/a.b"])).toBe(false);
      expect(isPathDiscovered(root, "apps/[v1]", ["apps/[v1]"])).toBe(true);
      expect(isPathDiscovered(root, "apps/(test)", ["apps/(test)"])).toBe(true);
      expect(isPathDiscovered(root, "apps/$core", ["apps/$core"])).toBe(true);
    });

    it("matches hostile wildcard patterns quickly without backtracking blow-up", () => {
      const hostile = `${"a*".repeat(30)}b`;
      const started = Date.now();
      expect(isPathDiscovered(root, `apps/${"a".repeat(5000)}`, [`apps/${hostile}`])).toBe(false);
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it("supports literal, wildcard and multiple patterns", () => {
      expect(isPathDiscovered(root, "apps/storefront", ["apps/*"])).toBe(true);
      expect(isPathDiscovered(root, "apps/storefront", ["services/*/*", "apps"])).toBe(true);
      expect(isPathDiscovered(root, "identity-auth", ["identity-*"])).toBe(true);
      expect(isPathDiscovered(root, "billing-auth", ["identity-*"])).toBe(false);
    });

    it("supports single-character ? wildcard matching", () => {
      expect(isPathDiscovered(root, "apps/service-1", ["apps/service-?"])).toBe(true);
      expect(isPathDiscovered(root, "apps/service-a", ["apps/service-?"])).toBe(true);
      expect(isPathDiscovered(root, "apps/service-", ["apps/service-?"])).toBe(false);
      expect(isPathDiscovered(root, "apps/service-10", ["apps/service-?"])).toBe(false);
      expect(isPathDiscovered(root, "apps/v01", ["apps/v??"])).toBe(true);
      expect(isPathDiscovered(root, "apps/v1", ["apps/v??"])).toBe(false);
    });

    it("supports multi-wildcard * patterns in prefix, infix, and suffix positions", () => {
      expect(isPathDiscovered(root, "packages/ui-components", ["packages/*-components"])).toBe(
        true,
      );
      expect(isPathDiscovered(root, "packages/backend-api-core", ["packages/*-api-*"])).toBe(true);
      expect(isPathDiscovered(root, "packages/backend-worker-core", ["packages/*-api-*"])).toBe(
        false,
      );
      expect(isPathDiscovered(root, "services/app/test", ["services/*/*"])).toBe(true);
      expect(isPathDiscovered(root, "services/app/test", ["*/*/*"])).toBe(true);
      expect(isPathDiscovered(root, "services/app/test", ["services/**"])).toBe(true);
    });

    it("handles trailing and redundant slashes in resource dir and pattern", () => {
      expect(isPathDiscovered(root, "services/shop/api/", ["services/*/*"])).toBe(true);
      expect(isPathDiscovered(root, "services/shop/api", ["services/*/*/"])).toBe(true);
      expect(isPathDiscovered(root, "./services/shop/api", ["services/*/*"])).toBe(true);
    });

    it("rejects resource directory that is shallower than pattern", () => {
      expect(isPathDiscovered(root, "services", ["services/*/*"])).toBe(false);
      expect(isPathDiscovered(root, "services/shop", ["services/*/*"])).toBe(false);
      expect(isPathDiscovered(root, "services/a/b", ["services/a/b/c/d"])).toBe(false);
    });

    it("handles absolute paths resolved within projectRoot", () => {
      const absPath = join(root, "services", "orders", "api");
      expect(isPathDiscovered(root, absPath, ["services/*/*"])).toBe(true);
    });
  });

  describe("chooseResourcePath", () => {
    it("keeps the conventional folder when discovery covers it", () => {
      writeProjectJson(["services/*/*", "apps/*"]);
      expect(chooseResourcePath(root, "apps/storefront", "shop", "storefront")).toEqual({
        path: "apps/storefront",
      });
    });

    it("moves a resource under services/<stack>/ when its conventional folder is not discovered", () => {
      writeProjectJson(["services/*/*"]);
      expect(chooseResourcePath(root, "apps/storefront", "shop", "storefront")).toEqual({
        path: "services/shop/storefront",
        adjustedFrom: "apps/storefront",
      });
    });

    it("keeps the conventional folder when no default location is discovered either", () => {
      writeProjectJson(["packages/*"]);
      expect(chooseResourcePath(root, "apps/storefront", "shop", "storefront")).toEqual({
        path: "apps/storefront",
      });
    });

    it("handles diverse stacks and resource names with adjustFrom tracking", () => {
      writeProjectJson(["services/*/*"]);
      expect(chooseResourcePath(root, "workers/payment-sync", "billing", "payment-sync")).toEqual({
        path: "services/billing/payment-sync",
        adjustedFrom: "workers/payment-sync",
      });

      expect(chooseResourcePath(root, "agents/support-bot", "ai", "support-bot")).toEqual({
        path: "services/ai/support-bot",
        adjustedFrom: "agents/support-bot",
      });
    });

    it("keeps conventional path when discovery paths use broad wildcard covering it", () => {
      writeProjectJson(["*/*"]);
      expect(chooseResourcePath(root, "apps/dashboard", "core", "dashboard")).toEqual({
        path: "apps/dashboard",
      });
      expect(chooseResourcePath(root, "workers/mailer", "core", "mailer")).toEqual({
        path: "workers/mailer",
      });
    });
  });
});
