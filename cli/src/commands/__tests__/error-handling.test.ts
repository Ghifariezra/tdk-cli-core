// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyMasterConfigs } from "../../generator/template-engine.js";
import { captureExit } from "../../test-support/index.js";
import { checkPrismaConsistency } from "../../utils/doctor-wiring.js";
import {
  errorFactories,
  requireProjectRoot,
  runCommand,
  showError,
  showErrorAndExit,
  TdkError,
} from "../../utils/errors.js";
import { evaluateSharedPlatformPostgres } from "../../utils/shared-platform-postgres.js";
import {
  createKebabCaseValidator,
  isValidPort,
  validateResourceName,
} from "../../utils/validation.js";
import { completionCommand } from "../completion.js";
import { configCommand } from "../config.js";
import {
  DRIFT_EXIT_CODE,
  enforceDriftGate,
  enforceVersionFloor,
  nativeWindowsUpRefusal,
} from "../up.js";

vi.mock("../../generator/template-engine.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../generator/template-engine.js")>()),
  verifyMasterConfigs: vi.fn(),
}));

vi.mock("../../utils/doctor-wiring.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/doctor-wiring.js")>()),
  checkPrismaConsistency: vi.fn(),
}));

vi.mock("../../utils/shared-platform-postgres.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/shared-platform-postgres.js")>()),
  evaluateSharedPlatformPostgres: vi.fn(),
}));

vi.mock("../../utils/errors.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/errors.js")>();
  return {
    ...actual,
    requireProjectRoot: vi.fn(actual.requireProjectRoot),
  };
});

