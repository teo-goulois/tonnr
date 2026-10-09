<img src="assets/icon.svg" width="64" height="64" alt="">

# Tonnr

A free, open-source surf-conditions service. Save your spots with the conditions that make them work, get alerted when measurements or forecasts match, and share them. An API serves the data underneath, to accounts and to programs that hold a key: buoy measurements, forecasts, tides, and history.

Tonnr is at an early stage. The API lives under `/v1`, and [decision 003](docs/decisions/003-api-versioning.md) says what may change inside a version.

## Run it

You need Node 26, pnpm, and Docker. The interface uses the Nucleo icons, whose packages check a licence when they install: give your key to the install, as below.

```bash
NUCLEO_LICENSE_KEY=your-key pnpm install
cp apps/server/.env.example apps/server/.env   # then fill in the secret
cp apps/web/.env.example apps/web/.env
pnpm run db:start   # Postgres in Docker
pnpm run db:migrate # apply the schema
pnpm run dev        # web on http://localhost:3001, API on http://localhost:3000
pnpm run dev:worker # fetch buoy data on a schedule
```

The API reference is at http://localhost:3000/v1/docs. `pnpm run check` runs lint, the format check, the type check, and the tests.

## Host it

`docker compose up` runs the API, the worker, and Postgres from this repository. Each container brings the database up to date when it starts. [Hosting Tonnr yourself](docs/self-hosting.md) gives the steps, and says what an instance owes the data providers.

## The data

The measurements belong to the networks that publish them, each under its own terms. Tonnr stores every station's licence and attribution and returns them with the data. [Data sources](docs/data-sources.md) lists the providers and what each one allows.

## Contribute

[CONTRIBUTING.md](CONTRIBUTING.md) says how. Report a security problem in private, as [SECURITY.md](SECURITY.md) describes.

## Licence

Tonnr's code is free software under the [GNU Affero General Public License, version 3](LICENSE). Copyright © 2026 Téo Goulois.

You may use it, change it, and share it. If you let people use a changed version over a network, the licence asks you to offer them its source. The measurements are not part of it: they stay under their providers' terms.

The interface primitives in `packages/ui` come from [shadcn/ui](https://ui.shadcn.com), under the MIT licence.

## Learn more

- [Product vision](docs/product-vision.md)
- [Decisions](docs/decisions/README.md)
- [AGENTS.md](AGENTS.md) for package boundaries and conventions
