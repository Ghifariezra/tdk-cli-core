# `service.json` reference

Each Flisk resource is described by a `service.json` file in the resource directory. The file drives resource discovery, generated Tilt and Docker configuration, routing, dependency ordering, and editor assistance.

The [service schema](../engine/schemas/service-schema.json) is the source of truth for JSON types and editor validation. The CLI is authoritative at runtime: `flisk config verify` applies the manifest and generated-output checks described below, while `flisk doctor` performs environment, readiness, and discovery-time safety checks. The published schema URL is:

```text
https://flisk.sh/schema.service.json
```

## Minimal examples

A backend resource needs a backend port. The usual backend range is `4000`–`4999`.

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "orders-backend",
  "appType": "backend",
  "stack": "shop",
  "port": 4000,
  "healthCheckPath": "/health",
  "dependsOn": []
}
```

A frontend normally uses a port in the `3000`–`3999` range. `framework` is optional; omitting it keeps the default React provider.

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "orders-app",
  "appType": "frontend",
  "stack": "shop",
  "port": 3000,
  "backendName": "orders-backend",
  "basePath": "/shop"
}
```

A worker is a background process that reads from NATS. The service schema requires `featuresEnabled` to contain `"nats"` for a worker. Change `appName`, `stack`, `queueGroup`, and `subjects` to match your own service. The `nats` block is optional and sets the queue group and the subjects the worker subscribes to; see the `nats` field under [Configuration, secrets, and integrations](#configuration-secrets-and-integrations) and the [resource features guide](resource-features.md).

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "email-worker",
  "appType": "worker",
  "stack": "shop",
  "port": 6000,
  "featuresEnabled": ["nats"],
  "nats": {
    "queueGroup": "email-workers",
    "subjects": ["email.send"]
  },
  "dependsOn": []
}
```

A worker has no HTTP server, so it needs no `healthCheckPath` or `traefik` block: Flisk gives it no proxy route and no HTTP health check. `port` is optional for a worker; if you set it, use the `6000`–`6999` range.

An MCP (Model Context Protocol) server is an API resource like a backend: it uses the `4000`–`5999` HTTP-service range (wider than a backend's `4000`–`4999`, shared with `bring-your-own` and `agent` resources), runs behind the Traefik API host, and speaks Streamable HTTP — clients POST JSON-RPC messages to its `/mcp` route on the public proxy URL. The generated scaffold also serves a plain `GET /health` endpoint, so the default health check needs no override. An MCP resource has no `framework` or `language` setting; `flisk resource <name> --type mcp` generates one fixed scaffold (a `@modelcontextprotocol/sdk` server).

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "tools-mcp-server",
  "appType": "mcp",
  "stack": "ai",
  "port": 4002,
  "healthCheckPath": "/health",
  "featuresEnabled": [],
  "dependsOn": ["knowledge-db"]
}
```

`featuresEnabled` is optional; leave it empty or omit it unless the server opts into a platform feature. `dependsOn` follows the same rule as any other resource — it lists resources that must start first (here a database the tools read from). See the [AI Agents in Flisk guide](agents/ai-agents.md) for the MCP hosting model.

Run `flisk resource <name> --type backend`, `flisk resource <name> --type frontend`, `flisk resource <name> --type worker`, or `flisk resource <name> --type mcp` to generate a starting manifest. Existing examples are in [`examples/tdk-example`](../examples/tdk-example).

## Required identity and compatibility fields

| Field | Type and default | Applies to | Description |
| --- | --- | --- | --- |
| `$schema` | string; optional | all | Editor metadata. Point it at the published schema URL for completion and inline validation. |
| `schemaVersion` | integer; **required**, currently `1` | all | Version of the Flisk manifest contract. An unsupported version is rejected; Flisk does not guess how to migrate it. |
| `appName` | string; **required** | all | Resource identifier. Use lowercase letters, numbers, and hyphens; it should match the resource directory name. |
| `appType` | enum; required when `type` is absent | all | Resource kind: `backend`, `frontend`, `library`, `sdk`, `worker`, `migrator`, `mcp`, or `bring-your-own`. Provide either `appType` or the legacy `type` field. |
| `type` | enum; legacy alias for `appType` | existing manifests | Older manifests may use `type`; provide it when `appType` is absent. Use `appType` in new files. During config migration, Flisk copies the legacy value to `appType`. |
| `stack` | string; **required** | all | Groups related resources and influences database names, routes, and generated dependency configuration. |

