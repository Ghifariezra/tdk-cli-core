// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for check-test-helper-allowlist.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import { checkHelpers, declaredHelpers } from "./check-test-helper-allowlist.mjs";

const clean = `import { runFlisk } from "../../test-support/index.js";\nconst x = 1;\n`;
const copied = `const cliBin = path.join(root, "bin");\nfunction runFlisk(args: string[]) {\n}\n`;
const resourceArrow = `const resource = (name: string): DiscoveredResource => ({ name });\n`;
const localVariable = `const resource = discovery.resources.find((r) => r.name === name);\n`;

test("declaredHelpers finds function and function-valued const declarations with their line", () => {
  assert.deepEqual(
    [...declaredHelpers(copied)],
    [
      ["cliBin", 1],
      ["runFlisk", 2],
    ],
  );
  assert.deepEqual([...declaredHelpers(resourceArrow)], [["resource", 1]]);
});

test("declaredHelpers ignores imports and ordinary local variables", () => {
  assert.equal(declaredHelpers(clean).size, 0);
  assert.equal(declaredHelpers(localVariable).size, 0);
});

test("a clean file passes with an empty allowlist", () => {
  const { errors } = checkHelpers({
    files: new Map([["cli/src/a/__tests__/a.test.ts", clean]]),
    allowlistText: "",
  });
  assert.deepEqual(errors, []);
});

test("a new file that copies a helper fails", () => {
  const { errors } = checkHelpers({
    files: new Map([["cli/src/a/__tests__/new.test.ts", copied]]),
    allowlistText: "",
  });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /new\.test\.ts:1 declares cliBin; import fliskBin/);
  assert.match(errors[1], /new\.test\.ts:2 declares runFlisk/);
});

test("an allowlisted copy passes", () => {
  const { errors } = checkHelpers({
    files: new Map([["cli/src/a/__tests__/old.test.ts", copied]]),
    allowlistText:
      "cli/src/a/__tests__/old.test.ts runFlisk\ncli/src/a/__tests__/old.test.ts cliBin\n",
  });
  assert.deepEqual(errors, []);
});

test("an allowlisted file that adds a helper not on its line fails", () => {
  const { errors } = checkHelpers({
    files: new Map([["cli/src/a/__tests__/old.test.ts", copied]]),
    allowlistText: "cli/src/a/__tests__/old.test.ts runFlisk\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /old\.test\.ts:1 declares cliBin/);
});

test("a listed entry whose file no longer duplicates the helper fails", () => {
  const { errors } = checkHelpers({
    files: new Map([["cli/src/a/__tests__/old.test.ts", clean]]),
    allowlistText: "cli/src/a/__tests__/old.test.ts runFlisk\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"cli\/src\/a\/__tests__\/old\.test\.ts runFlisk" no longer duplicates/);
});

test("a listed entry for a deleted file fails", () => {
  const { errors } = checkHelpers({
    files: new Map(),
    allowlistText: "cli/src/a/__tests__/gone.test.ts runFlisk\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no longer duplicates/);
});

test("a malformed allowlist line is reported", () => {
  const { errors } = checkHelpers({
    files: new Map(),
    allowlistText: "# comment\n\ncli/src/a.test.ts notAHelper\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must be "<file> <helper>"/);
});
