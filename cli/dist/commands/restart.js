// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { STANDARD_PORTS } from "../utils/constants.js";
import { errorFactories, ProcessExitError, runCommand, showErrorAndExit, TdkError, } from "../utils/errors.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import { isTiltConnectionFailure, isValidPort } from "../utils/tilt-logs.js";
import { tiltUnreachableMessage } from "../utils/tilt-unreachable-message.js";
export const restartCommand = new Command("restart")
    .description("Restart a running resource in the stack")
    .argument("<resource>", "Name of the resource (service) to restart")
    .option("--port <n>", "Tilt UI port (default: TILT_PORT or 10350)")
    .option("--json", "Output one JSON object and exit", false)
    .action(async (resourceName, options) => {
    const portText = options.port ?? process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
    if (!isValidPort(portText)) {
        const portSource = options.port !== undefined ? "--port" : "TILT_PORT";
        const message = `${portSource} must be a valid port number`;
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "USAGE", message }])));
            console.error(message);
            process.exit(2);
        }
        showErrorAndExit(message, 2);
    }
    const action = async () => {
        const root = findProjectRoot();
        if (!root) {
            const error = errorFactories.notInProject();
            if (options.json)
                writeMachineError(error);
            error.exit();
        }
        let tiltAvailable = false;
        try {
            tiltAvailable = await isTiltAvailable();
        }
        catch {
            tiltAvailable = false;
        }
        if (!tiltAvailable) {
            // isTiltAvailable collapses missing binary and nonzero version into false.
            // Report TILT_NOT_RUNNING for both; a missing binary is rare and still surfaces via doctor.
            const msg = tiltUnreachableMessage(portText);
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                process.exit(1);
            }
            throw new TdkError(msg, ["Start the stack first with: flisk up"]);
        }
        const result = await runTilt("trigger", [resourceName, "--port", portText], {
            inheritStdio: false,
        });
        if (result.exitCode !== 0) {
            const detail = result.stderr.trim();
            if (!detail || isTiltConnectionFailure(detail)) {
                const msg = tiltUnreachableMessage(portText);
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                    process.exit(1);
                }
                throw new TdkError(msg, ["Start the stack first with: flisk up"]);
            }
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_TRIGGER_FAILED", message: detail }])));
                process.exit(1);
            }
            throw new TdkError(`Failed to restart ${resourceName}: ${detail}`);
        }
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({ resource: resourceName, restarted: true })));
            return;
        }
        console.log(chalk.green(`✓ Triggered restart for ${resourceName}`));
    };
    if (options.json) {
        try {
            await action();
        }
        catch (err) {
            if (err instanceof ProcessExitError) {
                throw err;
            }
            writeMachineError(err);
        }
        return;
    }
    await runCommand(action);
});