`appType` determines more than the label shown in the UI. It selects the generator and validation rules. A `worker` must declare the `nats` feature, while `bring-your-own` resources need a `Dockerfile` or `image` and do not receive an application scaffold.

## Ports, runtimes, and providers

| Field | Type and default | Applies to | Description |
| --- | --- | --- | --- |
| `port` | integer; type-specific | backend, frontend, `mcp`, `bring-your-own` | External development port. Backends use `4000`–`4999`; MCP and BYO resources use `4000`–`5999`; frontends use `3000`–`3999`. The internal container port remains `3000`. |
| `runtime` | `"bun"` or `"node"`; defaults to `"bun"` | generated services | Runtime used for the resource. |
| `language` | provider id; omitted means Bun for legacy backends | backend | Backend language provider, such as `bun`, `python`, `go`, `rust`, or `node`. The CLI provider registry, not this document or the schema examples, defines the current ids. |
| `framework` | provider id; omitted means React for frontends and Hono for Bun backends | frontend and backend | Selects the registered framework provider. Unknown ids fail before a resource is written. |
| `featuresEnabled` | string array; generator-selected when omitted | generated resources | Platform and generator features, such as `nats`, `prisma`, `redis`, `infisical`, `vitest`, `traefik`, `websocket`, `graphql`, `grpc`, `api-client`, `env-config`, `vite`, `tsconfig`, `dockerfile`, `nginx`, `playwright`, `agents-md`, `ddd`, and `sablier`. See the complete [resource features guide](resource-features.md). |
| `replicas` | integer; defaults to `1` | runnable services | Number of containers to run. The supported range is `1`–`10`; Traefik load-balances across replicas. |
| `enabled` | boolean; optional | all | Whether the resource is enabled by the project configuration. |

The `language` and `framework` properties intentionally use an open id pattern in the JSON Schema. The CLI registries are the contract because provider ids can be added without editing the schema.

## Dependencies, routes, and health checks

