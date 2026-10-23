// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { relative, sep } from "node:path";
import chalk from "chalk";
import type { DiscoveredResource } from "../types/index.js";
import { formatCount } from "./formatting.js";
import { SERVICE_MANIFEST_SCHEMA_VERSION } from "./service-manifest.js";
import { discoverResourcesFromRoot } from "./services.js";

/**
 * A service.json that declares a schemaVersion this flisk does not know is refused before anything starts: a newer format
 * read as if it were the old one could start the wrong thing. A missing schemaVersion is not refused (see
 * warnSchemaVersions), because every project began without one.
 */
export function enforceSchemaVersionGate(
  projectRoot: string,
  options: { onInvalid?: (message: string) => void; resources?: DiscoveredResource[] } = {},
  exit: (code: number) => never = process.exit,
): void {
  // A root that cannot be read is reported by the checks that run next; this gate only refuses what it can read.
  let resources: DiscoveredResource[];
  if (options.resources) {
    resources = options.resources;
  } else {
    try {
      resources = discoverResourcesFromRoot(projectRoot);
    } catch {
      return;
    }
  }
  const unsupported = resources.flatMap((resource) => {
    const version: unknown = resource.config?.schemaVersion;
    if (version === undefined || version === SERVICE_MANIFEST_SCHEMA_VERSION) return [];
    const rel = relative(projectRoot, resource.configPath) || resource.configPath;
    const file = rel.split(sep).join("/");
    return [
      `${file} schemaVersion ${JSON.stringify(version)}: this flisk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`,
    ];
  });
  if (unsupported.length === 0) return;

  const verb = unsupported.length === 1 ? "declares" : "declare";
  const message = `${formatCount(unsupported.length, "service.json file")} ${verb} a schemaVersion this flisk does not support:\n    ${unsupported.join("\n    ")}`;
  const fix =
    "Upgrade flisk to a version that supports these files. Changing schemaVersion by hand is not a fix";
  options.onInvalid?.(`${message}\nFix: ${fix}`);
  console.error(chalk.red(`✗ ${message}`));
  console.error(chalk.gray(`  Fix: ${fix}`));
  exit(1);
}
