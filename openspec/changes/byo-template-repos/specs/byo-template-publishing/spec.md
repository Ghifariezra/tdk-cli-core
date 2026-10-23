## ADDED Requirements

### Requirement: Never publish under an upstream name

No package published by this project SHALL use the name of an upstream scaffolder, including `create-adonisjs`, `create-analog`, `create-astro`, `create-bati`, `create-better-t-stack`, `create-hono`, `create-mastra`, `create-next-app`, `create-nuxt`, `create-react-router`, `create-refine` and `create-vue`. A publish check SHALL fail the release when the package name is in that deny list, and the list SHALL be stored in a file next to the check.

#### Scenario: Upstream name is refused

- **WHEN** a release workflow runs for a package named `create-vue`
- **THEN** the name check fails before `npm publish`

#### Scenario: Own name is accepted

- **WHEN** the package name is the scaffolder name recorded in the registry
- **THEN** the name check passes

### Requirement: Name availability is checked, not assumed

Before the first publish of any package, the release process SHALL run `npm view <name> name` and record the result in the release pull request. A name that exists and is not owned by the project SHALL block the release. A name that exists and is owned by the project SHALL require the explicit decision in the design (Decision 3) before it is reused.

#### Scenario: Taken name

- **WHEN** `npm view <name>` returns a package whose maintainers do not include the project's publisher account
- **THEN** the release is blocked and the pull request says who holds the name

#### Scenario: Free name

- **WHEN** `npm view <name>` returns a 404
- **THEN** the check records "available" with the date

### Requirement: Ownership and access

Published packages SHALL be owned by an npm organization or publisher account controlled by at least two maintainers listed in `MAINTAINERS.md`. Two-factor authentication SHALL be required for publish in the npm organization settings. No personal access token with publish rights SHALL be stored in a repository secret when trusted publishing is available.

#### Scenario: Two owners

- **WHEN** the package access list is read
- **THEN** at least two maintainers have publish rights

#### Scenario: Trusted publishing preferred

- **WHEN** the release workflow publishes
- **THEN** it authenticates with GitHub OIDC trusted publishing
- **AND** no long-lived npm token is read from secrets

### Requirement: Provenance

Every release SHALL be published from a GitHub Actions workflow with `npm publish --provenance --access public`. The workflow SHALL run on a tag push (`v*`), from the default branch's history, with `id-token: write` as its only elevated permission. The published package page SHALL show a provenance badge linking to the workflow run.

#### Scenario: Provenance attached

- **WHEN** a release is published
- **THEN** `npm view <name> dist.attestations` shows a provenance attestation

#### Scenario: Manual publish is refused

- **WHEN** someone runs `npm publish` from a laptop
- **THEN** the package `prepublishOnly` script fails and tells them to push a tag instead

### Requirement: Dry run before first release

Before the first publish of a package, `npm publish --dry-run` SHALL run in CI and its file list SHALL be reviewed in the release pull request. The tarball SHALL contain only `bin/`, `dist/`, the embedded registry, `README.md`, `LICENSE` and `package.json`. It SHALL NOT contain tests, fixtures, `.env` files, source maps with absolute paths or any file larger than 1 MB.

#### Scenario: Unexpected file in the tarball

- **WHEN** the dry run lists `.env.local`
- **THEN** the release check fails

#### Scenario: Size guard

- **WHEN** the unpacked tarball exceeds 5 MB
- **THEN** the release check fails

### Requirement: First release is 0.x

The first published version of a new package SHALL be `0.1.0` and SHALL use the `next` dist-tag until a maintainer promotes it to `latest` by hand after one week without a blocking issue.

#### Scenario: First publish uses next

- **WHEN** `0.1.0` is published
- **THEN** `npm dist-tag ls <name>` shows `next` pointing at it and no `latest`

#### Scenario: Promotion is manual

- **WHEN** a maintainer runs the promote workflow
- **THEN** `latest` moves to the chosen version and the workflow run is recorded in the release issue

### Requirement: Reusing the existing create-flisk name

If the design selects `create-flisk` for the scaffolder, the first scaffolder release SHALL be a new MAJOR (`1.0.0`) and SHALL run through the `next` tag first. `create-flisk` is published today at `0.1.2` as a landing page app that says it is not a scaffolding CLI. Existing users of `0.x` SHALL see a changelog entry that states the command changed. If the design selects another name, `create-flisk` SHALL be left untouched.

#### Scenario: Name reuse is a major version

- **WHEN** the scaffolder is published as `create-flisk`
- **THEN** its version is `1.0.0` or higher
- **AND** the changelog explains what `0.x` did

#### Scenario: Other name leaves create-flisk alone

- **WHEN** the design selects `create-flisk-stack`
- **THEN** no new version of `create-flisk` is published

#### Scenario: Landing page keeps working

- **WHEN** `https://flisk-sh.github.io/create-flisk` is requested after the release
- **THEN** it still serves the landing page

### Requirement: Landing page survives the name reuse

If `create-flisk` is reused, the landing page at `https://flisk-sh.github.io/create-flisk` SHALL keep serving, and the repository `flisk-sh/create-flisk` SHALL either keep the page in its own directory or move it to a differently named repository with a redirect.

#### Scenario: Page URL unchanged

- **WHEN** the first scaffolder release is published
- **THEN** the page URL still returns the landing page

### Requirement: Deprecation and removal

A published version that breaks projects SHALL be deprecated with `npm deprecate` and a message naming the fixed version. A version SHALL NOT be unpublished unless it contains a secret or illegal content. Template repositories SHALL be archived, not deleted, when retired, with a README line pointing at the replacement.

#### Scenario: Broken release

- **WHEN** `0.3.0` ships with a bad pin
- **THEN** it is deprecated with "use 0.3.1" and 0.3.1 is published

#### Scenario: Retired template

- **WHEN** a template is retired
- **THEN** its repository is archived with a pointer to the replacement and its registry entry is removed in the same pull request as the scaffolder release

### Requirement: Supply-chain controls

Release workflows SHALL pin every third-party action by commit SHA, SHALL run with `permissions: contents: read` at the top level, and SHALL not run on `pull_request_target`. The scaffolder SHALL have no runtime dependencies beyond a small allow-listed set recorded in the repository, and its lockfile SHALL be committed. Dependabot SHALL be enabled for both npm and GitHub Actions.

#### Scenario: Unpinned action

- **WHEN** a workflow uses `actions/checkout@v4`
- **THEN** the workflow lint check fails and asks for a commit SHA

#### Scenario: New runtime dependency

- **WHEN** a pull request adds a runtime dependency not on the allow list
- **THEN** the dependency check fails until a maintainer approves it in the allow list

### Requirement: Trademark and endorsement wording

Package READMEs and template READMEs SHALL name upstream projects only to say what is scaffolded. They SHALL NOT use upstream logos, claim endorsement, or describe the package as official. The package description SHALL contain the sentence "Flisk community templates; not affiliated with the upstream projects."

#### Scenario: Description wording

- **WHEN** `npm view <name> description` is read
- **THEN** it includes the non-affiliation sentence

#### Scenario: Logo use

- **WHEN** a template README embeds an upstream logo
- **THEN** the review checklist item "no upstream logos" blocks the merge

### Requirement: Release notes

Each release SHALL have notes listing the registry changes (templates added, removed or re-pinned, with old and new tags). Notes SHALL be generated from the registry diff, not typed by hand.

#### Scenario: Re-pin shows in notes

- **WHEN** the registry moves `hono` from `v1.0.0` to `v1.1.0`
- **THEN** the release notes say "hono: v1.0.0 → v1.1.0"
