# 052. Production on the instance that runs today

Status: decided by Téo on 2026-10-15, before the first public release. It answers what decision 021 left open, and amends 021 and 009.

## Context

Decision 021 made one stage of the web app, `dev`, at `dev.tonnr.app`, against the API of Téo's instance at `api.tonnr.app`. It left two things open: a production stage, and whether production gets an API and a database of its own.

An API trusts one web origin, its `CORS_ORIGIN` (decision 019). Two web apps against one API is therefore not possible: the second one's pages are refused.

Open-Meteo counts its free requests by the address that asks (decision 023). A second instance on the same server would share the same allowance.

## Decision

- Production is the instance that runs today: the API at `api.tonnr.app`, its worker, and its database. No second instance is made.
- The production stage of the web app is `prod`. It serves `tonnr.app` and sets `WEB_INDEXED=true`. Its PostHog environment is `production`, on the API and on the web app.
- The API's and the worker's `CORS_ORIGIN` become `https://tonnr.app`. From then on `dev.tonnr.app` is refused by the API: it is no pre-production any more.
- The admin app moves to the `prod` stage too, at `admin.tonnr.app`, which Téo asked for on 2026-10-15: `ADMIN_DOMAIN` in that stage, and the API's `ADMIN_ORIGIN` becomes `https://admin.tonnr.app`.
- The database is backed up by Easypanel's own backups, which Téo set up there.

## Rejected

- **A second instance for production.** A second server, a second set of keys and secrets, and an Open-Meteo allowance divided by two on one address. Téo is the only user of the instance before the release, so it has nothing to keep apart.
- **A list of trusted origins, so that `dev` and `prod` share the API.** Decision 021 rejected it for the same reason.

## Consequences

- There is no pre-production. A change is tried locally, then deployed to production. A pre-production comes back with a second instance, on an address of its own for Open-Meteo.
- The Workers of `dev.tonnr.app` and `admin.dev.tonnr.app` stay deployed, since no command takes a stage down: they load, and every call to the API is refused. Remove them by hand in Cloudflare, or leave it until a pre-production comes back.
- What the database holds from before the release, accounts and spots made while trying the app, stays unless Téo removes it.
