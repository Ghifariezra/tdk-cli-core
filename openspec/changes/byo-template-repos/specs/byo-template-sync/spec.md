## ADDED Requirements

### Requirement: Registry is the single pin

`examples/byo/templates.json` SHALL list every template that is synced from its own repository. Each entry SHALL have `id`, `folder` (the directory under `examples/byo/`), `repository` (`flisk-sh/flisk-template-<id>`), `tag` (the pinned release), `healthPath` and `port`. No other file in this repository SHALL hold a template version. The file SHALL validate against a JSON Schema committed beside it.

#### Scenario: Entry for vue

- **WHEN** `templates.json` is read
- **THEN** there is an entry with `id` `vue`, `folder` `create-vue` and `repository` `flisk-sh/flisk-template-vue`
- **AND** `tag` matches `^v\d+\.\d+\.\d+$`

#### Scenario: Duplicate folder is rejected

- **WHEN** two entries share a `folder`
- **THEN** schema validation fails and names both ids

#### Scenario: Branch pin is rejected

- **WHEN** an entry has `tag` set to `main`
- **THEN** schema validation fails

### Requirement: Folder names stay unchanged

The sync script SHALL write each template to `examples/byo/<folder>/` using the existing folder name (`create-vue`, not `vue`). Every existing reference to those paths, including `verify-byo-example.sh <folder> <health>`, the `examples/byo/**` glob in `tests/e2e/resource-types/bring-your-own/suite.json`, links in `docs/` and the Tilt/Docker build context, SHALL keep working with no edit.

#### Scenario: Existing check command still works

- **WHEN** `tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-vue /` is run after a sync
- **THEN** it builds `examples/byo/create-vue/Dockerfile` and expects HTTP 200 on `/`

#### Scenario: Glob still matches

- **WHEN** a template repository's contents are synced into `examples/byo/create-hono/`
- **THEN** the path matches the `examples/byo/**` entry in `suite.json`

### Requirement: Sync script

`scripts/sync-byo-templates.sh` SHALL read `templates.json`, and for each entry (or the ids named on the command line) clone `https://github.com/<repository>.git` at the pinned `tag` with `--depth 1 --branch <tag>` into a temporary directory, verify that the checkout's `template.json` `id` equals the entry's `id`, and replace `examples/byo/<folder>/` with the checkout contents minus `.git`. It SHALL print the resolved commit SHA for each template.

#### Scenario: Script never escalates

- **WHEN** the script needs a permission it does not have
- **THEN** it exits non-zero and prints the manual command, and never calls `sudo`

#### Scenario: Sync one template

- **WHEN** `scripts/sync-byo-templates.sh vue` is run
- **THEN** only `examples/byo/create-vue/` is replaced
- **AND** the script prints the repository, tag and commit SHA

#### Scenario: Missing tag leaves the folder alone

- **WHEN** the pinned tag does not exist in the repository
- **THEN** the script exits non-zero and prints the tag and repository
- **AND** the previous `examples/byo/<folder>/` contents are unchanged

#### Scenario: Id mismatch is refused

- **WHEN** the cloned `template.json` has `id` `nuxt` but the entry is `vue`
- **THEN** the script exits non-zero without writing the folder

#### Scenario: Offline run fails fast

- **WHEN** the network is unavailable
- **THEN** the script exits non-zero within 30 seconds per template and prints the manual `git clone` command to run instead

### Requirement: Sync failures leave the folder untouched

The sync script SHALL exit non-zero if a tag does not exist, a clone fails or an id check fails, and SHALL leave the previous folder contents unchanged in that case.

#### Scenario: Clone fails halfway

- **WHEN** the clone is interrupted
- **THEN** the script exits non-zero and the previous folder is unchanged

### Requirement: Synced folders are not tracked

