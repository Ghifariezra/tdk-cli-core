# Flisk documentation

[![Test coverage](https://raw.githubusercontent.com/flisk-sh/flisk/main/docs/assets/coverage.svg)](https://github.com/flisk-sh/flisk/blob/main/docs/assets/coverage.svg)

## Start here

- [Run one backend locally](../examples/one-backend/README.md)
- [Run one Python backend locally](../examples/one-backend-python/README.md)
- [Full multi-service example](../examples/tdk-example/README.md)
- [Mega cheat sheet](cheat-sheet.md): every `flisk` command, alias and flag
- [Configuration and editor schemas](configuration.md)
- [Resource features](resource-features.md): code generators, Prisma, and `featuresEnabled`
- [Generated service files](generated-files.md): what Flisk writes from `service.json`, and how to handle drift
- [Environment, params and secrets](environment.md): the project `.env`, `params`, `secrets` and auth
- [Operator runbook](operator-runbook.md): install matrix, version minimums, releases, license key
- [Release operations](releasing.md): cut, verify and repair a CLI release; GitHub Packages backfill; unscoped npm package
- [WSL2 setup](wsl2.md)
- [Windows hardware checks](windows-hardware.md): what the Windows e2e suites cover, what a real Windows machine adds, and how to run them
- [Install and use Flisk alongside Helm](with-helm.md)

## Understand Flisk

- [Project overview and repository map](project-overview.md)
- [How flisk up works](how-tdk-up-works.md): lifecycle, port planning, focus filtering, and shutdown
- [Architecture](ARCHITECTURE.md): how flisk, the engine, and discovery fit together
- [Features](FEATURES.md)
- [Topology](TOPOLOGY.md)
- [Tool comparison: docker-compose, Tilt, Skaffold, DevSpace, kind](comparison.md)
- [Honest comparison and known limits](compare-honest.md)
- [Claims registry](claims.md): every public number and where it comes from

## Guides

- [Pilot Flisk on a real repository](adopt-flisk.md): a team lead's guide to trying Flisk in an afternoon
- [Scope and non-goals](scope.md): local development only, what differs from production, which Dockerfile you ship
- [Layout and ownership](layout.md): one project or one per repo, services in other repos, name clashes, CODEOWNERS, layouts for 5, 20 and 50 services
- [Pilot scorecard](pilot-scorecard.md): record the same measurements and decision at the end of a pilot
- [FAQ for agencies and multi-client teams](faq-teams.md): honest answers on stacks, proxies, Windows, licence and exit
- [Running Flisk in CI](ci.md): a GitHub Actions workflow for your repository: `flisk config verify`, then `flisk up` and a health wait
- [Gradual adoption](gradual-adoption.md): what Flisk adds to an existing repository, what to commit, and how to remove it
- [Troubleshooting](troubleshooting.md): flisk and Tilt messages as printed, with cause, fix and how each was checked
- [Troubleshoot L1 (base image)](troubleshoot-l1.md): Docker build failures in the foundational OS and Bun runtime layer
- [Troubleshoot L2 (dependency layer)](troubleshoot-l2.md): Docker build failures in package manifests, lockfiles, and dependency caching
- [Leaving Flisk](leaving-flisk.md): what `flisk eject` really does, what stays usable without Flisk, what you lose
- [Local data: reset, seed, snapshot](data.md): where Postgres data lives and how to reset it
- [Testing webhooks locally](local-webhooks.md): a proposed recipe for replaying duplicate, retried and tampered provider deliveries without the provider
- [Upgrading and version pinning](upgrading.md): `minTdkVersion`, installing a specific version, what is versioned
- [Security: network calls, secrets and supply chain](security.md): what Flisk sends, where secrets live, image tags and release checks
- [Smoke check](smoke.md): `flisk up` checks a service through the URL it prints
- [Agent hosts](agent-hosts.md): Dev Containers, Codespaces and WebContainers, and what `flisk doctor` reports for them
- [AI agents in Flisk](agents/ai-agents.md): hosting agents, persistent checkpoint volumes, session routing, and recipes
- [Flisk MCP setup](agent-tooling/flisk-mcp-setup.md): install Flisk and connect Codex or Claude Code over local stdio
- [Flisk MCP quick guide](agent-tooling/flisk-mcp.md): the tools a connected client exposes, and how to target a project
- [Bring-your-own resources](byo.md): wrap an existing service or image, one-shot jobs, `--restart`
- [Frontend framework providers](frontend-framework-providers.md): add a Vite framework (React, Vue, Svelte, Preact, Lit, Solid, Qwik, plain TypeScript)
- [MCP resources](mcp.md): `--type mcp` scaffolds a Model Context Protocol server
- [Backend language and framework providers](backend-language-providers.md): Bun with Hono, Express, Elysia, Fastify, NestJS, Koa or h3, and Python, Go or Rust

## Recipes and examples

- [Recipes](recipes/): using Flisk next to other tools. [moon](recipes/moon.md), [Rsbuild](recipes/rsbuild.md)
- [Bring-your-own examples](../examples/byo/README.md): one folder per framework, each with its own README and a check command
- [One-shot job examples](../examples/byo-jobs/README.md): database migrations (dbmate, Atlas, Ptah, Prisma, TypeORM, MikroORM, Drizzle) that run once and exit
- [Worked example: a real shop](examples/shop-real.md)

## Reference

- [Machine-readable CLI](reference/machine-readable-cli.md): JSON shapes, exit codes, an agent polling example
- [Doctor contract](reference/doctor-contract.md): `flisk doctor --json` schema and migration notes

## Benchmarks

- [Scale fixture measurements](benchmarks/scale-bench.md)
- [Cold boot of a real shop](benchmarks/cold-boot-shop-real.md)

## Contributing

- [Contributor guide](contributing/README.md)
- [Write CLI unit tests](contributing/08-write-cli-unit-tests.md)
- [Write an end-to-end test](contributing/05-write-e2e.md)

## Where things live

| Folder | Holds |
| --- | --- |
| `docs/` (top level) | Long-lived guides that other repos, error messages and published releases link to. Their paths are kept stable on purpose, for example `wsl2.md` is named in CLI messages and `byo.md` in upstream issues. |
| [`operator-runbook.md`](operator-runbook.md) | Importer command, core version prerequisite, and import boundaries. |
| `docs/recipes/` | One file per outside tool |
| `docs/reference/` | Contracts that scripts and agents rely on |
| `docs/benchmarks/` | Measurements and how they were taken |
| `docs/examples/` | Written walkthroughs of the runnable examples in `examples/` |
| `docs/contributing/` | Contributor guides |
| `docs/assets/` | Images used by the READMEs |
| `docs/drafts/` | Unpublished writing |

Before moving or renaming a document, search the whole repository for its path (CLI messages in `cli/src`,
`.github/`, `scripts/`, other READMEs) and keep the old path if a released version or a public issue links to it.
