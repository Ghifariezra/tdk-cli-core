// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorFactories } from "../../utils/errors.js";

const tilt = vi.hoisted(() => ({
  isTiltAvailable: vi.fn(async () => true),
  runTilt: vi.fn(),
}));
const paths = vi.hoisted(() => ({ findProjectRoot: vi.fn() }));
const secretMock = vi.hoisted(() => ({
  envSecretValues: vi.fn((): string[] => []),
}));

vi.mock("../../utils/tilt.js", () => ({ ...tilt, getTiltfilePath: () => "Tiltfile" }));
vi.mock("../../utils/paths.js", () => paths);
vi.mock("../../utils/secret-redaction.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/secret-redaction.js")>();
  return {
    ...actual,
    envSecretValues: secretMock.envSecretValues,
  };
});

import { EnvUnreadableError } from "../../utils/secret-redaction.js";
import { logsCommand } from "../logs.js";

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: "" });
const resources = (...names: string[]) =>
  ok(JSON.stringify({ items: names.map((name) => ({ metadata: { name } })) }));
const logLine = (message: string) =>
  JSON.stringify({ time: "t", resource: "api", level: "info", source: "runtime", message });

interface Envelope {
  schemaVersion: number;
  data: unknown;
  errors: Array<{ code: string; message: string; suggestions?: string[] }>;
}

let out: string[];
let errors: string[];
let exit: ReturnType<typeof vi.spyOn>;

async function run(...args: string[]): Promise<{ envelope: Envelope; code: number | null }> {
  let code: number | null = null;
  exit.mockImplementation(((c: number) => {
    // runCommand catches the mocked exit and exits again; the first code is the real one.
    code ??= c;
    throw new Error("exit");
  }) as never);
  try {
    await logsCommand.parseAsync(["--json", ...args], { from: "user" });
  } catch (error) {
    if ((error as Error).message !== "exit") throw error;
  }
  return { envelope: JSON.parse(out[0] ?? "null"), code };
}

beforeEach(() => {
  out = [];
  errors = [];
  vi.spyOn(console, "log").mockImplementation((line) => void out.push(String(line)));
  vi.spyOn(console, "error").mockImplementation(
    (...parts) => void errors.push(parts.map(String).join(" ")),
  );
  exit = vi.spyOn(process, "exit");
  paths.findProjectRoot.mockReturnValue("/project");
  tilt.isTiltAvailable.mockResolvedValue(true);
  tilt.isTiltAvailable.mockClear();
  tilt.runTilt.mockReset();
  secretMock.envSecretValues.mockReturnValue([]);
  delete process.env.TILT_PORT;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const option of ["service", "since", "port", "tail"])
    logsCommand.setOptionValue(option, undefined);
  logsCommand.setOptionValue("tail", "200");
  logsCommand.setOptionValue("json", false);
  delete process.env.TILT_PORT;
});

