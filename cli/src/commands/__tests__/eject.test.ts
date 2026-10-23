// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";
import { promptConfirm } from "../../utils/prompt.js";
import {
  EJECTED_CONTENT,
  ejectCommand,
  TILT_UP_COMMAND,
  TILTFILE_RELATIVE_PATH,
} from "../eject.js";

vi.mock("../../utils/prompt.js", () => ({
  promptConfirm: vi.fn(),
}));

const originalCwd = process.cwd();

describe("flisk eject", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tdk-eject-test-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".tdk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/**"] },
      }),
    );
    mkdirSync(join(tempDir, ".tdk", ".tdk-out"), { recursive: true });
    writeFileSync(join(tempDir, ".tdk", ".tdk-out", "Tiltfile"), "# generated\n");
    writeFileSync(join(tempDir, ".tdk", ".tdk-out", "docker-compose.yml"), "services: {}\n");
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists kept and created files in dry-run without writing", async () => {
    writeFileSync(join(tempDir, "Tiltfile"), "# user-owned\n");
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));

    try {
      await ejectCommand.parseAsync(["node", "flisk", "--dry-run"], { from: "node" });
    } finally {
      console.log = originalLog;
    }

    const dryRunOutput = output.join("\n");
    expect(dryRunOutput).toContain("Generated files, left where they are (git-ignored):");
    expect(dryRunOutput).toContain(join(".tdk", ".tdk-out", "Tiltfile"));
    expect(dryRunOutput).toContain(
      "Root Tiltfile, left where it is (not generated, not git-ignored):\n  Tiltfile\nFiles written:",
    );
    expect(dryRunOutput).toContain("Files written:\n  EJECTED.md");
    expect(existsSync(join(tempDir, "EJECTED.md"))).toBe(false);
  });

  it("writes EJECTED.md and prints a tilt command that points at the real Tiltfile", async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));

    try {
      await ejectCommand.parseAsync(["node", "flisk", "--yes"], { from: "node" });
    } finally {
      console.log = originalLog;
    }

    expect(readFileSync(join(tempDir, "EJECTED.md"), "utf-8")).toBe(EJECTED_CONTENT);
    expect(output).toEqual([
      "Wrote EJECTED.md. Nothing was copied, moved or generated.",
      "Generated files stay in .tdk/.tdk-out/ (git-ignored) and still need Flisk inputs.",
      "Run from the project root: tilt up -f .tdk/.tdk-out/Tiltfile -- --focus=<stack>",
      "Replace <stack> with a stack name under services/, or omit --focus to use the Tiltfile's default phase.",
      "Read EJECTED.md",
    ]);
    // `flisk up` passes this exact file to Tilt; there is no Tiltfile at the project root.
    expect(TILTFILE_RELATIVE_PATH).toBe(".tdk/.tdk-out/Tiltfile");
    expect(TILT_UP_COMMAND).toContain("-f .tdk/.tdk-out/Tiltfile");
    expect(existsSync(join(tempDir, "Tiltfile"))).toBe(false);
  });

  it("writes only EJECTED.md and does not claim files it did not create", async () => {
    const before = readdirSync(tempDir, { recursive: true }).map(String).sort();
    const originalLog = console.log;
    console.log = () => {};
    try {
      await ejectCommand.parseAsync(["node", "flisk", "--yes"], { from: "node" });
    } finally {
      console.log = originalLog;
    }
    const after = readdirSync(tempDir, { recursive: true }).map(String).sort();
    expect(after.filter((p) => !before.includes(p))).toEqual(["EJECTED.md"]);

    expect(EJECTED_CONTENT).not.toMatch(/^Keep:/m);
    expect(EJECTED_CONTENT).not.toContain("compose files Flisk wrote");
    expect(EJECTED_CONTENT).toContain("written by Tilt when it runs");
    expect(EJECTED_CONTENT).toContain("`service.json` files");
    expect(EJECTED_CONTENT).toContain("`flisk config regenerate`");
    expect(EJECTED_CONTENT).toContain("no Tiltfile at the project root");
  });

  it("leaves an existing EJECTED.md alone and says so", async () => {
    writeFileSync(join(tempDir, "EJECTED.md"), "mine\n");
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    try {
      await ejectCommand.parseAsync(["node", "flisk", "--yes"], { from: "node" });
    } finally {
      console.log = originalLog;
    }
    expect(readFileSync(join(tempDir, "EJECTED.md"), "utf-8")).toBe("mine\n");
    expect(output[0]).toContain("EJECTED.md already exists and was left unchanged");
  });

  it("requires a Flisk project", async () => {
    rmSync(join(tempDir, ".tdk", "project.json"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { expectExit } = captureExit();
    try {
      await expect(
        ejectCommand.parseAsync(["node", "flisk", "--dry-run"], { from: "node" }),
      ).rejects.toThrow("process.exit");
      const output = error.mock.calls.flat().join("\n");
      expect(output).toContain("Could not find project root (no .tdk/project.json found)");
      expect(output).toContain("Run this from within a Flisk project");
      expect(output).toContain("Run `flisk project --yes` to initialize a new project");
      expectExit(1);
    } finally {
      error.mockRestore();
    }
  });

  it("fails with an informative error when generated Tilt files are missing", async () => {
    rmSync(join(tempDir, ".tdk", ".tdk-out", "Tiltfile"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { expectExit } = captureExit();
    try {
      await expect(
        ejectCommand.parseAsync(["node", "flisk", "--yes"], { from: "node" }),
      ).rejects.toThrow("process.exit");
      const output = error.mock.calls.flat().join("\n");
      expect(output).toContain(
        "Generated Tilt files are missing. Run `flisk project --yes` before ejecting.",
      );
      expectExit(1);
    } finally {
      error.mockRestore();
    }
  });

  it("aborts eject and writes nothing when user declines confirmation", async () => {
    vi.mocked(promptConfirm).mockResolvedValue(false);
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    try {
      await ejectCommand.parseAsync(["node", "flisk"], { from: "node" });
    } finally {
      console.log = originalLog;
    }
    expect(existsSync(join(tempDir, "EJECTED.md"))).toBe(false);
  });

  it("proceeds with eject when user accepts confirmation prompt without --yes flag", async () => {
    vi.mocked(promptConfirm).mockResolvedValue(true);
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    try {
      await ejectCommand.parseAsync(["node", "flisk"], { from: "node" });
    } finally {
      console.log = originalLog;
    }
    expect(existsSync(join(tempDir, "EJECTED.md"))).toBe(true);
    expect(output).toContain("Wrote EJECTED.md. Nothing was copied, moved or generated.");
  });

  it("prints (none) for files written in dry run when EJECTED.md already exists", async () => {
    writeFileSync(join(tempDir, "EJECTED.md"), "already exists\n");
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    try {
      await ejectCommand.parseAsync(["node", "flisk", "--dry-run"], { from: "node" });
    } finally {
      console.log = originalLog;
    }
    const text = output.join("\n");
    expect(text).toContain("Files written:\n  (none)");
  });

  it("omits root Tiltfile section in dry run when root Tiltfile is absent", async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    try {
      await ejectCommand.parseAsync(["node", "flisk", "--dry-run"], { from: "node" });
    } finally {
      console.log = originalLog;
    }
    const text = output.join("\n");
    expect(text).not.toContain("Root Tiltfile, left where it is");
  });
});