Synced template folders SHALL be listed in `.gitignore` so a developer cannot commit them by mistake, and SHALL NOT be git submodules. A pre-commit check SHALL fail when a path listed in `templates.json` is staged. The sync script SHALL write a `.synced-from` file in each folder naming the repository, tag and commit SHA.

#### Scenario: Staging a synced folder fails

- **WHEN** a developer runs `git add -f examples/byo/create-vue/Dockerfile` and commits
- **THEN** the pre-commit check fails and says the folder comes from `flisk-sh/flisk-template-vue`

#### Scenario: Provenance file present

- **WHEN** a sync completes
- **THEN** `examples/byo/create-vue/.synced-from` contains the repository, `tag` and a 40-character commit SHA

#### Scenario: No submodule metadata

- **WHEN** `.gitmodules` is read
- **THEN** it does not exist, or it has no entry under `examples/byo/`

### Requirement: Clean checkouts do not need the templates

A fresh clone of this repository SHALL be able to run `bun run typecheck`, `bun run lint`, `bun run test`, `make test-shell` and every `flisk` command without running the sync script. Only the example e2e legs, documentation link checks that target synced paths, and the scheduled workflows SHALL require the sync.

#### Scenario: Unit tests without sync

- **WHEN** a contributor clones the repository and runs `bun run test` without syncing
- **THEN** the test run does not fail because an `examples/byo/create-*` folder is missing

#### Scenario: Example leg syncs first

- **WHEN** the BY1 e2e leg starts
- **THEN** its first step is `scripts/sync-byo-templates.sh` for the template under test

### Requirement: Link checks tolerate unsynced folders

Documentation that links to `examples/byo/create-*/README.md` SHALL link to the template repository's README instead, or the link checker SHALL treat those paths as synced and skip them when the folder is absent.

#### Scenario: Link check on a clean clone

- **WHEN** the documentation link check runs on a clone without a sync
- **THEN** links into `examples/byo/create-vue/` do not fail the check

### Requirement: Scheduled pin bumps

A scheduled workflow SHALL run daily, query the latest release tag of every repository in `templates.json`, and for each template with a newer semantic version tag open or update one pull request that changes only that entry's `tag`. The pull request title SHALL be `chore(byo): bump <id> template to <tag>`, it SHALL link the release notes, and it SHALL be labeled `examples` and `dependencies`. A MAJOR bump SHALL NOT be merged automatically.

#### Scenario: Patch release opens a bump pull request

- **WHEN** `flisk-template-hono` publishes `v1.0.1` and the registry pins `v1.0.0`
- **THEN** a pull request changes the `hono` entry `tag` to `v1.0.1` and nothing else

#### Scenario: Existing bump pull request is updated, not duplicated

- **WHEN** a bump pull request for `hono` is open and `v1.0.2` is released
- **THEN** the same pull request is updated to `v1.0.2`

#### Scenario: Major bump waits for a human

- **WHEN** a template releases `v2.0.0`
- **THEN** the pull request is opened with the label `needs-review`
- **AND** auto-merge is not enabled

### Requirement: Pin integrity

CI SHALL fail a pull request that changes a `tag` to one that does not exist, to one lower than the current pin, or to a tag whose commit is not reachable from the repository's default branch.

#### Scenario: Downgrade is blocked

- **WHEN** a pull request moves `vue` from `v1.2.0` to `v1.1.0`
- **THEN** the pin check fails unless the pull request carries the `allow-template-downgrade` label

#### Scenario: Orphan tag is blocked

- **WHEN** the tag points at a commit that is not on `main` of the template repository
- **THEN** the pin check fails

### Requirement: Same bytes locally and in CI

The sync script SHALL be the only way templates reach `examples/byo/`, locally and in CI. Workflows SHALL call the script and SHALL NOT clone template repositories inline.

#### Scenario: Workflow uses the script

- **WHEN** a workflow file under `.github/workflows/` references a `flisk-template-` repository
- **THEN** it does so only through `scripts/sync-byo-templates.sh`
