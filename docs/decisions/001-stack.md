# 001. Initial stack

Status: accepted on 2026-10-08.

## Context

Tonn is free and built by one developer. Téo has a server running Easypanel. A mobile app follows the web app, so the API has several clients. The stack starts from the defaults in Téo's handbook (teogoulois.com/code) and departs from them where this project gives a reason.

`bts.jsonc` records what Better-T-Stack generated. This file records why.

## Decision

| Layer           | Choice                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tooling         | Turborepo, pnpm, Oxlint, Oxfmt, TypeScript 7                                                                                      |
| Web             | TanStack Start, deployed to Cloudflare with Alchemy                                                                               |
| API             | oRPC procedures hosted by Hono on Node. One router serves RPC and OpenAPI, and later MCP.                                         |
| Data            | Drizzle on Postgres 18                                                                                                            |
| Auth            | Better Auth                                                                                                                       |
| Backend logic   | Effect v4, added with the first domain code                                                                                       |
| Background jobs | pg-boss in the same Postgres, added with ingestion                                                                                |
| Hosting         | API, worker, and Postgres as containers on Téo's Easypanel server. Cloudflare serves the web app and caches public API responses. |

## Departures from the handbook defaults

- Postgres runs on the server, not on Neon. Neon's free plan allows 1 GB of storage and 100 CU-hours a month per project. Buoy readings alone are about 12 million rows a year, and ingestion wakes the database all day.
- The API runs next to the database, not on Cloudflare Workers. With the database on one server, an API at the edge would cross the internet on every uncached request and would still be down whenever the server is.

## Constraint: stay portable to PlanetScale Postgres

Téo wants to be able to move the database to PlanetScale Postgres later.

- Use stock Postgres features. PlanetScale runs Postgres 17 and 18.
- Use only extensions PlanetScale lists. PostGIS and pg_partman are listed. TimescaleDB is listed in its Apache 2 edition only, so compression and continuous aggregates would not move.
- Partition time-series tables with native declarative partitioning.
- Make every schema change through a Drizzle migration.
- Before migrating, test pg-boss against PlanetScale's connection pooler.

## Rejected

- Temporal for background work. The first-release jobs are scheduled fetches with idempotent upserts, chunked backfills whose progress fits in a table, and alert checks after each ingestion. None needs durable multi-step state. Temporal would add a server, a UI, its own database schemas, and determinism rules for workflow code. Revisit it when a job must wait days on an outside event, or coordinate several steps that must each run exactly once.
- TimescaleDB. See the portability constraint.
- Neon on a paid plan with the API on Workers. It removes the single server but adds a monthly cost to a free project.
- Hono with `@hono/zod-openapi`. oRPC generates the same OpenAPI spec and also gives the typed client and the route to MCP.

## Consequences

- One server is a single point of failure for the API, ingestion, and alerts. The web app shell stays up on Cloudflare.
- Postgres backups are Téo's job. Schedule dumps to object storage before the first user data exists.
- The server must have room for Postgres, the API, and a worker. This record assumes 4 GB of RAM and tens of GB of disk are free. Unconfirmed.
- `pnpm run db:start` needs Docker on the development machine.

## User overrides

- Téo chose everything on his server over Neon with Workers.
- Téo asked whether Temporal was overkill for this. It was, and pg-boss replaced it.
- Téo asked to keep a migration path to PlanetScale Postgres.
