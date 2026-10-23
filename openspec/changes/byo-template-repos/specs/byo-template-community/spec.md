## ADDED Requirements

### Requirement: Contributing a template guide

The repository SHALL document how to add a new template in `docs/contributing/` and link it from `CONTRIBUTING.md` and `docs/contributing/02-feature-recipes.md`. The guide SHALL cover: choosing an upstream scaffolder, finding its non-interactive flags, writing the `Dockerfile` to the container contract, filling `template.json`, running the verify script, asking for a repository, and getting a registry entry merged. Every command in the guide SHALL be one the author ran.

#### Scenario: Guide is reachable

- **WHEN** a contributor opens `CONTRIBUTING.md`
- **THEN** a link to "Contributing a template" is in the table of contents

#### Scenario: Commands are real

- **WHEN** the guide shows `scripts/sync-byo-templates.sh vue`
- **THEN** the command exists and works as shown

### Requirement: Template repository skeleton

The project SHALL publish a template repository skeleton (a GitHub template repository, `flisk-sh/flisk-template-skeleton`) with the required files, a placeholder `template.json`, the verify workflow, issue forms, a pull request template and a CONTRIBUTING pointer. Creating a new template SHALL be one click on "Use this template" plus filling the placeholders.

#### Scenario: Skeleton passes its own check

- **WHEN** the skeleton repository's verify workflow runs unchanged
- **THEN** it passes against the placeholder `Dockerfile`

#### Scenario: Placeholders are obvious

- **WHEN** a contributor forgets to replace `REPLACE_ME`
- **THEN** the skeleton check fails and names the file

### Requirement: Template request form

This repository SHALL have an issue form, `.github/ISSUE_TEMPLATE/template-request.yml`, for asking for a new template. It SHALL ask for: the upstream scaffolder name and link, why it is useful, whether the requester will maintain it, the non-interactive command they tried, and the expected port and health path. Submitted issues SHALL be labeled `examples`, `community` and `help wanted`.

#### Scenario: Form fields

- **WHEN** a user opens the template request form
- **THEN** all five questions are shown and the upstream link is required

#### Scenario: Labels applied

- **WHEN** the form is submitted
- **THEN** the issue has the labels `examples`, `community` and `help wanted`

### Requirement: Good first issues per template

Each template repository SHALL start with at least two open issues labeled `good first issue` that a newcomer can finish in one sitting (for example "add a `.dockerignore`", "document the upstream flags"). Maintainers SHALL keep the labels `good first issue` and `help wanted` in sync across the template repositories.

#### Scenario: Seed issues exist

- **WHEN** a new template repository is created
- **THEN** it has two `good first issue` issues within one day

#### Scenario: Labels exist

- **WHEN** a template repository is created
- **THEN** the labels `good first issue`, `help wanted`, `bug` and `upstream-change` exist

### Requirement: Maintainers and CODEOWNERS

Each template repository SHALL have a `CODEOWNERS` file listing at least one named owner and the `@flisk-sh/maintainers` team. Named owners SHALL be people who asked to maintain the template. A template with no named owner for 90 days SHALL be marked "looking for maintainer" in its README and in the registry.

#### Scenario: Owner listed

- **WHEN** `CODEOWNERS` is read
- **THEN** it contains `@flisk-sh/maintainers` and at least one more owner or the explicit text "looking for maintainer"

#### Scenario: Unowned template flagged

- **WHEN** no named owner exists for 90 days
- **THEN** the registry entry carries `"maintainer": "wanted"` and the README says so

### Requirement: Public list of templates

The `flisk` README and `examples/byo/README.md` SHALL list every template repository with a one-line description and a link, generated from `templates.json` by a script so the list cannot drift. The Flisk website SHALL link to the same list.

#### Scenario: List matches the registry

- **WHEN** the README list is compared to `templates.json`
- **THEN** every id appears once and there are no extra rows

#### Scenario: Generated, not typed

- **WHEN** `templates.json` gains an entry
- **THEN** `scripts/render-byo-template-list.sh` adds its row and the check passes only when the README is regenerated

### Requirement: Recognition

Contributors to template repositories SHALL be counted in the same contributor recognition and badge process described in `CONTRIBUTING.md`. The process SHALL read commits from the template repositories listed in `templates.json`.

#### Scenario: Template commit counts

- **WHEN** a contributor lands a merged pull request in `flisk-template-hono`
- **THEN** they appear in the contributor recognition list

### Requirement: Code of conduct, security and support

Each template repository SHALL link to this organization's `CODE_OF_CONDUCT.md`, `SECURITY.md` and `SUPPORT.md` (through the organization's `.github` repository or a copy kept in sync). Security reports about a template SHALL go to the address in `SECURITY.md`, not to public issues.

#### Scenario: Security link

- **WHEN** a user opens the "Security" tab of a template repository
- **THEN** it shows the policy from `SECURITY.md`

### Requirement: Upstream relationship

When a template fails because of an upstream change, the maintainers SHALL first check whether the upstream project has an open issue, link it from the Flisk issue, and only add a workaround to the `Dockerfile` if the upstream fix is not imminent. Workarounds SHALL carry a comment naming the upstream issue and SHALL be removed when it is closed.

#### Scenario: Workaround comment

- **WHEN** a `Dockerfile` pins a flag to work around upstream
- **THEN** a comment above it links the upstream issue

#### Scenario: Workaround removal

- **WHEN** the upstream issue is closed
- **THEN** the weekly job opens an issue "remove workaround for <upstream issue>"

### Requirement: Announcement and discovery

The project SHALL announce the template repositories and the scaffolder once, after the first stable scaffolder release, in the changelog and the project's discussion board. Each template repository SHALL set GitHub topics `flisk`, `template`, `docker` and the upstream framework name so it is found by search.

#### Scenario: Topics set

- **WHEN** a template repository is created
- **THEN** its topics include `flisk`, `template`, `docker` and the framework name

#### Scenario: Changelog entry

- **WHEN** the first stable scaffolder release is tagged
- **THEN** `CHANGELOG.md` has an entry linking the template list

### Requirement: Adopters and feedback

`ADOPTERS.md` SHALL gain an optional "templates we use" column or note, and the scaffolder SHALL print, once per run and only in interactive mode, a single line pointing at the template request form. The line SHALL be suppressed by `CI` or `--quiet`.

#### Scenario: Quiet run

- **WHEN** `--quiet` is passed
- **THEN** no feedback line is printed