describe("error handling", () => {
  describe("resource name validation", () => {
    it("should validate resource names using actual validation utility", () => {
      expect(validateResourceName("my-service")).toEqual({ valid: true });
      expect(validateResourceName("service123")).toEqual({ valid: true });
      expect(validateResourceName("api-gateway")).toEqual({ valid: true });

      expect(validateResourceName("")).toEqual({
        valid: false,
        error: "Resource name is required",
      });
      expect(validateResourceName("MyService")).toEqual({
        valid: false,
        error:
          'Resource name "MyService" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-service".',
      });
      expect(validateResourceName("my_service")).toEqual({
        valid: false,
        error:
          'Resource name "my_service" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-service".',
      });
    });

    it("should create kebab-case validators for different contexts", () => {
      const resourceValidator = createKebabCaseValidator("resource");
      const stackValidator = createKebabCaseValidator("stack");

      expect(resourceValidator("my-resource")).toBe(true);
      expect(resourceValidator("")).toBe("Resource name is required");
      expect(resourceValidator("MyResource")).toBe(
        'Resource name "MyResource" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-service".',
      );

      expect(stackValidator("my-stack")).toBe(true);
      expect(stackValidator("")).toBe("Stack name is required");
      expect(stackValidator("MyStack")).toBe(
        'Stack name "MyStack" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-stack".',
      );
    });
  });

  describe("port assignment", () => {
    it("should validate port is within valid range using isValidPort", () => {
      // Valid ports (isValidPort allows ports 1-65535, not just 1024+)
      expect(isValidPort(3000)).toBe(true);
      expect(isValidPort(8080)).toBe(true);
      expect(isValidPort(1024)).toBe(true);
      expect(isValidPort(1)).toBe(true); // Valid per isValidPort (just > 0)
      expect(isValidPort(65535)).toBe(true);

      // Invalid ports
      expect(isValidPort(65536)).toBe(false);
      expect(isValidPort(0)).toBe(false);
      expect(isValidPort(-1)).toBe(false);
    });
  });

  describe("stack name validation", () => {
    it("should validate stack name format using createKebabCaseValidator", () => {
      const validNames = ["main", "api-services", "v1-stack", "test123"];

      const invalidNames = ["My Stack", "my_stack", "MyStack", ""];

      const stackValidator = createKebabCaseValidator("stack");

      for (const name of validNames) {
        expect(stackValidator(name)).toBe(true);
      }

      for (const name of invalidNames) {
        expect(typeof stackValidator(name)).toBe("string");
      }
    });
  });

  describe("unified error formatting and exit codes", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("formats showError and showErrorAndExit with the standard ❌ prefix", () => {
      const stderr: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args) => {
        stderr.push(args.map(String).join(" "));
      });
      const { expectExit } = captureExit();

      showError("Unsupported shell: fish-custom");
      expect(stderr[0]).toContain("❌ Unsupported shell: fish-custom");

      stderr.length = 0;
      expect(() => showErrorAndExit("--port must be a valid port number", 2)).toThrow(
        "process.exit",
      );
      expect(stderr[0]).toContain("❌ --port must be a valid port number");
      expectExit(2);
    });

    it("routes unexpected and TdkError failures in runCommand through showError", async () => {
      const stderr: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args) => {
        stderr.push(args.map(String).join(" "));
      });
      const { exit } = captureExit();

      await expect(
        runCommand(async () => {
          throw new Error(".tdk/project.json not found");
        }),
      ).rejects.toThrow("process.exit");
      expect(stderr[0]).toContain("❌ .tdk/project.json not found");
      expect(exit).toHaveBeenCalledWith(1);

      stderr.length = 0;
      exit.mockClear();
      await expect(
        runCommand(async () => {
          throw errorFactories.unknownServices(["bad-svc"], ["orders-api"]);
        }),
      ).rejects.toThrow("process.exit");
      expect(stderr[0]).toContain("❌ Unknown service bad-svc. Valid names: orders-api");
      expect(exit).toHaveBeenCalledWith(2);

      stderr.length = 0;
      exit.mockClear();
      await expect(
        runCommand(async () => {
          throw new TdkError("Custom failure", ["Try 'flisk doctor'"], 1);
        }),
      ).rejects.toThrow("process.exit");
      expect(stderr[0]).toContain("❌ Custom failure");
      expect(stderr.join("\n")).toContain("→ Try 'flisk doctor'");
      expect(exit).toHaveBeenCalledWith(1);
    });

    it("keeps DRIFT_EXIT_CODE as 2 for flisk up drift gate", () => {
      expect(DRIFT_EXIT_CODE).toBe(2);
    });

    it("exits with code 1 on native Windows startup refusal", () => {
      const refusal = nativeWindowsUpRefusal("win32", undefined);
      expect(refusal).toBeDefined();

      const stderr: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args) => {
        stderr.push(args.map(String).join(" "));
      });
      const { expectExit } = captureExit();

      expect(() => showErrorAndExit(refusal ?? "")).toThrow("process.exit");
      expect(stderr[0]).toContain("❌");
      expectExit(1);
    });

    it("emits drift detection errors exactly once to stderr and keeps stdout clean", () => {
      vi.mocked(verifyMasterConfigs).mockReturnValue({
        valid: false,
        errors: ["services/shop/api/.autogenerated/Dockerfile: differs"],
        warnings: [],
        diffs: [],
        handEdited: ["services/shop/api/.autogenerated/Dockerfile"],
      });

      const stderr: string[] = [];
      const stdout: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args) => {
        stderr.push(args.map(String).join(" "));
      });
      const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
        stdout.push(args.map(String).join(" "));
      });
      const { exit, expectExit } = captureExit();
      const exitFn = exit as unknown as (code: number) => never;

      expect(() => enforceDriftGate("/mock-project", {}, exitFn)).toThrow("process.exit");
      expectExit(DRIFT_EXIT_CODE);

      expect(stdout).toHaveLength(0);
      expect(logSpy).not.toHaveBeenCalled();

      const errorSymbols = stderr.flatMap((line) => line.match(/❌/g) ?? []);
      expect(errorSymbols).toHaveLength(1);
      expect(stderr.join("\n")).toContain(
        "Generated files were edited by hand and no longer match service.json",
      );
      expect(stderr.join("\n")).toContain("services/shop/api/.autogenerated/Dockerfile");
    });

    it("emits version floor errors with message and fix combined into a single diagnostic", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "tdk-version-test-"));
      try {
        mkdirSync(join(tempDir, ".tdk"), { recursive: true });
        writeFileSync(
          join(tempDir, ".tdk", "project.json"),
          JSON.stringify({ minTdkVersion: "2.0.0" }),
          "utf-8",
        );

        const stderr: string[] = [];
        const stdout: string[] = [];
        vi.spyOn(console, "error").mockImplementation((...args) => {
          stderr.push(args.map(String).join(" "));
        });
        const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
          stdout.push(args.map(String).join(" "));
        });
        const { exit, expectExit } = captureExit();
        const exitFn = exit as unknown as (code: number) => never;

        expect(() => enforceVersionFloor(tempDir, {}, "1.3.183", exitFn)).toThrow("process.exit");
        expectExit(1);

        expect(stdout).toHaveLength(0);
        expect(logSpy).not.toHaveBeenCalled();

        const errorSymbols = stderr.flatMap((line) => line.match(/❌/g) ?? []);
        expect(errorSymbols).toHaveLength(1);
        expect(stderr.join("\n")).toContain("1.3.183");
        expect(stderr.join("\n")).toContain("2.0.0");
        expect(stderr.join("\n")).toContain("flisk upgrade");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("emits unsupported shell errors exactly once to stderr and keeps stdout clean for piping", async () => {
      const stderr: string[] = [];
      const stdout: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args) => {
        stderr.push(args.map(String).join(" "));
      });
      const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
        stdout.push(args.map(String).join(" "));
      });
      const { expectExit } = captureExit();

      await expect(
        completionCommand.parseAsync(["node", "flisk", "bogus-shell"], { from: "node" }),
      ).rejects.toThrow("process.exit");
      expectExit(1);

      expect(stdout).toHaveLength(0);
      expect(logSpy).not.toHaveBeenCalled();

      const errorSymbols = stderr.flatMap((line) => line.match(/❌/g) ?? []);
      expect(errorSymbols).toHaveLength(1);
      expect(stderr.join("\n")).toContain("❌ Unsupported shell: bogus-shell");
      expect(stderr.join("\n")).toContain("Supported shells: bash, zsh, fish, powershell");
    });

    it("routes config consistency diagnostics to stderr and never to stdout", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "tdk-config-verify-"));
      try {
        vi.mocked(requireProjectRoot).mockReturnValue(tempDir);
        vi.mocked(verifyMasterConfigs).mockReturnValue({
          valid: true,
          errors: [],
          warnings: [],
          diffs: [],
          handEdited: [],
        });
        vi.mocked(evaluateSharedPlatformPostgres).mockReturnValue({
          featureOn: false,
          featureOnFromProjectJson: false,
          featureOnFromTiltfile: false,
          featureOnFromSpecMaster: false,
          focusWouldEnableDatabaseManagement: false,
          dependsOnUsers: [],
          willStart: false,
          reason: "none",
          unknownDependsOnNames: [],
        });
        vi.mocked(checkPrismaConsistency).mockReturnValue({
          name: "prisma-consistency",
          didPass: false,
          message: "Prisma schema is out of sync with migrations",
        });

        const stderr: string[] = [];
        const stdout: string[] = [];
        vi.spyOn(console, "error").mockImplementation((...args) => {
          stderr.push(args.map(String).join(" "));
        });
        vi.spyOn(console, "log").mockImplementation((...args) => {
          stdout.push(args.map(String).join(" "));
        });
        const { expectExit } = captureExit();

        await expect(
          configCommand.parseAsync(["node", "flisk", "verify"], { from: "node" }),
        ).rejects.toThrow("process.exit");
        expectExit(1);

        const stderrMatches = stderr.filter((line) =>
          line.includes("❌ Prisma schema is out of sync with migrations"),
        );
        expect(stderrMatches).toHaveLength(1);

        const stdoutMatches = stdout.filter((line) =>
          line.includes("Prisma schema is out of sync with migrations"),
        );
        expect(stdoutMatches).toHaveLength(0);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
