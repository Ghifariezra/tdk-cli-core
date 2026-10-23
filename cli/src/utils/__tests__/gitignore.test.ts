// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureGitignore,
  ensureSmokeRecordsIgnored,
  isInsideGitWorkTree,
} from "../file-helpers.js";

describe("ensureGitignore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-gitignore-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates .gitignore with .env and generated output", () => {
    expect(ensureGitignore(dir)).toEqual([
      ".env",
      ".tdk/.tdk-out/",
      ".tdk/.project-id",
      ".tdk/smoke/",
      "node_modules/",
    ]);
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(".env\n");
  });

  it("appends only what's missing and keeps existing lines", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules\ndist");
    expect(ensureGitignore(dir)).toEqual([
      ".env",
      ".tdk/.tdk-out/",
      ".tdk/.project-id",
      ".tdk/smoke/",
    ]);
    const content = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(content.startsWith("node_modules\ndist\n")).toBe(true);
  });

  it("is a no-op the second time", () => {
    ensureGitignore(dir);
    expect(ensureGitignore(dir)).toEqual([]);
  });

  it("handles CRLF line breaks in existing .gitignore", () => {
    writeFileSync(join(dir, ".gitignore"), "dist\r\n.env\r\nnode_modules\r\n");
    expect(ensureGitignore(dir)).toEqual([".tdk/.tdk-out/", ".tdk/.project-id", ".tdk/smoke/"]);
  });

  it("handles padded whitespace and duplicate entries in existing .gitignore", () => {
    writeFileSync(join(dir, ".gitignore"), "  .env  \n.env\n\t.tdk/.project-id\t\nnode_modules/\n");
    expect(ensureGitignore(dir)).toEqual([".tdk/.tdk-out/", ".tdk/smoke/"]);
  });

  it("does not mistake .env.example or .env.local for .env", () => {
    writeFileSync(join(dir, ".gitignore"), ".env.example\n.env.local\n");
    const added = ensureGitignore(dir);
    expect(added).toContain(".env");
  });
});

describe("isInsideGitWorkTree", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-git-tree-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is false for a directory that is not in a repository", () => {
    expect(isInsideGitWorkTree(dir)).toBe(false);
  });

  it("is true when an ancestor holds the .git directory of a clone", () => {
    mkdirSync(join(dir, ".git"));
    const nested = join(dir, "services", "api");
    mkdirSync(nested, { recursive: true });
    expect(isInsideGitWorkTree(nested)).toBe(true);
  });

  it("is true when the .git file of a linked worktree is there", () => {
    writeFileSync(join(dir, ".git"), "gitdir: /elsewhere/.git/worktrees/name");
    expect(isInsideGitWorkTree(dir)).toBe(true);
  });

  it("terminates and returns false at root filesystem", () => {
    const rootDir = parse ? parse(process.cwd()).root : "/";
    expect(isInsideGitWorkTree(rootDir)).toBe(existsSync(join(rootDir, ".git")));
  });
});

describe("ensureSmokeRecordsIgnored", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-smoke-ignore-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("adds the ignore entry in a git working tree", () => {
    mkdirSync(join(dir, ".git"));
    expect(ensureSmokeRecordsIgnored(dir)).toBeUndefined();
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(".tdk/smoke/");
  });

  it("writes nothing outside a git working tree", () => {
    expect(ensureSmokeRecordsIgnored(dir)).toBeUndefined();
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("warns instead of failing when the ignore entry cannot be written", () => {
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, ".gitignore"));
    const warning = ensureSmokeRecordsIgnored(dir);
    expect(warning).toMatch(/Git may track the smoke response records/);
  });
});
