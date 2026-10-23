// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnvelope } from "../../test-support/index.js";
import { STANDARD_PORTS } from "../../utils/constants.js";
import { ProcessExitError } from "../../utils/errors.js";
import { restartCommand } from "../restart.js";

const paths = vi.hoisted(() => ({
  findProjectRoot: vi.fn<() => string | null>(),
}));

const tilt = vi.hoisted(() => ({
  isTiltAvailable: vi.fn<() => Promise<boolean>>(),
  runTilt:
    vi.fn<
      (
        command: string,
        args: string[],
        options?: { inheritStdio?: boolean },
      ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
    >(),
}));

vi.mock("../../utils/paths.js", () => paths);
vi.mock("../../utils/tilt.js", () => tilt);

interface EnvelopeResult {
  schemaVersion: number;
  data: { resource: string; restarted: boolean } | null;
  errors: Array<{ code: string; message: string; suggestions?: string[] }>;
}

let stdout: string[];
let stderr: string[];
let capturedExitCode: number | null;

async function runRestart(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  envelope: EnvelopeResult | null;
}> {
  stdout = [];
  stderr = [];
  capturedExitCode = null;

  try {
    await restartCommand.parseAsync(args, { from: "user" });
  } catch (error) {
    if (!(error instanceof ProcessExitError) && (error as Error).message !== "exit") throw error;
  }

  const rawStdout = stdout.join("\n");
  let envelope: EnvelopeResult | null = null;
  if (rawStdout.trim().startsWith("{")) {
    try {
      envelope = parseEnvelope(rawStdout) as EnvelopeResult;
    } catch {
      envelope = null;
    }
  }

  return {
    stdout: rawStdout,
    stderr: stderr.join("\n"),
    exitCode: capturedExitCode,
    envelope,
  };
}

describe("restart command unit tests", () => {
  const originalTiltPort = process.env.TILT_PORT;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    capturedExitCode = null;

    vi.spyOn(console, "log").mockImplementation((...parts) => {
      stdout.push(parts.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...parts) => {
      stderr.push(parts.join(" "));
    });

    vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      capturedExitCode ??= code;
      throw new ProcessExitError(code);
    }) as never);

    paths.findProjectRoot.mockReturnValue("/workspace/myproject");
    tilt.isTiltAvailable.mockResolvedValue(true);
    tilt.runTilt.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restartCommand.setOptionValue("json", false);
    restartCommand.setOptionValue("port", undefined);
    if (originalTiltPort !== undefined) {
      process.env.TILT_PORT = originalTiltPort;
    } else {
      delete process.env.TILT_PORT;
    }
  });

  it("fails with USAGE error in --json mode when --port is invalid", async () => {
    const { envelope, exitCode, stderr } = await runRestart([
      "api",
      "--port",
      "not-a-port",
      "--json",
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("--port must be a valid port number");
    expect(envelope?.errors[0]).toEqual({
      code: "USAGE",
      message: "--port must be a valid port number",
    });
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("fails with USAGE error in --json mode when TILT_PORT env is invalid", async () => {
    process.env.TILT_PORT = "70000";
    const { envelope, exitCode, stderr } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("TILT_PORT must be a valid port number");
    expect(envelope?.errors[0]).toEqual({
      code: "USAGE",
      message: "TILT_PORT must be a valid port number",
    });
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("fails with COMMAND_FAILED error when executed outside a Flisk project", async () => {
    paths.findProjectRoot.mockReturnValue(null);

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("COMMAND_FAILED");
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING when isTiltAvailable returns false", async () => {
    tilt.isTiltAvailable.mockResolvedValue(false);

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(envelope?.errors[0]?.message).toContain(String(STANDARD_PORTS.tiltUi));
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING when isTiltAvailable throws", async () => {
    tilt.isTiltAvailable.mockRejectedValue(new Error("Tilt check crashed"));

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING when trigger output indicates connection failure", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "connect: connection refused",
    });

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(envelope?.errors[0]?.message).toContain("Start it with: flisk up");
  });

  it("reports TILT_TRIGGER_FAILED when trigger fails with a non-connection error", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: 'resource "unknown-service" not found',
    });

    const { envelope, exitCode } = await runRestart(["unknown-service", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]).toEqual({
      code: "TILT_TRIGGER_FAILED",
      message: 'resource "unknown-service" not found',
    });
  });

  it("triggers restart successfully in --json mode", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 0,
      stdout: "triggering api",
      stderr: "",
    });

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBeNull(); // succeeded without process.exit(1/2)
    expect(envelope?.schemaVersion).toBe(1);
    expect(envelope?.data).toEqual({
      resource: "api",
      restarted: true,
    });
    expect(envelope?.errors).toEqual([]);
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["api", "--port", "10350"], {
      inheritStdio: false,
    });
  });

  it("triggers restart successfully in text mode", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    const { stdout, exitCode } = await runRestart(["web"]);

    expect(exitCode).toBeNull();
    expect(stdout).toContain("Triggered restart for web");
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["web", "--port", "10350"], {
      inheritStdio: false,
    });
  });

  it("resolves port precedence: --port flag > TILT_PORT env > default", async () => {
    // 1. With --port flag overriding TILT_PORT
    process.env.TILT_PORT = "10400";
    await runRestart(["api", "--port", "10500", "--json"]);
    expect(tilt.runTilt).toHaveBeenLastCalledWith("trigger", ["api", "--port", "10500"], {
      inheritStdio: false,
    });

    // 2. Without --port flag, uses TILT_PORT
    restartCommand.setOptionValue("port", undefined);
    process.env.TILT_PORT = "10400";
    await runRestart(["api", "--json"]);
    expect(tilt.runTilt).toHaveBeenLastCalledWith("trigger", ["api", "--port", "10400"], {
      inheritStdio: false,
    });

    // 3. Without --port and without TILT_PORT, uses default (10350)
    delete process.env.TILT_PORT;
    restartCommand.setOptionValue("port", undefined);
    await runRestart(["api", "--json"]);
    expect(tilt.runTilt).toHaveBeenLastCalledWith("trigger", ["api", "--port", "10350"], {
      inheritStdio: false,
    });
  });
});
