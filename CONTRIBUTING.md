# Contributing

Tonnr is built by one person, in the open. A fix or a small improvement is welcome as a pull request. For anything larger, open an issue first, so that we agree on it before you write it.

## Where things are

- [README.md](README.md) says how to run Tonnr on your machine.
- [AGENTS.md](AGENTS.md) describes the packages, what each one may know, and the commands that have a catch. It is written for coding agents and holds for people.
- [docs/decisions](docs/decisions/README.md) records why things are as they are. A change that goes against a record needs a new one.

## Checks

`pnpm run check` runs lint, the format check, the type check, and the tests. CI runs it on every push and pull request.

Some tests need Postgres and are skipped without it. To run them, start the database with `pnpm run db:start`, then:

```bash
TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres pnpm run test
```

They create databases of their own and drop them. The one the address names is never written to.

A change to a Dockerfile, a dependency, or a migration also builds the two images in CI and starts them on an empty database.

## Changing the schema

Change the schema in `packages/db`, run `pnpm run db:generate`, and commit the migration it writes. CI fails when the two disagree.

A new version applies its migrations while the previous one still runs. Add in one release and remove in a later one, so that the previous version keeps working meanwhile.

## Data providers

- Read [Data sources](docs/data-sources.md) first. A provider is added once its terms were read at the source, station by station where they differ.
- A test reads a saved sample of the provider's data, as small as the test needs. The sample stays under the provider's terms.
- Neither the tests nor CI call a provider.
