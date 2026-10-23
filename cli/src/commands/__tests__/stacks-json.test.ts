// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

describe("flisk resources and stacks --json", () => {
  function createProject(includeResources = true): string {
    return createTempProject(
      includeResources
        ? {
            stacks: { api: { gateway: { appType: "backend", port: 3100 } } },
            resources: { "worker/queue": { appType: "worker" } },
          }
        : {},
    );
  }

  function run(args: string[], includeResources = true) {
    return runFlisk(args, { cwd: createProject(includeResources) });
  }

  it("prints stack names and counts in a versioned JSON report", () => {
    const result = run(["stacks", "--json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseEnvelope(result.stdout)).toMatchObject({
      schemaVersion: 1,
      data: { stacks: [{ name: "api", resourceCount: 1 }] },
      errors: [],
    });
    expect(result.stdout).not.toContain(String.fromCharCode(27));
  });

  it("prints an empty stack list as JSON instead of a human empty state", () => {
    const result = run(["stacks", "--json"], false);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseEnvelope(result.stdout)).toMatchObject({
      schemaVersion: 1,
      data: { stacks: [] },
      errors: [],
    });
  });

  it("includes service names when --services is combined with --json", () => {
    const result = run(["stacks", "--services", "--json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseEnvelope(result.stdout)).toMatchObject({
      data: {
        stacks: [
          {
            name: "api",
            resourceCount: 1,
            services: ["gateway"],
          },
        ],
      },
    });
    const stack = parseEnvelope(result.stdout).data.stacks[0];
    expect(stack.services).toHaveLength(stack.resourceCount);
    expect(stack).not.toHaveProperty("description");
  });

  it("includes descriptions when --verbose is combined with --json", () => {
    const result = run(["stacks", "--verbose", "--json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const stack = parseEnvelope(result.stdout).data.stacks[0];
    expect(stack.description).toBeTruthy();
    expect(stack).not.toHaveProperty("services");
  });

  it("filters the human resource list with --no-stack", () => {
    const result = run(["resources", "--no-stack"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("queue");
    expect(result.stdout).not.toContain("gateway");
    expect(result.stdout).not.toContain("not assigned to any stack");
  });

  it("keeps resource stack filters working with --json", () => {
    const assigned = run(["resources", "--stack", "api", "--json"]);
    expect(assigned.status).toBe(0);
    expect(assigned.stderr).toBe("");
    expect(
      parseEnvelope(assigned.stdout).data.resources.map((item: { name: string }) => item.name),
    ).toEqual(["gateway"]);

    const unassigned = run(["resources", "--no-stack", "--json"]);
    expect(unassigned.status).toBe(0);
    expect(unassigned.stderr).toBe("");
    expect(
      parseEnvelope(unassigned.stdout).data.resources.map((item: { name: string }) => item.name),
    ).toEqual(["queue"]);
  });
});
