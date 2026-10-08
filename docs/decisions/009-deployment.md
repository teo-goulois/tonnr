# 009. Deployment of the API and the worker

Status: proposed to Téo on 2026-10-08. On a development machine the two images were built and run against an empty database: the API applied the migrations and served, the worker ingested every provider, and each stopped within a second. Nothing is deployed yet.

## Context

Decision 001 puts the API, the worker, and Postgres on Téo's Easypanel server, and the web app on Cloudflare. Easypanel builds an image from a Dockerfile in the repository and gives each container its environment.

## Decision

- The API and the worker each have a Dockerfile, built with the repository root as context. An image installs only what its app needs, with `pnpm install --filter "<app>..."`.
- A container takes every value from its environment. No `.env` file goes into an image. Varlock checks the values at startup, so a container with a missing value stops and names it. Each app's `.env.schema` lists what it needs.
- The API container applies the migrations, then starts the API. A migration that fails stops the container before it serves anything.
- The worker changes no schema of the application. pg-boss creates and updates its own `pgboss` schema.
- The API answers `GET /` with `OK`, which is what a health check calls. It does not query the database.
- Both programs stop on SIGTERM: the API lets requests under way finish, and the worker lets pg-boss stop.
- Both run as the `node` user, not as root.
- `docker-compose.yml` runs the same two images with Postgres on one machine, to try a release before it is deployed.

## Consequences

- Run one API container. Two that start together would both apply the migrations.
- When a release adds a migration the worker needs, deploy the API first. A worker that starts too early fails its runs until the next schedule.
- The images carry the development dependencies, since the migration tool is one of them. Each weighs about 900 MB on arm64, 380 MB of which is the Node base image. A production-only install would take about 250 MB off the worker and 70 MB off the API, whose `better-auth` brings 400 MB of peer dependencies either way. Slim them when their size matters.
- `pnpm fetch` is not used to cache the download between builds: it puts the dependencies of the whole repository in the image, which then weighs 2.8 GB.
- Not decided yet: backups of Postgres, and how Cloudflare caches the public API.
