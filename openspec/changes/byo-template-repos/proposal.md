## Why

`examples/byo/` holds twelve scaffolder wrappers: `create-adonisjs`, `create-analog`, `create-astro`, `create-bati`, `create-better-t-stack`, `create-hono`, `create-mastra`, `create-next-app`, `create-nuxt`, `create-react-router`, `create-refine` and `create-vue`. Each is two files, a `Dockerfile` and a `README.md`, about 8 KB. The `Dockerfile` runs the upstream scaffolder at build time (`npm create vue@latest app -- --default`) and then makes the result meet the bring-your-own container contract in `docs/byo.md`: read `PORT`, bind `0.0.0.0`, answer a health route, run as a non-root user.

They already work, and `tests/e2e/resource-types/bring-your-own/verify-byo-example.sh` proves it. The gap is that nobody outside the repository can find, use or fix them:

- A contributor who wants to repair the Nuxt wrapper has to clone a monorepo with 2,000 files, learn its CI, and open a pull request whose reviewers care about CLI, engine and discovery code.
- A developer who just wants "a Vue app that runs under Flisk" has to know that `examples/byo/create-vue` exists, copy two files by hand, and run `flisk resource ... --type bring-your-own` themselves.
- The wrappers drift. They pin a base image by digest, but the scaffolder they call is `@latest`, so an upstream release can break one with no change in this repository. Today that surfaces only when the example e2e leg happens to run.
- There is no place to ask for a thirteenth wrapper (Remix, SvelteKit, Qwik City, Expo) except a Flisk feature request.

The tempting fix is to publish the folders to npm under their own names. That is not possible and would be wrong if it were. All twelve `create-*` names are already owned by the upstream projects (`create-vue` by the Vue team, `create-astro` by Astro, `create-next-app` by Vercel, and so on). Publishing, or even appearing to publish, under those names would mislead people about who ships the code.

## What Changes

- **One repository per wrapper.** Create `flisk-sh/flisk-template-<id>` for each of the twelve, where `<id>` is the upstream scaffolder name without the `create-` prefix (`vue`, `astro`, `next-app`, and so on, listed in the template registry). Each repository holds the `Dockerfile`, a `README.md`, a `template.json` manifest, and its own CI that builds the image and expects HTTP 200. History is carried over with `git filter-repo`.
- **A template registry in this repository.** `examples/byo/templates.json` lists every template: id, repository, pinned tag, health path, port, upstream scaffolder and the `flisk resource` command. It is the only place a version is pinned.
- **A sync script.** `scripts/sync-byo-templates.sh` clones each listed repository at its pinned tag into `examples/byo/<folder>/`, so every existing path, `verify-byo-example.sh` argument, `suite.json` path glob and documentation link keeps working. The cloned folders are git-ignored, not submodules, and a clean checkout still runs `tdk`/`flisk` commands that do not need them.
- **Automatic pin bumps.** A scheduled workflow opens a pull request when a template repository has a newer release tag, and runs the example e2e leg on that pull request.
- **One scaffolder command.** A new npm package copies a chosen template into a project and registers it: `npm create <name>@latest -- --template vue` writes the `Dockerfile` and `README.md` into the project and runs `flisk resource <resource> --type bring-your-own --dockerfile ./Dockerfile`. Interactive use shows the template picker; `--list` prints the registry.
- **Publishing rules.** Every published package uses a name the project owns (never an upstream `create-*` name), is published from GitHub Actions with npm provenance, and is dry-run before the first release. The package name is a decision recorded in the design. The current holder of `create-flisk` is a landing-page app, and repurposing it needs an explicit major version and deprecation text.
- **Community path.** A "Contributing a template" guide, a template-request issue form, a template repository skeleton, a CODEOWNERS and labels convention, and a README section that lists every template repository.
- **Verification.** The twelve templates each get a build check in their own repository and stay in the existing `BY1` e2e variant here. A weekly drift job rebuilds each template against the newest upstream scaffolder and files an issue when one fails.

Out of scope:

- Creating the repositories, publishing to npm, or changing any file under `examples/byo/` in this change. This pull request carries the OpenSpec change only. Implementation lands in follow-up pull requests, one per task group.
- The other 46 folders in `examples/byo/` (`fastify`, `django`, `rails`, and so on). They are small apps rather than scaffolder wrappers. The registry format supports them later; this change does not move them.
- Changing the bring-your-own container contract in `docs/byo.md`.
- Any use of git submodules.

## Capabilities

### New Capabilities

- `byo-template-repositories`: What a template repository contains, how it is named, versioned, licensed and tagged, and how it relates to its upstream scaffolder.
- `byo-template-sync`: The registry file, the sync script, the git-ignore rule and the scheduled bump workflow that keep `examples/byo/` populated at pinned versions.
- `create-flisk-scaffolder`: The npm command that copies a template into a project and registers it as a bring-your-own resource.
- `byo-template-publishing`: Package naming, ownership checks, provenance, dry runs, release tags, deprecation and the rule against publishing under upstream names.
- `byo-template-verification`: Per-repository CI, the monorepo e2e leg, the weekly drift job and what counts as a passing template.
- `byo-template-community`: The contribution guide, issue forms, labels, CODEOWNERS, repository skeleton and the public list of templates.

### Modified Capabilities

None. `frontend-framework-contributions` and `generated-config-safety` describe different surfaces, and this change touches neither.

## Impact

- Affected code, in later pull requests: `examples/byo/README.md`, `examples/byo/templates.json` (new), `scripts/sync-byo-templates.sh` (new), `tests/e2e/resource-types/bring-your-own/verify-byo-example.sh`, `tests/e2e/resource-types/bring-your-own/suite.json`, `.gitignore`, `.github/workflows/` (one new scheduled workflow, one edited), `.github/ci-inventory.json`, `docs/byo.md`, `CONTRIBUTING.md`, `docs/contributing/02-feature-recipes.md`.
- New repositories, created only after the maintainers approve this spec: twelve `flisk-sh/flisk-template-*` repositories, and the scaffolder package repository.
- New npm package: one scaffolder. No upstream name is ever used.
- No change to the Flisk runtime, the CLI binary, Docker, Tilt, Traefik, ports, generated modules or `service.json`.
- No change to what `flisk resource --type bring-your-own` accepts.
- Risk: a template repository can break independently of this repository. The pin, the bump pull request and the e2e leg exist to contain that.
- Tracking issue: [flisk-sh/flisk#1965](https://github.com/flisk-sh/flisk/issues/1965).
