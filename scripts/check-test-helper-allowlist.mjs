// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Stops duplicated test helpers from coming back (#1402, part of #1388). A test file under cli/src/**/__tests__ that
// declares one of the shared helpers (runFlisk, createTempProject, makeResource, ...) fails, unless the file and helper
// are listed in cli/test-helper-allowlist.txt as "<file> <helper>". The list only shrinks: a new copy fails, and a
// listed entry that no longer duplicates anything fails until its line is removed.
//   node scripts/check-test-helper-allowlist.mjs [--root <repo dir>]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Helpers that live in cli/src/test-support. A name here is a duplicate when a test file declares it.
export const HELPERS = [
  "runFlisk",
  "runTdk",
  "runCli",
  "createProject",
  "createTempProject",
  "createTempDir",
  "parseEnvelope",
  "makeResource",
  "captureExit",
  "evaluateStarlark",
  "engineFile",
  "evaluate",
  "resource",
  "cliBin",
];
// The test-support export to import instead, where the names differ.
const SHARED = { runTdk: "runFlisk", cliBin: "fliskBin", evaluate: "evaluateStarlark", resource: "makeResource" };
export const ALLOWLIST = "cli/test-helper-allowlist.txt";
const TEST_DIR = "cli/src";

// Maps each helper a source declares (as a function or a function-valued const) to its first line number.
export function declaredHelpers(source) {
  const found = new Map();
  source.split("\n").forEach((line, index) => {
    for (const name of HELPERS) {
      if (found.has(name)) continue;
      const declared =
        name === "cliBin"
          ? /\b(?:const|let|var)\s+cliBin\b\s*=/
          : new RegExp(
              `\\bfunction\\s+${name}\\s*[(<]|\\b(?:const|let|var)\\s+${name}\\b\\s*(?::[^=]+)?=\\s*(?:async\\s+)?(?:\\(|function\\b)`,
            );
      if (declared.test(line)) found.set(name, index + 1);
    }
  });
  return found;
}

// Reads "<file> <helper>" lines. Blank lines and "#" comments are skipped; anything else malformed is an error.
export function parseAllowlist(text) {
  const entries = new Set();
  const errors = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const parts = line.split(/\s+/);
    if (parts.length !== 2 || !HELPERS.includes(parts[1])) {
      errors.push(
        `${ALLOWLIST}:${index + 1} must be "<file> <helper>" with a known helper, got "${line}"`,
      );
      return;
    }
    entries.add(`${parts[0]} ${parts[1]}`);
  });
  return { entries, errors };
}

// files: Map of repo-relative path -> source for each test file. allowlistText: contents of the allowlist.
export function checkHelpers({ files, allowlistText }) {
  const { entries, errors } = parseAllowlist(allowlistText);
  const duplicates = [];
  const seen = new Set();
  for (const [file, source] of files) {
    for (const [helper, line] of declaredHelpers(source)) {
      const key = `${file} ${helper}`;
      seen.add(key);
      if (!entries.has(key)) {
        const shared = SHARED[helper] ?? helper;
        duplicates.push(
          `${file}:${line} declares ${helper}; import ${shared} from cli/src/test-support instead`,
        );
      }
    }
  }
  const stale = [...entries]
    .filter((key) => !seen.has(key))
    .map((key) => `${ALLOWLIST}: "${key}" no longer duplicates a helper; remove the line`);
  return { errors: [...errors, ...duplicates, ...stale] };
}

// Every .ts file under a __tests__ folder in cli/src, keyed by its repo-relative path.
export function readTestFiles(root) {
  const files = new Map();
  for (const rel of readdirSync(path.join(root, TEST_DIR), { recursive: true })) {
    const name = String(rel).split(path.sep).join("/");
    if (!name.endsWith(".ts") || !name.includes("__tests__/")) continue;
    const repoPath = `${TEST_DIR}/${name}`;
    files.set(repoPath, readFileSync(path.join(root, repoPath), "utf8"));
  }
  return files;
}

function main(argv) {
  const rootIndex = argv.indexOf("--root");
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const root = rootIndex === -1 ? defaultRoot : path.resolve(argv[rootIndex + 1]);
  const allowlistText = readFileSync(path.join(root, ALLOWLIST), "utf8");
  const { errors } = checkHelpers({ files: readTestFiles(root), allowlistText });
  if (errors.length > 0) {
    for (const message of errors) console.error(`::error::${message}`);
    console.error(`${errors.length} test helper allowlist problem(s). See ${ALLOWLIST}.`);
    return 1;
  }
  const { entries } = parseAllowlist(allowlistText);
  console.log(`Test helper allowlist OK: ${entries.size} entries, no new duplicates.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
