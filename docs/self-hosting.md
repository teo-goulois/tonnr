# Hosting Tonnr yourself

An instance is three programs: Postgres 18, the API, and the worker that fetches the measurements. Decision 009 gives the reasons behind what follows.

The web app is not one of the containers, and an instance without it serves the API alone. It goes to Cloudflare: "The web app, on Cloudflare" below gives the steps. To run it on your machine instead, follow "Run it" in the [README](../README.md), with `VITE_SERVER_URL` in `apps/web/.env` set to the public address of the API.

## With Docker Compose

1. Clone the repository on the server.
2. Copy `apps/server/.env.example` to `apps/server/.env` and set the three values below. Compose sets `DATABASE_URL` itself.
3. Copy `.env.example` to `.env` and choose `POSTGRES_PASSWORD`, from letters and digits only: it goes into the database's address as it is. `openssl rand -hex 24` makes one. Postgres takes it when it first creates its volume, so choose it before the first start.
4. Run `docker compose up --detach --build`.

| Variable             | Value                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | 32 characters or more. `openssl rand -base64 32` makes one.                                                                                   |
| `BETTER_AUTH_URL`    | The public HTTPS address of the API.                                                                                                          |
| `CORS_ORIGIN`        | The public HTTPS address of the web app, exactly as the browser shows it, with no slash at its end. Without a web app, the API's own address. |

Keep the secret: changing it signs every user out.

The API then answers on port 3000, or on `API_PORT`. Put a reverse proxy with HTTPS in front of it: the session cookie is marked secure, so sign-in works over HTTPS only, `localhost` aside. Postgres listens on this machine only.

To check the instance:

- `curl http://localhost:3000/` answers `OK`, and `/v1/docs` shows the API reference. `curl http://localhost:3000/v1/stations` answers 401: the API asks who calls.
- `docker compose logs worker` shows `Migrations applied`, one `Scheduled ingest-…` line per provider, then lines such as `ndbc: 765 stations, 1210 new readings` and `breaks-osm: 340 listed, 340 added, 0 removed, 0 unreadable`.
- With a web app, signing in from it proves that the three addresses agree.

## On another platform

Run the same three services: `postgres:18` with its volume mounted at `/var/lib/postgresql`, an image built from `apps/server/Dockerfile`, and one built from `apps/worker/Dockerfile`. Both builds take the repository root as their context.

- The API needs `DATABASE_URL` and the three values above. It listens on `PORT`, 3000 by default, and answers `GET /` with `OK` for a health check.
- The worker needs `DATABASE_URL` only, the same as the API's. It listens on no port.
- A container with a missing or malformed value stops at once and names it.

The services may start in any order, and together.

On Easypanel, each service has a deploy address under "Deployments". Put it in the root `.env`, as `.env.example` shows, and `pnpm run deploy:api` or `pnpm run deploy:worker` deploys the service from your machine. Keep the address secret: whoever knows it can deploy.

## The web app, on Cloudflare

This is optional: an instance serves its API without it. Decision 021 gives the reasons behind what follows.

The web app runs as a Cloudflare Worker, deployed from your machine with Alchemy. A stage is one deployment of it: a name you choose, such as `prod`, a host name, and the API it talks to.

You need a Cloudflare account that holds the zone of your domain, and the web app on the same site as the API: `app.example.org` beside `api.example.org`. The session cookie is the API's, and from a page of any other site Safari keeps it back. For the same reason the address Cloudflare gives a Worker, under `workers.dev`, cannot be the web app's.

1. In Cloudflare, create an API token with these rights and no other:

   | On                  | Right                 | What it is for                                     |
   | ------------------- | --------------------- | -------------------------------------------------- |
   | The account         | Workers Scripts: Edit | The web app's Worker, its files, and its host name |
   | The account         | Secrets Store: Edit   | The token and the key of Alchemy's state store     |
   | The zone of the app | Workers Routes: Edit  | Putting the Worker on the host name                |
   | The zone of the app | Zone: Read            | Finding the zone by its name                       |

2. Copy `packages/infra/.env.example` to `packages/infra/.env` and set the token and the account's id.
3. Write `packages/infra/.env.<stage>`, such as `.env.prod`, with the stage's two values: `WEB_DOMAIN`, the host name, and `VITE_SERVER_URL`, the public address of the API.
4. Set the API's `CORS_ORIGIN` to `https://` and that host name, and restart the API.
5. Run `pnpm run deploy:web <stage>`. It shows what it will change and asks before it does. `--yes` does not ask. `--dry-run` only shows, once a first deployment has made the state store below.

