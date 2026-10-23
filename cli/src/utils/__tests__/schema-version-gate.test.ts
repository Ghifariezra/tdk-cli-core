// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { enforceSchemaVersionGate } from "../schema-version-gate.js";
import { SERVICE_MANIFEST_SCHEMA_VERSION } from "../service-manifest.js";
import * as servicesModule from "../services.js";

let root: string;

function service(name: string, extra: Record<string, unknown>, stack = "app") {
  const path = join(root, "services", stack, name);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "service.json"),
    JSON.stringify({ appName: name, appType: "backend", stack, port: 4000, ...extra }),
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tdk-schema-gate-"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("enforceSchemaVersionGate", () => {
  it("refuses a schemaVersion this flisk does not know, and says which file", () => {
    service("api", { schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION + 1 });
    const seen: string[] = [];
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    expect(() =>
      enforceSchemaVersionGate(root, { onInvalid: (m) => seen.push(m) }, exit as never),
    ).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(seen[0]).toContain("services/app/api/service.json schemaVersion");
    expect(seen[0]).toContain(`this flisk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`);
  });

  it("does not refuse a missing schemaVersion, which only warns", () => {
    service("api", {});
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    enforceSchemaVersionGate(root, {}, exit as never);
    expect(exit).not.toHaveBeenCalled();
  });

  it("does not refuse the supported version", () => {
    service("api", { schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION });
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    enforceSchemaVersionGate(root, {}, exit as never);
    expect(exit).not.toHaveBeenCalled();
  });

  it("formats plural message when multiple files declare unsupported schemaVersions", () => {
    service("orders-api", { schemaVersion: 2 }, "store");
    service("billing-worker", { schemaVersion: 3 }, "finance");
    const seen: string[] = [];
    const exit = vi.fn(() => {
      throw new Error("exit");
    });

    expect(() =>
      enforceSchemaVersionGate(root, { onInvalid: (m) => seen.push(m) }, exit as never),
    ).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(seen[0]).toContain(
      "2 service.json files declare a schemaVersion this flisk does not support:",
    );
    expect(seen[0]).toContain("services/store/orders-api/service.json schemaVersion 2");
    expect(seen[0]).toContain("services/finance/billing-worker/service.json schemaVersion 3");
    expect(seen[0]).toContain(
      "Fix: Upgrade flisk to a version that supports these files. Changing schemaVersion by hand is not a fix",
    );
  });

  it("rejects non-numeric and boundary schemaVersion values", () => {
    const invalidVersions: unknown[] = [
      "v2.0",
      "future-beta",
      true,
      false,
      null,
      0,
      -1,
      99,
      { major: 2 },
      [1, 2],
    ];

    for (const badVersion of invalidVersions) {
      const exit = vi.fn(() => {
        throw new Error("exit");
      });
      const dummyResource: DiscoveredResource = {
        name: "test-svc",
        path: join(root, "services/app/test-svc"),
        configPath: join(root, "services/app/test-svc/service.json"),
        config: {
          appName: "test-svc",
          appType: "backend",
          schemaVersion: badVersion,
        } as never,
      };

      const seen: string[] = [];
      expect(() =>
        enforceSchemaVersionGate(
          root,
          { resources: [dummyResource], onInvalid: (m) => seen.push(m) },
          exit as never,
        ),
      ).toThrow("exit");
      expect(exit).toHaveBeenCalledWith(1);
      expect(seen[0]).toContain(`schemaVersion ${JSON.stringify(badVersion)}`);
    }
  });

  it("uses pre-discovered options.resources without discovering from root", () => {
    const spy = vi.spyOn(servicesModule, "discoverResourcesFromRoot");
    const preDiscovered: DiscoveredResource[] = [
      {
        name: "custom-api",
        path: join(root, "apps/custom-api"),
        configPath: join(root, "apps/custom-api/service.json"),
        config: {
          appName: "custom-api",
          appType: "backend",
          schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
        } as never,
      },
    ];

    const exit = vi.fn();
    enforceSchemaVersionGate(root, { resources: preDiscovered }, exit as never);
    expect(spy).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("returns cleanly when options.resources is empty", () => {
    const exit = vi.fn();
    enforceSchemaVersionGate(root, { resources: [] }, exit as never);
    expect(exit).not.toHaveBeenCalled();
  });

  it("handles resources with undefined config safely", () => {
    const preDiscovered: DiscoveredResource[] = [
      {
        name: "raw-app",
        path: join(root, "apps/raw-app"),
        configPath: join(root, "apps/raw-app/service.json"),
        config: undefined as never,
      },
    ];

    const exit = vi.fn();
    enforceSchemaVersionGate(root, { resources: preDiscovered }, exit as never);
    expect(exit).not.toHaveBeenCalled();
  });

  it("handles discoverResourcesFromRoot throwing an exception gracefully", () => {
    vi.spyOn(servicesModule, "discoverResourcesFromRoot").mockImplementation(() => {
      throw new Error("Unreadable directory");
    });

    const exit = vi.fn();
    expect(() => enforceSchemaVersionGate(root, {}, exit as never)).not.toThrow();
    expect(exit).not.toHaveBeenCalled();
  });

  it("falls back to configPath when relative path is empty string", () => {
    const exit = vi.fn(() => {
      throw new Error("exit");
    });
    const configPath = root; // relative(root, root) === ""
    const dummyResource: DiscoveredResource = {
      name: "root-svc",
      path: root,
      configPath,
      config: {
        appName: "root-svc",
        appType: "backend",
        schemaVersion: 999,
      } as never,
    };

    const seen: string[] = [];
    expect(() =>
      enforceSchemaVersionGate(
        root,
        { resources: [dummyResource], onInvalid: (m) => seen.push(m) },
        exit as never,
      ),
    ).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(seen[0]).toContain(configPath.replace(/\\/g, "/"));
  });

  it("logs formatted red message and gray fix text to console.error", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    service("bad-api", { schemaVersion: 42 });
    const exit = vi.fn(() => {
      throw new Error("exit");
    });

    expect(() => enforceSchemaVersionGate(root, {}, exit as never)).toThrow("exit");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      chalk.red(
        `✗ 1 service.json file declares a schemaVersion this flisk does not support:\n    services/app/bad-api/service.json schemaVersion 42: this flisk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`,
      ),
    );
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      chalk.gray(
        "  Fix: Upgrade flisk to a version that supports these files. Changing schemaVersion by hand is not a fix",
      ),
    );
  });
});
