// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Helpers shared by CLI tests. This folder is excluded from the build and the npm package.

export { runCompletionCommand } from "./completion.js";
export { captureExit, type ExitCapture, makeResource } from "./doubles.js";
export { type Envelope, parseEnvelope } from "./parse-envelope.js";
export { type FliskRunOptions, type FliskRunResult, fliskBin, runFlisk } from "./run-flisk.js";
export { type InProcessRun, runCommandInProcess } from "./run-in-process.js";
export {
  engineFile,
  evaluateStarlark,
  resolveTiltAvailability,
  type StarlarkOptions,
  type StarlarkRun,
  tiltAvailable,
} from "./starlark.js";
export {
  createTempDir,
  createTempProject,
  type ServiceSpec,
  type TempProjectSpec,
} from "./temp-project.js";
