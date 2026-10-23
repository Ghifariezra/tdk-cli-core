## Context

Twelve folders under `examples/byo/` wrap upstream scaffolders: `create-adonisjs`, `create-analog`, `create-astro`, `create-bati`, `create-better-t-stack`, `create-hono`, `create-mastra`, `create-next-app`, `create-nuxt`, `create-react-router`, `create-refine`, `create-vue`. Each is a `Dockerfile` plus a `README.md`, about 8 KB. The Dockerfile runs the upstream scaffolder at build time, then starts the dev server on `0.0.0.0:${PORT}`.

Facts checked on 2026-10-23, before this spec was written:

- All twelve `create-*` names exist on npm and belong to the upstream projects (`create-vue` 3.24.0 by the Vue team, `create-astro` 5.3.1, `create-next-app` 16.4.3, and so on). None can be published by this project.
- `create-flisk` exists on npm at `0.1.2`. Its description says it is a landing page app and "does not provide a project-scaffolding CLI". Its repository is `flisk-sh/create-flisk`.
- `flisk-template-vue`, `flisk-template-astro`, `create-flisk-vue` and `create-flisk-stack` return 404 on npm, so they are free today.
- The `@flisk` npm scope has no organization yet (`npm org ls flisk` returns 404).
- This repository's `LICENSE` is MIT. `MAINTAINERS.md` and a DCO file exist.
- The bring-your-own e2e suite (`tests/e2e/resource-types/bring-your-own/suite.json`) already has a `BY1` `example` variant that builds one folder and expects HTTP 200. Its `paths` include `examples/byo/**`.
- Wrappers differ: six use `node:22-alpine`, `create-hono` uses `oven/bun:1`, some install a pinned `npm` from GitHub (`create-analog`, `create-better-t-stack`), and `create-refine` pipes Enter presses because its scaffolder reads answers only from a terminal.

Stakeholders: contributors who want to fix or add a wrapper, developers who want a ready-made starter, and maintainers who must keep twelve things green without twelve times the work.

## Goals / Non-Goals

**Goals:**

- Make each wrapper a repository a stranger can find, fork, fix and star.
- Keep every existing path, command and test in this repository working during and after the move.
- Give users one command to get a template into a project.
- Contain breakage: an upstream release or a template change SHALL NOT silently break this repository's CI.
- Publish only under names the project owns, with provenance.

**Non-Goals:**

- Moving the other 46 folders in `examples/byo/`.
- Changing the container contract or `flisk resource --type bring-your-own`.
- Creating repositories or publishing packages in the pull request that carries this spec.
- Making the wrappers official upstream starters.

## Decisions

### Decision 1: Separate repositories, not submodules

Submodules were considered seriously, because the repositories are ours and a submodule gives a visible pointer in the tree. We reject them:

- A clone without `--recurse-submodules` leaves `examples/byo/create-vue/` empty, with no error. Contributors who copy the clone command from GitHub hit this first.
- Every job in every workflow that touches the folders needs `submodules: recursive`, and a job that forgets it fails in a confusing way (`Dockerfile: no such file`).
- A change takes two merges: one in the template repository, one pointer bump here. Pointers go stale unless a bot bumps them, and a bot is needed anyway.
- Worktrees, which this project uses heavily, and the repository's auto-commit tooling both behave badly with nested git state.
- A pull request that changes a template and the e2e script together cannot be tested as one unit.

The alternative chosen: a registry file plus a sync script that clones a pinned tag. The registry gives the same "pointer" visibility (one line per template, reviewable in a diff), the sync script gives the same bytes locally and in CI, and a clean checkout needs nothing extra. If the maintainers prefer submodules, Decisions 2 to 6 still hold; only the sync requirement group changes.

### Decision 2: Template ids drop the `create-` prefix

