// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { Command } from "commander";
import { vi } from "vitest";
import { ProcessExitError } from "../utils/errors.js";
import { captureExit } from "./doubles.js";

export interface InProcessRun {
  /** What the command wrote with `console.log` and `process.stdout.write`. */
  stdout: string;
  /** What the command wrote with `console.error` and `process.stderr.write`. */
  stderr: string;
  /** The code passed to `process.exit`, or `undefined` when the command returned without exiting. */
  status: number | undefined;
}

/**
 * Runs a Commander command object in-process from `cwd` and captures its output. Use it for envelope-only and
 * flag-only cases; a case that exercises the top-level handler or the real request path stays a `runFlisk` spawn.
 * `process.exit` throws through `captureExit`, so the run stops where the command would exit. Commander keeps option
 * values between calls, so pass every flag a case needs on each call and never rely on an earlier one being absent.
 * The caller clears any discovery cache first, for example with `clearDiscoveryCache()`.
 */
export async function runCommandInProcess(
  command: Command,
  args: readonly string[],
  cwd: string,
): Promise<InProcessRun> {
  const exit = captureExit();
  let stdout = "";
  let stderr = "";
  const capture = (sink: "stdout" | "stderr") => (chunk: unknown) => {
    if (sink === "stdout") stdout += String(chunk);
    else stderr += String(chunk);
    return true;
  };
  const out = vi.spyOn(process.stdout, "write").mockImplementation(capture("stdout") as never);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(capture("stderr") as never);
  const log = vi.spyOn(console, "log").mockImplementation((...lines: unknown[]) => {
    stdout += `${lines.map(String).join(" ")}\n`;
  });
  const errorLog = vi.spyOn(console, "error").mockImplementation((...lines: unknown[]) => {
    stderr += `${lines.map(String).join(" ")}\n`;
  });
  const cwdBefore = process.cwd();
  process.chdir(cwd);
  let status: number | undefined;
  try {
    await command.parseAsync([...args], { from: "user" }).catch((error: unknown) => {
      if (!(error instanceof ProcessExitError)) throw error;
    });
  } finally {
    // Read the exit code before the restore: mockRestore clears the spy's recorded calls.
    status = exit.exit.mock.calls[0]?.[0];
    process.chdir(cwdBefore);
    out.mockRestore();
    err.mockRestore();
    log.mockRestore();
    errorLog.mockRestore();
    exit.exit.mockRestore();
  }
  return { stdout, stderr, status };
}
