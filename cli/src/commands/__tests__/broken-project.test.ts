// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The broken-project fixture (#1386), the part that needs no Docker or Tilt. Scenarios 3 (unhealthy service) and 4
// (interrupted up) need a running stack, so they live in tests/e2e/journeys/broken-project.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject, runFlisk } from "../../test-support/index.js";

interface DoctorCheck {
  name: string;
  didPass: boolean;
  message: string;
  fix?: string;
}

describe("broken project: bad service.json", () => {
  it("refuses flisk up before startup and leaves no generated stack behind", () => {
    // A truncated service.json, next to a valid one: the whole run must stop before anything is generated.
    const root = createTempProject({
      projectJson: {},
      resources: {
        "app/api": { appType: "backend", stack: "app", schemaVersion: 1, port: 3000 },
      },
      files: {
        "services/app/broken/service.json": '{"appName":"broken","appType":"backend","stack":"app"',
      },
    });

    const result = runFlisk(["up"], { cwd: root, timeout: 60_000 });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /Invalid service\.json at .*services\/app\/broken\/service\.json/,
    );
    expect(result.stderr).toMatch(/invalid JSON/);
    // Nothing was generated and no Tilt was started for the project.
    expect(existsSync(join(root, ".tdk", ".tdk-out"))).toBe(false);
  });
});

describe("broken project: missing dependency", () => {
  it("doctor names the unknown dependsOn target and how to fix it", () => {
    const root = createTempProject({
      projectJson: {},
      resources: {
        "app/api": {
          appType: "backend",
          stack: "app",
          schemaVersion: 1,
          port: 3000,
          dependsOn: ["ghost-service"],
        },
      },
    });

    // `flisk doctor` exits non-zero here (the environment checks are not what this test is about), so read the JSON, not the status.
    const result = runFlisk(["doctor", "--json"], { cwd: root, timeout: 120_000 });
    const report = JSON.parse(result.stdout) as {
      data: { checks: DoctorCheck[] };
    };
    const check = report.data.checks.find((c) => c.message.includes("unknown dependsOn name"));

    expect(check).toBeDefined();
    expect(check?.didPass).toBe(false);
    // The missing requirement is named, with the service that asks for it ...
    expect(check?.message).toContain('"ghost-service"');
    expect(check?.message).toContain("(from api)");
    // ... and the fix says what to change.
    expect(check?.fix).toMatch(/"postgres" or "database-management"/);
    expect(check?.fix).toMatch(/fix the name to match an existing service/);
  }, 150_000);
});