describe("flisk logs --json", () => {
  it("returns one envelope with normalized lines and never follows", async () => {
    tilt.runTilt.mockResolvedValueOnce(ok(`${logLine("hi")}\n`));
    const { envelope, code } = await run("--tail", "5");
    expect(code).toBeNull();
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      data: { services: [], tail: 5, since: null, lines: [{ resource: "api", text: "hi" }] },
      errors: [],
    });
    const args = tilt.runTilt.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--tail", "5", "--json"]));
    expect(args).not.toContain("-f");
    expect(args).not.toContain("--follow");
  });

  it("returns one shared not-in-project error envelope before checking Tilt", async () => {
    paths.findProjectRoot.mockReturnValue(null);

    const { envelope, code } = await run();

    expect(code).toBe(1);
    expect(out).toHaveLength(1);
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      data: null,
      errors: [
        {
          code: "COMMAND_FAILED",
          message: "Could not find project root (no .tdk/project.json found)",
          suggestions: [
            "Run this from within a Flisk project",
            "Run `flisk project --yes` to initialize a new project",
          ],
        },
      ],
    });
    expect(tilt.isTiltAvailable).not.toHaveBeenCalled();
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("prints shared not-in-project suggestions in text mode before checking Tilt", async () => {
    paths.findProjectRoot.mockReturnValue(null);
    let code: number | null = null;
    exit.mockImplementation(((exitCode: number) => {
      code ??= exitCode;
      throw new Error("exit");
    }) as never);

    try {
      await logsCommand.parseAsync([], { from: "user" });
    } catch {
      // The mocked process.exit ends the command under test.
    }

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Could not find project root (no .tdk/project.json found)");
    expect(errors.join("\n")).toContain("Run this from within a Flisk project");
    expect(errors.join("\n")).toContain("Run `flisk project --yes` to initialize a new project");
    expect(tilt.isTiltAvailable).not.toHaveBeenCalled();
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("passes service names after `--` so they cannot be read as flags", async () => {
    tilt.runTilt.mockResolvedValueOnce(resources("api", "-weird")).mockResolvedValueOnce(ok(""));
    await run("--service=api", "--service=-weird");
    const args = tilt.runTilt.mock.calls[1]?.[1] as string[];
    expect(args.slice(-3)).toEqual(["--", "api", "-weird"]);
  });

  it("suggests a close resource name for an unknown service, exit 2", async () => {
    tilt.runTilt.mockResolvedValueOnce(resources("api", "web"));
    const { envelope, code } = await run("-s", "aip");
    expect(code).toBe(2);
    expect(envelope.errors[0]).toMatchObject({
      code: "UNKNOWN_SERVICE",
      suggestions: expect.arrayContaining(['Did you mean "api"?']),
    });
    expect(envelope.errors[0].message).toContain("api, web");
    expect(tilt.runTilt).toHaveBeenCalledTimes(1);
  });

  it("uses the shared unknown-service factory for an unknown Tilt resource", async () => {
    tilt.runTilt.mockResolvedValueOnce(resources("api", "web"));
    const factory = vi.spyOn(errorFactories, "unknownServices");
    const { envelope, code } = await run("-s", "aip");
    expect(code).toBe(2);
    expect(envelope.errors[0].suggestions).toContain('Did you mean "api"?');
    expect(factory).toHaveBeenCalledWith(["aip"], ["api", "web"]);
  });

  it("renders close resource suggestions in text errors", async () => {
    tilt.runTilt.mockResolvedValueOnce(resources("api", "web"));
    const messages: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      messages.push(parts.map(String).join(" "));
    });
    let code: number | null = null;
    exit.mockImplementation(((exitCode: number) => {
      code ??= exitCode;
      throw new Error("exit");
    }) as never);

    try {
      await logsCommand.parseAsync(["-s", "aip"], { from: "user" });
    } catch {
      // The mocked process.exit ends the command under test.
    }

    expect(code).toBe(2);
    expect(messages.join("\n")).toContain('Did you mean "api"?');
  });

  it("omits name suggestions for an unrelated unknown service", async () => {
    tilt.runTilt.mockResolvedValueOnce(resources("api", "web"));
    const { envelope, code } = await run("-s", "completely-unrelated");
    expect(code).toBe(2);
    expect(envelope.errors[0]).toMatchObject({ code: "UNKNOWN_SERVICE" });
    expect(envelope.errors[0].suggestions).toBeUndefined();
  });

  it("reports a missing Tilt binary", async () => {
    tilt.isTiltAvailable.mockResolvedValue(false);
    const { envelope, code } = await run();
    expect(code).toBe(1);
    expect(envelope.errors[0].code).toBe("TILT_MISSING");
  });

  it("labels an unreachable Tilt TILT_NOT_RUNNING", async () => {
    tilt.runTilt.mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "dial tcp: connection refused",
    });
    const { envelope, code } = await run();
    expect(code).toBe(1);
    expect(envelope.errors[0].code).toBe("TILT_NOT_RUNNING");
  });

  it("labels a rejected argument TILT_LOGS_FAILED, not 'stack is down'", async () => {
    tilt.runTilt.mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: 'invalid argument "x" for "--since"',
    });
    const { envelope } = await run();
    expect(envelope.errors[0].code).toBe("TILT_LOGS_FAILED");
  });

  it.each([
    [["--tail", "0"]],
    [["--tail", "10001"]],
    [["--since", ""]],
    [["--since", "5"]],
    [["--port", "65536"]],
  ])("rejects %j as USAGE (exit 2) without calling Tilt", async (args) => {
    const { envelope, code } = await run(...args);
    expect(code).toBe(2);
    expect(envelope.errors[0].code).toBe("USAGE");
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("streams logs directly to stdout with secret redaction in text mode", async () => {
    secretMock.envSecretValues.mockReturnValue(["super-secret-token-1234"]);
    tilt.runTilt.mockResolvedValueOnce(
      ok("connecting to database with token super-secret-token-1234 successfully\n"),
    );

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await logsCommand.parseAsync([], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalledWith(
      "connecting to database with token [REDACTED] successfully\n",
    );
  });

  it("redacts secrets from JSON envelope output", async () => {
    secretMock.envSecretValues.mockReturnValue(["super-secret-password-xyz"]);
    tilt.runTilt.mockResolvedValueOnce(
      ok(`${logLine("database password is super-secret-password-xyz")}\n`),
    );

    const { envelope } = await run();
    expect(JSON.stringify(envelope)).not.toContain("super-secret-password-xyz");
    expect(JSON.stringify(envelope)).toContain("[REDACTED]");
  });

  it("reports ENV_UNREADABLE error in JSON mode when envSecretValues throws EnvUnreadableError", async () => {
    secretMock.envSecretValues.mockImplementation(() => {
      throw new EnvUnreadableError("/project/.env", "permission denied (EACCES)");
    });

    const { envelope, code } = await run();
    expect(code).toBe(1);
    expect(envelope.errors[0]).toMatchObject({
      code: "ENV_UNREADABLE",
      message: "Could not read /project/.env: permission denied (EACCES)",
      suggestions: ["Fix the read permission on .env, or move it out of the project"],
    });
  });

  it("reports ENV_UNREADABLE error in text mode when envSecretValues throws EnvUnreadableError", async () => {
    secretMock.envSecretValues.mockImplementation(() => {
      throw new EnvUnreadableError("/project/.env", "permission denied (EACCES)");
    });

    let code: number | null = null;
    exit.mockImplementation(((c: number) => {
      code ??= c;
      throw new Error("exit");
    }) as never);

    try {
      await logsCommand.parseAsync([], { from: "user" });
    } catch {}

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Could not read /project/.env: permission denied");
    expect(errors.join("\n")).toContain(
      "Fix the read permission on .env, or move it out of the project",
    );
  });

  it("passes custom --port flag to tilt logs command", async () => {
    tilt.runTilt.mockResolvedValueOnce(ok(""));
    await run("--port", "12345");
    const args = tilt.runTilt.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--port", "12345"]));
  });

  it("uses TILT_PORT environment variable when --port is not supplied", async () => {
    process.env.TILT_PORT = "9999";
    tilt.runTilt.mockResolvedValueOnce(ok(""));
    await run();
    const args = tilt.runTilt.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--port", "9999"]));
  });

  it("falls back to standard Tilt UI port (10350) when no port specified", async () => {
    tilt.runTilt.mockResolvedValueOnce(ok(""));
    await run();
    const args = tilt.runTilt.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--port", "10350"]));
  });

  it("passes --since parameter to tilt logs command", async () => {
    tilt.runTilt.mockResolvedValueOnce(ok(""));
    await run("--since", "45s");
    const args = tilt.runTilt.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--since", "45s"]));
  });

  it("tolerates tiltResourceNames listing failure and continues to fetch logs", async () => {
    // When runTilt("get", ["uiresources"...]) returns exitCode 1, tiltResourceNames returns null
    tilt.runTilt
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "not found" })
      .mockResolvedValueOnce(ok(`${logLine("log from svc")}\n`));

    const { envelope, code } = await run("-s", "api");
    expect(code).toBeNull();
    expect(envelope.data).toMatchObject({
      services: ["api"],
      lines: [{ resource: "api", text: "log from svc" }],
    });
  });
});