The command builds what `main` holds on the remote named `origin`, in a checkout of its own, and never what your working tree holds. It installs the dependencies there, so it needs the licence key of the icons, in the root `.env` or in the shell. Run it again to deploy a newer `main`.

- Cloudflare makes the DNS record and the certificate of the host name. A first deployment may take a minute to answer.
- Alchemy records what it deployed in a Worker of your account, `alchemy-state-store`, and makes it at the first deployment. Every project you deploy with Alchemy shares it, so leave it in place.
- The token can change every Worker of the account. Keep it as you keep the API's secret.
- The web app tells search engines not to list a stage. Add `WEB_INDEXED=true` to the stage's file when you want yours listed.
- To check a stage, sign in from its address. That proves the web app, the API, and `CORS_ORIGIN` agree.

## Updating

```bash
git pull
docker compose up --detach --build
```

Then `pnpm run deploy:web <stage>`, from your machine, when the instance has a web app: deploy the API first when the web app needs something new from it.

A new version applies its migrations when its first container starts. A migration that fails stops the container, and none of the pending migrations is kept. Back the database up first:

```bash
docker compose exec -T postgres pg_dump -U postgres --format=custom app > tonnr-$(date +%F).dump
```

`pg_restore` reads the file back.

## Running one job

Once the instance runs, `docker compose run --rm worker node dist/cli.mjs <job>` runs one job once and exits. A job is a provider's name, such as `ndbc`, or `alerts`, `exposure`, or `breaks`. The two jobs of the private list take a value, and the next section gives them.

## Keeping a list of breaks you may not publish

This is optional: an instance runs without it.

You may hold a list of surf breaks from a provider that gave you no right to republish it. The private list keeps it in your database for you alone: the API gives it to an operator's session and to no one else, and the worker never asks the provider for it. Decision 016 gives the rules. You answer to the provider for holding the list.

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

- `provider` is a short name in lower case that keys the list in your database. It is yours to choose, and need not name the list's origin.
- `termsUrl` and `url` are yours to give or to leave out: the terms the list falls under, and the page that shows a break. A row carries a source only when the file gives one.
- `ref` is the break's identifier in the list. A file gives each one once.
- `collectedAt` is when you read the list, with its offset and no finer than a millisecond.
- `details` holds whatever else the list says of the break. It is stored as it is, and may be left out.
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

As an operator, signed in, you read the list at `GET /v1/private-breaks`, and one break with its details at `GET /v1/private-breaks/<id>`. No key reads them.

Whoever can query the database reads the list too, and a dump holds it. Keep your backups as private as the list.

## Accounts, the operator, and API keys

The API asks who calls. It answers an account, by the session of a sign-in, or a program, by an API key. Anyone else gets 401, the health check and the reference aside. Decisions 019 and 020 give the rules.

Anyone who can reach the API can create an account with an email address and a password. Tonnr does not check the address yet. An account reads the data everyone shares and keeps its own spots and lists.

An operator is an account that runs the instance. It creates the developer accounts and makes their keys, sees how much they call, reads the list of the accounts that signed up, and alone reads the private list above. You name the operator from the server, by the account's id. Do it before you give the instance's address to anyone.

A developer account is whoever consumes the API with keys: a person, a team, or a program of your own. It is not an account that signs in. You create it, you make its keys, and you hand them over.

Without a web app or an admin app, with `https://api.example.org` standing for your API's address:

```bash
# Create your account. The cookie it gets is your session.
curl --cookie-jar session.txt --header 'Content-Type: application/json' \
  --header 'Origin: https://api.example.org' \
  --data '{"name":"You","email":"you@example.org","password":"a long password"}' \
  https://api.example.org/api/auth/sign-up/email

# Read its id.
curl --cookie session.txt https://api.example.org/v1/account

# On the server: see which account the id names, then make it an operator.
docker compose run --rm worker node dist/cli.mjs operator <account id>
docker compose run --rm worker node dist/cli.mjs operator <account id> --write

# Create a developer account, with 100 calls an hour between its keys. The answer gives its id.
curl --cookie session.txt --header 'Content-Type: application/json' \
  --header 'Origin: https://api.example.org' \
  --data '{"name":"my scripts","callsPerHour":100}' https://api.example.org/v1/developers

# Make it a key. The answer shows the key once, and nothing shows it again.
curl --cookie session.txt --header 'Content-Type: application/json' \
  --header 'Origin: https://api.example.org' \
  --data '{"name":"tide clock","developerId":"<developer id>"}' https://api.example.org/v1/keys

# A program calls with the key.
curl --header 'Authorization: Bearer <key>' https://api.example.org/v1/stations
```

