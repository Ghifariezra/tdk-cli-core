// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { TdkError } from "../errors.js";
import {
  createMachineEnvelope,
  isMachineOutputEnvelope,
  type MachineOutputEnvelope,
  SCHEMA_VERSION,
  toMachineError,
  writeMachineError,
} from "../machine-output.js";

describe("createMachineEnvelope", () => {
  it("creates envelope with schemaVersion, data, and empty errors array", () => {
    const envelope = createMachineEnvelope({ status: "ready" });
    expect(envelope).toEqual({
      schemaVersion: 1,
      data: { status: "ready" },
      errors: [],
    });
  });

  it("creates envelope with null data and custom errors", () => {
    const errors = [{ code: "ERR_CODE", message: "Error message", suggestions: ["Fix A"] }];
    const envelope = createMachineEnvelope(null, errors);
    expect(envelope).toEqual({
      schemaVersion: 1,
      data: null,
      errors,
    });
  });
});

describe("isMachineOutputEnvelope", () => {
  it("accepts a valid schemaVersion/data/errors envelope", () => {
    const envelope: MachineOutputEnvelope = createMachineEnvelope({ ok: true }, [
      { code: "HINT", message: "optional" },
    ]);
    expect(isMachineOutputEnvelope(envelope)).toBe(true);
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("accepts null data and empty errors", () => {
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: null, errors: [] })).toBe(true);
  });

  it("accepts primitive data types", () => {
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: "string", errors: [] })).toBe(true);
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: 12345, errors: [] })).toBe(true);
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: true, errors: [] })).toBe(true);
  });

  it("accepts error with string array suggestions", () => {
    const envelope = {
      schemaVersion: 1,
      data: null,
      errors: [{ code: "WARN", message: "warning", suggestions: ["run flisk doctor"] }],
    };
    expect(isMachineOutputEnvelope(envelope)).toBe(true);
  });

  it("rejects an unsupported numeric schemaVersion", () => {
    expect(isMachineOutputEnvelope({ schemaVersion: 2, data: null, errors: [] })).toBe(false);
    expect(isMachineOutputEnvelope({ schemaVersion: 0, data: null, errors: [] })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isMachineOutputEnvelope(null)).toBe(false);
    expect(isMachineOutputEnvelope(undefined)).toBe(false);
    expect(isMachineOutputEnvelope("not an envelope")).toBe(false);
    expect(isMachineOutputEnvelope(42)).toBe(false);
    expect(isMachineOutputEnvelope(true)).toBe(false);
  });

  it("rejects envelopes missing required fields or with wrong types", () => {
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: null })).toBe(false);
    expect(isMachineOutputEnvelope({ schemaVersion: "1", data: null, errors: [] })).toBe(false);
    expect(isMachineOutputEnvelope({ schemaVersion: 1, errors: [] })).toBe(false);
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: null, errors: "not array" })).toBe(
      false,
    );
  });

  it("rejects malformed error objects inside errors array", () => {
    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: [null],
      }),
    ).toBe(false);

    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: ["string error"],
      }),
    ).toBe(false);

    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: [{ code: 1, message: "bad code" }],
      }),
    ).toBe(false);

    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: [{ code: "ERR", message: 123 }],
      }),
    ).toBe(false);

    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: [{ code: "X", message: "ok", suggestions: "not array" }],
      }),
    ).toBe(false);

    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: [{ code: "X", message: "ok", suggestions: [123] }],
      }),
    ).toBe(false);
  });
});

describe("toMachineError", () => {
  it("converts TdkError with suggestions to COMMAND_FAILED code", () => {
    const error = new TdkError("Command invalid", ["Use --force", "Re-run init"], 3);
    const result = toMachineError(error);
    expect(result).toEqual({
      error: {
        code: "COMMAND_FAILED",
        message: "Command invalid",
        suggestions: ["Use --force", "Re-run init"],
      },
      exitCode: 3,
    });
  });

  it("converts TdkError without suggestions to COMMAND_FAILED code without suggestions key", () => {
    const error = new TdkError("Simple failure", [], 1);
    const result = toMachineError(error);
    expect(result).toEqual({
      error: {
        code: "COMMAND_FAILED",
        message: "Simple failure",
      },
      exitCode: 1,
    });
  });

  it("converts standard Error to INTERNAL error code with exitCode 2", () => {
    const error = new Error("Database connection dropped");
    const result = toMachineError(error);
    expect(result).toEqual({
      error: {
        code: "INTERNAL",
        message: "Database connection dropped",
      },
      exitCode: 2,
    });
  });

  it("converts string or non-Error thrown value to INTERNAL error", () => {
    const resultStr = toMachineError("fatal failure string");
    expect(resultStr).toEqual({
      error: {
        code: "INTERNAL",
        message: "fatal failure string",
      },
      exitCode: 2,
    });

    const resultObj = toMachineError({ custom: "object" });
    expect(resultObj).toEqual({
      error: {
        code: "INTERNAL",
        message: "[object Object]",
      },
      exitCode: 2,
    });
  });
});

describe("writeMachineError", () => {
  it("outputs machine JSON to stdout, message to stderr, and exits process", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as unknown as (code?: string | number | null | undefined) => never);

    const error = new TdkError("Missing config", ["Run flisk init"], 1);

    expect(() => writeMachineError(error)).toThrow("process.exit called");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const printedJson = JSON.parse(logSpy.mock.calls[0][0]);
    expect(isMachineOutputEnvelope(printedJson)).toBe(true);
    expect(printedJson.data).toBeNull();
    expect(printedJson.errors[0].code).toBe("COMMAND_FAILED");
    expect(printedJson.errors[0].message).toBe("Missing config");
    expect(printedJson.errors[0].suggestions).toEqual(["Run flisk init"]);

    expect(errSpy).toHaveBeenCalledWith("Missing config");
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
