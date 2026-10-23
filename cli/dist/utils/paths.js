// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cwd } from "node:process";
import packageJson from "../../package.json" with { type: "json" };
import { PROJECT_JSON } from "./constants.js";
/**
 * Find the nearest enclosing Flisk project root by walking up from `startDir` until a
 * `.tdk/project.json` marker is found. Stops at the filesystem root without treating the
 * root itself as a project.
 * @param startDir - Directory to start searching from (default: cwd)
 * @returns Absolute path of the project root, or null if no `.tdk/project.json` exists on any parent
 */
export function findProjectRoot(startDir = cwd()) {
    let currentDir = resolve(startDir);
    const root = resolve("/");
    while (currentDir !== root) {
        if (existsSync(join(currentDir, ".tdk", PROJECT_JSON))) {
            return currentDir;
        }
        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }
    return null;
}
let packageCache = null;
function getPackageInfo() {
    if (packageCache) {
        return packageCache;
    }
    // Imported JSON is bundled by Bun compile, unlike a runtime fs lookup from $bunfs.
    const parsed = packageJson;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid package.json: expected object");
    }
    const packageInfo = parsed;
    packageCache = {
        name: String(packageInfo.name ?? "@flisk-sh/flisk"),
        version: String(packageInfo.version ?? "0.0.0"),
        fullPackage: packageInfo,
    };
    return packageCache;
}
/**
 * Return the CLI's own package version from the bundled `package.json`, cached after the
 * first read (the JSON import is resolved at compile time by Bun, so this never touches
 * the filesystem at runtime).
 * @returns The version string of the CLI package
 */
export function getPackageVersion() {
    return getPackageInfo().version;
}
