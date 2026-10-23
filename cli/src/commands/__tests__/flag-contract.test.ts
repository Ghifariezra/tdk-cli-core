// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  createTempDir,
  createTempProject,
  runCommandInProcess,
  runFlisk,
} from "../../test-support/index.js";
import { YES_OPTION_DESCRIPTION } from "../../utils/command-helpers.js";
import { configCommand } from "../config.js";
import { downCommand } from "../down.js";
import { ejectCommand } from "../eject.js";
import { networksCommand } from "../networks.js";
import { projectsCommand } from "../projects.js";
import { resourcesCommand } from "../resources.js";
import { stacksCommand } from "../stacks.js";
import { statusCommand } from "../status.js";
import { upCommand } from "../up.js";

const commandsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One row per command that prints `--json` and can run in a temp project without Docker, Tilt or prompts.
 * Each row is checked against the `--json` contract, both in a project and outside one.
 */
const JSON_MATRIX: Array<{ command: string[]; project: Parameters<typeof createTempProject>[0] }> =
  [
    {
      command: ["stacks"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    {
      command: ["resources"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    { command: ["projects"], project: { resources: { api: { runtime: "node" } } } },
    {
      command: ["status"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    {
      command: ["networks"],
      project: { stacks: { api: { gateway: { appType: "backend", port: 3100 } } } },
    },
    { command: ["config", "verify"], project: {} },
  ];

const VALID_PROJECT_JSON = {
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
};

/** A valid project with generated Tilt files and one backend, so the commands below reach their plan. */
const CONFIGURED_PROJECT: Parameters<typeof createTempProject>[0] = {
  projectJson: VALID_PROJECT_JSON,
  stacks: { api: { gateway: { appType: "backend", port: 3100 } } },
  generated: { Tiltfile: "# generated\n", "docker-compose.yml": "services: {}\n" },
};

/**
 * One row per command that prints a dry-run plan without Docker or Tilt. `expect` is the text the plan prints.
 * `eject` prints no "Dry run" line; its plan is the list of files it would leave and write.
 */
const DRY_RUN_MATRIX: Array<{
  site: string;
  command: string[];
  project: Parameters<typeof createTempProject>[0];
  expect: string;
}> = [
  {
    site: "config regenerate --dry-run",
    command: ["config", "regenerate"],
    project: CONFIGURED_PROJECT,
    expect: "Dry run",
  },
  { site: "down --dry-run", command: ["down"], project: CONFIGURED_PROJECT, expect: "Dry run" },
  {
    site: "eject --dry-run",
    command: ["eject"],
    project: CONFIGURED_PROJECT,
    expect: "Files written:",
  },
  { site: "up --dry-run", command: ["up"], project: CONFIGURED_PROJECT, expect: "Dry run" },
];

/**
 * One row per command that runs non-interactively with `--yes` in a temp project. Each runs with stdin closed,
 * so a prompt that ignores `--yes` ends the run with an error instead of hanging.
 */
const YES_MATRIX: Array<{
  site: string;
  command: string[];
  project: Parameters<typeof createTempProject>[0];
}> = [
  { site: "eject --yes", command: ["eject"], project: CONFIGURED_PROJECT },
  {
    site: "stack --yes",
    command: ["stack", "api", "--resources", "web"],
    project: {
      ...CONFIGURED_PROJECT,
      resources: { web: { appType: "backend", port: 4000 } },
    },
  },
  {
    site: "resource --yes",
    command: ["resource", "web", "--type", "backend"],
    project: CONFIGURED_PROJECT,
  },
  { site: "project --yes", command: ["project"], project: CONFIGURED_PROJECT },
];

/**
 * `agent sessions --json` fails before any request when the session id is missing, so its error envelope runs in a
 * temp project with no agent process. The `site` names the command the same way the completeness check does.
 */
const AGENT_SESSIONS_JSON: {
  site: string;
  command: string[];
  project: Parameters<typeof createTempProject>[0];
} = {
  site: "agent sessions --json",
  command: ["agent", "sessions", "assistant"],
  project: { stacks: { api: { assistant: { appType: "agent", port: 3200 } } } },
};

/**
 * `doctor --json` runs its probes with or without a project and prints one report. Its exit status depends on the
 * host (a machine without Docker exits 1), so this row checks the envelope only, not the status.
 */
const DOCTOR_JSON: { site: string; command: string[] } = {
  site: "doctor --json",
  command: ["doctor", "--no-ping"],
};

/**
 * Commands and subcommands that register one of the three flags but have no matrix row yet. Each entry says why.
 * Shrinking this list is the work; a new entry needs a reason.
 */
const EXEMPT: Record<string, string> = {
  "doctor --dry-run":
    "with --fix, prints the Dry run line only when a repair is planned; repairs come from the host's Docker networks and leftover probes, so a temp project may plan none",
  "doctor --yes":
    "with --fix, removes unused Docker networks on the host's Docker daemon; a test run would act on that daemon",
  "down --json":
    "runs tilt down against the host's Tilt binary and stops any tilt up for the project; needs Tilt and a running stack",
  "down --yes":
    "runs tilt down against the host's Tilt binary and stops any tilt up for the project; needs Tilt and a running stack",
  "import --yes": "spawns npx flisk-import over the network",
  "logs --json":
    "reads logs through the host's Tilt UI port; needs Tilt, and the output depends on whether a stack is running",
  "restart --json":
    "triggers a resource on the host's Tilt UI port, and isTiltAvailable checks the host's tilt binary; needs Tilt and a running stack",
  "runtime --json":
    "checks the packaged install's bundled assets, so a source checkout reports ok: false; prints {ok, assetRoot, missing, templateErrors}, not the envelope",
  "up --json": "starts containers through the host's Docker, Compose and Tilt; needs Docker",
  "upgrade --dry-run":
    "compares the installed CLI with origin over git on the host, and prints 'Dry run:' rather than 'Dry run -'",
  "upgrade --yes":
    "updates the installed CLI checkout, so a test run would rebuild the repo under test",
};

interface FlagSite {
  key: string;
  flags: string[];
}

/**
 * `--json` prints one envelope. Some commands pretty-print it over several lines, so the whole of stdout must parse
 * as one JSON value rather than one line.
 */
function parseOneEnvelope(stdout: string): {
  schemaVersion: number;
  data: unknown;
  errors: unknown[];
} {
  const envelope = JSON.parse(stdout) as {
    schemaVersion: number;
    data: unknown;
    errors: unknown[];
  };
  expect(Object.keys(envelope).sort()).toEqual(["data", "errors", "schemaVersion"]);
  return envelope;
}

/** Walks a Commander command and its subcommands, returning each one that registers a contract flag. */
function collectFlagSites(command: Command, prefix: string[] = []): FlagSite[] {
  const name = [...prefix, command.name()].filter(Boolean);
  const sites: FlagSite[] = [];
  for (const option of command.options) {
    if (option.long === "--json" || option.long === "--dry-run" || option.long === "--yes") {
      sites.push({ key: `${name.join(" ")} ${option.long}`, flags: [option.long] });
    }
  }
  for (const sub of command.commands) {
    sites.push(...collectFlagSites(sub, name));
  }
  return sites;
}

/** Every file under `dir` as a map of root-relative path to content, so a test can prove nothing was written. */
function snapshotTree(root: string, dir = root, out: Record<string, string> = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshotTree(root, full, out);
    else out[path.relative(root, full)] = fs.readFileSync(full, "utf-8");
  }
  return out;
}

/** The `<command> <flag>` sites that have a matrix row. */
function coveredSites(): Set<string> {
  return new Set([
    ...JSON_MATRIX.map((row) => `${row.command.join(" ")} --json`),
    ...DRY_RUN_MATRIX.map((row) => row.site),
    ...YES_MATRIX.map((row) => row.site),
    AGENT_SESSIONS_JSON.site,
    DOCTOR_JSON.site,
  ]);
}

async function loadAllCommands(): Promise<Command[]> {
  const files = fs
    .readdirSync(commandsDir)
    .filter((file) => file.endsWith(".ts") && !file.includes(".test."));
  const commands: Command[] = [];
  for (const file of files) {
    const mod = (await import(path.join(commandsDir, file))) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (value && typeof value === "object" && "options" in value && "commands" in value) {
        commands.push(value as Command);
      }
    }
  }
  return commands;
}

/** The command object that owns each in-project JSON row. `config verify` runs through its `verify` subcommand. */
const IN_PROCESS_TARGETS: Record<string, { command: Command; args: string[] }> = {
  stacks: { command: stacksCommand, args: [] },
  resources: { command: resourcesCommand, args: [] },
  projects: { command: projectsCommand, args: [] },
  status: { command: statusCommand, args: [] },
  networks: { command: networksCommand, args: [] },
  "config verify": { command: configCommand, args: ["verify"] },
};

describe("flag contract: --json", () => {
  it.each(JSON_MATRIX)(
    "flisk $command --json prints one envelope in a project",
    async ({ command, project }) => {
      // In-project rows run the command object in-process: the envelope is printed by the command itself, so the
      // child process adds no coverage here. Outside-project rows stay spawns, because they exercise the top-level handler.
      const root = createTempProject(project);
      const target = IN_PROCESS_TARGETS[command.join(" ")];
      const result = await runCommandInProcess(target.command, [...target.args, "--json"], root);
      expect(result.stderr).not.toMatch(/^\{/m);
      const envelope = parseOneEnvelope(result.stdout);
      expect(envelope.schemaVersion).toBe(1);
      expect(Array.isArray(envelope.errors)).toBe(true);
    },
  );

  it.each(JSON_MATRIX)(
    "flisk $command --json outside a project fails with a null-data envelope",
    ({ command }) => {
      const result = runFlisk([...command, "--json"], { cwd: createTempDir() });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Could not find project root");
      expect(result.stderr).not.toMatch(/^\{/m);
      const envelope = parseOneEnvelope(result.stdout);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
    },
  );
});

describe("flag contract: --json for doctor", () => {
  it(`${DOCTOR_JSON.site} prints one envelope with no project`, () => {
    const result = runFlisk([...DOCTOR_JSON.command, "--json"], {
      cwd: createTempDir(),
      timeout: 60_000,
    });
    expect(result.stderr).not.toMatch(/^\{/m);
    const envelope = parseOneEnvelope(result.stdout);
    expect(envelope.schemaVersion).toBe(1);
    expect(Array.isArray(envelope.errors)).toBe(true);
  }, 60_000);
});

describe("flag contract: --json error envelope for agent sessions", () => {
  it(`${AGENT_SESSIONS_JSON.site} without --session-id fails with a null-data envelope`, () => {
    const root = createTempProject(AGENT_SESSIONS_JSON.project);
    const result = runFlisk([...AGENT_SESSIONS_JSON.command, "--json"], { cwd: root });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toMatch(/^\{/m);
    const envelope = parseOneEnvelope(result.stdout);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.data).toBeNull();
    expect(envelope.errors).toEqual([expect.objectContaining({ code: "SESSION_ID_REQUIRED" })]);
  });
});

describe("flag contract: completeness", () => {
  it("every command that registers --json, --dry-run or --yes has a matrix row or an exemption", async () => {
    const sites = (await loadAllCommands()).flatMap((command) => collectFlagSites(command));
    expect(sites.length).toBeGreaterThan(0);

    const covered = coveredSites();
    const missing = sites
      .map((site) => site.key)
      .filter((key) => !covered.has(key) && !(key in EXEMPT));
    expect(missing).toEqual([]);
  });

  it("does not keep an exemption for a site that now has a matrix row", () => {
    const covered = coveredSites();
    expect(Object.keys(EXEMPT).filter((key) => covered.has(key))).toEqual([]);
  });

  it("flags an exemption that no longer matches a real flag, so the list cannot go stale", async () => {
    const sites = new Set(
      (await loadAllCommands())
        .flatMap((command) => collectFlagSites(command))
        .map((site) => site.key),
    );
    const stale = [...Object.keys(EXEMPT), ...coveredSites()].filter((key) => !sites.has(key));
    expect(stale).toEqual([]);
  });
});

/** The command object and arguments that each dry-run row runs in-process, without `--dry-run` (added below). */
const DRY_RUN_TARGETS: Record<string, { command: Command; args: string[] }> = {
  "config regenerate": { command: configCommand, args: ["regenerate"] },
  down: { command: downCommand, args: [] },
  eject: { command: ejectCommand, args: [] },
  up: { command: upCommand, args: [] },
};

describe("flag contract: --dry-run", () => {
  it.each(DRY_RUN_MATRIX)(
    "flisk $site prints its plan and writes nothing",
    async ({ command, project, expect: line }) => {
      const root = createTempProject(project);
      const before = snapshotTree(root);
      // The plan is printed by the command itself, so the row runs in-process. Each row is one command object,
      // so Commander's kept option values cannot leak between rows.
      const target = DRY_RUN_TARGETS[command.join(" ")];
      const result = await runCommandInProcess(target.command, [...target.args, "--dry-run"], root);
      expect(result.status ?? 0).toBe(0);
      expect(result.stdout).toContain(line);
      expect(snapshotTree(root)).toEqual(before);
    },
  );
});

describe("flag contract: --yes", () => {
  it.each(YES_MATRIX)(
    "flisk $site runs without a prompt when stdin is closed",
    ({ command, project }) => {
      const root = createTempProject(project);
      const result = runFlisk([...command, "--yes"], { cwd: root, input: "", timeout: 60_000 });
      expect(result.status).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/\(y\/n\)|\[y\/N\]/i);
    },
  );
});

function collectCommands(
  command: Command,
  prefix: string[] = [],
): Array<{ name: string; command: Command }> {
  const pathParts = [...prefix, command.name()].filter(Boolean);
  const items: Array<{ name: string; command: Command }> = [{ name: pathParts.join(" "), command }];
  for (const sub of command.commands) {
    items.push(...collectCommands(sub, pathParts));
  }
  return items;
}

describe("flag contract: -y/--yes and --force convention", () => {
  it("every command that defines --yes also defines -y", async () => {
    const allCommands = (await loadAllCommands()).flatMap((cmd) => collectCommands(cmd));
    const missingShort = allCommands.flatMap(({ name, command }) =>
      command.options
        .filter((option) => option.long === "--yes" && option.short !== "-y")
        .map(() => name),
    );
    expect(missingShort).toEqual([]);
  });

  it("uses the shared YES_OPTION_DESCRIPTION across standard --yes commands", async () => {
    const allCommands = new Map(
      (await loadAllCommands())
        .flatMap((cmd) => collectCommands(cmd))
        .map(({ name, command }) => [name, command] as const),
    );
    for (const commandName of [
      "project",
      "resource",
      "stack",
      "eject",
      "import",
      "upgrade",
      "down",
    ]) {
      const command = allCommands.get(commandName);
      expect(command, `expected command "${commandName}" to exist`).toBeDefined();
      const yesOption = command?.options.find((option) => option.long === "--yes");
      expect(yesOption?.short, `expected "${commandName}" to have -y`).toBe("-y");
      expect(yesOption?.description, `expected "${commandName}" to use shared description`).toBe(
        YES_OPTION_DESCRIPTION,
      );
    }
  });

  it("never defines --force with a 'skip confirmation' description", async () => {
    const allCommands = (await loadAllCommands()).flatMap((cmd) => collectCommands(cmd));
    const badForce = allCommands.flatMap(({ name, command }) =>
      command.options
        .filter(
          (option) =>
            option.long === "--force" &&
            /(skip|bypass|suppress|without).*(confirm|prompt)/i.test(option.description),
        )
        .map((option) => `${name}: ${option.description}`),
    );
    expect(badForce).toEqual([]);
  });

  it("uses consistent descriptions for --json options", async () => {
    const allCommands = (await loadAllCommands()).flatMap((cmd) => collectCommands(cmd));
    const jsonOptions = allCommands.flatMap(({ name, command }) =>
      command.options
        .filter((option) => option.long === "--json")
        .map((option) => ({ name, description: option.description })),
    );
    expect(jsonOptions.length).toBeGreaterThan(0);
    for (const { description } of jsonOptions) {
      const lower = description.toLowerCase();
      expect(lower.includes("json") || lower.includes("machine-readable")).toBe(true);
    }
  });
});

describe("flag contract: unknown flag handling", () => {
  it("rejects unknown flags with error and non-zero exit code", () => {
    const dir = createTempDir("tdk-unknown-flag-");
    try {
      const res = runFlisk(["status", "--nonexistent-flag-test"], { cwd: dir });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("error: unknown option");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
