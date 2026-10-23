// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, createTempProject, parseEnvelope, runFlisk } from "../index.js";

describe("runFlisk", () => {
  it("returns status, stdout and stderr of a finished run", () => {
    const result = runFlisk(["--version"], { cwd: createTempDir() });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.stderr).toBe("");
  });

  it("returns a non-zero exit code instead of throwing", () => {
    const result = runFlisk(["stacks", "--json"], { cwd: createTempDir() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root");
  });

  it("throws with the command and directory when the spawn fails", () => {
    const missing = path.join(createTempDir(), "does-not-exist");
    expect(() => runFlisk(["stacks"], { cwd: missing })).toThrow(
      /Could not run `flisk stacks`.*ENOENT/s,
    );
  });

  it("throws when the child is killed by the timeout", () => {
    expect(() => runFlisk(["--version"], { cwd: createTempDir(), timeout: 1 })).toThrow(
      /Could not run|did not exit normally/,
    );
  });

  it("sets NO_COLOR and lets a test remove or override variables", () => {
    const base = { cwd: createTempDir() };
    const project = createTempProject();
    const plain = runFlisk(["projects", "--json"], { cwd: project });
    expect(plain.stdout).not.toContain("\u001b[");
    expect(runFlisk(["--version"], { ...base, env: { NO_COLOR: undefined } }).status).toBe(0);
  });
});

describe("createTempProject", () => {
  it("writes project.json, stacks, resources and generated files from the spec", () => {
    const root = createTempProject({
      stacks: { api: { gateway: { appType: "backend", port: 3100 } } },
      resources: { "worker/queue": { appType: "worker" }, broken: "{invalid\n" },
      generated: ["spec.master"],
      files: { "notes/readme.txt": "hi" },
    });

    expect(JSON.parse(fs.readFileSync(path.join(root, ".tdk", "project.json"), "utf-8"))).toEqual(
      {},
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(root, "services/api/gateway/service.json"), "utf-8")),
    ).toEqual({ appName: "gateway", stack: "api", appType: "backend", port: 3100 });
    expect(
      JSON.parse(fs.readFileSync(path.join(root, "services/worker/queue/service.json"), "utf-8")),
    ).toEqual({ appName: "queue", appType: "worker" });
    expect(fs.readFileSync(path.join(root, "services/broken/service.json"), "utf-8")).toBe(
      "{invalid\n",
    );
    expect(fs.readFileSync(path.join(root, ".tdk/.tdk-out/spec.master"), "utf-8")).toBe("");
    expect(fs.readFileSync(path.join(root, "notes/readme.txt"), "utf-8")).toBe("hi");
  });

  it("omits the .tdk folder when projectJson is null, so flisk finds no project", () => {
    const root = createTempProject({ projectJson: null });
    expect(fs.existsSync(path.join(root, ".tdk"))).toBe(false);
    const result = runFlisk(["stacks", "--json"], { cwd: root });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root");
  });

  const created: string[] = [];
  it("creates a project that flisk can read", () => {
    const root = createTempProject({ stacks: { api: { gateway: { appType: "backend" } } } });
    created.push(root);
    const envelope = parseEnvelope(runFlisk(["stacks", "--json"], { cwd: root }).stdout);
    expect(envelope.data.stacks).toMatchObject([{ name: "api", resourceCount: 1 }]);
  });

  it("removes the project once the test has finished", () => {
    expect(created).toHaveLength(1);
    expect(fs.existsSync(created[0] as string)).toBe(false);
  });
});

describe("parseEnvelope", () => {
  const ok = JSON.stringify({ schemaVersion: 1, data: { x: 1 }, errors: [] });

  it("returns the parsed envelope", () => {
    expect(parseEnvelope(`${ok}\n`)).toEqual({ schemaVersion: 1, data: { x: 1 }, errors: [] });
  });

  it("rejects stdout that is not JSON", () => {
    expect(() => parseEnvelope("Could not find project root\n")).toThrow(/not JSON/);
  });

  it("rejects more than one line", () => {
    expect(() => parseEnvelope(`${ok}\n${ok}\n`)).toThrow(/single JSON line/);
    expect(() => parseEnvelope("")).toThrow();
  });

  it("rejects JSON without the envelope keys", () => {
    expect(() => parseEnvelope(JSON.stringify({ schemaVersion: 1, data: null }))).toThrow();
    expect(() =>
      parseEnvelope(JSON.stringify({ schemaVersion: 1, data: 1, errors: [], x: 1 })),
    ).toThrow();
    expect(() => parseEnvelope("null")).toThrow();
  });
});
