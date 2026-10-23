## ADDED Requirements

### Requirement: Repository declares one pinned CLI version
A repository MUST be able to set `pinnedFliskVersion` in `.tdk/project.json` as a `MAJOR.MINOR.PATCH` string. Flisk MUST reject any other value as malformed.

#### Scenario: Valid pin
- **WHEN** `pinnedFliskVersion` is `"1.3.80"` and the running CLI is 1.3.80
- **THEN** the check passes and the command continues

#### Scenario: Malformed pin
- **WHEN** `pinnedFliskVersion` is `"latest"`
- **THEN** the command exits with code 1 and names the field and an example such as `"1.3.80"`

#### Scenario: Pin below the floor
- **WHEN** `pinnedFliskVersion` is lower than `minFliskVersion`
- **THEN** the configuration is reported as malformed

### Requirement: Mismatch is reported before any mutation
Flisk MUST compare the running CLI version with the pin before it writes generated files or starts services, and MUST exit with code 1 on a mismatch.

#### Scenario: Older or newer CLI
- **WHEN** the pin is 1.3.80 and the running CLI is 1.3.79 or 1.3.90
- **THEN** the output names the expected and current versions
- **AND** nothing is written and nothing is started

#### Scenario: Dry run
- **WHEN** `flisk up --dry-run` runs on a mismatch
- **THEN** it exits with code 1, as it does for the version floor

### Requirement: Mismatch output includes a copyable fix
A mismatch report MUST include a command that installs the pinned version and MUST say how to move the pin deliberately.

#### Scenario: Fix lines
- **WHEN** a mismatch is reported
- **THEN** the output includes `npm install -g @flisk-sh/flisk@<pinned version>`
- **AND** states that editing `pinnedFliskVersion` moves the pin deliberately

### Requirement: Escape hatches stay available
Commands needed to leave a mismatch MUST NOT be blocked by it. The existing `--ignore-version` flag MUST bypass the pin check on `flisk up` with a warning, and every other gated command MUST offer a documented bypass that also warns.

#### Scenario: Upgrade and version under mismatch
- **WHEN** the pin does not match
- **THEN** `flisk upgrade`, `flisk version`, and `flisk completion` still run

#### Scenario: Ignore flag
- **WHEN** `flisk up --ignore-version` runs on a mismatch
- **THEN** it warns that the pin was not checked and continues

### Requirement: Doctor and CI can validate the pin
`flisk doctor` MUST report the pin check with the same message and fix as `flisk up`, so CI can validate the pinned version by running it.

#### Scenario: Doctor
- **WHEN** `flisk doctor` runs on a mismatch
- **THEN** the version check fails with the same message and fix

#### Scenario: CI
- **WHEN** CI installs the version read from `pinnedFliskVersion` and runs `flisk doctor`
- **THEN** the job fails if the installed version differs from the pin

### Requirement: Unpinned repositories are unchanged
A project without `pinnedFliskVersion` MUST behave exactly as before, including `minFliskVersion` handling.

#### Scenario: No pin
- **WHEN** `pinnedFliskVersion` is absent
- **THEN** behavior is identical to today

#### Scenario: Bypass on another gated command
- **WHEN** `flisk config regenerate` runs on a mismatch with the documented bypass set
- **THEN** it warns that the pin was not checked and continues