# 009. Deployment of the API and the worker

Status: in use since 2026-10-08, when Téo deployed the three services on Easypanel. The API answers at `api.tonnr.app` and the worker ingests. CI builds the two images on amd64 and starts them on an empty database at every push. Not tried yet: a release whose migration the previous version has to live with.

## Context

Decision 001 puts the API, the worker, and Postgres on Téo's Easypanel server, and the web app on Cloudflare. Easypanel builds an image from a Dockerfile in the repository and gives each container its environment.

## Decision

- The API and the worker each have a Dockerfile, built with the repository root as context. The build stage installs what the app and its workspace packages need, with `pnpm install --filter "<app>..."`. The image that runs holds the repository's files, the built app, and its production dependencies: no development dependency, and no pnpm.
- A container takes every value from its environment. No `.env` file goes into an image. Varlock checks the values at startup, so a container with a missing value stops and names it. Each app's `.env.schema` lists what it needs.
- Each container runs its app's `start.ts`, which applies the migrations and then starts the app. It uses the ORM's own migrator, which keeps the same record of applied migrations as `drizzle-kit migrate`, so development keeps using `pnpm run db:migrate`. A migration that fails stops the container before it does anything else.
- A container locks the database while it migrates. The ones that start meanwhile wait, then find nothing left to apply, so the services may start in any order and together. Decision 012 asked for this.
- pg-boss creates and updates its own `pgboss` schema.
- The API answers `GET /` with `OK`, which is what a health check calls. It does not query the database.
- Both programs stop on SIGTERM. The API gives requests under way five seconds to finish and exits with an error when it has to cut one. A stop during the migrations ends the process at once, and Postgres rolls back the migration under way.
- Both run as the `node` user, not as root.
- `docker-compose.yml` runs the same two images with Postgres on one machine, to try a release before it is deployed.
- Easypanel deploys a service when its deploy address is called. `pnpm run deploy:api` and `pnpm run deploy:worker` call it, reading it from the root `.env`: whoever knows the address can deploy, so it stays out of the repository.

## First deployment

`docs/self-hosting.md` gives the services, their values, and how to check them.

## Consequences

- A new version applies its migrations while the previous API and worker still run. Write each migration so that the previous version keeps working: add in one release, remove in a later one.
- The API image weighs about 1 GB and the worker's 660 MB on arm64, 380 MB of which is the Node base image. Most of the rest of the API's is the 400 MB of peer dependencies that `better-auth` brings, development tools among them.
- Every build installs the dependencies again, since a change to any file comes before the install. `pnpm fetch` would cache the download, but it puts the dependencies of the whole repository in the image, which then weighs 2.8 GB.
- Not decided yet: backups of Postgres, and how Cloudflare caches the public API.
