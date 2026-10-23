// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The CLI entry point the tests run, resolved once. */
export const fliskBin = path.resolve(here, "../../bin/tdk.js");

export interface FliskRunOptions {
  cwd: string;
  /** Written to the child's stdin. */
  input?: string;
  /** Merged over `process.env` and `NO_COLOR=1`. A value of `undefined` removes the variable. */
  env?: Record<string, string | undefined>;
  /** Kill the child after this many milliseconds. */
  timeout?: number;
}

export interface FliskRunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs `flisk <args>` in a child process and returns its exit status and output.
 * Throws when the child could not run to completion (spawn error, timeout or signal), so a test never reads
 * `status: null` as an exit code.
 */
export function runFlisk(args: readonly string[], options: FliskRunOptions): FliskRunResult {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1", ...options.env };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }
  const result = spawnSync(process.execPath, [fliskBin, ...args], {
    cwd: options.cwd,
    encoding: "utf-8",
    input: options.input,
    env: env as NodeJS.ProcessEnv,
    timeout: options.timeout,
  });
  const command = `flisk ${args.join(" ")}`;
  if (result.error) {
    throw new Error(`Could not run \`${command}\` in ${options.cwd}: ${result.error.message}`);
  }
  if (result.status === null) {
    throw new Error(`\`${command}\` did not exit normally (signal ${result.signal ?? "unknown"})`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
