# Release operations

The ops checklist for cutting a Flisk CLI release, repairing one that only half finished, and the settings behind the pipeline. Background — npm authentication, candidate lessons, the publish gate in detail — lives in the [operator runbook](operator-runbook.md#cutting-a-release); this page is what you run.

## Table of contents

1. [What a release publishes](#what-a-release-publishes)
2. [The pipeline at a glance](#the-pipeline-at-a-glance)
3. [Cutting a release](#cutting-a-release)
4. [Verify a release](#verify-a-release)
5. [Repair a half-finished release](#repair-a-half-finished-release)
6. [Backfill GitHub Packages](#backfill-github-packages)
7. [Unscoped npm package (flisk)](#unscoped-npm-package-flisk)
8. [Troubleshooting](#troubleshooting)
9. [Settings and secrets](#settings-and-secrets)
10. [Building binaries by hand](#building-binaries-by-hand)

## What a release publishes

| Channel | Name | Consumers | Produced by |
| --- | --- | --- | --- |
| Public npm | `@flisk-sh/flisk` | `npm i -g`, `flisk upgrade` | `publish` job (OIDC) |
| Binary release | [`flisk-sh/releases`](https://github.com/flisk-sh/releases/releases) tag `v<version>` | `install.sh`, winget-style installers, checksums | `publish` job (`scripts/release-binaries.sh --publish-only`) |
| GitHub Packages | `@flisk-sh/flisk` on `npm.pkg.github.com` | environments that require GitHub-hosted packages ([setup](github-packages.md)) | `publish-github-packages` job |
| Checksums release | `flisk-sh/flisk` tag `v<version>` | OpenSSF Scorecard Signed-Releases; signature verification | `publish` job (cosign sign + attestation) |
| Unscoped npm | `flisk` | users who type `npm i -g flisk` | `publish-unscoped-npm` job ([status](#unscoped-npm-package-flisk)) |

The version is picked by the workflow, not by a file: the highest of `package.json` and the latest npm version, plus one for every version already on npm or on `flisk-sh/releases`. `package.json` on `main` can lag; the workflow bumps it back through a PR.

## The pipeline at a glance

`release-binaries.yml` runs on a push to `main` that touches `package.json` or `cli/package.json`, or on `workflow_dispatch`.

```
build ──► windows-binary ──► publish ──► publish-github-packages
                         │            └─► publish-unscoped-npm
                         │
                    (on the bump-PR merge push to main)
                    tag-bumped-release: tag vX.Y.Z + publish the checksums draft
```

The `publish` job, in order:

1. `Require a passing release candidate` — the [publish gate](#cutting-a-release) (`scripts/check-release-candidate.mjs`).
2. `Publish verified binary release` — binaries to `flisk-sh/releases`.
3. `Publish to npm` — `@flisk-sh/flisk`, OIDC or `NPM_TOKEN`.
4. `Sign the checksums` and `Attest build provenance` — the draft checksums release on `flisk-sh/flisk` and the signature on `flisk-sh/releases` (both `continue-on-error`).
5. `Commit the version bump` — last on purpose: opens `release/bump-<version>` and its PR, and enables auto-merge. Bookkeeping failure never skips the signing steps again (regression seen in 1.3.207).

## Cutting a release

### 0. Preconditions

- npm trusted publisher on `@flisk-sh/flisk` for this repo and `release-binaries.yml` (`npm trust list @flisk-sh/flisk`), or the `NPM_TOKEN` secret set.
- `BINARY_RELEASE_TOKEN` (write to `flisk-sh/releases`) and optionally `RELEASE_PAT` (opens the bump PR as a user so its checks run).
- `main` is protected by the **main merge queue** ruleset: the bump PR needs the required checks and approvals before auto-merge lands it. Check open PRs afterwards; approve it.

### 1. Land the code

Merge what you want to ship. If `cli/src` changed, `cli/dist` must be rebuilt in the same merge or the `📦 Pack CLI` job fails on `main`:

```bash
npm --prefix cli run check:dist   # builds, then diffs cli/dist
git add -f cli/dist && git commit -s -m "Rebuild cli/dist" && git push
```

`cli/dist` is committed so `npm install -g github:flisk-sh/flisk` works without a build step; new files under it need `git add -f` (it is gitignored file-by-file).

### 2. Release candidate

The publish gate refuses a commit no passing candidate covers. `main` moves every few minutes, so run the candidate on an `rc-*` tag at the commit you are releasing:

```bash
git tag rc-<version> <commit> && git push origin refs/tags/rc-<version>
gh run watch <candidate-run-id> --exit-status
```

The candidate (`release-candidate.yml`) packs the CLI, then runs the quickstart journey and every release-blocking resource-type suite against that exact tarball. Retry a run whose failures are all the same infrastructure readiness check (Docker Compose on a slow runner); never bypass the gate.

Check the gate for any commit before dispatching:

```bash
GH_TOKEN="$(gh auth token)" node scripts/check-release-candidate.mjs --sha <commit> --repo flisk-sh/flisk
```

It accepts an **exact** candidate, or an **ancestor** candidate when no commit since changed a release input (`cli/**`, `engine/**`, `package.json`, `bun.lock`, `Tiltfile`, `discovery/**`, `specs/**`, `ext/**`, `scripts/release-binaries.sh`, `shared-platform-engineering/docker-templates/**`, `release-binaries.yml`).

### 3. Dispatch the release

```bash
gh workflow run release-binaries.yml --ref main
```

Watch the run. `build`, `windows-binary` and `publish` must be green; `publish-unscoped-npm` may be red until the [unscoped package](#unscoped-npm-package-flisk) exists (it does not block the others). Publication happens inside `publish`: by the time it finishes, npm and `flisk-sh/releases` are live even if later steps failed.

### 4. Merge the version-bump PR

The publish job opens `Release <version> (automatic version bump)` from `release/bump-<version>`. `main` requires checks and approvals, so:

```bash
gh pr list --search "automatic version bump" --state open
gh pr checks <number> --watch && gh pr review <number> --approve
```

Auto-merge takes it from there. The merge push triggers `tag-bumped-release`, which tags `v<version>` on the bump commit and publishes the checksums draft. It only publishes a draft that already exists; it never creates the release.

## Verify a release

```bash
npm view "@flisk-sh/flisk" dist-tags                      # latest = version
npm view "@flisk-sh/flisk@<version>" dist.tarball
gh release view "v<version>" --repo flisk-sh/releases \
  --json assets --jq '.assets[].name'                     # 5 binaries + engine + zip + checksums + sigstore
gh release view "v<version>" --repo flisk-sh/flisk \
  --json isDraft,assets --jq '{draft:.isDraft,assets:[.assets[].name]}'   # draft false, checksums.txt + checksums.txt.sigstore.json + checksums.txt.intoto.jsonl
git ls-remote --tags origin "refs/tags/v<version>"        # tag exists
git show "v<version>":package.json | grep '"version"'     # version field matches
```

Signature and provenance (the two checks OpenSSF Scorecard's Signed-Releases reads). Both files live on the `flisk-sh/flisk` release:

```bash
mkdir -p verify && gh release download "v<version>" --repo flisk-sh/flisk \
  --pattern checksums.txt --pattern checksums.txt.sigstore.json --dir verify
cosign verify-blob --bundle verify/checksums.txt.sigstore.json \
  --certificate-identity-regexp 'https://github.com/flisk-sh/flisk/.github/workflows/(release-binaries|sign-release)\.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  verify/checksums.txt                                    # signature: Verified OK
gh attestation verify verify/checksums.txt --repo flisk-sh/flisk   # provenance: only releases built by release-binaries.yml have it
```

A release without `checksums.txt.intoto.jsonl` has no provenance; that is expected for versions cut before provenance was added. A release without a signature is a gap to close with [sign-release.yml](#repair-a-half-finished-release), not something to fix by hand.

See also the [maintainer checks for GitHub Packages](github-packages.md#maintainer-release-checks).

## Repair a half-finished release

`publish` can fail after npm and the binaries are already out (a rejected bump push, a missing secret). The artifacts are live; only bookkeeping is missing. Do not re-dispatch the release — it would skip npm (already published) and pick the **next** version.

| What is missing | Fix |
| --- | --- |
| No version-bump PR | Apply the bump on `main` yourself (both `package.json` files), commit as `Release <version> (automatic version bump)`, push. The message triggers `tag-bumped-release`, which tags and publishes the release. |
| Draft checksums release never created (sign step did not run) | Create an empty draft first: `gh release create "v<version>" --repo flisk-sh/flisk --draft --latest=false --title "v<version>" --notes "Signed checksums for flisk <version>."`, then run `sign-release.yml` (next row), which uploads the checksums **and** their signature into it, **before** pushing the bump commit. `tag-bumped-release` finds the draft and publishes it. Never upload a bare `checksums.txt`: that is how 1.3.207 ended up unsigned. |
| No `v<version>` tag | `tag-bumped-release` creates it on the bump push. To do it by hand: `git tag "v<version>" <bump-commit> && git push origin "refs/tags/v<version>"`. |
| GitHub Packages missing the version | [Backfill](#backfill-github-packages). |
| Signature (`checksums.txt.sigstore.json`) missing on a published version | Run **Actions → Sign an existing release**, or `gh workflow run sign-release.yml -f version=<version>`. It downloads the published binaries from `flisk-sh/releases`, checks them against `checksums.txt`, signs it keyless, and attaches the signature to the `flisk-sh/releases` release and the `flisk-sh/flisk` release. Do not re-run the `publish` job: it uses the workflow file of the original run. Provenance cannot be added afterwards; it has to come from the run that built the binaries, so that version stays without `checksums.txt.intoto.jsonl`. |

Case studies: 1.3.187 (bump push rejected, signing skipped), 1.3.206 (version already in `package.json`, so no bump PR ran — tag and draft published by hand), 1.3.207 (bump push rejected by the `release/*` ruleset at branch creation — ruleset relaxed, bump and tag done by hand; the signing steps had run after the bump step and were skipped, and the hand-made release carried an unsigned `checksums.txt`, which OpenSSF Scorecard flagged. The bump step now runs last, and `sign-release.yml` signs a version after the fact. 1.3.205 on `flisk-sh/releases` was also unsigned).

Both repositories are scored: `flisk-sh/flisk` (checksums, signature, provenance) and `flisk-sh/releases` (the binaries, which have no workflows of their own). Every signing or provenance step has to attach its file to both.

## Backfill GitHub Packages

To publish an already-released npm version to GitHub Packages without cutting another release:

**Actions → Publish existing npm version to GitHub Packages** → enter the version, or:

```bash
gh workflow run publish-existing-npm-to-github-packages.yml -f version=<version>
```

It downloads the exact public npm tarball, publishes it to `npm.pkg.github.com`, then fetches the tarball back from GitHub Packages, checks its sha512 against the npm tarball, and installs that file in a clean prefix to verify. If the package is the first publication, make it public in the package settings and confirm it is linked to `flisk-sh/flisk`.

## Unscoped npm package (flisk)

`publish-unscoped-npm` republishes the same archive under the unscoped name `flisk`. It fails with `404 Not Found - PUT https://registry.npmjs.org/flisk` while the `flisk` package does not exist on npmjs.com: OIDC can publish to a package that has a trusted publisher configured, it cannot create one. The scoped `@flisk-sh/flisk` release is unaffected.

One-time owner setup (needs an npm account that may create the name):

```bash
npm login
# claim the name: publish the current archive under the unscoped name once, or create a stub package
npm pkg set name=flisk   # in a scratch copy of the packed package; do not change this repository's name
npm publish --access public
npm trust github flisk --file release-binaries.yml --repo flisk-sh/flisk --allow-publish
```

Or in the npm UI: open the `flisk` package → **Settings → Trusted Publisher → GitHub Actions** → org `flisk-sh`, repo `flisk`, workflow `release-binaries.yml`, allow publish. The alternative is an `NPM_TOKEN` secret with publish rights on `flisk`; the workflow now uses it as a fallback, exactly like the scoped publish. Once either exists, the job skips versions that are already on npm and publishes the rest.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `📦 Pack CLI`: `cli/dist is stale` | `cli/src` changed without rebuilding the committed `cli/dist` | `npm --prefix cli run check:dist`, `git add -f cli/dist`, commit `Rebuild cli/dist`, push |
| `error: GH013 ... release/bump-*` on the bump push | A ruleset enforced required status checks at branch creation | `do_not_enforce_on_create` must be on for the required-status-checks rule of the `release branch protections` ruleset (`gh api repos/flisk-sh/flisk/rulesets`) |
| Publish gate: `No passing Release candidate covers <sha>` | No candidate on that commit, or release inputs changed since the last one | Push an `rc-*` tag at the commit, let it pass, re-dispatch |
| Publish gate lists `release inputs changed since (cli/**)` | A candidate exists but `cli/**` changed after it | New candidate on the release commit |
| `npm ERR! code EOTP` | An empty `NPM_TOKEN` was exported; npm tried token auth instead of OIDC | Never export an empty `NODE_AUTH_TOKEN`; the workflow only exports it when the secret exists |
| `404 Not Found - PUT .../flisk` | The unscoped package does not exist on npm | [Unscoped npm package](#unscoped-npm-package-flisk) |
| Workflow red but npm and `flisk-sh/releases` are live | A post-publication step failed (bump push, signing) | [Repair a half-finished release](#repair-a-half-finished-release) |
| GitHub Packages verify: `bin/tdk: No such file or directory` | Pre-rebrand releases link `bin/tdk`, newer ones link `bin/flisk` | The backfill workflow accepts both names |
| Tag exists but `package.json` on it is one version behind | Tag pointed at the pre-bump commit | Tags must point at the version-bump commit (`tag-bumped-release` does this; fix by re-tagging the bump commit) |

## Settings and secrets

| Name | Where | Used for |
| --- | --- | --- |
| `RELEASE_PAT` | repo secret | Bump PR opened as a user so its checks run; fall back is `github.token` |
| `NPM_TOKEN` | repo secret | Fallback publish for `@flisk-sh/flisk` and `flisk` when OIDC has no trusted publisher; must be absent-or-valid, never empty |
| `BINARY_RELEASE_TOKEN` | repo secret | Uploads to `flisk-sh/releases` |
| `main merge queue` ruleset | repository rules | `main`: merge queue, required checks, 2 approvals, code coverage floor |
| `release branch protections` ruleset | repository rules | `release/*`: PR required, required checks with `do_not_enforce_on_create` on (branch creation must stay pushable) |

## Building binaries by hand

```bash
scripts/release-binaries.sh                    # build only: release-dist-<version>/
scripts/release-binaries.sh --publish          # build, create a draft release, verify bytes, publish
scripts/release-binaries.sh --publish-only     # reuse an existing release-dist-<version>/
```

Output: `tdk-linux-{amd64,arm64}`, `tdk-darwin-{amd64,arm64}`, `tdk-windows-amd64.exe`, `tdk-cli-engine.tar.gz`, `checksums.txt` (SHA-256). The installer verifies each binary against `checksums.txt`.
