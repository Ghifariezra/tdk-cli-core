## Context

`minTdkVersion` (renamed to `minFliskVersion` by this change) lives in `.tdk/project.json` with an evaluator shared by
`flisk up` and `flisk doctor`. It is a floor: newer CLIs pass. Teams need an exact pin.

## Goals / Non-Goals

**Goals:** one canonical pin, a clear mismatch message before any mutation,
a copyable fix, CI-readable, no change for unpinned repos.
**Non-Goals:** semver ranges, a `flisk pin` subcommand, auto-switching versions,
`install.sh` support for older tags (not documented today).

## Decisions

1. **Field in `.tdk/project.json`, named `pinnedFliskVersion` (per maintainer review).** Reuses the file and
   schema the floor uses; CI can read it with `jq` without running Flisk. A separate
   `.tdk-version` file would create a second source of truth next to `minFliskVersion`.
2. **Exact `MAJOR.MINOR.PATCH`**, same pattern as `minFliskVersion`. Ranges are a follow-up.
3. **Mismatch is two-way.** A newer CLI than the pin is also a mismatch; that is the
   point of pinning. The fix is not `flisk upgrade` (it only goes to latest):
   `npm install -g @flisk-sh/flisk@<pin>`, or edit the pin to move it deliberately.
4. **Pin and floor coexist.** If `pinnedFliskVersion` < `minFliskVersion`, the config is
   `malformed`. When a pin is set and matches, the floor is satisfied by construction.
5. **Bypass with the existing `--ignore-version`**, with a warning. `flisk doctor` still reports it.
6. **Exempt commands:** `upgrade`, `version`, `completion`, help. Blocking them would
   leave no way out of a mismatch.
7. **Enforcement point:** keep `enforceVersionFloor` as the single call site for `up`. Other commands call a shared gate right after resolving the project root, before any read-modify-write: `config` (regenerate, migrate, verify, enable-infra, disable-infra), `eject`, `resource` (not `resource --frameworks`), and `stack`. `project` is not gated: a new project has no `.tdk/project.json`, so the pin evaluates to none. `config edit` and `resource --frameworks` stay exempt.
8. **Rename `minTdkVersion` to `minFliskVersion`**, per maintainer review. Open question: keep `minTdkVersion` readable as a deprecated alias for one release, or hard rename?

## Risks / Trade-offs

- A newer CLI is rejected on purpose; the message must make the escape obvious.
- Command names can drift; the copyable command must come from one constant.

## Open Questions

- Bypass outside `up`: one shared environment variable (for example `FLISK_IGNORE_VERSION=1`) or a `--ignore-version` flag per command.
- Alias for `minTdkVersion` for one release, or hard rename?