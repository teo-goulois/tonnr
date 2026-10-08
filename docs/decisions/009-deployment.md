# 009. Deployment of the API and the worker

Status: proposed to Téo on 2026-10-08. On a development machine, an arm64 Mac, the two images were built and run against an empty database: the API applied the migrations and served, the worker ingested every provider, and each stopped within a second. Not tried: a build on amd64, Easypanel itself, and a switch from one version to the next. Nothing is deployed yet.

## Context

Decision 001 puts the API, the worker, and Postgres on Téo's Easypanel server, and the web app on Cloudflare. Easypanel builds an image from a Dockerfile in the repository and gives each container its environment.

## Decision

- The API and the worker each have a Dockerfile, built with the repository root as context. The build stage installs what the app and its workspace packages need, with `pnpm install --filter "<app>..."`. The image that runs holds the built app and its production dependencies only.
- A container takes every value from its environment. No `.env` file goes into an image. Varlock checks the values at startup, so a container with a missing value stops and names it. Each app's `.env.schema` lists what it needs.
- The API container runs `apps/server/src/start.ts`, which applies the migrations and then starts the API. It uses the ORM's own migrator, which keeps the same record of applied migrations as `drizzle-kit migrate`, so development keeps using `pnpm run db:migrate`. A migration that fails stops the container before it serves anything.
- The worker changes no schema of the application. pg-boss creates and updates its own `pgboss` schema.
- The API answers `GET /` with `OK`, which is what a health check calls. It does not query the database.
- Both programs stop on SIGTERM. The API gives requests under way five seconds to finish and exits with an error when it has to cut one. A stop during the migrations ends the process at once, and Postgres rolls back the migration under way.
- Both run as the `node` user, not as root.
- `docker-compose.yml` runs the same two images with Postgres on one machine, to try a release before it is deployed.

## First deployment

Three services: Postgres 18, the API from `apps/server/Dockerfile`, the worker from `apps/worker/Dockerfile`. Deploy them in that order.

- API `DATABASE_URL` and worker `DATABASE_URL`: the production database, the same for both.
- API `BETTER_AUTH_SECRET`: 32 characters or more, generated once and kept. Changing it signs every user out.
- API `BETTER_AUTH_URL`: the public HTTPS address of the API.
- API `CORS_ORIGIN`: the public HTTPS address of the web app, exactly as the browser shows it.
- Web `VITE_SERVER_URL`: the same address as `BETTER_AUTH_URL`. It is read when the web app is built.
- The API listens on `PORT`, 3000 by default. The domain of the API service points at that port.

A container that answers `OK` only proves that the API started. Sign in from the web app to prove that the three addresses agree.

## Consequences

- Run one API container. Two that start together would both apply the migrations, and nothing locks them out of each other.
- A new version applies its migrations while the previous API and worker still run. Write each migration so that the previous version keeps working: add in one release, remove in a later one.
- When a release adds a migration the worker needs, deploy the API first. A worker that starts too early fails its runs until the next schedule.
- The API image weighs about 1 GB and the worker's 660 MB on arm64, 380 MB of which is the Node base image. Most of the rest of the API's is the 400 MB of peer dependencies that `better-auth` brings, development tools among them.
- Every build installs the dependencies again, since a change to any file comes before the install. `pnpm fetch` would cache the download, but it puts the dependencies of the whole repository in the image, which then weighs 2.8 GB.
- Not decided yet: backups of Postgres, and how Cloudflare caches the public API.
