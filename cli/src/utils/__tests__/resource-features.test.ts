// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDefaultFeaturesForResourceType,
  getGeneratorsForResourceType,
  RESOURCE_FEATURES,
  type ResourceType,
} from "../resource-features.js";

describe("resource-features", () => {
  it("documents every feature from RESOURCE_FEATURES in docs/resource-features.md", () => {
    const docPath = resolve(__dirname, "../../../../docs/resource-features.md");
    const docContent = readFileSync(docPath, "utf-8");

    const featureKeys = Object.keys(RESOURCE_FEATURES);
    expect(featureKeys.length).toBeGreaterThan(0);

    for (const key of featureKeys) {
      expect(
        docContent.includes(`\`${key}\``),
        `Feature "${key}" is defined in RESOURCE_FEATURES but missing from docs/resource-features.md`,
      ).toBe(true);
    }
  });

  describe("RESOURCE_FEATURES structure & metadata", () => {
    it("has valid configuration for every registered feature", () => {
      for (const [key, feature] of Object.entries(RESOURCE_FEATURES)) {
        expect(feature.name).toBe(key);
        expect(feature.description.length).toBeGreaterThan(0);
        expect(Array.isArray(feature.applies_to)).toBe(true);
        expect(feature.applies_to.length).toBeGreaterThan(0);
        expect(typeof feature.enabled_by_default).toBe("boolean");
        expect(feature.generator_file.length).toBeGreaterThan(0);
        expect(feature.output_file.length).toBeGreaterThan(0);
      }
    });

    it("marks premium features with category 'premium' and keeps them opt-in", () => {
      expect(RESOURCE_FEATURES.ddd.category).toBe("premium");
      expect(RESOURCE_FEATURES.ddd.enabled_by_default).toBe(false);

      expect(RESOURCE_FEATURES.sablier.category).toBe("premium");
      expect(RESOURCE_FEATURES.sablier.enabled_by_default).toBe(false);
    });

    it("keeps opt-in generators disabled by default", () => {
      expect(RESOURCE_FEATURES.prisma.enabled_by_default).toBe(false);
      expect(RESOURCE_FEATURES.playwright.enabled_by_default).toBe(false);
    });
  });

  describe("getDefaultFeaturesForResourceType", () => {
    it("returns frontend generator features by default", () => {
      const frontendDefaults = getDefaultFeaturesForResourceType("frontend");
      expect(frontendDefaults).toEqual(["api-client", "env-config", "api-index"]);
    });

    it("does not enable prisma by default for backend resources", () => {
      const backendDefaults = getDefaultFeaturesForResourceType("backend");
      expect(backendDefaults).not.toContain("prisma");
      expect(backendDefaults).toEqual([]);
    });

    it("returns empty array for worker, migrator, and sdk resources", () => {
      expect(getDefaultFeaturesForResourceType("worker")).toEqual([]);
      expect(getDefaultFeaturesForResourceType("migrator")).toEqual([]);
      expect(getDefaultFeaturesForResourceType("sdk")).toEqual([]);
    });

    it("returns empty array for bring-your-own resources", () => {
      const byoDefaults = getDefaultFeaturesForResourceType("bring-your-own");
      expect(byoDefaults).toEqual([]);
    });

    it("returns empty array for unknown or unhandled resource types", () => {
      expect(getDefaultFeaturesForResourceType("unknown" as ResourceType)).toEqual([]);
      expect(getDefaultFeaturesForResourceType("" as ResourceType)).toEqual([]);
    });
  });

  describe("getGeneratorsForResourceType", () => {
    it("returns all features that apply to frontend", () => {
      const frontendGenerators = getGeneratorsForResourceType("frontend");
      const names = frontendGenerators.map((f) => f.name);
      expect(names).toContain("api-client");
      expect(names).toContain("env-config");
      expect(names).toContain("api-index");
      expect(names).toContain("nginx");
      expect(names).toContain("vite");
      expect(names).toContain("tsconfig");
      expect(names).toContain("dockerfile");
      expect(names).toContain("npmrc");
      expect(names).toContain("bunfig");
      expect(names).toContain("playwright");
      expect(names).toContain("agents-md");
      expect(names).toContain("sablier");
      expect(names).not.toContain("prisma");
      expect(names).not.toContain("env");
      expect(names).not.toContain("ddd");
    });

    it("returns all features that apply to backend", () => {
      const backendGenerators = getGeneratorsForResourceType("backend");
      const names = backendGenerators.map((f) => f.name);
      expect(names).toContain("prisma");
      expect(names).toContain("vite");
      expect(names).toContain("tsconfig");
      expect(names).toContain("dockerfile");
      expect(names).toContain("npmrc");
      expect(names).toContain("bunfig");
      expect(names).toContain("env");
      expect(names).toContain("playwright");
      expect(names).toContain("agents-md");
      expect(names).toContain("ddd");
      expect(names).toContain("sablier");
      expect(names).not.toContain("nginx");
      expect(names).not.toContain("api-client");
    });

    it("returns all features that apply to worker", () => {
      const workerGenerators = getGeneratorsForResourceType("worker");
      const names = workerGenerators.map((f) => f.name);
      expect(names).toContain("prisma");
      expect(names).toContain("tsconfig");
      expect(names).toContain("dockerfile");
      expect(names).toContain("npmrc");
      expect(names).toContain("bunfig");
      expect(names).toContain("env");
      expect(names).toContain("agents-md");
      expect(names).toContain("ddd");
      expect(names).not.toContain("vite");
      expect(names).not.toContain("nginx");
      expect(names).not.toContain("sablier");
    });

    it("returns all features that apply to migrator", () => {
      const migratorGenerators = getGeneratorsForResourceType("migrator");
      const names = migratorGenerators.map((f) => f.name);
      expect(names).toContain("prisma");
      expect(names).toContain("tsconfig");
      expect(names).toContain("dockerfile");
      expect(names).toContain("npmrc");
      expect(names).toContain("bunfig");
      expect(names).toContain("env");
      expect(names).toContain("agents-md");
      expect(names).toContain("ddd");
      expect(names).not.toContain("vite");
      expect(names).not.toContain("nginx");
    });

    it("returns all features that apply to sdk", () => {
      const sdkGenerators = getGeneratorsForResourceType("sdk");
      const names = sdkGenerators.map((f) => f.name);
      expect(names).toContain("vite");
      expect(names).toContain("tsconfig");
      expect(names).toContain("dockerfile");
      expect(names).toContain("npmrc");
      expect(names).toContain("bunfig");
      expect(names).toContain("agents-md");
      expect(names).not.toContain("prisma");
      expect(names).not.toContain("env");
      expect(names).not.toContain("nginx");
      expect(names).not.toContain("ddd");
    });

    it("returns empty array for bring-your-own resources", () => {
      const byoGenerators = getGeneratorsForResourceType("bring-your-own");
      expect(byoGenerators).toEqual([]);
    });

    it("returns empty array for unknown resource type", () => {
      const unknownGenerators = getGeneratorsForResourceType("invalid-type" as ResourceType);
      expect(unknownGenerators).toEqual([]);
    });
  });

  describe("feature applicability constraints", () => {
    it("restricts frontend-only features strictly to frontend", () => {
      expect(RESOURCE_FEATURES["api-client"].applies_to).toEqual(["frontend"]);
      expect(RESOURCE_FEATURES["env-config"].applies_to).toEqual(["frontend"]);
      expect(RESOURCE_FEATURES["api-index"].applies_to).toEqual(["frontend"]);
      expect(RESOURCE_FEATURES.nginx.applies_to).toEqual(["frontend"]);
    });

    it("restricts backend/worker/migrator env feature", () => {
      expect(RESOURCE_FEATURES.env.applies_to).toEqual(["backend", "worker", "migrator"]);
    });

    it("restricts ddd feature to backend, worker, and migrator", () => {
      expect(RESOURCE_FEATURES.ddd.applies_to).toEqual(["backend", "worker", "migrator"]);
    });

    it("restricts sablier to backend and frontend", () => {
      expect(RESOURCE_FEATURES.sablier.applies_to).toEqual(["backend", "frontend"]);
    });
  });
});
