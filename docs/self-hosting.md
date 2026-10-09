# Hosting Tonnr yourself

An instance is three programs: Postgres 18, the API, and the worker that fetches the measurements. Decision 009 gives the reasons behind what follows.

The web app is not one of the containers yet, and an instance without it serves the API alone. To run the web app, follow "Run it" in the [README](../README.md), with `VITE_SERVER_URL` in `apps/web/.env` set to the public address of the API. `pnpm run deploy` sends it to Cloudflare instead, a path that no real deployment has used so far.

## With Docker Compose

1. Clone the repository on the server.
2. Copy `apps/server/.env.example` to `apps/server/.env` and set the three values below. Compose sets `DATABASE_URL` itself.
3. Copy `.env.example` to `.env` and choose `POSTGRES_PASSWORD`, from letters and digits only: it goes into the database's address as it is. `openssl rand -hex 24` makes one. Postgres takes it when it first creates its volume, so choose it before the first start.
4. Run `docker compose up --detach --build`.

| Variable             | Value                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | 32 characters or more. `openssl rand -base64 32` makes one.                                                         |
| `BETTER_AUTH_URL`    | The public HTTPS address of the API.                                                                                |
| `CORS_ORIGIN`        | The public HTTPS address of the web app, exactly as the browser shows it. Without a web app, the API's own address. |

Keep the secret: changing it signs every user out.

The API then answers on port 3000, or on `API_PORT`. Put a reverse proxy with HTTPS in front of it: the session cookie is marked secure, so sign-in works over HTTPS only, `localhost` aside. Postgres listens on this machine only.

To check the instance:

- `curl http://localhost:3000/` answers `OK`, and `/v1/docs` shows the API reference.
- `docker compose logs worker` shows `Migrations applied`, one `Scheduled ingest-…` line per provider, then lines such as `ndbc: 765 stations, 1210 new readings` and `breaks-osm: 340 listed, 340 added, 0 removed, 0 unreadable`.
- With a web app, signing in from it proves that the three addresses agree.

## On another platform

Run the same three services: `postgres:18` with its volume mounted at `/var/lib/postgresql`, an image built from `apps/server/Dockerfile`, and one built from `apps/worker/Dockerfile`. Both builds take the repository root as their context.

- The API needs `DATABASE_URL` and the three values above. It listens on `PORT`, 3000 by default, and answers `GET /` with `OK` for a health check.
- The worker needs `DATABASE_URL` only, the same as the API's. It listens on no port.
- A container with a missing or malformed value stops at once and names it.

The services may start in any order, and together.

On Easypanel, each service has a deploy address under "Deployments". Put it in the root `.env`, as `.env.example` shows, and `pnpm run deploy:api` or `pnpm run deploy:worker` deploys the service from your machine. Keep the address secret: whoever knows it can deploy.

## Updating

```bash
git pull
docker compose up --detach --build
```

A new version applies its migrations when its first container starts. A migration that fails stops the container, and none of the pending migrations is kept. Back the database up first:

```bash
docker compose exec -T postgres pg_dump -U postgres --format=custom app > tonnr-$(date +%F).dump
```

`pg_restore` reads the file back.

## Running one job

Once the instance runs, `docker compose run --rm worker node dist/cli.mjs <job>` runs one job once and exits. A job is a provider's name, such as `ndbc`, or `alerts`, `exposure`, or `breaks`. The two jobs of the private list take a value, and the next section gives them.

## Keeping a list of breaks you may not publish

This is optional: an instance runs without it.

You may hold a list of surf breaks from a provider that gave you no right to republish it. The private list keeps it in your database for you alone: the API does not serve it, and the worker never asks the provider for it. Decision 016 gives the rules. You answer to the provider for holding the list.

Write the list as one JSON file, in UTF-8:

```json
{
  "provider": "example",
  "termsUrl": "https://example.org/terms",
  "breaks": [
    {
      "ref": "a1",
      "name": "North jetty",
      "latitude": 48.0,
      "longitude": -4.5,
      "url": "https://example.org/breaks/a1",
      "collectedAt": "2026-10-08T10:00:00Z",
      "details": { "bottom": "sand" }
    }
  ]
}
```

- `provider` is a short name in lower case, and `termsUrl` the address of the provider's terms.
- `ref` is the break's identifier at the provider. A file gives each one once.
- `url` is the provider's page for the break. `collectedAt` is when you read it, with its offset and no finer than a millisecond.
- `details` holds whatever else the provider says of the break. It is stored as it is, and may be left out.
- Any other field refuses the file, and so does one faulty line: nothing of a file is stored unless all of it can be.
- A number is refused when JavaScript cannot hold it as it is written, such as an integer past 2^53.

Keep the file outside the clone. A build copies the clone into the image, and Git must never see the file.

The instance must run a version that has the two tables, so update it first. The command then takes the path of the file and says what storing it would change. It stores it only with `--write`:

```bash
docker compose run --rm --volume /path/to/breaks.json:/tmp/breaks.json:ro worker node dist/cli.mjs private-breaks /tmp/breaks.json
docker compose run --rm --volume /path/to/breaks.json:/tmp/breaks.json:ro worker node dist/cli.mjs private-breaks /tmp/breaks.json --write
```

From a clone, with `DATABASE_URL` naming the instance's database, `pnpm --filter worker run job private-breaks /path/to/breaks.json` does the same.

A break already stored keeps its id and takes the file's values. A break the file leaves out stays. Storing the same file twice changes nothing.

When it stores something, the command prints the id of the import. With that id, this says how many breaks the import added, and deletes them only with `--write`:

```bash
docker compose run --rm worker node dist/cli.mjs private-breaks-remove <import>
docker compose run --rm worker node dist/cli.mjs private-breaks-remove <import> --write
```

It deletes them as they are, with whatever a later file changed in them, and touches nothing else. It does not bring back the values a break had before: store the earlier file again for that.

Whoever can query the database reads the list, and a dump holds it. Keep your backups as private as the list.

## Accounts

Anyone who can reach the API can create an account with an email address and a password. Tonnr does not check the address yet.

## What an instance owes the data providers

The worker calls the providers from your server, each on its schedule, from every ten minutes to once an hour. You answer to them for your instance.

- Read [Data sources](data-sources.md) before you open an instance to other people. It says what each provider allows.
- Show a station's attribution wherever you show its data. The API returns it with every station.
- The catalogue of surf breaks comes from OpenStreetMap, through one request a week to the public Overpass servers. Show "© OpenStreetMap contributors" wherever you show a break. The API returns it with every break.
- The map colors the sea with tiles that each visitor's browser fetches from the Copernicus Marine Service. Your API reads only their description, two documents an hour. Keep the credit the map shows for them. Decision 018 says what that provider sees.
- A station whose `license.commercialUse` is `false` or `null` must stay out of anything paid.
- The code's licence covers the code. The measurements stay under their providers' terms.

## What the licence asks

Tonnr is under the GNU Affero General Public License, version 3. Running it as it is asks nothing more of you. If you change the code and let other people use your instance, offer them the source of your version.
