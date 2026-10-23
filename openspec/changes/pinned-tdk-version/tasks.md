## 1. Schema and evaluator
- [ ] 1.0 Rename `minTdkVersion` to `minFliskVersion` and `tdk-version.ts` to `flisk-version.ts` in schema, evaluator, `up`, `doctor`, tests and docs
- [ ] 1.1 Add `pinnedFliskVersion` to the project schema and its contract test
- [ ] 1.2 Add `evaluateFliskVersionPin` in `flisk-version.ts` with unit tests (in the renamed file; update imports in `up.ts` and `doctor.ts`)
- [ ] 1.3 Reject a pin lower than `minFliskVersion` as malformed

## 2. Enforcement
- [ ] 2.1 Call the pin check from `enforceVersionFloor` (up and dry-run)
- [ ] 2.2 Add the pin check to `checkFliskVersion` in `doctor.ts`
- [ ] 2.3 Audit `config` (regenerate, migrate, verify, enable-infra, disable-infra), `eject`, `resource`, and `stack` for file writes and gate them with a shared helper
- [ ] 2.4 Keep `upgrade`, `version`, `completion` exempt, with tests

## 3. Docs and release
- [ ] 3.1 Update `docs/upgrading.md`, `docs/ci.md`, `docs/troubleshooting.md`, `docs/cheat-sheet.md`, `docs/how-tdk-up-works.md`
- [ ] 3.2 Add a CI example that reads the pin with `jq` (coordinate with #1756)
- [ ] 3.3 CHANGELOG Unreleased entry
- [ ] 3.4 `cd cli && npm run check:dist` and commit `cli/dist/`