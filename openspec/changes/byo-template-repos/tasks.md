## 0. Decisions needed before implementation

- [ ] 0.1 Maintainers answer the open questions in `design.md` (scaffolder name, npm organization, submodules or not, shared workflow home, repository naming).
- [ ] 0.2 Maintainers confirm that `flisk-sh` is the owner of the new repositories and that creating them and publishing to npm is approved.

## 1. Skeleton and shared workflow

- [ ] 1.1 Create `flisk-sh/flisk-template-skeleton` as a GitHub template repository with `Dockerfile`, `README.md`, `template.json` (placeholders), `LICENSE`, `CONTRIBUTING.md`, `CODEOWNERS`, issue forms and a pull request template.
- [ ] 1.2 Write `byo-template.schema.json` and the skeleton check that fails on `REPLACE_ME`.
- [ ] 1.3 Write the reusable `verify-template.yml` workflow and `verify-byo-template.sh` (build, run with `PORT=4000`, require HTTP 200, upload log, clean up what it created).
- [ ] 1.4 Add the checks for unpinned `FROM`, non-root user and README/`template.json` agreement.
- [ ] 1.5 Verify the skeleton passes its own workflow.

## 2. Split the first three templates

- [ ] 2.1 Run `git filter-repo --subdirectory-filter examples/byo/create-vue` on a fresh clone; add `template.json`, `LICENSE`, `CONTRIBUTING.md`, workflow and issue forms; push to `flisk-sh/flisk-template-vue`; tag `v1.0.0`.
- [ ] 2.2 Repeat for `create-hono` (`oven/bun:1` base) and `create-astro`.
- [ ] 2.3 Confirm each repository's verify workflow passes and paste the run links in the pull request.
- [ ] 2.4 Seed two `good first issue` issues and the topics `flisk`, `template`, `docker` and the framework name in each.

## 3. Registry, sync and guards in this repository

- [ ] 3.1 Add `examples/byo/templates.json` and its JSON Schema with the three entries.
- [ ] 3.2 Write `scripts/sync-byo-templates.sh` (clone pinned tag, id check, temp dir swap, `.synced-from`, fail fast offline, no `sudo`).
- [ ] 3.3 Add the synced folders to `.gitignore` and add the pre-commit guard that fails when they are staged.
- [ ] 3.4 Make the BY1 leg run the sync first, add `templates.json` and the sync script to the suite `paths`, and keep `verify-byo-example.sh` arguments unchanged.
- [ ] 3.5 Confirm `bun run typecheck`, `bun run lint`, `bun run test` and `make test-shell` pass on a clean clone with no sync.
- [ ] 3.6 Make the documentation link check tolerate unsynced folders, and point links at the template repositories.
- [ ] 3.7 Remove the three source folders from tracking in the same pull request, after the BY1 leg passes on synced copies.
- [ ] 3.8 Add the pin integrity check (exists, not lower, reachable from the default branch, downgrade label).
- [ ] 3.9 Update `examples/byo/README.md` and `docs/byo.md` to describe the sync.

## 4. Split the other nine templates

- [ ] 4.1 `adonisjs`, `analog`, `bati` (group one).
- [ ] 4.2 `better-t-stack`, `mastra`, `next-app` (group two).
- [ ] 4.3 `nuxt`, `react-router`, `refine` (group three). Document the `refine` piped-input workaround and link an upstream issue.
- [ ] 4.4 For each, add the registry entry and delete the source folder in the same pull request as its passing BY1 leg.
- [ ] 4.5 Confirm `suite.json` has one BY1 matrix job per template.

## 5. Through-Flisk check

- [ ] 5.1 Extend `verify-byo-tdk.sh` usage (or add a case) so one template (`vue`) is registered, brought up with `flisk up` and requested through Traefik.
- [ ] 5.2 The report states the URL and status code it observed and says "container-only" for standalone checks.

## 6. Scaffolder package

- [ ] 6.1 Create the scaffolder repository (or use `flisk-sh/create-flisk` after the naming decision) with TypeScript, no native dependencies and a committed lockfile.
- [ ] 6.2 Implement `--template`, the picker, `--list`, `--show`, `--ref`, `--name`, `--force`, `--dry-run`, `--json` and `--quiet`.
- [ ] 6.3 Implement fetch by pinned tag with the archive path-safety check, and the `flisk resource ... --type bring-your-own` call, including the missing-`flisk` path.
- [ ] 6.4 Embed the registry and add the parity check against `examples/byo/templates.json`.
- [ ] 6.5 Write the tests listed in the verification spec using a local fixture archive; run them with the network disabled.
- [ ] 6.6 Add the name deny list and the publish name check.
- [ ] 6.7 Run `npm publish --dry-run` in CI; review the file list; enforce the 5 MB limit.
- [ ] 6.8 Run `npm view <name>` and record the availability result in the release pull request.

## 7. Release process

- [ ] 7.1 Create the npm organization with two owners and require two-factor authentication.
- [ ] 7.2 Configure trusted publishing (GitHub OIDC) and the tag-triggered release workflow with `--provenance`, pinned actions and `permissions: contents: read`.
- [ ] 7.3 Add `prepublishOnly` that refuses a manual publish.
- [ ] 7.4 Publish the first version to the `next` tag only.
- [ ] 7.5 After one week without a blocking issue, promote to `latest` with the promote workflow.
- [ ] 7.6 If `create-flisk` is reused, publish `1.0.0`, write the changelog entry, and confirm the landing page URL still works.
- [ ] 7.7 Generate release notes from the registry diff.

## 8. Automation

- [ ] 8.1 Add the daily bump workflow: one pull request per template, major bumps labeled `needs-review`, no auto-merge for majors.
- [ ] 8.2 Add the weekly no-cache drift workflow with one retry, one issue per failing template, auto-close on recovery, and the summary table.
- [ ] 8.3 Publish `status.json` and link it from the scaffolder README.
- [ ] 8.4 Add the `.github/ci-inventory.json` entries for both workflows and confirm the inventory check passes.

## 9. Community

- [ ] 9.1 Write "Contributing a template" in `docs/contributing/` and link it from `CONTRIBUTING.md` and `docs/contributing/02-feature-recipes.md`. Run every command in it first.
- [ ] 9.2 Add `.github/ISSUE_TEMPLATE/template-request.yml` with the five questions and the three labels.
- [ ] 9.3 Add `scripts/render-byo-template-list.sh` and the check that the README list equals the registry.
- [ ] 9.4 Add the template list to the `flisk` README and to the project website.
- [ ] 9.5 Make contributor recognition read commits from the template repositories.
- [ ] 9.6 Add the 90-day "looking for maintainer" check.
- [ ] 9.7 Announce once, after the first stable scaffolder release, in `CHANGELOG.md` and the discussion board.

## 10. Verification and wrap-up

- [ ] 10.1 `openspec validate byo-template-repos --strict`
- [ ] 10.2 `bun run typecheck && bun run lint && bun run test`
- [ ] 10.3 `make test-shell`
- [ ] 10.4 Run the BY1 leg for each of the twelve templates and record the results.
- [ ] 10.5 Run the scaffolder against a fresh directory with `flisk` installed, and again without it; record the output of both.
- [ ] 10.6 Archive the OpenSpec change (`openspec archive byo-template-repos`) once every task above is done.
