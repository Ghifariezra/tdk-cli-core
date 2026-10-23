# Windows hardware checks

Native Windows is **inspection-only** today: `flisk --version`, `flisk doctor` and `flisk up --dry-run` work, and `flisk up` refuses with a pointer to WSL2 Ubuntu. That is the claim in the [README](../README.md#requirements-and-support), and this page does not change it. The decision on whether native Windows gets a runtime is [#1757](https://github.com/flisk-sh/flisk/issues/1757); the acceptance gates it depends on are listed there.

What this page covers is the **evidence** behind the claim on a real Windows machine, which the CI runners cannot provide. Issue [#1765](https://github.com/flisk-sh/flisk/issues/1765) asks for that inventory and for a reproducible way to run it.

## What runs today

| Suite | Where it runs | What it proves | What it cannot show |
| --- | --- | --- | --- |
| [`tests/e2e/platforms/windows`](../tests/e2e/platforms/windows/) (W1–W4) | `windows-latest` | The CLI typechecks, builds and runs on Windows; the platform unit tests pass; native Windows refuses `doctor`, `up --dry-run` and `up shop` with WSL2 guidance and starts nothing; native Windows refuses the one-command demo before it clones, installs or boots anything. | It runs a **source build** (`node bin/tdk.js`), not the published `tdk.exe`. It has no antivirus, no Docker Desktop, no user PATH, no PowerShell profile, and the project lives in the runner's temp directory. |
| [`tests/e2e/platforms/windows`](../tests/e2e/platforms/windows/) (W1–W3) | `windows-latest` | The CLI typechecks, builds and runs on Windows; the platform unit tests pass; native Windows refuses `doctor`, `up --dry-run` and `up shop` with WSL2 guidance and starts nothing. | It runs a **source build** (`node bin/tdk.js`), not the published `tdk.exe`. It has no antivirus, no Docker Desktop, no user PATH, no PowerShell profile, and the project lives in the runner's temp directory. |
| [`tests/e2e/platforms/windows-binary`](../tests/e2e/platforms/windows-binary/) (WB1) | `windows-latest`, in the release workflow | The **release candidate** matches `checksums.txt`, reports its version and finds its bundled engine next to the exe. | It runs the candidate that was just built, not the artifact a user downloads. The engine is unpacked by the test, not by the installer. |
| [`tests/e2e/platforms/wsl2`](../tests/e2e/platforms/wsl2/) (WS1–WS5) | by hand, under WSL2 | The full stack boots under Ubuntu in WSL2. | It says nothing about native Windows. |
| [`tests/e2e/platforms/windows-hardware`](../tests/e2e/platforms/windows-hardware/) (WH1–WH6) | a real Windows machine, by hand or on a self-hosted runner | The **published** `tdk-windows-amd64.exe`: its checksums, the official installer, its version and bundled engine, the refusal contract, the one-command demo flow, and the host differences a runner does not have. | It does not boot a stack. Native Windows cannot. |

## What a real machine adds

These are the gaps between a hosted runner and a Windows 11 AMD64 developer machine. The hardware suite covers the first five; the last two are still open.

1. **The published artifact, downloaded the way a user downloads it.** The runner tests a build; a user runs the file from the release.
2. **The official installer.** `install.ps1` (in the `flisk.sh` website repository) downloads the release, verifies the checksum, unpacks the engine with `tar.exe`, writes the user PATH and runs the exe. No CI job runs it.
3. **PATH lookup.** A user runs `tdk` (or `tdk.exe`) by name, from a directory they put it in.
4. **Paths with spaces.** `C:\Users\First Last\AppData\Local\flisk\bin` is the default install path, and project directories have spaces too.
5. **A long path.** Windows caps a path at 260 characters unless long paths are enabled.
6. **Windows-only diagnostics.** `cli/src/utils/windows-doctor.ts` implements the Docker Desktop container-mode check, the Hyper-V excluded-port-range check, the `tdk.localhost` DNS check and the `core.autocrlf` warning. **None of them is called by `flisk doctor` today**: `doctor.ts` returns on native Windows before reaching them, so a Windows user gets one line ("Native Windows landscape boot is unsupported") and no diagnostics. Tracked as [#1856](https://github.com/flisk-sh/flisk/issues/1856).
7. **The one-command demo did the wrong thing on native Windows.** `flisk demo` (and `npx @flisk-sh/flisk demo`) cloned the starter into `~/.flisk/flisk-demo`, installed the CLI globally, installed the service dependencies, and only then failed, because `flisk up` refuses on native Windows. It now refuses before it touches the machine, and `platforms/windows` W4 holds that line: no clone, no global install, no stack. A release published before the fix still behaves the old way, which is why the source-build suite holds the contract and the hardware suite leaves the demo to the checklist below.
8. **Which `tar.exe` the installer finds.** `install.ps1` unpacks the engine with `Get-Command tar.exe`. Windows ships a BSD tar in `C:\Windows\System32` that reads `C:\...` as a path; Git for Windows ships a GNU tar that reads the same string as a **remote host**. On a machine whose PATH holds the Git for Windows toolchain directory, the installer fails with `tar (child): Cannot connect to C: resolve failed`. The repository's own release check works around this (`tests/e2e/platforms/windows-binary/run.sh` puts `C:\Windows\System32` first); the installer has no guard. Tracked as [flisk-sh/website#67](https://github.com/flisk-sh/website/issues/67).
9. **The PowerShell version.** The official installer calls `Invoke-WebRequest` without `-UseBasicParsing`. Windows PowerShell 5.1 needs the Internet Explorer engine to parse a response, which Windows 11 does not have, so the installer needs PowerShell 7 (`pwsh`) or a `-UseBasicParsing` fix in the website repository. The hardware suite reports the exact error when it happens, with the PowerShell version it used. Tracked as [flisk-sh/website#66](https://github.com/flisk-sh/website/issues/66).
7. **Which `tar.exe` the installer finds.** `install.ps1` unpacks the engine with `Get-Command tar.exe`. Windows ships a BSD tar in `C:\Windows\System32` that reads `C:\...` as a path; Git for Windows ships a GNU tar that reads the same string as a **remote host**. On a machine whose PATH holds the Git for Windows toolchain directory, the installer fails with `tar (child): Cannot connect to C: resolve failed`. The repository's own release check works around this (`tests/e2e/platforms/windows-binary/run.sh` puts `C:\Windows\System32` first); the installer has no guard. Tracked as [flisk-sh/website#67](https://github.com/flisk-sh/website/issues/67).
8. **The PowerShell version.** The official installer calls `Invoke-WebRequest` without `-UseBasicParsing`. Windows PowerShell 5.1 needs the Internet Explorer engine to parse a response, which Windows 11 does not have, so the installer needs PowerShell 7 (`pwsh`) or a `-UseBasicParsing` fix in the website repository. The hardware suite reports the exact error when it happens, with the PowerShell version it used. Tracked as [flisk-sh/website#66](https://github.com/flisk-sh/website/issues/66).

## Run it on a real Windows machine

Requirements: Windows 10 22H2 or Windows 11 on AMD64, PowerShell 5.1 or newer (PowerShell 7 recommended, see gap 8), `tar.exe` (shipped with Windows 10 1803 and newer) and about 600 MB of free disk space for the download and the copies the suite makes.

```powershell
git clone https://github.com/flisk-sh/flisk.git
cd flisk
pwsh -NoProfile -File tests/e2e/platforms/windows-hardware/windows-hardware.ps1 -Case all
```

The suite works without Git Bash. It writes a findings report to `%TEMP%\flisk-windows-hardware\windows-hardware-findings.md`, with the raw output of every command next to it.

| Case | What it checks |
| --- | --- |
| WH1 | The published `tdk-windows-amd64.exe` and `tdk-cli-engine.tar.gz` match `checksums.txt`, and the exe is a PE binary. |
| WH2 | The official installer runs on this machine: the exe lands in the install directory, the engine sits beside it, the install directory joins the user PATH (restored afterwards) and the installed exe reports its version and its runtime assets. It runs the installer with the PATH a normal PowerShell window has, and records what the same installer does with the PATH this machine actually has. |
| WH3 | The exe reports the release version and finds its own engine next to it. |
| WH4 | `doctor`, `doctor --json`, `up`, `up --dry-run` and `up shop` all refuse with WSL2 and Ubuntu guidance, the JSON report carries the native-Windows finding, and nothing starts: no Tilt, no Docker daemon, no container. |
| WH5 | The exe starts from a path with a space, resolves through PATH, keeps its refusal in a project directory whose path has a space, and (when Bun is installed) scaffolds a project there. It also records what a path longer than 260 characters does. |
| WH6 | The one-command demo flow (`tdk demo`) does not boot a stack on native Windows: it exits non-zero, starts no Tilt and no container, and either refuses with the WSL2 guidance before it clones or installs anything, or the report says what the release did before it stopped. The demo runs with a home directory and an npm prefix of its own, so the acceptance run does not change the machine. |

One case at a time, and other inputs:

```powershell
pwsh -NoProfile -File tests/e2e/platforms/windows-hardware/windows-hardware.ps1 -Case WH4
$env:FLISK_WINDOWS_RELEASE = 'v1.3.204'   # pin a release instead of "latest"
$env:FLISK_WINDOWS_EXE = 'C:\build\tdk-windows-amd64.exe'   # test a local build instead of the published one
```

On a machine with Git Bash, the same suite runs through its wrapper, which is what CI calls:

```bash
tests/e2e/platforms/windows-hardware/run.sh all
tests/e2e/platforms/windows-hardware/run.sh WH4
```

## Run it in CI on a self-hosted runner

The workflow [`e2e-platforms-hardware.yml`](../.github/workflows/e2e-platforms-hardware.yml) has two jobs:

- **hosted** runs the suite on `windows-latest` on every pull request that touches the Windows platform code. It is a reference run and a canary on the published release, not the acceptance run.
- **hardware** runs the same suite on a self-hosted Windows 11 AMD64 machine. It only runs when someone dispatches the workflow by hand, so a pull request never executes on a maintainer's machine.

To use it, register a runner on the Windows machine with the labels `self-hosted`, `windows` and `x64`, then dispatch **🪟 Platforms hardware E2E** from the Actions tab. The `release` input pins the release to test; the findings report is uploaded as the artifact `windows-hardware-findings-machine-<run id>`.

## The manual acceptance checklist

The design for first-class Windows support asks for a human acceptance run on a real Windows 11 AMD64 machine before any support claim changes ([`openspec/changes/tdk-windows-first-class-support/tasks.md`](../openspec/changes/tdk-windows-first-class-support/tasks.md), task 7.3). This is that checklist. The suite automates the parts it can; the rest is still a person.

| # | Step | Automated by | Result |
| --- | --- | --- | --- |
| 1 | Install with the official script, or download the exe by hand | WH2 | |
| 2 | `tdk --version` prints the release version | WH3 | |
| 3 | `tdk runtime --check-assets` finds the bundled engine | WH3 | |
| 4 | `tdk doctor` refuses and points at WSL2 Ubuntu | WH4 | |
| 5 | `flisk up` and `flisk up --dry-run` refuse and start nothing | WH4 | |
| 6 | The exe runs from a path with a space and resolves through PATH | WH5 | |
| 7 | `tdk project --yes` scaffolds a project in a directory with a space | WH5 (needs Bun) | |
| 8 | `tdk demo` refuses with WSL2 guidance and clones nothing | WH6 (the published release); `platforms/windows` W4 (the current build) | |
| 9 | Under WSL2 (the supported Windows path) `tdk demo` starts the stack and every service answers | `platforms/wsl2` WS6 (`scripts/wsl2-demo.sh`) | |
| 10 | `flisk upgrade --dry-run` reports the standalone binary installation | manual | |
| 11 | The npm installation works: `npm install -g @flisk-sh/flisk` | manual | |
| 12 | WSL2 Ubuntu still boots the stack | `tests/e2e/platforms/wsl2` | |
| 13 | macOS and Linux are unaffected | the usual CI | |

Record the result of each row, with the Windows build, the PowerShell version and the Flisk version, in the issue that asked for the run.

## Findings

The suite writes a findings report with one row per case, the host facts (Windows build, architecture, PowerShell, Docker, Tilt, Bun, Node), the release it tested and the SHA-256 of the exe. Link the report from the issue that asked for the run; a hosted run's report is the artifact `windows-hardware-findings-hosted-<run id>`, a machine run's is `windows-hardware-findings-machine-<run id>`.

### What the reference run found

The reference run on `windows-latest` (2026-10-22, release v1.3.204, [run](https://github.com/flisk-sh/flisk/actions/runs/39703690654)) passes all five cases and records three things worth acting on:

| Finding | Where | Status |
| --- | --- | --- |
| The official installer breaks when the Git for Windows toolchain is on the PATH: it resolves Git's GNU `tar.exe`, which reads `C:\...` as a remote host, so the engine is never unpacked. | `install.ps1` in the website repository | [flisk-sh/website#67](https://github.com/flisk-sh/website/issues/67) |
| `flisk doctor` on native Windows reports one line and no diagnostics, because the Windows checks in `cli/src/utils/windows-doctor.ts` are never called. | `cli/src/commands/doctor.ts` | [#1856](https://github.com/flisk-sh/flisk/issues/1856) |
| `flisk demo` on native Windows cloned a starter, installed the CLI globally and installed the service dependencies before it failed. | `cli/src/cli.ts` | fixed; `platforms/windows` W4 holds the line |
| A path longer than 260 characters cannot even be created on a stock Windows host without long paths enabled, so an install or a project under such a path is out of reach. | Windows `MAX_PATH` | recorded by WH5 |

A hosted runner is not a developer's Windows 11 machine: it has no Docker Desktop, no Tilt, no Bun and no antivirus. The acceptance run is the `hardware` job, on a machine a maintainer registers as a runner.

## See also

- [WSL2 setup](wsl2.md): the supported Windows path
- [Write an end-to-end test](contributing/05-write-e2e.md): how a suite is written
- [Run e2e suites in a matrix](contributing/06-e2e-matrix.md): how a suite becomes a CI leg
- [Troubleshooting](troubleshooting.md): what each message means and how it was checked