Repositories are `flisk-sh/flisk-template-<id>`. `<id>` is the upstream scaffolder name minus `create-`: `adonisjs`, `analog`, `astro`, `bati`, `better-t-stack`, `hono`, `mastra`, `next-app`, `nuxt`, `react-router`, `refine`, `vue`. This keeps search results distinct from the upstream repositories (a search for `create-vue` returns Vue's project first, and the template repository should not look like it). The monorepo folders keep the `create-` names so no existing path breaks.

### Decision 3: Scaffolder package name

Candidates:

| Name | State today | Notes |
| --- | --- | --- |
| `create-flisk` | Taken by this project, `0.1.2`, a landing page | Best command: `npm create flisk@latest`. Repurposing needs a major version and a changelog entry. The package already points at `flisk-sh/create-flisk`. |
| `create-flisk-stack` | Free | Safe, longer, says "stack". |
| `@flisk/create` | Scope not created | `npm create @flisk` works, but needs an npm organization first. |
| `create-flisk-<id>` ×12 | Free | Twelve packages to keep alive. Rejected. |

Decision: use `create-flisk`, because the project already owns it, the command is the shortest, and the current package does not claim to scaffold anything. The first scaffolder release is `1.0.0` under the `next` tag. The landing page moves to a separate package name or stays on GitHub Pages only; the page URL does not change. If a maintainer disagrees, the fallback is `create-flisk-stack`, and no other requirement changes. This is the one question that needs a human answer before Phase 3, and it is listed in Open Questions.

### Decision 4: One scaffolder, templates fetched by pinned tag

The scaffolder embeds the registry (ids and pinned tags) at build time and fetches each template's archive from `https://codeload.github.com/flisk-sh/flisk-template-<id>/tar.gz/refs/tags/<tag>`. Alternatives:

- Bundle all twelve templates into the package. Simple and offline, but then a template fix needs a scaffolder release, and the package grows with every template.
- Fetch the default branch. Always fresh, but untested, and a broken `main` breaks every new project.
- Fetch the pinned tag (chosen). A fix is a template release plus a pin bump (automated), and the user gets the tested version.

The archive is extracted with a path check (Decision 7). The scaffolder never builds or runs anything from it.

### Decision 5: Registry shape

`examples/byo/templates.json`:

```json
{
  "scaffolder": { "package": "create-flisk" },
  "templates": [
    {
      "id": "vue",
      "folder": "create-vue",
      "repository": "flisk-sh/flisk-template-vue",
      "tag": "v1.0.0",
      "port": 3000,
      "healthPath": "/",
      "upstream": "npm create vue@latest",
      "label": "Vue (create-vue)"
    }
  ]
}
```

The same file is copied into the scaffolder at release, and a release check fails if the two differ (Requirement: Registry parity). The folder name is stored explicitly because `create-next-app` becomes id `next-app`, which cannot be derived from the folder by only dropping a prefix once other prefixes appear later.

### Decision 6: Sync script behavior

`scripts/sync-byo-templates.sh` uses `git clone --depth 1 --branch <tag>`. It verifies `template.json` `id`, writes into a temp directory first, then swaps the folder, so a failed run leaves the old content. It never calls `sudo`. When the network is down it fails fast and prints the manual `git clone` command, matching the repository's rule of printing a manual command instead of escalating.

Synced folders are git-ignored and guarded by a pre-commit check, so no one commits a copy that then disagrees with the pin. Because the folders are absent on a clean clone, unit tests and lint must not depend on them (Requirement: Clean checkouts do not need the templates).

### Decision 7: Safety of the scaffolder

The scaffolder copies files. It does not run template code, build images or send telemetry. Tar extraction rejects absolute paths, `..` segments and links that leave the target. It has a small, allow-listed dependency set and a committed lockfile. These limits matter more than usual because the package is run with `npm create`, which executes the package on the user's machine with their privileges.

### Decision 8: Verification split

Each template verifies itself in its own repository, using one shared reusable workflow so there are not twelve copies of the HTTP check. This repository keeps the existing `BY1` leg so the contract between Flisk and the templates stays tested here, and one template is checked through `flisk up` and Traefik. A weekly job rebuilds every template with no cache to catch `@latest` drift and files one issue per broken template.

### Decision 9: Rollout in small pull requests

1. This spec (no behavior change).
2. Skeleton repository and the shared verify workflow.
3. Split three templates (`vue`, `hono`, `astro`) locally, review, then create their repositories.
4. Registry, sync script, `.gitignore`, pre-commit guard, and the e2e leg change, with three templates pinned.
5. Split the other nine.
6. Scaffolder package, dry run, `next` release.
7. Bump workflow and weekly drift job.
8. Community docs, issue form, README list, announcement.

Each pull request is against `main`, not stacked, and verified on `origin/main` after merge.

## Risks / Trade-offs

- **Twelve repositories to look after** → A shared reusable workflow, a skeleton, a bump bot and a weekly job keep the per-repository cost low. A template with no owner for 90 days is marked "looking for maintainer" instead of silently rotting.
- **Upstream `@latest` breaks a wrapper** → This already happens today without notice. The weekly no-cache build turns it into an issue within seven days. Pinning scaffolder versions was considered and rejected because it freezes the starter at an old version, which defeats the point of a starter.
- **Pin bumps hide a broken template** → Bump pull requests run the `BY1` leg; majors need a human.
- **Name confusion with upstream** → No `create-` names for templates, a non-affiliation sentence in every description, no upstream logos.
- **`create-flisk` reuse surprises `0.x` users** → The `0.x` package is a landing page, so there is no CLI behavior to break; a major version and a changelog entry still tell people.
- **Supply-chain risk of a `create` package** → Provenance, pinned actions, trusted publishing, minimal dependencies, no execution of template code, two owners.
- **Split loses history** → `git filter-repo --subdirectory-filter` keeps it; the source folder stays until the new path passes.
- **CI time grows** → The BY1 matrix already runs one job per folder; syncing adds one clone per job.
- **Offline contributors cannot run example checks** → Documented: the sync needs the network once, and `flisk` commands and unit tests do not need it.

## Migration Plan

1. Merge this spec. No behavior change.
2. Create the skeleton repository and the shared workflow. Verify the workflow passes on the skeleton.
3. For `vue`, `hono` and `astro`: run `git filter-repo` on a fresh clone, push to the new repository, tag `v1.0.0`, confirm the repository's verify workflow passes.
4. In this repository, add the registry with those three entries, the sync script, `.gitignore` and the pre-commit guard. Keep the three source folders tracked until the BY1 leg passes using synced copies, then remove them in the same pull request.
5. Repeat for the other nine, in groups of three.
6. Build and dry-run the scaffolder. Publish `1.0.0` (or `0.1.0` under a new name) on the `next` tag. After one week without a blocking issue, promote to `latest`.
7. Turn on the bump workflow and the weekly drift job.
8. Announce once, after the first stable release.

Rollback at any step: the source folders stay tracked until their replacement passes, so reverting a pull request restores the previous state. A bad scaffolder release is deprecated and replaced, never unpublished (Requirement: Deprecation and removal).

## Open Questions

1. **Scaffolder name.** `create-flisk` (reuse, major version) or `create-flisk-stack` (new). Needs a maintainer decision before the scaffolder release. Recommended: `create-flisk`.
2. **npm organization.** Create a `flisk` npm organization now, with two owners, even if the first package is unscoped? Recommended: yes, it reserves the scope and makes ownership explicit.
3. **Submodules after all?** If maintainers want a visible pointer in the tree, the sync requirement group changes; nothing else does.
4. **Where does the shared verify workflow live?** In the scaffolder repository (one more thing to release) or in `flisk-sh/.github`? Recommended: the scaffolder repository, tagged, so templates pin it by SHA.
5. **Should the other 46 `examples/byo` folders follow later?** The registry and sync script support it, but each app has different ownership. Recommended: decide after the first twelve have lived for a month.
6. **Naming of the repositories.** `flisk-template-<id>` versus `byo-<id>`. Recommended: `flisk-template-<id>`; it says what it is and is easy to search.
