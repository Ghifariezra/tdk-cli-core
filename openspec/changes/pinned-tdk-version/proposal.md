## Why

`minFliskVersion` only sets a floor, so a team can still run different Flisk versions
against one project and get different generated files and validation results.
Issue #1761 asks for one repository-pinned version, enforced before anything is
written or started (follow-up to #564, CI usage coordinated with #1756).

## What Changes

- Add optional `pinnedFliskVersion` (`MAJOR.MINOR.PATCH`) to `.tdk/project.json`.
- Add `evaluateFliskVersionPin` in `cli/src/utils/flisk-version.ts`
  (`none | ok | mismatch | malformed`).
- Check the pin from `enforceVersionFloor` (`flisk up`, also under `--dry-run`),
  from `flisk doctor`, and before commands that write project files.
- A mismatch reports expected and current versions plus a copyable install command.
- Update the project schema, `docs/upgrading.md`, `docs/ci.md`, `docs/troubleshooting.md`, `docs/cheat-sheet.md`, and the CHANGELOG.
- Rename `minTdkVersion` to `minFliskVersion` (schema, evaluator, `up`, `doctor`, tests, docs).

## Capabilities

### New Capabilities
- `pinned-tdk-version`: exact CLI version pinning per repository.

### Modified Capabilities
- None.

## Non-goals

- Semver ranges, a `flisk pin` subcommand, or automatic CLI version switching.
- Adding `install.sh` support for installing older tags.
- Changing the semantics of the minimum-version floor (only its name changes).

## Impact

- `cli/src/utils/flisk-version.ts`, `cli/src/commands/up.ts`, `doctor.ts`, and the
  project schema; `cli/dist/` rebuilt.
- Projects without `pinnedFliskVersion` behave exactly as before.