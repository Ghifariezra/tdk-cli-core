## ADDED Requirements

### Requirement: One repository per scaffolder wrapper

Each of the twelve wrappers in `examples/byo/` SHALL live in its own repository under the `flisk-sh` organization, named `flisk-template-<id>`. The `<id>` SHALL be the upstream scaffolder package name with its `create-` prefix removed: `adonisjs`, `analog`, `astro`, `bati`, `better-t-stack`, `hono`, `mastra`, `next-app`, `nuxt`, `react-router`, `refine` and `vue`. A repository name SHALL NOT start with `create-`, because those names belong to the upstream projects.

#### Scenario: Every current wrapper has a repository name

- **WHEN** the template registry is read
- **THEN** it lists exactly twelve ids
- **AND** each id maps to a repository named `flisk-sh/flisk-template-<id>`
- **AND** no repository name starts with `create-`

#### Scenario: Id is derived, not invented

- **WHEN** the wrapper folder is `examples/byo/create-next-app`
- **THEN** its template id is `next-app`
- **AND** its repository is `flisk-sh/flisk-template-next-app`

### Requirement: Template repository contents

A template repository SHALL contain, at its root: a `Dockerfile`, a `README.md`, a `template.json` manifest, a `LICENSE`, a `CONTRIBUTING.md`, a `.github/workflows/verify.yml` and a `.github/ISSUE_TEMPLATE/` directory. It SHALL NOT contain scaffolded application source. The scaffolder runs at image build time, so the repository stays in step with upstream instead of freezing a copy of it.

#### Scenario: Repository has no scaffolded source

- **WHEN** a template repository is cloned
- **THEN** the only files needed to build it are the `Dockerfile` and files it copies
- **AND** the repository has no `node_modules`, lockfile for the scaffolded app or generated `src/` tree

#### Scenario: Missing required file fails the skeleton check

- **WHEN** a template repository has no `template.json`
- **THEN** the repository skeleton check fails and names the missing file

### Requirement: Template manifest

Each template repository SHALL describe itself in `template.json` with these fields: `id`, `label`, `upstream` (the scaffolder command, for example `npm create vue@latest`), `port` (the default), `healthPath`, `stack` (a short description), `notes`, and `resourceCommand` (the exact `flisk resource` command, with `<name>` as the placeholder). `template.json` SHALL validate against the JSON Schema `byo-template.schema.json`, published in the scaffolder repository.

#### Scenario: Manifest names the health path

- **WHEN** `template.json` for `vue` is read
- **THEN** `healthPath` is `/`
- **AND** `port` is `3000`

#### Scenario: Manifest and README disagree

- **WHEN** a pull request changes `template.json` `port` but not the `README.md` check command
- **THEN** the verify workflow fails and prints both values

### Requirement: README agrees with the manifest

The `README.md` SHALL NOT state a port, health path or command that differs from `template.json`. It SHALL be generated from the manifest or checked against it in CI.

#### Scenario: README repeats the manifest port

- **WHEN** the README check command names port `3000` and `template.json` says `3000`
- **THEN** the check passes

### Requirement: Container contract compliance

Every template's image SHALL meet the container contract in `docs/byo.md`: the process reads `PORT` (falling back to the template default), binds `0.0.0.0`, answers HTTP 200 on `healthPath`, and runs as a non-root user. The base image SHALL be pinned by digest. A `HEALTHCHECK` SHALL be present unless the base image makes one impossible, in which case the README SHALL say why.

#### Scenario: Image answers on the assigned port

- **WHEN** the image is run with `PORT=4000`
- **THEN** an HTTP request to `http://127.0.0.1:4000<healthPath>` returns status 200 within the start window

#### Scenario: Image runs as non-root

- **WHEN** the running container is inspected
- **THEN** the effective user is not `root`

#### Scenario: Unpinned base image is rejected

- **WHEN** a `Dockerfile` has a `FROM` line without an `@sha256:` digest
- **THEN** the verify workflow fails and names the line

### Requirement: Upstream scaffolder is called, not copied

A template `Dockerfile` SHALL invoke the upstream scaffolder with explicit, non-interactive flags, and SHALL NOT vendor the scaffolder's output. A wrapper that cannot run the scaffolder non-interactively (the Refine wrapper pipes Enter presses today) SHALL document the workaround in its README and open or link an upstream issue.

#### Scenario: Non-interactive invocation

- **WHEN** the image is built without a terminal
- **THEN** the scaffolder step completes without prompting
- **AND** the build fails if the scaffolder waits for input past the build timeout

#### Scenario: Workaround is documented

- **WHEN** a `Dockerfile` pipes input into the scaffolder
- **THEN** the README has a "Notes" entry explaining why and linking the upstream issue

### Requirement: Versioning and release tags

Template repositories SHALL be versioned with semantic version tags `vMAJOR.MINOR.PATCH`. The registry in this repository pins the tag, never a branch and never a bare commit. A change to the scaffolder flags, the base image, the port or the health path that could change what a project built from the template does SHALL be a MINOR or MAJOR release. A documentation-only change SHALL be a PATCH release.

#### Scenario: Pin is a tag

- **WHEN** the registry pin for `vue` is read
- **THEN** it matches `^v\d+\.\d+\.\d+$`
- **AND** the tag exists in `flisk-sh/flisk-template-vue`

#### Scenario: Port change is not a patch

- **WHEN** a pull request changes the default port in a template
- **THEN** the release automation refuses a PATCH bump

### Requirement: Licensing and attribution

Each template repository SHALL carry the same license as this repository (MIT, as in the `LICENSE` of this repository) and the Developer Certificate of Origin sign-off rule in `CONTRIBUTING.md`. The README SHALL name the upstream project, link its license, and state that the template is a Flisk wrapper and not an upstream release.

#### Scenario: README names the upstream project

- **WHEN** the `nuxt` template README is read
- **THEN** it names Nuxt, links its documentation and states the template is maintained by the Flisk community

#### Scenario: Missing sign-off is flagged

- **WHEN** a pull request contains a commit without a `Signed-off-by` trailer
- **THEN** the DCO check fails

### Requirement: History is preserved on split

The initial content of each template repository SHALL be produced by `git filter-repo --subdirectory-filter examples/byo/<folder>` against a fresh clone of this repository, so authorship and `git log` for the folder carry over. The source folder in this repository SHALL NOT be deleted until the sync script and e2e leg for that template pass against the new repository.

#### Scenario: Authors are kept

- **WHEN** `git log --format=%an` is run in a new template repository
- **THEN** it lists the authors of the original folder's commits

#### Scenario: Source folder outlives the cutover

- **WHEN** the new repository exists but the sync leg has not passed
- **THEN** `examples/byo/<folder>/` is still tracked in this repository
