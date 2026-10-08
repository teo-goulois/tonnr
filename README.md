<img src="assets/icon.svg" width="64" height="64" alt="">

# Tonn

A free surf-conditions service. Save your spots with the conditions that make them work, get alerted when measurements or forecasts match, and share them. A public API serves the data underneath: buoy measurements, forecasts, tides, and history.

## Run it

```bash
pnpm install
pnpm run db:start   # Postgres in Docker
pnpm run db:migrate # apply the schema
pnpm run dev        # web on http://localhost:3001, API on http://localhost:3000
pnpm run dev:worker # fetch buoy data on a schedule
```

The API reference is at http://localhost:3000/v1/docs. `pnpm run check` runs lint, the format check, the type check, and the tests.

## Learn more

- [Product vision](docs/product-vision.md)
- [Data sources](docs/data-sources.md)
- [Decisions](docs/decisions/README.md)
- [AGENTS.md](AGENTS.md) for package boundaries and conventions
