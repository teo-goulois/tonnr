# Tonnr

Tonnr is a free, open-source surf-conditions service. Users save spots with the conditions that make them work, get alerted when measurements or forecasts match, and share spots. A public API serves the data underneath: buoy measurements, forecasts, tides, and history. The repository directory is still named `forecastr`.

Read `docs/product-vision.md` before product work, `docs/data-sources.md` before touching a data provider, `docs/self-hosting.md` before changing how an instance is deployed, and the relevant record in `docs/decisions/` before structural work. Record a new decision there after making a durable one.

## Boundaries

- `apps/server` hosts the oRPC router with Hono on Node. It serves the public API at `/v1`, with its spec at `/v1/openapi.json` and reference at `/v1/docs`, the typed RPC transport at `/rpc`, and Better Auth at `/api/auth`. It deploys as a Docker container, and decision 009 says how.
- `apps/worker` fetches buoy data on a schedule and writes it to the database. It deploys as a second container, which applies the migrations at its start as the API's does. Each provider is one module that knows its provider's format and nothing about the database. Decision 004 describes the model.
- `apps/web` is the TanStack Start app. It deploys to Cloudflare through `packages/infra`.
- `packages/api` holds the procedures. Each user action is one oRPC procedure, and its validation, authorization, and logic live in that procedure. Public procedures belong to a versioned router. Decision 003 says what may change inside a version.
- `packages/db` holds the Drizzle schema and client. Use stock Postgres 18 features and change the schema through Drizzle migrations, so the database stays portable. Decision 001 gives the reason.
- `packages/conditions` computes what the sea does at a point: tides, forecasts, and whether a spot's criteria are met. The API and the worker both use it, and it knows nothing about HTTP or the database.
- `packages/upstream` is how the API and the worker call a data provider. It sets the user agent, the timeout, and the retries, so no other code calls `fetch` on a provider.
- `packages/auth` sets up Better Auth. `packages/ui` holds shared interface primitives.

## The product name

The name may change. Read it from `APP_NAME` in `@repo/config/app` wherever a user sees it, and keep it out of identifiers. Packages use the neutral `@repo` scope for that reason.

To rename the product, change `APP_NAME`, then the prose in `README.md`, this file, and `docs/`. `APP_SLUG`, the `name` in `docker-compose.yml`, and the `name` in the root `package.json` identify infrastructure. Change them only before the first deploy. Compose names the images after its project, and `.github/workflows/images.yml` starts the worker's by that name.

## Data rules

- Fetch from the upstream providers listed in `docs/data-sources.md`.
- Store each station's license and attribution, and return them in API responses.

## A public repository

The repository is public, and so is its history. Decision 012 says what follows.

- Keep secrets, personal data, and paths of one machine out of code, tests, docs, and commit messages.
- Tests and CI never call a data provider. A test reads a saved sample, as small as the test needs.
- CI reads no secret. A workflow that needs one is a decision to record first.
- What a deployment needs goes into `docs/self-hosting.md` in the same change: other people follow it.

## Environment files

Téo's rules are at teogoulois.com/code/workstation/secrets. In this repository:

- Each app's `.env.schema` declares its variables and is committed. Varlock validates them at startup and generates `src/env.ts`.
- Each app's `.env.example` lists the same variables with fake values. Update it in the change that starts reading a variable, and tell Téo which value goes in which file.
- Real values live in `apps/server/.env` and `apps/web/.env`, which Git ignores. The worker and `packages/db` read the server's values through their schema's `@import`.
- The `.env.example` at the root lists what `docker-compose.yml` reads. `TEST_DATABASE_URL` is set in the shell and in CI, in no file.
- Show a file's variable names, never its contents. `envsync push` is Téo's to run.

## Commands

`package.json` lists the scripts. These have a catch:

- `pnpm run check` runs lint, the format check, the type check, and the tests. It writes nothing. `pnpm run format` writes.
- `pnpm run db:start` needs Docker.
- `pnpm run docker:up` runs the release images of the API and the worker with Postgres. It takes ports 3000 and 5432 unless `API_PORT` and `POSTGRES_PORT` name others, and belongs to the same Compose project as `db:start`, so stop the development API first.
- The tests that need Postgres are skipped unless `TEST_DATABASE_URL` names a server on which they may create databases: `TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres pnpm run test`. Each creates a database of its own and drops it.
- The API listens on `PORT`, 3000 by default. To try something next to a running app, start a second one with `PORT` and `DATABASE_URL` set in the environment.
- `pnpm run dev` leaves the worker out, so that starting the app does not poll the providers. Start it with `pnpm run dev:worker`, or run one job once with `pnpm --filter worker run job <provider>`, `... job alerts`, or `... job exposure`.
- `pnpm run demo` is temporary. It builds the app and serves it through a Cloudflare quick tunnel, with its own web build in `apps/web/.demo-dist`. `pnpm run demo:reload` rebuilds and restarts the app behind the same address. Delete `scripts/demo.mjs` once a real deployment exists.
- Apply schema changes with `pnpm run db:generate`, then `pnpm run db:migrate`. `db:push` skips the migration files. Turborepo refuses these scripts in a shell without a terminal, as an agent's is: run them in the package, `pnpm --filter @repo/db run db:migrate`.
- Run `pnpm run auth:generate` after changing Better Auth plugins, and `pnpm run env:generate` after changing a `.env.schema`.
- tsdown bundles into `apps/server/dist` every dependency that `apps/server/package.json` does not list. A library that reads files next to its own module then fails at startup, so list it there, as `@neaps/tide-database` is.
- Varlock blocks any HTTP response that contains the value of a sensitive variable. Mark a variable `@public` in `.env.schema` when its value may appear in a response, as the server URL does in the OpenAPI spec.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
