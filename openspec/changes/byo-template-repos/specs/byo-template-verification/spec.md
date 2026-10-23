## ADDED Requirements

### Requirement: Every template verifies itself

Each template repository SHALL run `.github/workflows/verify.yml` on every pull request and on pushes to its default branch. The workflow SHALL build the image from the `Dockerfile`, run it with `PORT=4000`, wait up to the template's start window, and require HTTP 200 on `healthPath`. A failing build, a container that exits, or a non-200 status SHALL fail the workflow and upload the container log as an artifact.

#### Scenario: Passing template

- **WHEN** a pull request changes only a README
- **THEN** the verify workflow still builds the image and the check passes

#### Scenario: Container exits early

- **WHEN** the container exits with a non-zero code before answering
- **THEN** the workflow fails and the log artifact contains the container output

#### Scenario: Non-200 answer

- **WHEN** `healthPath` returns 404
- **THEN** the workflow fails and prints the status code

### Requirement: Shared verify script, not twelve copies

The verify logic SHALL come from one reusable workflow and one script, `verify-byo-template.sh`, published in the scaffolder repository (or this repository) and called by each template's workflow by pinned SHA. A template repository SHALL NOT carry its own copy of the HTTP check.

#### Scenario: Reusable workflow

- **WHEN** a template's `verify.yml` is read
- **THEN** it calls a reusable workflow with `uses: <owner>/<repo>/.github/workflows/verify-template.yml@<sha>`

#### Scenario: Fix once

- **WHEN** the shared script is fixed and the SHA is bumped in a template
- **THEN** the template picks up the fix without editing script code

### Requirement: Monorepo e2e leg keeps passing

The BY1 `example` variant in `tests/e2e/resource-types/bring-your-own/suite.json` SHALL keep running `verify-byo-example.sh` against each synced template. Its first step SHALL be the sync script for the template under test. The suite `paths` SHALL include `examples/byo/templates.json` and `scripts/sync-byo-templates.sh` so changing a pin or the script triggers the leg.

#### Scenario: Pin change triggers the leg

- **WHEN** a pull request changes only `examples/byo/templates.json`
- **THEN** the BY1 variant runs

#### Scenario: Matrix covers every template

- **WHEN** the BY1 matrix is expanded
- **THEN** there is one job per template id in `templates.json`

### Requirement: Through-Flisk check for one template

At least one template SHALL be verified through `flisk up` and Traefik, not only as a standalone container, using the existing `verify-byo-tdk.sh` approach: register the resource, start the stack, and request it at `http://<name>.<project>.localhost/`. The check SHALL state the observed status code and SHALL NOT claim more than it observed. A standalone `docker run` SHALL NOT be reported as proof that a template works under Flisk.

#### Scenario: Through the stack

- **WHEN** the `vue` template is registered with `flisk resource` and the stack is brought up
- **THEN** the request through Traefik returns 200 and the check prints the URL and status

#### Scenario: Honest claim

- **WHEN** only the standalone check ran
- **THEN** the report says "container-only" and does not say "works with flisk up"

### Requirement: Weekly drift job

A scheduled workflow SHALL run weekly. For each template it SHALL build the image with the Docker build cache disabled, so the `@latest` scaffolder is fetched again, run the HTTP check, and compare the result to the last passing run.

#### Scenario: Upstream release breaks a template

- **WHEN** `create-nuxt` ships a change and the nuxt image no longer answers 200
- **THEN** an issue is opened with the failing build log and the scaffolder version

#### Scenario: One issue per template

- **WHEN** the same template fails two weeks in a row
- **THEN** the existing issue gets a comment and no second issue is created

#### Scenario: Recovery closes the issue

- **WHEN** the next weekly run passes
- **THEN** the issue is closed with a link to the passing run

### Requirement: Drift opens one issue per template

When a template that passed last week fails now, the weekly workflow SHALL open or update one issue titled `Template <id> fails against latest <scaffolder>` with the log, labeled `examples` and `bug`. When the template recovers, it SHALL comment and close the issue.

#### Scenario: Failure opens an issue

- **WHEN** a template passed last week and fails now
- **THEN** one issue with the build log is opened or updated

### Requirement: Flaky versus broken

A check that fails and passes on retry SHALL be reported as flaky and SHALL NOT open an issue unless it fails three runs in a row. The workflow SHALL retry a failed template once, after 60 seconds, before reporting.

#### Scenario: Retry passes

- **WHEN** the first attempt fails on a network timeout and the retry passes
- **THEN** no issue is opened and the run summary says "retried"

### Requirement: Scorecard of templates

The weekly job SHALL write a summary table to the workflow run and to a `status.json` published on the project site: template id, pinned tag, scaffolder version seen, last pass date, status. The README of the scaffolder repository SHALL link to it.

#### Scenario: Summary table

- **WHEN** the weekly job finishes
- **THEN** the run summary has one row per template

#### Scenario: Stale status is visible

- **WHEN** a template has not passed in 30 days
- **THEN** its row is marked "stale"

### Requirement: Resource limits

The verify job SHALL have a timeout of 20 minutes per template, SHALL run templates in a matrix with at most four jobs at once, and SHALL clean up containers and images it created, including when the job fails. A verify job SHALL NOT remove containers it did not create.

#### Scenario: Timeout

- **WHEN** a build exceeds 20 minutes
- **THEN** the job is cancelled and the log notes the timeout

#### Scenario: Cleanup on failure

- **WHEN** the job fails mid-run
- **THEN** the container and image it created are removed
- **AND** other containers on the runner are untouched

### Requirement: Scaffolder tests

The scaffolder SHALL have automated tests that cover: listing, an unknown template, the interactive picker with a faked terminal, writing files into a temporary directory, refusing to overwrite, `--dry-run`, `--json`, missing `flisk`, a failing `flisk resource`, archive path traversal, and the registry parity check. Tests SHALL run without network access by using a local fixture archive.

#### Scenario: Offline test run

- **WHEN** the scaffolder tests run with the network disabled
- **THEN** all tests pass using the fixture

#### Scenario: Traversal test

- **WHEN** the fixture contains a `../` entry
- **THEN** the test asserts nothing was written outside the temporary directory

### Requirement: Spec and docs checks

CI in this repository SHALL run `openspec validate --strict` for this change, the JSON Schema check for `templates.json`, the typos check on new docs, and the link check on `docs/byo.md`, `examples/byo/README.md` and `CONTRIBUTING.md`.

#### Scenario: Invalid registry

- **WHEN** `templates.json` has an entry without `repository`
- **THEN** the schema check fails and names the entry

#### Scenario: Broken doc link

- **WHEN** `docs/byo.md` links to a template path that neither exists nor is declared synced
- **THEN** the link check fails