Later, `/api/auth/sign-in/email` takes the same address and password and gives a new session.

The `Origin` header is what tells the API that a request sent with a cookie comes from a site it trusts. A browser adds it. A script has to, on sign-up, on sign-in, on anything that writes with the session, and on every call to what runs the instance, a read too: the developer accounts, the keys, the counts and the list of accounts.

- A key reads the shared data only. It reads nothing of an account and not the private list, so it can be given to a program.
- The keys are the instance's: every operator lists them at `GET /v1/keys` and revokes any of them at `DELETE /v1/keys/<id>`. A revoked key never works again.
- `PATCH /v1/developers/<id>` changes a developer account, and suspends it with `{"suspended":true}`: none of its keys works until it is resumed. `DELETE /v1/developers/<id>` deletes it with its keys and their counts.
- A developer account's limit is a number of calls in an hour of the clock, UTC's, shared by its keys. A call over it gets 429, with `Retry-After`. Leave `callsPerHour` out for no limit. An account calls with its session without a limit.
- `GET /v1/usage/series` and `GET /v1/usage/breakdown` give the calls by hour or by day, by developer account, by key and by procedure. The API keeps no address and no record of a call: it counts them, writes the counts every thirty seconds, and deletes them after thirteen months. A key's counts show when its developer account calls and what it asks for.
- `GET /v1/actions` lists what the operators did to the developer accounts and the keys: who, when, and what it changed. A key is named there and never shown, and a contact or a note is only said to have changed. A record is kept thirteen months, a deleted account's too. The commands you run on the server are not recorded.
- `GET /v1/accounts` lists the accounts that signed up, with their name and their address. Every operator reads it, so name as operators only people who may.
- `node dist/cli.mjs operator-remove <account id>` takes the operator's rights back, with `--write`, and revokes every key the account made. Those keys never work again.
- An instance with no operator still serves its accounts. Nobody can make a key, and nobody reads the private list.
- A key made before the developer accounts was given one named after its maker, when the instance was updated.

### The admin app

`apps/admin` is a web app for all of the above. It is optional, and it is not one of the containers. It goes to Cloudflare as the second app of a stage, beside the web app:

1. Follow "The web app, on Cloudflare" above: the admin is a part of a stage of the web app.
2. Add `ADMIN_DOMAIN` to the stage's file, `packages/infra/.env.<stage>`: the admin's host name, such as `admin.example.org`.
3. Update the API to a version that has the admin's procedures, set its `ADMIN_ORIGIN` to `https://` and that host name, and restart it.
4. Run `pnpm run deploy:admin <stage>`. It works as `pnpm run deploy:web` does, and takes the same `--dry-run` and `--yes`.

Open the admin's address only once the command has said it is done. Cloudflare makes the host name's DNS record at the first deployment, and a browser or a resolver that asked for the name before that remembers for up to thirty minutes that there is none: the page then says the site cannot be found while everyone else reaches it. Clearing the DNS cache of the browser and of the machine ends the wait.

To run it on your machine instead, against an API on your machine, set `VITE_SERVER_URL` in `apps/admin/.env` and run `pnpm run dev:admin`: it answers at `http://localhost:3002`, which the API's `ADMIN_ORIGIN` then names.

- The admin signs in with an account's address and password, as the web app does. It creates no account.
- Its address and the API's must belong to one site, such as `admin.example.org` and `api.example.org`. The session cookie is the API's, and a browser does not send it from a page of another site. An admin on your machine therefore runs an API on your machine. Do not name an address of your machine in the `ADMIN_ORIGIN` of an instance online: whatever runs there would run the instance.
- Its address must not be the web app's. Once `ADMIN_ORIGIN` is set, what runs the instance answers that address and no other: a page of the web app is refused there, with your session too, and so is the API's own reference. Your scripts then send `Origin: <the admin's address>`.
- Without `ADMIN_ORIGIN`, what runs the instance answers the API's own address, as the commands above show. The reference at `/v1/docs` is a page at that address, and it loads its script from a CDN.

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
