## Why

`minTdkVersion` only sets a floor, so a team can still run different Flisk versions
against one project and get different generated files and validation results.
Issue #1761 asks for one repository-pinned version, enforced before anything is
written or started (follow-up to #564, CI usage coordinated with #1756).

## What Changes

- Add optional `pinnedTdkVersion` (`MAJOR.MINOR.PATCH`) to `.tdk/project.json`.
- Extend `cli/src/utils/tdk-version.ts` with `evaluateTdkVersionPin`
  (`none | ok | mismatch | malformed`).
- Check the pin from `enforceVersionFloor` (`flisk up`, also under `--dry-run`),
  from `flisk doctor`, and before commands that write project files.
- A mismatch reports expected and current versions plus a copyable install command.
- Update the project schema, `docs/upgrading.md`, `docs/ci.md`,
  `docs/troubleshooting.md`, `docs/cheat-sheet.md`, and the CHANGELOG.

## Capabilities

### New Capabilities
- `pinned-tdk-version`: exact CLI version pinning per repository.

### Modified Capabilities
- None.

## Non-goals

- Semver ranges, a `flisk pin` subcommand, or automatic CLI version switching.
- Changing how `minTdkVersion` behaves for existing projects.
- Adding `install.sh` support for installing older tags.

## Impact

- `cli/src/utils/tdk-version.ts`, `cli/src/commands/up.ts`, `doctor.ts`, and the
  project schema; `cli/dist/` rebuilt.
- Projects without `pinnedTdkVersion` behave exactly as before.