| Field | Type and default | Applies to | Description |
| --- | --- | --- | --- |
| `dependsOn` | string array; optional | all | Resources or stacks that must start before this resource. It also informs focus mode, health checks, migration order, and generated frontend environment values. |
| `dependencies` | string array; deprecated | existing manifests | Legacy spelling for `dependsOn`. It is still read for compatibility; use `dependsOn` in new files. |
| `basePath` | path string; defaults from the stack | frontends | Public route prefix for frontend traffic. |
| `backendName` | resource name; auto-computed for frontends | frontends | Associated backend resource. |
| `apiPath` | path string; optional | API resources | API route exposed by the resource when applicable. |
| `apiBasePath` | `"/api"` by default | legacy/engine integrations | Base path used for API routes in Traefik. New manifests normally rely on the generated route unless an integration needs this override. |
| `healthCheckPath` | path string; defaults to `/health` for HTTP API resources | HTTP resources | Container health endpoint. Traefik uses it too unless `traefik.healthCheck` is set. Omit it for a non-HTTP BYO resource. |
| `traefik` | object; generated when omitted | routable resources | Routing overrides: `host`, `pathPrefix`, and `healthCheck`. |
| `exposeViaProxy` | boolean; defaults to `true` for BYO | BYO resources | Set `false` to keep a BYO resource off Traefik; it then has no public route or HTTP health probe. |
| `smoke` | object; optional | routable HTTP resources | Post-start checks through the public proxy URL. Use `via: "proxy"` and one or more HTTP `steps`. See the [`smoke` configuration guide](configuration.md#smoke-check-the-public-url-after-flisk-up). |

`healthCheckPath` is an inside-the-container readiness probe. A `smoke` block is different: it verifies the public route printed by `flisk up`, and can perform a safe write/read-back flow. Do not use a full URL in a smoke step; its `path` is appended to the public URL.

### Example: one service that depends on another

Say `orders-backend` calls `inventory-backend` and should start after it. Put each manifest in its own directory under `services/`:

```text
services/
  inventory-backend/service.json
  orders-backend/service.json
```

`services/inventory-backend/service.json` has no dependencies:

```json
{
  "schemaVersion": 1,
  "appName": "inventory-backend",
  "appType": "backend",
  "stack": "shop",
  "port": 4001,
  "healthCheckPath": "/health",
  "dependsOn": []
}
```

`services/orders-backend/service.json` lists the service it needs in `dependsOn`:

```json
{
  "schemaVersion": 1,
  "appName": "orders-backend",
  "appType": "backend",
  "stack": "shop",
  "port": 4000,
  "healthCheckPath": "/health",
  "dependsOn": ["inventory-backend"]
}
```

What this does on `flisk up`:

- The generated Tiltfile gives `orders-backend` a Tilt `resource_deps` entry for `inventory-backend`, so Tilt starts `orders-backend` after `inventory-backend` is ready. Tilt decides when a resource is ready; for a container that has a health check, such as the `healthCheckPath` above, that is when the check passes.
- `flisk up --only orders-backend` also starts `inventory-backend`, because a requested service brings in the services it lists in `dependsOn`. `flisk up --dry-run --json --only orders-backend` shows this under `declaredDependencies`.
- A `dependsOn` name that matches no service is reported as an error when the manifests are checked. `postgres` and `database-management` are the exception: they refer to the shared platform Postgres.

This is only local startup ordering for `flisk up`. It does not describe how you deploy the services, and it does not make `orders-backend` retry or wait if `inventory-backend` stops later. Each manifest field is described in the table above; see [`flisk up`](cheat-sheet.md#flisk-up-stack-name-alias-deploy) for `--only` and [Machine-readable CLI](reference/machine-readable-cli.md) for the JSON output.

### Example: Postgres, then a migrator, then an API

A database-backed service usually needs three things in order: Postgres is up, the migrations have run, then the API starts. The `dependsOn` field expresses each step. The scaffold writes this pair for you: `flisk resource orders-api --type backend --stack shop --feature prisma` creates `orders-api` and `orders-api-migrator`.

```text
services/shop/
  orders-api-migrator/service.json
  orders-api/service.json
```

Postgres has no manifest of its own. `postgres` (or `database-management`) in `dependsOn` names the shared platform Postgres that Flisk runs for the project.

`services/shop/orders-api-migrator/service.json` waits for Postgres:

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "orders-api-migrator",
  "appType": "migrator",
  "stack": "shop",
  "featuresEnabled": ["prisma"],
  "dependsOn": ["postgres"]
}
```

`services/shop/orders-api/service.json` waits for the migrator, so it starts last:

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "orders-api",
  "appType": "backend",
  "stack": "shop",
  "port": 4000,
  "healthCheckPath": "/health",
  "featuresEnabled": ["prisma"],
  "dependsOn": ["orders-api-migrator"]
}
```

Reading it from the bottom up: `orders-api` lists `orders-api-migrator`, and the migrator lists `postgres`, so the order is Postgres, then the migrator, then the API. Each name in `dependsOn` is the `appName` of another manifest. As in the earlier example, each entry becomes a Tilt `resource_deps` edge, and a name that matches no service (other than the two Postgres names) is reported when the manifests are checked.

Keep the migration command in the migrator, not in the API's start command. The migrator runs when `flisk up` starts it, and the API only starts after it, so restarting the API does not re-run migrations. The scaffolded migrator's `start` script is `prisma migrate deploy`. For a migrator that is not Prisma, see [One-shot jobs](byo.md#one-shot-jobs-migrations-seeders) and the runnable [`examples/byo-jobs/`](../examples/byo-jobs/README.md), which set `"restart": "no"` so the job is not started again after it exits.

The two manifests above pass the service schema and `flisk config verify` (no manifest or dependency error). That Tilt holds the API until the migrator finishes is **not checked here**, because it needs a running stack.

## Build and container fields

| Field | Type and default | Applies to | Description |
| --- | --- | --- | --- |
| `dockerfile` | path string; generated Dockerfile by default | BYO and custom builds | Dockerfile path relative to the resource or build context. |
| `buildContext` | path string; resource directory by default | BYO | Docker build context relative to the resource directory. When set, `dockerfile` is relative to this context. |
| `image` | image reference; optional | BYO | Use an existing image instead of building a Dockerfile. |
| `restart` | `no`, `on-failure`, `unless-stopped`, or `always`; defaults to `unless-stopped` | BYO | Docker Compose restart policy. Use `no` or `on-failure` for one-shot jobs such as migrations. |
| `syncs` | string array; generated by type when omitted | generated services | Directories to sync for hot reload. Backends default to `src` and `prisma`; frontends default to `src` and `public`. |
| `dev` | object; optional | provider-specific/legacy | Development command and watch settings for languages that own their development process. The provider determines the supported shape. |
| `build` | object; optional | provider-specific/legacy | Additional build settings consumed by the relevant generator. |

## Configuration, secrets, and integrations

| Field | Type and default | Applies to | Description |
| --- | --- | --- | --- |
| `params` | string map; optional | all | Non-secret values such as `BASE_URL` or `PORT`. |
| `envVars` | object; deprecated | existing manifests | Legacy alias for `params`, read only when `params` is absent. |
| `secrets` | object; optional | all | Secret names to inject from the project `.env` or the configured secret provider. Use `required` and optionally `optional`; never put secret values in this file. |
| `nats` | object; optional | services using NATS | Custom `queueGroup` and `subjects`. Flisk generates NATS configuration when `nats` is enabled in `featuresEnabled`. |
| `databaseName` | string; generated from the stack by default | database-backed services | Overrides the generated database name. |
| `playwright` | boolean; defaults to `false` | generated frontend/services | Requests a generated Playwright configuration when enabled. |
| `sablier` | object; disabled unless enabled | licensed services | On-demand scaling. Options are `enable`, `deferStart`, `group`, and `sessionDuration`. This is a Premium feature and requires `TDK_LICENSE_KEY`; it is not available merely by adding the JSON block. |
| `name` | string; legacy/generated metadata | existing manifests | Retained for compatibility with older generated manifests. Prefer `appName` for the resource identity. |

Do not add `jwtSecret` or other secret values to `service.json`. Flisk ignores `jwtSecret` and reports that it must be removed; put secret names in `secrets` and values in the project’s ignored `.env` or the configured provider.

Unknown fields are preserved so projects can carry application-specific metadata, but Flisk reports them as warnings. A warning is not evidence that the field affects generated infrastructure.

## Validation and troubleshooting

Run the checks that match the change:

```bash
flisk config verify
flisk doctor
```

The JSON Schema catches editor-time type, enum, required-field, and port-range mistakes. The CLI additionally checks the manifest path and generated-output safety. Typical messages include:

```text
services/shop/api/service.json.appType: required field is missing
services/shop/api/service.json.schemaVersion: unsupported version 2 (supported: 1)
services/shop/api/service.json.healthCheckPath: must be a path such as /health (no spaces, line breaks or YAML syntax)
```

The manifest validator rejects line breaks and control characters in values that reach generated YAML. It also validates the structure of `smoke`, including a non-empty `steps` array, absolute path fragments beginning with `/`, and `save` selectors such as `$.id`.

If an older manifest has `type` instead of `appType`, run the config migration flow and review the diff. Flisk preserves unknown fields and warns about deprecated `dependencies`, `envVars`, and ignored secret fields rather than silently deleting them.

## Keeping this reference current

When adding or changing a manifest field, update all of these together:

1. `cli/src/types/index.ts` for the TypeScript contract.
2. `engine/schemas/service-schema.json` for editor validation and descriptions.
3. `cli/src/utils/service-manifest.ts` when runtime validation, deprecation, or safety behavior changes.
4. This reference and the short overview in [`cli/README.md`](../cli/README.md).

The published schema is a post-merge artifact. Pull requests should validate the repository copy offline; do not treat a stale published URL as permission to document behavior that is not present on `main`.
