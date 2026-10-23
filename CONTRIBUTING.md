# Contributing to Flisk

English | [简体中文](docs/contributing/translations/CONTRIBUTING-zh_cn.md) | [繁體中文](docs/contributing/translations/CONTRIBUTING-zh_tw.md) | [日本語](docs/contributing/translations/CONTRIBUTING-ja.md) | [한국어](docs/contributing/translations/CONTRIBUTING-ko.md)

Welcome! Small fixes and large features are both useful. Start with the short [contributor guide](docs/contributing/README.md); it walks you through finding a change, making it, checking it, and opening a pull request.

## Table of contents

- [Your first contribution](#your-first-contribution)
- [Start here](#start-here)
- [Quick setup](#quick-setup)
- [Supported platforms](#supported-platforms)
- [Getting help](#getting-help)
- [Code review](#code-review)
- [Changing the CLI source](#changing-the-cli-source)
- [Tests](#tests)
- [Find bugs](#find-bugs)
- [Review pull requests](#review-pull-requests)
- [Find something to work on](#find-something-to-work-on)
- [Spell check](#spell-check)
- [Labels](#labels)
- [Sign your commits](#sign-your-commits)
- [Contributor recognition](#contributor-recognition)
- [Contributor badges](#contributor-badges)
- [Add your team to the adopters list](#add-your-team-to-the-adopters-list)
- [Governance](#governance)
- [Be kind](#be-kind)

## Your first contribution

Looking for an easy place to start?

- Browse [good first issues](https://github.com/flisk-sh/flisk/labels/good%20first%20issue) for small, self-contained tasks.
- Check [help wanted](https://github.com/flisk-sh/flisk/labels/help%20wanted) issues for tasks needing community help.
- Visit the [Start here tracking issue (#120)](https://github.com/flisk-sh/flisk/issues/120) for a curated list of beginner-friendly tasks and quests.

## Start here

1. [Choose your change and get the repo ready](docs/contributing/01-first-change.md).
2. [Follow the recipe for your kind of change](docs/contributing/02-feature-recipes.md).
3. [Check your work and open a pull request](docs/contributing/03-open-a-pr.md).
4. [Review someone else's pull request](docs/contributing/04-review-a-pr.md), with one-click AI review buttons.

The focused [frontend provider guide](docs/frontend-framework-providers.md) has the exact steps for adding another Vite framework like Vue. The [backend provider guide](docs/backend-language-providers.md) covers adding a backend language like Python. The [architecture guide](docs/ARCHITECTURE.md) explains how the CLI, the engine, and discovery fit together end to end. For AI coding agents and automated contributors, see [AGENTS.md](AGENTS.md) for the repository map, commands, and ground rules.

## Quick setup

New here? The [contributor quick start](docs/contributing/quick-start.md) goes from clone to your first pull request in about five minutes.

**Fastest way (recommended):** open the repository in a ready-to-use environment.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/flisk-sh/flisk?quickstart=1)
[![Open in Dev Containers](https://img.shields.io/badge/Open%20in-Dev%20Containers-2f363d?style=for-the-badge&logo=visualstudiocode&logoColor=white&labelColor=2f363d)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/flisk-sh/flisk)
[![Open in Gitpod](https://img.shields.io/badge/Open%20in-Gitpod-2f363d?style=for-the-badge&logo=gitpod&logoColor=white&labelColor=2f363d)](https://gitpod.io/#https://github.com/flisk-sh/flisk)
[![Open in Firebase Studio](https://img.shields.io/badge/Open%20in-Firebase%20Studio-2f363d?style=for-the-badge&logo=firebase&logoColor=white&labelColor=2f363d)](https://idx.google.com/import?url=https://github.com/flisk-sh/flisk)
[![Open in Replit](https://img.shields.io/badge/Open%20in-Replit-2f363d?style=for-the-badge&logo=replit&logoColor=white&labelColor=2f363d)](https://replit.com/github/flisk-sh/flisk)
[![Open in DevPod](https://img.shields.io/badge/Open%20in-DevPod-2f363d?style=for-the-badge&logo=devpod&logoColor=white&labelColor=2f363d)](https://devpod.sh/open#https://github.com/flisk-sh/flisk)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-2f363d?style=for-the-badge&logo=stackblitz&logoColor=white&labelColor=2f363d)](https://stackblitz.com/github/flisk-sh/flisk)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-2f363d?style=for-the-badge&logo=codesandbox&logoColor=white&labelColor=2f363d)](https://codesandbox.io/p/github/flisk-sh/flisk)
[![Open in VS Code](https://img.shields.io/badge/Open%20in-VS%20Code-2f363d?style=for-the-badge&labelColor=2f363d)](vscode://vscode.git/clone?url=https://github.com/flisk-sh/flisk)
[![Use with Claude Code](https://img.shields.io/badge/Use%20with-Claude%20Code-2f363d?style=for-the-badge&labelColor=2f363d)](https://claude.ai/code)
[![Use with Codex](https://img.shields.io/badge/Use%20with-Codex-2f363d?style=for-the-badge&labelColor=2f363d)](https://chatgpt.com/codex)
[![Use with Devin](https://img.shields.io/badge/Use%20with-Devin-2f363d?style=for-the-badge&labelColor=2f363d)](https://app.devin.ai/?prompt=Contribute%20to%20the%20Flisk%20CLI.%20Read%20the%20contributing%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Fflisk%2Fblob%2Fmain%2FCONTRIBUTING.md%20and%20walk%20me%20through%20my%20first%20change%20step%20by%20step.)
[![Use with Coder](https://img.shields.io/badge/Use%20with-Coder-2f363d?style=for-the-badge&labelColor=2f363d)](https://coder.com)
[![Use with Zed](https://img.shields.io/badge/Use%20with-Zed-2f363d?style=for-the-badge&labelColor=2f363d)](https://zed.dev)
[![Use with Cursor](https://img.shields.io/badge/Use%20with-Cursor-2f363d?style=for-the-badge&labelColor=2f363d)](cursor://anysphere.cursor-deeplink/prompt?text=Contribute%20to%20the%20Flisk%20CLI.%20Read%20the%20contributing%20guide%20at%20https%3A%2F%2Fgithub.com%2Fflisk-sh%2Fflisk%2Fblob%2Fmain%2FCONTRIBUTING.md%20and%20walk%20me%20through%20my%20first%20change%20step%20by%20step.)
[![Use with Windsurf](https://img.shields.io/badge/Use%20with-Windsurf-2f363d?style=for-the-badge&labelColor=2f363d)](https://windsurf.com)
[![Use with Codeanywhere](https://img.shields.io/badge/Use%20with-Codeanywhere-2f363d?style=for-the-badge&labelColor=2f363d)](https://codeanywhere.com)
[![Use with Augment Code](https://img.shields.io/badge/Use%20with-Augment%20Code-2f363d?style=for-the-badge&labelColor=2f363d)](https://www.augmentcode.com)
[![Use with Gemini CLI](https://img.shields.io/badge/Use%20with-Gemini%20CLI-2f363d?style=for-the-badge&labelColor=2f363d)](https://github.com/google-gemini/gemini-cli)
[![Use with Aider](https://img.shields.io/badge/Use%20with-Aider-2f363d?style=for-the-badge&labelColor=2f363d)](https://aider.chat/)
[![Use with GitHub Copilot](https://img.shields.io/badge/Use%20with-GitHub%20Copilot-2f363d?style=for-the-badge&labelColor=2f363d)](https://github.com/features/copilot)
[![Use with Antigravity](https://img.shields.io/badge/Use%20with-Antigravity-2f363d?style=for-the-badge&labelColor=2f363d)](https://antigravity.google/)

Or in VS Code: clone the repo, then **Dev Containers: Reopen in Container**.

The lightweight Dev Container provides Node.js 22 and Bun and runs `bun install` automatically. Most CLI changes only need:

```bash
bun run typecheck && bun run lint && bun run test
```

Docker and Tilt are **not** included in the default container (they are only needed when you want to try a full `flisk up`). See `.devcontainer/devcontainer.json` and the optional notes in the contributor guide if you need the heavier path.

**Local install (alternative):**

You need Git, [Bun](https://bun.sh) and Node.js 22.12+. Docker and Tilt are not needed for most changes.

```bash
git clone https://github.com/flisk-sh/flisk.git
cd flisk
bun install
bun run typecheck && bun run lint && bun run test   # about a minute; all of it should pass before you change anything
```

If one of these fails on a clean checkout, that is a bug in the project, not in your setup: please [open an issue](https://github.com/flisk-sh/flisk/issues/new/choose).


## CLI conventions

- `-y, --yes`: answer yes to confirmations and use defaults instead of prompting (`Skip prompts and confirmations; use defaults`). Every command that accepts `--yes` also accepts `-y` and registers it with `addYesOption` in `cli/src/utils/command-helpers.ts`.
- `--force` (or `-f, --force`): overwrite or override something that already exists (such as existing configuration, a running Tilt process, or an already-current version), never "skip confirmation".

## Supported platforms

For developing and running Flisk locally:

- **macOS and Linux**: Supported directly.
- **Windows**: Supported and recommended via WSL2 (Ubuntu). Native Windows is inspect-only (`flisk --version`, `flisk doctor`, and `flisk up --dry-run`) and refutes startup (`flisk up` exits with an error indicating landscape startup requires Ubuntu on WSL2). See the [WSL2 setup guide](docs/wsl2.md) and tracking in [#622](https://github.com/flisk-sh/flisk/issues/622).

## Getting help

If you have questions or encounter issues while contributing:

- **Bug report**: Use the [Bug report](https://github.com/flisk-sh/flisk/issues/new?template=bug_report.yml) template. Include steps to reproduce, what happened, what you expected, and the output of `flisk doctor` and `flisk --version`.
- **Feature request**: Use the [Feature request](https://github.com/flisk-sh/flisk/issues/new?template=feature_request.yml) template to suggest an idea or improvement.
- **Questions**: For quick questions, ideas, or general discussions that do not require an issue, use [GitHub Discussions](https://github.com/flisk-sh/flisk/discussions) or open a question via a blank issue.

Maintainers aim to reply within one working day.

## Code review

Every change goes through a pull request. Before a pull request is merged:

- The required checks pass: lint, typecheck, tests and fuzz (see `.github/workflows/ci.yml`).
- At least one person other than the author has reviewed the change. Authors cannot approve their own pull requests.
- The reviewer checks that the change does what the linked issue asks, that it has tests (see [Tests](#tests)), and that it does not weaken security checks or validation.
- Review comments that request changes are resolved before merge, or the author explains why they do not apply.

The full steps for reviewers, including what to look at, are in [docs/contributing/04-review-a-pr.md](docs/contributing/04-review-a-pr.md#who-can-approve-and-merge).

## Changing the CLI source

The CLI is committed as compiled output in `cli/dist/`, so `npm install -g github:flisk-sh/flisk` works without a build step. CI checks that `cli/dist/` matches `cli/src/`.

After you change anything under `cli/src/`:

```bash
cd cli && npm run check:dist   # builds, then fails if cli/dist changed
```

Commit the changed files under `cli/dist/`. New compiled files are gitignored, so add them with `git add -f cli/dist`.

The CI bot can rebuild `cli/dist/` and push it for pull requests from this repository. It cannot push to pull requests from forks, so if you opened yours from a fork, run the command above and push the commit yourself.

## Tests

Every new feature or behavior change needs automated tests in the same pull request. A change that affects a running stack (a resource type, a command or MCP tool that talks to the stack, `flisk up`, routing or the engine) also needs an end-to-end test. [Writing an e2e test](docs/contributing/05-write-e2e.md) explains when, where and how, including the deliberate-break evidence a new suite needs. Put tests next to the code they cover, or in the existing suite for that area (`cli/src/**/__tests__/`, `tests/fuzz/`). A bug fix adds a test that fails before the fix and passes after it. If a test is not practical, the pull request says why and links an issue that tracks adding it. Reviewers check this in every pull request, and the checks listed in [03-open-a-pr.md](docs/contributing/03-open-a-pr.md#run-the-checks-for-your-change) run the suite in CI.

### Unit tests and coverage

Flisk uses [Vitest](https://vitest.dev/) for CLI unit testing. You can run tests directly with Bun from the repository root:

- **Run all unit tests**:
  ```bash
  bun run test
  ```
- **Run a single test file or filter** (fast while writing tests):
  ```bash
  bun run test -- <filter-or-filename>
  # example:
  bun run test -- completion-install
  ```
- **Run with coverage report**:
  ```bash
  cd cli && bun run test:coverage
  ```
  This runs all unit tests with v8 coverage, prints a summary table in the terminal, generates an HTML report you can open in `cli/coverage/index.html`, and writes machine-readable summaries to `cli/coverage/coverage-summary.json`.

For a comprehensive guide covering Vitest structure, mocking external dependencies, test doubles, temporary projects, and golden files, see [Writing CLI unit tests](docs/contributing/08-write-cli-unit-tests.md).

### Where to put unit tests

- Place unit tests in a `__tests__/` directory directly next to the module they verify. For example:
  - CLI commands: `cli/src/commands/__tests__/<command>.test.ts`
  - Shared utilities: `cli/src/utils/__tests__/<utility>.test.ts`
- **Naming**: Name the test file after the source file, suffixed with `.test.ts` (for example, `completion-install.test.ts` tests `completion-install.ts`).
- **Prefer pure unit tests with mocks**: Keep tests fast, isolated, and deterministic. Avoid spawning live Docker containers or Tilt processes in unit tests; instead, mock external commands, file systems, or process executions using Vitest (`vi.mock()`) or test doubles from `cli/src/test-support/doubles.ts`.

### Coverage baseline and the ratchet process

High-risk CLI areas are protected by a coverage floor recorded in [`cli/coverage-baseline.json`](cli/coverage-baseline.json). The coverage ratchet script ([`cli/scripts/coverage-ratchet.mjs`](cli/scripts/coverage-ratchet.mjs)) verifies in CI that line and branch coverage in protected areas never regresses.

#### 1. Purpose of the baseline file

The baseline file sets minimum percentage thresholds for lines and branches across five high-risk CLI areas:
- **`install and update`**: `src/commands/upgrade.ts`, `src/utils/tdk-version.ts`, `src/utils/bun-floor.ts`, `src/utils/bun-requirement.ts`
- **`command implementations`**: all CLI commands under `src/commands/`
- **`validation`**: core schema and argument checks in `src/utils/validation.ts`
- **`discovery`**: path discovery and service contexts in `src/utils/discovery-paths.ts` and `src/utils/discovery-context.ts`
- **`stack and project handling`**: stack and project management in `src/utils/stack-*.ts` and `src/utils/project-*.ts`

#### 2. How the ratchet works

When CI runs `bun run test:coverage` inside `cli/`, Vitest generates a detailed JSON summary (`cli/coverage/coverage-summary.json`). The ratchet script:
1. Filters and maps covered lines and branches to their corresponding areas.
2. Calculates exact percentages (floored to two decimals so measurements never artificially exceed reality).
3. Compares each area against the floor in `cli/coverage-baseline.json`. If coverage falls below the baseline (even by 0.01%), the CI step fails with exit code `1` and details the drop in points.

To test the ratchet locally against your current coverage:
```bash
cd cli
bun run test:coverage
node scripts/coverage-ratchet.mjs
```

#### 3. Raising and lowering baselines

- **Raising a baseline (ratcheting up)**: When you add unit tests that increase an area's coverage, lock in that improvement! Run the ratchet with `--update` to rewrite `cli/coverage-baseline.json`:
  ```bash
  cd cli
  bun run test:coverage
  node scripts/coverage-ratchet.mjs --update
  ```
  Review `git diff cli/coverage-baseline.json` and include the updated baseline in your pull request.
- **Lowering a baseline**: Lowering a baseline is restricted and should be rare (for example, during major refactors or when deleting obsolete code). Any lower baseline must be isolated in its own single-purpose commit titled `coverage: lower baseline for <area>` with a clear explanation in the commit body.

#### 4. Finding coverage summaries in CI

CI makes coverage feedback accessible across several touchpoints:
1. **GitHub Actions Step Summary**: The `Coverage summary` step writes an overall lines, statements, functions, and branches table directly into `$GITHUB_STEP_SUMMARY` visible on the workflow run overview page.
2. **PR Test Summary Comment**: The test reporter aggregates `test-results/coverage-ratchet.json` and posts an automated pull request comment detailing per-area status.
3. **HTML Coverage Artifact**: Full interactive HTML reports are uploaded as the `cli-coverage-html` artifact (retained for 14 days), letting you inspect exact uncovered lines in any browser.
4. **Ratchet Gate Failure Log**: If coverage drops, the `Coverage ratchet for high-risk areas` step logs exactly which metric dropped and by how many points.

### Example test patterns to reference

New to writing tests for Flisk? Take a look at these existing test suites for patterns and conventions:
- **Command execution and flag contracts**: [`cli/src/commands/__tests__/completion-install.test.ts`](cli/src/commands/__tests__/completion-install.test.ts)
- **Pure logic and validation**: [`cli/src/commands/__tests__/api-path-constants.test.ts`](cli/src/commands/__tests__/api-path-constants.test.ts)
- **Mocking external processes and environment variables**: [`cli/src/commands/__tests__/agent-sessions.test.ts`](cli/src/commands/__tests__/agent-sessions.test.ts)

Run focused checks from the repository root while you work, then use `make test` as the comprehensive pre-PR entry point:

| I changed | Run |
| --- | --- |
| TypeScript or CLI logic | `make test-ts` |
| Python code, generators or Starlark-related logic | `make test-python` |
| Shell verification scripts or e2e suite files | `make test-shell` |
| Anything that runs against a live stack | `make test-e2e GROUP=<group> SUITE=<suite>` (see [writing an e2e test](docs/contributing/05-write-e2e.md)) |
| Multiple areas or anything before a PR | `make test` |

The TypeScript target requires Bun and Node.js 22.12+. The Python target requires the packages in `tests/requirements.txt`; it includes the known clean-checkout failures tracked in [#700](https://github.com/flisk-sh/flisk/issues/700) rather than hiding or skipping them. The shell target runs Bash syntax validation on `scripts/verify-*.sh` and the e2e suites, validates every `tests/e2e/<group>/<suite>/suite.json`, and runs the e2e helper unit tests. It does not start a stack. Run an affected verification script separately when you need its real integration coverage; those scripts document their own arguments and may require Docker, Tilt, a built CLI or network access.

## Find bugs

You do not need to write code to help. Run a command, compare what it prints with what Flisk promises (its `--help`, the docs, or another command), and report any difference. That is a bug.

[Finding bugs in Flisk](docs/contributing/finding-bugs.md) has the exact steps: a scratch project to test in, a checklist of commands with the output you should see, the patterns that found past bugs, and the report format maintainers can act on. For example, if `flisk networks` lists no URLs while `flisk up --dry-run` prints them, the two commands disagree, so one of them is wrong.

## Review pull requests

You can help without writing code by reviewing open [pull requests](https://github.com/flisk-sh/flisk/pulls). Every PR ends with **Grok**, **Claude**, and **Codex** buttons that open an AI chat already asked to review that PR. The AI is your helper: check what it says against the diff, then submit your own review on GitHub as **Comment**, **Approve**, or **Request changes**.

Before your first review, read the [required docs](docs/contributing/04-review-a-pr.md#before-your-first-review-required-reading) (about an hour, once). [Review a pull request](docs/contributing/04-review-a-pr.md) then explains the buttons step by step, with example comments for approving and for requesting changes.

## Find something to work on

- [The Flisk Journey](docs/journey/README.md): pick an island, finish a quest, rank up (8 kyu → 1 dan)
- [Good first issues](https://github.com/flisk-sh/flisk/labels/good%20first%20issue)
- [Help wanted](https://github.com/flisk-sh/flisk/labels/help%20wanted)
- [Hunt for bugs](docs/contributing/finding-bugs.md) with the step-by-step checklist
- [Report a bug or ask a question](https://github.com/flisk-sh/flisk/issues/new/choose)

If you pick an issue, comment `I'll take this` (or `I would like this one`, `I'd like to work on this`, `Can I take this?`). A bot assigns you and adds the `claimed` label so two people do not do the same work. A claim with no pull request is nudged after 14 days and released after 21; a draft PR counts as progress. For a bug report, include the output of `flisk doctor` when you can.

## Spell check

Install the pinned checker with `cargo install typos-cli --version 1.50.3`, then run `typos` from the repository root to check spelling.

## Labels

Use labels to find work that fits your interests and experience. Maintainers apply
labels during triage; issue forms and the PR labeler also apply some automatically.
The live [label list](https://github.com/flisk-sh/flisk/labels) includes
each label's description.

| Label | Meaning | When it is applied |
| --- | --- | --- |
| `bug` | Something does not work as expected. | Bug report forms and confirmed defects. |
| `enhancement` | A feature or improvement. | Feature request forms and accepted improvements. |
| `documentation` | Missing, incorrect, or unclear documentation. | Documentation forms and docs work. |
| `good first issue` | A small, self-contained task with little repo knowledge needed. | Maintainers identify a suitable first contribution. |
| `help wanted` | A task that needs community help, often larger than a first issue. | Maintainers welcome someone taking it on. |
| `difficulty: easy`, `difficulty: medium`, `difficulty: hard` | A few hours, a day or two, or work requiring deep repo knowledge or design. | Maintainers estimate the task's difficulty; these complement the contributor labels. |
| `question` | A request for clarification. | Maintainers triage a question rather than an implementation task. |
| `duplicate` | Another issue or PR already covers the work. | Maintainers link the original discussion. |
| `invalid`, `wontfix` | An invalid report or work the project will not take on. | Maintainers explain why the issue does not proceed. |
| `premium` | Premium license requests and paid features. | The premium issue form or maintainer triage. |
| `tracking` | An umbrella issue with related tasks. | Maintainers group work that spans multiple issues. |
| `community`, `examples`, `growth` | Community work, sample projects, or adoption improvements. | Maintainers identify outreach and adoption tasks. |
| `dx`, `design`, `guide` | Developer experience, visual or UX polish, or written guides. | Maintainers identify the kind of improvement. |
| `testing`, `ci`, `packaging` | Tests, GitHub Actions, or installers and packages. | Maintainers identify verification and delivery work. |
| `agents` | Documentation and files for AI coding agents. | Maintainers identify agent-facing work. |
| `rfc` | A design discussion before implementation. | Maintainers request agreement on a proposal's scope. |
| `windows` | Windows and WSL2 support. | Maintainers identify platform-specific work. |
| `performance`, `benchmark` | Speed or memory improvements, or measurement tooling. | Maintainers identify optimization and measurement work. |
| `hacktoberfest` | Work participating in Hacktoberfest. | Maintainers select eligible contributions for the event. |
| `area:*` | The affected surface, such as `area: tui`, `area: doctor`, or `area: cli`. | Maintainers label issues; the PR labeler derives areas from changed paths. |
| `tech:*` | A relevant technology, such as TypeScript, Docker, or Tilt. | Maintainers identify the tools involved in a task. |
| `rank:*`, `island:*` | Task size and topic on the Flisk Journey. | Maintainers place a quest on the contributor map. |
| `event:*` | Work targeting a named event, such as GitHub Universe. | Maintainers organize event-specific work. |

## Exit codes

CLI commands use a single error style and exit code convention. Report user-facing errors through `TdkError`, `showError`, or `showErrorAndExit` in `cli/src/utils/errors.ts` (which prefix the headline on `stderr` with `❌` and print optional `💡 Suggestions:` lines) rather than ad-hoc `chalk.red(...)` calls.

| Exit code | Meaning | Examples |
| --- | --- | --- |
| `0` | The command or check succeeded (including non-blocking warnings). | `flisk status`, `flisk config verify` on a clean project, `flisk doctor` with warnings only. |
| `1` | A blocking finding, missing prerequisite, or command/runtime failure. | Missing `.tdk/project.json`, `flisk config verify` drift, failed `flisk doctor` check, unreachable Tilt, native Windows startup refusal, failed smoke check, or a project whose vendored engine is too old for `flisk up --env-file`. |
| `2` | Invalid CLI arguments/flags, unknown `--only` / `--service` names, an unexpected internal error in `--json` mode, or `flisk up` hand-edited generated file drift (`DRIFT_EXIT_CODE = 2`, kept at `2` for CI compatibility). | Invalid `--port` or `--tail`, unknown service selector, malformed `.tdk/project.json` under `--json`, `flisk up` when `.autogenerated/` files were edited by hand, or a rejected `--env-file` path that is missing, unreadable or outside the project. |

## Sign your commits

Every commit needs a [Developer Certificate of Origin](DCO) sign-off. Add it with `git commit -s`, which appends `Signed-off-by: Your Name <you@example.com>`. To fix existing commits, run `git rebase --signoff origin/main` and force-push your branch. A pull request check fails when a commit is missing the line.

## Contributor recognition

Every contribution matters. When your pull request is merged:

- You are credited in the automated GitHub release notes for the next release.
- Your contribution is recorded in [CHANGELOG.md](CHANGELOG.md).
- You are recognized across the project contributor list and All Contributors records.

## Contributor badges

Every merged community PR earns you a personal `FLISK HALL OF FAME` badge you can copy into your portfolio or README. Your badge appears in the [Hall of fame: community contributors](https://github.com/flisk-sh/flisk/issues?q=is%3Aissue+is%3Aopen+label%3Acommunity) issue alongside a copy-ready markdown snippet.

See [Contributor badges](docs/contributing/contributor-badges.md) for how to find and use your badge.

## Add your team to the adopters list

Run Flisk on your own repository? You can be listed in [ADOPTERS.md](ADOPTERS.md) in either of two ways: open the [We use Flisk](https://github.com/flisk-sh/flisk/issues/new?template=we-use-flisk.yml) issue form, or add a row to the table in a pull request. [What counts](ADOPTERS.md#what-counts) explains what to link and what does not count.

## Governance

See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made and maintainers are added, [MAINTAINERS.md](MAINTAINERS.md) for who can merge, and [ADOPTERS.md](ADOPTERS.md) for teams using Flisk.

## Be kind

By taking part, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Please report security problems privately using [SECURITY.md](SECURITY.md), not in a public issue.
