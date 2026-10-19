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

The API then answers on port 3000, or on `API_PORT`. Put a reverse proxy with HTTPS in front of it: the session cookie is marked secure, so sign-in works over HTTPS only, `localhost` aside. The proxy must say where a request comes from, in `X-Real-IP` or at the end of `X-Forwarded-For`, and take off what a client wrote there: the API counts what a visitor asks of the forecasts by that address, 300 questions an hour, and an account 600 (decision 053). Traefik, which Easypanel runs, does both. Behind a proxy that says nothing, every visitor shares one address and one limit. Postgres listens on this machine only.

To check the instance:

- `curl http://localhost:3000/` answers `OK`, and `/v1/docs` shows the API reference. `curl http://localhost:3000/v1/stations` answers 401: the API asks who calls.
- `docker compose logs worker` shows `Migrations applied`, one `Scheduled ingest-…` line per provider, then lines such as `ndbc: 765 stations, 1210 new readings`.
- With a web app, signing in from it proves that the three addresses agree.
- Signed in to the admin app as an operator, the page "Instance" says whether the worker runs and what each job last did. It is the way to see that a deployment of the worker took: its start is there, and so is the API's.

## On another platform

Run the same three services: `postgres:18` with its volume mounted at `/var/lib/postgresql`, an image built from `apps/server/Dockerfile`, and one built from `apps/worker/Dockerfile`. Both builds take the repository root as their context.

- The API needs `DATABASE_URL` and the three values above. It listens on `PORT`, 3000 by default, and answers `GET /` with `OK` for a health check.
- The worker needs `DATABASE_URL` only, the same as the API's. It listens on no port. `METEO_FRANCE_API_KEY` and `AEMET_API_KEY` are optional: "Météo-France's wind stations" and "AEMET's wind stations" below say what they add.
- A container with a missing or malformed value stops at once and names it.

The services may start in any order, and together.

On Easypanel, each service has a deploy address under "Deployments". Put it in the root `.env`, as `.env.example` shows, and `pnpm run deploy:api` or `pnpm run deploy:worker` deploys the service from your machine. Keep the address secret: whoever knows it can deploy.

Easypanel swaps a container with no outage, and a build that fails leaves the one before answering, so the API's address alone does not say whether a deployment took. Name your API's address in `DEPLOYED_API_URL`, in the same file: the two commands then wait until the new API, or a new worker, has started, and fail when none did in ten minutes. `pnpm run deploy:status` says since when both run. They read `GET /v1/health`, which answers anyone: when the API started, and when the worker that started last did, each with the commit its image was built from. Any monitor can read it too.

The commit comes from the repository the image is built in: a build reads which commit is checked out, and keeps nothing else of the history. A platform that builds from an archive, with no `.git` folder, gives none: hand it the commit in the build argument `GIT_SHA`, or the health says null there.

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
- The web app tells search engines not to list a stage. Add `WEB_INDEXED=true` to the stage's file when you want yours listed: `robots.txt` then names a sitemap, at `/sitemap.xml`.
- Add `WEB_REDIRECTS=www.example.org` to the stage's file when the web app should answer at `www.` too: Cloudflare gives that name a record and a certificate, and the web app sends every request there on to the same page at `WEB_DOMAIN`, with a `301`. Several names are separated by commas.
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

Once the instance runs, `docker compose run --rm worker node dist/cli.mjs <job>` runs one job once and exits. A job is a provider's name, such as `ndbc`, or `alerts`, `moments`, `exposure`, or `pages`, which fetches the forecasts of the surf breaks that have a listed page, an eighth of them at each run (decision 057). The jobs of the catalogue of breaks take a value, and the next section gives them. `push-keys` makes a pair of keys, and "Alerts by push" says what for.

## Filling the catalogue of surf breaks

An instance starts with no surf break. You add them once, by hand, and they are the instance's from then on: nothing renames, moves or deletes a break afterwards because its source changed. Decision 024 gives the rules.

Every account and every key reads the catalogue. You answer for the lists you add, towards whoever published them and towards the people you serve.

### From OpenStreetMap

```bash
docker compose run --rm worker node dist/cli.mjs breaks-fetch osm
docker compose run --rm worker node dist/cli.mjs breaks-fetch osm --write
```

The first line asks the public Overpass servers for the list, once, and says how many breaks it gives: 340 on 2026-10-08. The second stores them, with the ODbL and the credit that the API then returns with each break. It adds only to a catalogue that holds no break, so that a place another list already gave does not stand twice. The servers are shared and often answer 504: try again later.

### From a file

Write the list as one JSON file, in UTF-8:

```json
{
  "provider": "example",
  "license": { "type": "CC-BY-4.0", "url": "https://example.org/licence" },
  "attribution": "Example contributors",
  "breaks": [
    {
      "ref": "a1",
      "name": "North jetty",
      "latitude": 48.0,
      "longitude": -4.5,
      "url": "https://example.org/breaks/a1",
      "characteristics": {
        "breakTypes": ["beach", "jetty"],
        "waveDirections": ["left", "right"],
        "bottomTypes": ["sand"],
        "abilityLevels": ["beginner", "intermediate"],
        "boardTypes": ["longboard", "fish"],
        "bestSeasons": ["autumn", "winter"],
        "bestTides": ["mid_low", "mid"],
        "bestSwellDirections": ["W", "WNW"],
        "bestWindDirections": ["E", "ENE"],
        "offshoreDirectionDegrees": 90,
        "waveSizeMeters": { "min": 0.6, "max": 2.4 }
      },
      "location": ["France", "Finistère"],
      "timezone": "Europe/Paris",
      "details": { "anything": "else" }
    }
  ]
}
```

- `provider` is a short name in lower case for the list. With `ref`, the break's identifier in the list, it tells a break the catalogue already holds. A file gives each `ref` once.
- Only `provider`, and a break's `ref`, `name`, `latitude` and `longitude`, are required.
- `license`, `attribution` and `url` say where the list comes from and on what terms. Give them when the list has them: the API returns them with each break, and null when the file gave none.
- `characteristics` takes the catalogue's own words, listed in `packages/db/src/schema/spots.ts`, and no others. Translate your list's words into them, and leave out what your list does not say. A direction of swell or wind is one of the sixteen points of the compass, in English letters. `offshoreDirectionDegrees` is where the wind blows from when it blows off the shore, from 0 to 359. `waveSizeMeters` is the height of the faces of the waves the break works at, in meters from 0 to 30: `min` and `max`, either null when the list gives no such bound. It is kept to the tenth of a meter.
- `location` names the places the break lies in, from the widest to the nearest.
- `details` holds whatever else the list says of the break. It is kept aside as it is, in a table that only the admin reads, to its operator.
- Any other field refuses the file, and so does one faulty line: nothing of a file is stored unless all of it can be.
- A number is refused when JavaScript cannot hold it as it is written, such as an integer past 2^53.

Keep the file outside the clone when it is not yours to publish. A build copies the clone into the image, and Git must never see such a file.

The command takes the path of the file and says what storing it would add. It stores it only with `--write`:

```bash
docker compose run --rm --volume /path/to/breaks.json:/tmp/breaks.json:ro worker node dist/cli.mjs breaks /tmp/breaks.json
docker compose run --rm --volume /path/to/breaks.json:/tmp/breaks.json:ro worker node dist/cli.mjs breaks /tmp/breaks.json --write
```

From a clone, with `DATABASE_URL` naming the instance's database, `pnpm --filter worker run job breaks /path/to/breaks.json` does the same.

A break the catalogue already holds from the same list is left as it is, whatever the file now says of it. Storing the same file twice changes nothing. Nothing matches one list against another: the same place under two list names is added twice.

### Removing a list

```bash
docker compose run --rm worker node dist/cli.mjs breaks-remove <list>
docker compose run --rm worker node dist/cli.mjs breaks-remove <list> --write
```

The first line says how many breaks the catalogue holds from the list, and how many spots were made from them. The second deletes the breaks, and forgets what the list said: added again, the list is added whole. Those spots keep their name and their point, and lose only the link.

A break that an operator merged into another, or deleted, from the admin is not brought back when its list is added again (decision 049).

### Candidates to decide in the admin

A list can also be proposed to the operator rather than added: each break waits in the admin's page Catalogue, under Import, where the operator adds it as a new break, merges it into one the catalogue holds, puts it off or leaves it out. Decision 049 gives the rules. The command reads a folder: `candidates.json`, and the pictures its candidates show in `images/`, JPEG, PNG or WebP, 5 MB each at most.

```json
{
  "list": "my-guide",
  "candidates": [
    {
      "ref": "p12-3",
      "name": "North jetty",
      "location": ["France", "Finistère"],
      "latitude": 48.0,
      "longitude": -4.5,
      "pointNote": "The beach, not the peak",
      "characteristics": { "breakTypes": ["jetty"] },
      "proposal": {
        "action": "merge",
        "breakId": "<id of a break>",
        "others": ["<id of another break it may be>"],
        "note": "Same name, 200 m away",
        "doubts": ["Which end of the jetty"]
      },
      "evidence": [
        { "url": "https://example.org/north-jetty", "title": "A page", "note": "What it says" }
      ],
      "texts": [
        {
          "label": "Description",
          "language": "en",
          "text": "The list's own words, for the operator to read."
        }
      ],
      "figures": [
        {
          "image": "p12.jpg",
          "crop": [0, 0, 1, 0.5],
          "mark": [0.4, 0.2, 0.5, 0.22],
          "caption": "Page 12"
        }
      ],
      "details": { "anything": "else, kept aside" }
    }
  ]
}
```

Only `list`, and a candidate's `ref` and `name`, are required. `proposal.action` is `add`, `merge`, which names `breakId`, or `hold`, which may name the break it may be in `breakId`. `proposal.others` names other breaks it may be, wherever they lie: the admin offers them beside the breaks within 3 km. A figure's `crop` and `mark` are boxes in fractions of its picture, left, top, right, bottom: the part shown first, and the break's label in it. A break added from a candidate names its list and its reference, and no page, attribution or licence.

```bash
docker compose run --rm --volume /path/to/folder:/tmp/candidates:ro worker node dist/cli.mjs candidates /tmp/candidates
docker compose run --rm --volume /path/to/folder:/tmp/candidates:ro worker node dist/cli.mjs candidates /tmp/candidates --write
docker compose run --rm worker node dist/cli.mjs candidates-remove <list> --write
```

Storing the folder again brings up to date the candidates that wait, and leaves those an operator decided. `candidates-remove` deletes a list's candidates and pictures, and leaves what was decided of them in the catalogue. Keep the folder outside the clone, as a file of breaks.

### Coming from an earlier version

Update the API and the worker before you add a file: the version before this one cannot answer for a break that names no source. An instance that ran the weekly import keeps the breaks it had, and the worker stops asking for more. An instance that kept a private list loses its two tables, and their rows, at the update after the one that stopped reading them. Keep the file you imported: write the list again in the format above, add it with `breaks`, and remove the breaks of `osm` first if the two lists give the same places.

## Alerts

An account sets an alert on spots of its own, and the worker looks at every alert every three hours: its job is `evaluate-alerts`. Every quarter of an hour, `tell-alert-moments` tells what begins and, at each account's hour, the evening before. The page of the instance lists both with the others. There is nothing to set. An alert reads the forecasts the instance keeps anyway, within the same count of requests. What an alert tells is listed in the web app. Decision 031 gives the rules.

### Alerts by mail

An account that says yes is mailed what its alerts tell, at the address it signed up with, once that address is checked. The worker sends these mails, not the API: give it the way out you gave the API (see "Checking addresses by mail" below), and the two public addresses a mail links to.

| Variable                                      | What the worker does with it                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `UNOSEND_API_KEY` or `SMTP_URL`, `EMAIL_FROM` | Sends the mail, as the API does.                                                                        |
| `EMAIL_DAILY_LIMIT`                           | The same day's limit as the API's: the alerts take four fifths of it at most.                           |
| `CORS_ORIGIN`                                 | The web app's address: a mail links to the spot, to the settings, and to the page that stops the mails. |
| `BETTER_AUTH_URL`                             | The API's address: a mail program posts there when its reader presses "unsubscribe".                    |

- With Docker Compose the worker reads `apps/server/.env` as the API does, so there is nothing more to set. On another platform, set these on the worker's service.
- A worker without a way out, or without the two addresses, sends no mail and says nothing of it: what the alerts tell stays in the web app's list.
- An account is mailed eight alert mails a day at most. A mail that a limit holds back is not sent later. An instance whose `EMAIL_DAILY_LIMIT` is 1 sends no alert mail: four fifths of one mail is none.
- A mail waits for the end of the account's quiet hours, as they are when it leaves, and is written then: it says where the hours are at that moment, and is not sent when they are over or gone.
- A mail that was leaving when the worker stopped is not sent again, and neither is what it said: nobody knows whether it left. Its delivery stays marked `sending` in `alert_delivery`, the alert's other mails wait ten minutes for it, and the web app's list holds what it said.
- While a mail is handed to your provider, its account's alerts and settings are held, so that an account that stops its mails is answered once the mail has left, and never before. A mail is given ten seconds: past them its request, or its connection to your SMTP server, is closed, and it is not sent again.
- `POST /v1/alert-mails/off` is what a mail's link does. It takes no session and no key: the link carries a key of its own, which switches alert mails off for one account and does nothing else. A `GET` at the same address leads to the web app's page that asks first, and reads nothing.
- A mail program shows its own "unsubscribe" button only when the mail's DKIM signature covers the two headers that carry this address, `List-Unsubscribe` and `List-Unsubscribe-Post`: RFC 8058 asks for it. Send yourself an alert mail, open its source, and read the `h=` list of its `DKIM-Signature` header. When the two names are missing, ask your provider to sign them, or set the signed headers of your SMTP relay. The link at the foot of the mail works either way.
- Your mail provider learns who has alerts, when, and the names of their alerts and spots, which a mail holds. An account can keep names out of the subject, not out of the mail.

### Alerts by push

An account that lets a browser be notified is sent what its alerts tell by push, to each browser it subscribed from. It switches push on in the web app, device by device, in the settings of its alerts, and the API keeps the browsers that subscribe. The worker sends these pushes, by the rules an alert mail leaves by. An instance sends push once it holds a pair of keys, which tells a browser's push service who sends. A command of the worker, `push-keys`, makes the pair: `pnpm --filter worker run job push-keys` from a checkout, and "Running one job" above says how a job is run in the container. It prints the two lines to set, on its standard output and nothing else there, and writes them nowhere: they are yours to put in the file and to keep. On an instance that holds a pair it says so first, since a new pair ends every subscription made with the old one.

Set the two values in `apps/server/.env`, then run `docker compose up --detach` again: it makes the containers anew with what the file holds, which `docker compose restart` does not.

| Variable            | Who reads it        | What it is for                                                                           |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`  | The API, the worker | Given to the web app by the API, for a browser to subscribe with. It is public.          |
| `VAPID_PRIVATE_KEY` | The worker          | What the worker signs each push with. Keep it as you keep the API's secret.              |
| `CORS_ORIGIN`       | The worker          | The web app's address: it names your instance to a push service, and a push opens there. |

- With Docker Compose the worker reads `apps/server/.env` as the API does, so there is nothing more to set. On another platform, give the API the public key, and the worker both.
- Set both, or neither. The API needs the public key, and the worker the pair: an API without the public key takes no subscription.
- The API keeps the address a browser's push service gave it, and takes no other: Google's, Mozilla's, Apple's and Microsoft's services, over `https`. The address lets whoever holds it send to that browser: the API answers it to no one and logs none. An account keeps ten devices at most. A device is kept with the session of its browser and goes with it: when the account signs out there, and when you suspend the account, which closes its sessions. An account that is let in again switches push on anew. A session that merely runs out ends no device: an account that has not opened the web app for a while goes on being pushed. A request that still carries the session's cookie at the moment it runs out has the session deleted, and its device with it: that account switches push on anew too.
- The public key is a point of the curve P-256 as its 65 bytes, and the private key 32 bytes, each in base64url with no padding: 87 and 43 characters. A value of another shape stops the container at its start, which names the variable, and so does an API whose public key is no point of the curve.
- Keep the pair. A browser subscribes to one public key: with another pair, every subscription made before stops working. A push service then refuses each push, and does not say that the subscription is gone: the worker keeps it and logs `push: not taken (status 403)`, until the browser subscribes again. It does so by itself the next time the web app is opened there, with the new key, and stays the device it was.
- A worker whose public key is not its private key's does not start, and says which variable is wrong. A worker without a pair, or without `CORS_ORIGIN`, sends no push and says nothing of it: what waits for a browser is given up when its hours are over.
- A push goes to the push service of the browser that subscribed, and to no other address: Google's for Chrome and the browsers built on it, Mozilla's, Apple's, Microsoft's. The worker needs the way out to them, over `https` on port 443, and follows no redirection.
- What a push says is encrypted for the browser: the push service learns which of its browsers is written to and when, and nothing of the alert. It learns your web app's address, which signs with your keys.
- An account is sent 24 pushes a day at most, however many browsers it has. A push that the limit holds back is not sent later.
- A push waits for the end of the account's quiet hours, as a mail does, and is written then. The push service is told to keep it until the hours it speaks of are over, and for the evening before until midnight: a device that was off until then is not told.
- A push is given ten seconds for all the browsers of an account together. While it is handed over, the account's alerts, its settings and its subscriptions are held, so that a browser that is forgotten is answered once the push has left. Past the ten seconds its connections are closed, and it is not sent again: it may have left.
- A subscription that its push service says is gone, by a 404 or a 410, is deleted. When an account has none left, the push is given up.
- The worker's log holds how a push failed, by the push service's status or the kind of failure. It never holds the address of a subscription, which is all it takes to write to that browser.
- The web app serves its service worker at `/sw.js`, from the same address as its pages. It shows a push and opens its page: it keeps no page for use offline, and answers no request.
- An iPhone or an iPad is sent push only by an app that was added to the Home Screen, and the settings say so there.

### Coming from an earlier version

The version before kept a spot's conditions on the spot. This one gives each such spot an alert when its migration runs. It leaves the spot's two columns and the first `notification` table where they are, for the version before to go on reading while this one starts, and the version after this one drops them.

Update the API first, and the worker once the API of the version before has stopped:

```bash
git pull
docker compose up --detach --build server
docker compose up --detach --build
```

The version before deletes a spot without holding its alert first. Next to the new worker, the two can wait for one another, and Postgres then refuses one of them.

## Photos and videos

An account adds photos and videos to the sessions of its log, which it alone reads. The browser sends each file to a bucket of Cloudflare R2, the worker makes of it what is shown, smaller, and deletes the file that was sent. An instance keeps media once it has a bucket: without one, the web app offers none. Decision 066 gives the rules.

1. In Cloudflare's dashboard, under R2, create a bucket, such as `tonnr-media`. Leave it private: no public address and no custom domain.
2. Under "Manage API tokens" of R2, create an API token with the permission "Object Read & Write", limited to that bucket. Keep its access key id and its secret: Cloudflare shows the secret once.
3. In the bucket's settings, add this CORS rule, with your web app's address. A browser sends a file there with PUT, and reads what is shown with GET:

   ```json
   [
     {
       "AllowedOrigins": ["https://app.example.org"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. In the same settings, add an object lifecycle rule that deletes the objects whose prefix is `up/` one day after they were written. A file goes there as it is sent, and nothing shows it: the worker deletes it once made, and the rule deletes what a browser sent and never said it had.
5. Set the four values in `apps/server/.env`, then run `docker compose up --detach` again.

| Variable               | Who reads it        | What it is for                                                                                                |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `MEDIA_BUCKET`         | The API, the worker | The bucket's name.                                                                                            |
| `R2_ACCOUNT_ID`        | The API, the worker | Your Cloudflare account's id, which names R2's address for it.                                                |
| `R2_ACCESS_KEY_ID`     | The API, the worker | The token's id. It is in every address the bucket signs, so it is no secret.                                  |
| `R2_SECRET_ACCESS_KEY` | The API, the worker | The token's secret, which signs every request to the bucket. Keep it as you keep the API's secret.            |
| `MEDIA_ENDPOINT`       | The API, the worker | Optional. Another store with R2's API, such as RustFS run for development: the account's id is then not read. |

- Set all four, or none: a container given some of them stops at its start and says so.
- The worker's image installs ffmpeg, which makes the videos. On another platform, give the worker an ffmpeg of its own, Debian's or one built with `libzimg`: without that filter a phone's HDR video is made with washed colors.
- The worker makes one medium at a time, every minute and as soon as one is sent: a photo in a second or two, a minute of a phone's 4K in a few minutes of two threads. It runs ffmpeg at a lower priority than itself.
- A photo is at most 40 MB and a video 1 GB and a minute long. An account keeps 2 GB once its files are made smaller, and every account together sends 20 GB a day: these are written in the code, and are no setting.
- Signed in to the admin app as an operator, the page "Instance" stops every upload and starts them again. What is kept is still shown and deleted meanwhile.
- The API answers addresses of the bucket signed for two hours at most. An account that deletes a photo, or signs out, leaves the addresses it was given working until they expire.
- What a file said of where and when it was taken is kept nowhere: the worker writes no metadata into what it makes.
- For development, a store with R2's API runs in Docker: `docker run -d -p 9100:9000 -e RUSTFS_ACCESS_KEY=devkey -e RUSTFS_SECRET_KEY=devsecret123 rustfs/rustfs`, a bucket made in it, and `MEDIA_ENDPOINT=http://localhost:9100` with that key and secret.

### Reports of the waves

The same bucket keeps the reports accounts send at the breaks of the catalogue, and the same job of the worker checks them: where and when each photo was taken, and whether it shows the sea, with two open models that run in the worker. Decision 067 gives the rules.

- The worker's image downloads the models as it is built, about 230 MB, at the revisions and with the checksums `packages/media/src/models.ts` names, and the worker never downloads one as it runs. It loads them the first time a report comes, and keeps a few hundred megabytes of memory for them.
- On another platform, or from a clone, put them in a folder with `pnpm --filter worker exec tsx scripts/fetch-models.ts <folder>` and name it in `MEDIA_MODELS_DIR`. A worker that finds no model leaves every report to an operator, in the admin's moderation.
- A report is shown a week, then kept, hidden from everyone but the operators. Set `REPORT_KEEP_DAYS` to have the worker delete the reports older than that many days, with their files: without it, it deletes none, and your privacy policy must say so, as Téo's does.
- The admin's moderation has a tab of the reports, with what was checked of each photo, where an operator shows a report or removes it.
- A report that is shown is told to the accounts that keep its break in a list, in the web app and by push: the worker's job `tell-reports` does it every minute, one notice at a break in three hours for an account, six pushes a day at most. It pushes with the pair of keys of the alerts (see "Push"): a worker without them lists the notices and pushes nothing. A notice is kept 30 days. Decision 068.
- The author of a report reads how many browsers saw it and opened its photos, and how many accounts it was told to: each browser counts a report once, and the API keeps the numbers and nothing of who.

| Variable           | Who reads it | What it is for                                                                              |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------- |
| `MEDIA_MODELS_DIR` | The worker   | Optional. Where the models are. The image's `models` folder, beside the worker, without it. |
| `REPORT_KEEP_DAYS` | The worker   | Optional. How many days a report is kept. Every report is kept without it.                  |

## Accounts, the operator, and API keys

The API asks who calls. It answers an account, by the session of a sign-in, or a program, by an API key. It also answers your web app for a visitor who has no account, until you close the instance to them: see "Visitors of the web app" below. Anyone else gets 401, the health check and the reference aside. Decisions 019, 020 and 039 give the rules.

Anyone who can reach the API can create an account with an email address and a password. Tonnr does not check the address yet. An account reads the data everyone shares and keeps its own spots and lists.

An operator is an account that runs the instance. It creates the developer accounts and makes their keys, sees how much they call, and reads the list of the accounts that signed up. You name the operator from the server, by the account's id. Do it before you give the instance's address to anyone.

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

A session lasts ninety days, on the web, in the apps and in a script alike. `GET /api/auth/get-session` renews it for ninety more, with its cookie, once a day or more has passed since it was last renewed: the web app and the apps ask it as they open, so whoever comes back within ninety days stays signed in, and a script that keeps a session asks it too. A call to `/v1` or `/rpc` renews nothing. Signing out, a new password, and an operator who closes an account's sessions or suspends it end one at once. Decision 070.

The `Origin` header is what tells the API that a request sent with a cookie comes from a site it trusts. A browser adds it. A script has to, on sign-up, on sign-in, on anything that writes with the session, and on every call to what runs the instance, a read too: the developer accounts, the keys, the counts and the list of accounts.

- A key reads the shared data only. It reads nothing of an account, so it can be given to a program.
- The keys are the instance's: every operator lists them at `GET /v1/keys` and revokes any of them at `DELETE /v1/keys/<id>`. A revoked key never works again.
- `PATCH /v1/developers/<id>` changes a developer account, and suspends it with `{"suspended":true}`: none of its keys works until it is resumed. `DELETE /v1/developers/<id>` deletes it with its keys and their counts.
- A developer account's limit is a number of calls in an hour of the clock, UTC's, shared by its keys. A call over it gets 429, with `Retry-After`. Leave `callsPerHour` out for no limit. An account calls with its session without a limit.
- `GET /v1/usage/series` and `GET /v1/usage/breakdown` give the calls by hour or by day, by developer account, by key and by procedure. The API keeps no address and no record of a call: it counts them, writes the counts every thirty seconds, and deletes them after thirteen months. A key's counts show when its developer account calls and what it asks for.
- `GET /v1/developers/<id>/members` lists the accounts that may read a developer account, `POST` to it with `{"accountId": "<account id>"}` adds one, and `DELETE /v1/developers/<id>/members/<account id>` takes one out. A member signs in and reads, at `GET /v1/console` and under `/v1/console/usage`, the account's limit, its keys by name and their calls. It never reads a key, your contact or your note, and changes nothing. Name the account you know to be theirs, by the identifier they give you: an address proves nothing of who holds an account, checked or not. Decision 027 gives the rules.
- `GET /v1/actions` lists what the operators did to the developer accounts, their members, the keys and the accounts, when they closed the instance to visitors or opened it, and what they changed, merged or deleted in the catalogue of breaks and decided of a list's candidates: who, when, and what it changed. A key is named there and never shown, and a contact or a note is only said to have changed. A record is kept thirteen months, a deleted account's too. The commands you run on the server are not recorded.
- `GET /v1/accounts` lists the accounts that signed up, with their name and their address. Every operator reads it, so name as operators only people who may.
- `GET /v1/accounts/{id}` gives one account: whether it is suspended, and how many sessions it has open. `DELETE /v1/accounts/{id}/sessions` closes its sessions, which is what to do with your own when a device is lost. `PATCH /v1/accounts/{id}` with `{"suspended": true}` closes them and keeps the account from signing in, until the same call with `false`. What a suspended account owns stays, and what it shared stays visible. An operator is not suspended: take its rights away first. Decision 025 gives the rules.
- `GET /v1/instance/overview` gives the instance in a glance: the accounts, with those active this week and the new ones, the calls of the last twenty-four hours by kind of caller, the day's forecast budget, whether the map opens to visitors, and whether the worker runs with its jobs on time. The admin's overview starts with it.
- `GET /v1/instance` gives the state of the instance: whether a worker runs, what each of its jobs last did and when it last worked, each provider's stations, when the API started and which addresses it holds, the size of the database, the requests sent to the forecast provider this day, this hour and this minute against what the instance lets itself send, and the mails counted today. A job is late when none of its runs started for the time its schedule leaves between two, and a tenth of it more, ten minutes at least. What failed is given as a kind: the worker's log has the error itself. Decision 022 gives the rules.
- `node dist/cli.mjs operator-remove <account id>` takes the operator's rights back, with `--write`, and revokes every key the account made. Those keys never work again.
- An instance with no operator still serves its accounts. Nobody can make a key.
- A key made before the developer accounts was given one named after its maker, when the instance was updated.

### The MCP server

The API is also an MCP server, at `/mcp`: an agent such as Claude Code or Cursor lists its tools and calls them in place of the routes of `/v1`. There is nothing to deploy and nothing to set: it comes with the API. Decision 045 gives the rules, and [`docs/mcp.md`](mcp.md) says how a client connects.

- It takes one of the keys above, in `Authorization: Bearer`: hand a key over as you would for a program. Or an account signs its assistant in, with nothing for you to do: the assistant registers itself, the account agrees on the web app's page `/connect`, and the assistant reads what that account keeps, and changes nothing. Decision 047 gives the rules. That takes a web app, at the address `CORS_ORIGIN` names, of a version that has the page.
- Anyone registers an assistant's client, so the table `oauth_client` grows, and nothing clears it. Which assistants registered, and how many accounts allowed one, is in the database and on no screen. A suspended account's assistants read nothing while it is suspended.
- A call to a tool is a call to its route. It is held to the developer account's limit and shows in its counts, under the route's name. The counts say which way a call came: the admin's overview shows how much comes by MCP and whose agents call, and `GET /v1/usage/breakdown` answers it with `by=way`, or with `way=mcp` beside `by=developer`. Listing the tools is not counted.
- Its tools read the shared data: the stations, the forecasts, the tides, the catalogue of breaks and their guides. A key reads nothing of an account. An assistant that an account signed in also reads that account's spots, alerts and sessions.
- A proxy in front of the API lets `POST /mcp` through, with `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server/api/auth`, where an assistant reads how an account signs in, and does not hold back an answer that comes as a stream. An agent's client is no browser, so the API's CORS does not concern it.
- The server keeps nothing between two requests, so several API processes answer one agent in turn.
- The key that signs an assistant's tokens is kept in the database, enciphered with `BETTER_AUTH_SECRET`. Changing that secret signs every assistant out.

### The admin app

`apps/admin` is a web app for all of the above. It is optional, and it is not one of the containers. It goes to Cloudflare as the second app of a stage, beside the web app:

1. Follow "The web app, on Cloudflare" above: the admin is a part of a stage of the web app.
2. Add `ADMIN_DOMAIN` to the stage's file, `packages/infra/.env.<stage>`: the admin's host name, such as `admin.example.org`.
3. Update the API to a version that has the admin's procedures, set its `ADMIN_ORIGIN` to `https://` and that host name, and restart it.
4. Run `pnpm run deploy:admin <stage>`. It works as `pnpm run deploy:web` does, and takes the same `--dry-run` and `--yes`.

Open the admin's address only once the command has said it is done. Cloudflare makes the host name's DNS record at the first deployment, and a browser or a resolver that asked for the name before that remembers for up to thirty minutes that there is none: the page then says the site cannot be found while everyone else reaches it. Clearing the DNS cache of the browser and of the machine ends the wait.

To run it on your machine instead, against an API on your machine, set `VITE_SERVER_URL` in `apps/admin/.env` and run `pnpm run dev:admin`: it answers at `http://localhost:3002`, which the API's `ADMIN_ORIGIN` then names.

### A private research catalogue

The Catalogue's **Private sources** tab can read a separate research database.
Set `CATALOGUE_DATABASE_URL` in the API's runtime environment only, using a
reader-only PostgreSQL role. Do not set it in the admin, web app or their build
environments. Without the setting the tab says that the private catalogue is not
configured; the rest of the instance still works.

The expected `catalogue` schema has its own migrations and is managed separately.
Tonnr's application migrations do not create it and must never be pointed at this
database. Keep `DATABASE_URL` set to the application database. The view reads the
private catalogue through operator-only RPC procedures, without a public REST
route or MCP tool. It does not fetch providers, change records or import them into
the public catalogue. [Decision 065](decisions/065-private-catalogue-in-the-admin.md)
records this boundary.

- The admin signs in with an account's address and password, as the web app does. It creates no account.
- An account that is no operator signs in to it too. It sees the console: the developer accounts you made it a member of, from a developer account's page. An account that is a member of none is shown its identifier, which is what you need to add it. So the people you give keys to may open the admin's address, and nothing of what runs the instance answers them.
- Its address and the API's must belong to one site, such as `admin.example.org` and `api.example.org`. The session cookie is the API's, and a browser does not send it from a page of another site. An admin on your machine therefore runs an API on your machine. Do not name an address of your machine in the `ADMIN_ORIGIN` of an instance online: whatever runs there would run the instance.
- Its address must not be the web app's. Once `ADMIN_ORIGIN` is set, what runs the instance answers that address and no other: a page of the web app is refused there, with your session too, and so is the API's own reference. Your scripts then send `Origin: <the admin's address>`.
- Without `ADMIN_ORIGIN`, what runs the instance answers the API's own address, as the commands above show. The reference at `/v1/docs` is a page at that address, and it loads its script from a CDN.
- Its page "Moderation" lists the spots that accounts ask to make public (decision 034). Nobody answers them without an operator: on an instance that has none, a request waits. Accepting publishes a spot's name, its point and what its owner says of it in your catalogue, under the ODbL. The terms of use that accounts agree to are the web app's page `/terms`: "Your legal texts" below says what is yours to write there.
- Its page "Catalogue" draws every break of the catalogue on a map: an operator changes one, writes its description, merges two, or deletes one that no account uses. Its tab "Import" decides one at a time the candidates that `candidates` stored (see "Candidates to decide in the admin"). Decision 049.

## Visitors of the web app

Anyone opens your web app without an account and reads the map: the buoys, the breaks of the catalogue, the forecasts and the tides. Saving a spot, a list or an alert takes an account. Decision 039 gives the rules.

- The API knows a visitor by where the request says it comes from: `CORS_ORIGIN`, in `Origin`. A browser writes that header itself. A program can write it too, and then reads what a visitor reads: use a key for a program of yours, which is counted and limited.
- A visitor spends your forecast budget as an account does. The page "Instance" of the admin app shows the requests sent today, and the page of the counts shows the calls under "Visitors of the web app".
- The instance closes to visitors by itself once it has sent 4,400 forecast requests in a day for the people who look, four fifths of what it lets itself send them: the rest of the day's forecasts is for your accounts. It opens again at midnight, UTC. The page "Instance" says when it has, and there is nothing to set.
- Before that, when too many come, close the instance to visitors yourself from the page "Instance", or from its command palette. The web app then asks whoever has no account to sign in or to create one. Accounts, keys and shared lists work as before. The same button opens it again.
- Without the admin app, an operator does it with their session: `curl --cookie session.txt -X PUT -H 'Content-Type: application/json' -H 'Origin: https://api.example.org' -d '{"open":false}' https://api.example.org/v1/visitors`. `Origin` is your `ADMIN_ORIGIN`, or the API's own address on an instance that names none.
- `GET /v1/visitors` says whether the instance answers visitors, to anyone.
- It takes effect at once, with no restart. What you set stays across restarts and updates, and holds whatever the day's count says: an instance you closed stays closed past midnight.
- Update the API before the web app: a web app of this version in front of an older API shows its visitors a map that loads nothing.

## The apps for phones

The apps of `apps/native` call the API as the web app does, and name themselves by an origin of their own in `expo-origin`, such as `app.tonnr://`, which no browser sends. A request that names it is trusted as the web app's is: a write with its session's cookie, a visitor without an account, and its analytics headers. Decision 069 gives the rules.

- `APP_ORIGINS`, in the API's environment, lists those origins, separated by commas. Leave it empty for the one of the apps this repository builds, `app.tonnr://`.
- The apps in the stores call Téo's instance alone. To have an app for yours, build `apps/native` with identifiers of your own, and name its origin in `APP_ORIGINS`.
- A program can name that origin too, and then reads what a visitor reads, as it can with `Origin`: use a key for a program of yours.
- `GET /v1/clients` tells an app, and anyone, which of its builds your instance answers, from six optional settings of the API's environment, three for each platform: `APP_IOS_OLDEST_BUILD` and `APP_ANDROID_OLDEST_BUILD`, the oldest build it still answers, `APP_IOS_NEWEST_BUILD` and `APP_ANDROID_NEWEST_BUILD`, the newest its store sells, and `APP_IOS_STORE_URL` and `APP_ANDROID_STORE_URL`, the https address of the app's page in that store. A build is the number an app sends after its version in `X-App`. An app older than the oldest asks to be updated, and goes no further. Leave them empty while no app of yours is in a store: every build is then answered.
- Raise an oldest build only once the build that replaces it is out in its store, and the newest with it: the API refuses to start with an oldest above the newest. A change takes effect when the API restarts.

### Links that open the app

On a phone where the app is installed, the links of the web app open it: the map of `/app`, the short addresses `/b/`, `/s/`, `/l/` and `/i/`, the pages of the surf breaks and `/reset-password`, in every language. Every other address stays in the browser. Decision 073 gives the list, which `APP_LINK_PATHS` holds in `packages/config/src/links.ts`. A phone opens the app only once the site names it, in two files that the web app answers from values of its stage, in `packages/infra/.env.<stage>`:

- `APPLE_TEAM_ID`, the team of the Apple developer account that signs the app for iPhones, which the account's page of membership shows: `/.well-known/apple-app-site-association` then names the app as that team and `APP_SCHEME`, for its links and for the passwords the keychain keeps for the site.
- `ANDROID_CERT_SHA256`, the SHA-256 fingerprints of the keys that sign the app for Android, separated by commas: the key of Play App Signing, which the Play Console shows under "App signing", and your upload key, which `keytool -list -v` prints. `/.well-known/assetlinks.json` then names the package `APP_SCHEME` with them.
- The bundle id and the package are `APP_SCHEME`, in `packages/config/src/app.ts`, which the app is built with too. Change it there for an app of your own, before its first build in a store.
- A file the stage names nothing for answers `404`, and a stage that names neither claims no app. Deploy the web app again after you change them.
- iPhones read Apple's file through Apple's cache, a day or more after it changes. A rule of your Cloudflare zone that challenges robots must leave both addresses alone, or no phone opens the app.

Once the app is in the App Store, add its id to the stage's file, its digits alone, as `VITE_APP_STORE_ID`: the short addresses and the pages of the surf breaks then show Safari's banner on an iPhone, which offers the app, or opens it at the page.

## Signing in with Google

Email and password work on every instance. Google sign-in is optional: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` together in the API's environment (`apps/server/.env` from a clone or with Docker Compose). Leave both empty to keep email alone. The web app learns whether Google is enabled from the API; no web build variable is needed. Decision 046 gives the account rules.

1. In [Google Cloud Console](https://console.cloud.google.com/), configure the OAuth consent screen and create an OAuth client of type **Web application**.
2. Register `${BETTER_AUTH_URL}/api/auth/callback/google` as an authorized redirect URI, with the actual public API address substituted and no trailing slash on the base address. This is the API's address, not the web app's. Use separate credentials for development and production.
3. Set both credentials in the API environment and restart or deploy the API. A partial pair prevents startup. If the consent screen is in testing, add the accounts that will test it.
4. Check that the web app offers **Continue with Google**, and complete a sign-in from it. Google Cloud requires an HTTPS callback on an eligible public domain, or HTTP on localhost for development; a `.localify` domain is not a public OAuth callback domain.

Google receives the request to sign in and returns a name, an email address and an image. The auth library stores them and the provider's tokens in the existing auth tables. Only identity scopes are requested; this does not give the app access to Drive or Gmail. An existing email account links only after its local address is verified. A new Google account chooses its username when the app needs one.

The apps for phones sign in with Google through a browser too, on the same client. An app that uses Google's own sheet instead sends the API the ID token Google gave it. On an iPhone it is made for a client of the app's: create an OAuth client of type **iOS**, with the app's bundle, and set its id in `GOOGLE_IOS_CLIENT_ID`, which needs the web's pair and has no secret. The API then takes a token made for either. On Android the sheet asks for the web's client as the server's, and its token is made for that one, which the API takes already: create an OAuth client of type **Android** too, with the app's package and the fingerprint of the key that signs it, which Google reads to let the app ask, and which the API needs no setting for.

Provider setup follows [Better Auth's Google documentation](https://better-auth.com/docs/authentication/google).

## Signing in with Apple

Sign in with Apple is optional too, on the web and in the app for iPhone, and takes an Apple developer account. Set `APPLE_SERVICES_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` together, with `APPLE_TEAM_ID`, in the API's environment, or none of the three: some and not all stop the API as it starts. The web app learns from the API whether Apple is on, as it does for Google. App Review's guideline 4.8 asks an app in the App Store that offers Google's sign-in to offer as well one that lets a person keep their address private, which Apple's does. Decision 070 gives the rules.

1. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list), open the App ID of your app, `app.tonnr` or your own bundle, and tick **Sign in with Apple**. The Services ID and the key below are grouped under it as their primary App ID.
2. Create a **Services ID**, such as `app.tonnr.web`, tick **Sign in with Apple** and configure it: the primary App ID, your API's domain, such as `api.example.org`, and as return URL `${BETTER_AUTH_URL}/api/auth/callback/apple`, with the actual public API address and no trailing slash. It is the API's address, not the web app's. Apple takes HTTPS on a public domain alone, so neither `localhost` nor a `.localify` domain. The Services ID goes in `APPLE_SERVICES_ID`.
3. Under **Keys**, create a key with **Sign in with Apple**, configured with the same primary App ID, and download its `.p8` file, which Apple gives once. Its Key ID goes in `APPLE_KEY_ID`, and the file's content in `APPLE_PRIVATE_KEY`, from `-----BEGIN PRIVATE KEY-----` to its end, with its lines, or with each line break written `\n` on one line. Keep the file as you keep a password: whoever holds it signs in as your instance at Apple.
4. Your Team ID, shown in the developer account under **Membership details**, goes in `APPLE_TEAM_ID`.
5. Under **Services**, configure **Sign in with Apple for Email Communication**: register the domain of `EMAIL_FROM`, with the SPF record the page asks for, and the address itself. A person may hide their address from you. Apple then gives an address of its relay, which passes on the mails of the senders registered there and refuses every other: without this, the mail that checks the address, the one for a new password and the alerts' mails never reach such an account.
6. Restart or deploy the API, and check that the web app offers **Continue with Apple** and completes a sign-in.

- Apple asks for a secret with each sign-in, a token signed with the key that lasts six months at most. The API signs one as it starts, lasting a day, and signs it again before it runs out: there is nothing to renew by hand.
- The app for iPhone signs in with Apple's own sheet and sends the API the token it gave, made for the app's bundle. The API reads the bundle from the origin the app names itself by: `app.tonnr` for `app.tonnr://`, the default of `APP_ORIGINS`. An app of your own has its bundle as the scheme of its origin. A token made for the Services ID is refused there: the web signs in through Apple's page alone.
- Apple gives a name the first time a person signs in, and an address, which may be one of its relay. An account made with Apple has no password and no username: it chooses a username when the app needs one, and sets a password through the mail of a forgotten one. An existing account is linked only once both addresses are checked, as with Google.
- Apple's page posts its answer to the API from `https://appleid.apple.com`, with the cookies of the sign-in under way, and the sign-in library then trusts that origin. A proxy in front of the API lets that post through.

## Checking addresses by mail

An instance sends no mail unless you give it a way out. With one, it sends each account that signs up a mail with a link, which marks the account's address as checked. Nothing else changes: an account signs in and uses the instance whether it follows the link or not. An account that forgot its password is mailed a link to choose another, which works once, for an hour: an instance without mail cannot do that, and its web app says so. Decision 026 gives the rules.

Set these in `apps/server/.env`, or in the API's environment on another platform. The worker needs the same to send the mails of the alerts: "Alerts by mail" above says which.

| Variable            | Value                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `UNOSEND_API_KEY`   | A key of an Unosend account, to send through Unosend.                                                                                    |
| `SMTP_URL`          | Or any mail server: `smtp://user:password@host:587`, or `smtps://` for one that speaks TLS from the start. Set one of the two, not both. |
| `EMAIL_FROM`        | The sender, as `Name <address>` or an address alone. Needed with either.                                                                 |
| `EMAIL_DAILY_LIMIT` | Optional. How many mails the instance lets out in a day. 200 without it.                                                                 |

- The address in `EMAIL_FROM` must be one your provider lets you send from. Set up SPF and DKIM for its domain as the provider says, or the mails end in the spam folder.
- The link in the mail opens the API, which sends the browser on to the web app at `/verified`, or under its language's prefix for a mail in another language, such as `/fr/verified`. So `BETTER_AUTH_URL` and `CORS_ORIGIN` must be the public addresses of the two. The link for a new password opens the web app itself, at `/reset-password`, under the same prefix.
- Your provider learns the address of everyone who signs up or asks for a new password, when, and the mail itself, link included. Turn off what it offers to track: opened mails and followed links. A provider that tracks links rewrites them, and keeps them.
- The instance counts its mails and stops at the day's limit, the alerts' mails with the others. An account is sent three mails that check its address an hour at most, and five a day, and as many for a new password: its alert mails are counted apart. Someone who signs up again and again with made-up addresses spends the day's mails: the page "Instance" of the admin shows the count.
- The library that sends the mail would report its use to its authors. The instance tells it not to.
- The log keeps how a mail failed, never to whom it went.
- The landing's form sends the ideas of its readers, and `/contact` their messages, to `CONTACT_EMAIL`, in `packages/config/src/app.ts`, through the same mail: put your own address there. 20 a day at most, counted with the day's mails. Without mail, the form gives that address to write to.

## Météo-France's wind stations

An instance fetches the wind of Météo-France's stations only with a key of its own. Without one it runs with the other providers, and shows none of these stations. Decision 032 gives the rules.

1. Open a free account on `portail-api.meteofrance.fr`.
2. Subscribe to the API "Package Observations".
3. Under "Générer Token", choose "API Key" and a duration in seconds. The longest is 94608000, three years.
4. Set `METEO_FRANCE_API_KEY` to the key: in the root `.env` with Docker Compose, or in the worker's environment on another platform. From a clone, set it in `apps/server/.env`.
5. Start the worker again. Its log shows `Scheduled ingest-meteofrance`, then lines such as `meteofrance: 777 stations, 1482 new readings`.

- The worker sends Météo-France three requests every six minutes. The subscription allows 100 a minute.
- The subscription ends after two years, on the date the portal shows, and the key at the end of its duration. The API then refuses the worker, and the page "Instance" of the admin shows the job as failed. Renew the subscription on the portal, or make a new key.
- A new key does not end the one before it, so a key that leaked stays good until its own end.
- The data is under the Licence Ouverte 2.0. Show "Météo-France" with a station's data: the API returns it as the station's attribution.
- Without the key, the worker stops fetching at its next start. The stations it stored stay, with their last readings.

## AEMET's wind stations

An instance fetches the wind of Spain's stations only with a key of its own, as it does Météo-France's. Without one it shows none of them.

1. Ask for a key at `opendata.aemet.es`, under "Obtención de API Key", with an email address. The key comes by mail.
2. Set `AEMET_API_KEY` to the key: in the root `.env` with Docker Compose, or in the worker's environment on another platform. From a clone, set it in `apps/server/.env`.
3. Start the worker again. Its log shows `Scheduled ingest-aemet`, then a line with the count of its stations.

- The worker sends AEMET two requests an hour.
- Show "© AEMET" with a station's data: the API returns it as the station's attribution.

## What an instance owes the data providers

The worker calls the providers from your server, each on its schedule, from every few minutes to once an hour. You answer to them for your instance.

- Read [Data sources](data-sources.md) before you open an instance to other people. It says what each provider allows.
- Show a station's attribution wherever you show its data. The API returns it with every station.
- A catalogue of surf breaks filled from OpenStreetMap is under the ODbL. Show "© OpenStreetMap contributors" wherever you show one of its breaks. The API returns the credit with each of them.
- The forecasts are read from the files behind Open-Meteo's API, on its public bucket on AWS, `openmeteo.s3.amazonaws.com`, under CC BY 4.0: a few kilobytes a point, from your server, with no account and no quota (decision 058). Show the forecast's attribution wherever you show it: it names Open-Meteo and the services whose models answered. The bucket promises no service: when a file cannot be read, the API below is asked instead.
- The API as a fallback: Open-Meteo's free API, which is for sites without subscriptions or advertising, and which limits what one address may ask. Your API and your worker ask it from your server, and count each request: 8,000 a day, 4,000 an hour and 480 a minute at most, four fifths of what it allows. The day is shared: 2,500 requests for the people who look at the map, 3,900 for the worker that keeps the forecasts of the surf breaks whose page a search engine may list, once a day each, and 1,600 for the alerts (decisions 023 and 057). The pages of the web app ask nothing of Open-Meteo themselves: a page shows the forecast the worker kept, or says that it is on the map. Past a limit they ask nothing more, and a forecast they kept answers for a day, saying that it is an older one. The limits are in the code, not in a setting: another program that calls Open-Meteo from the same address is outside the count. Show the forecast's attribution wherever you show it. Decision 023 gives the rules.
- The search that finds a place by its name asks Photon's public service, at `photon.komoot.io`, which Komoot offers for fair use and without any promise. It is sent what a surfer types, the language, the middle of the map to a tenth of a degree and the map's zoom, from your server's address. To ask another Photon, yours for instance, set `PLACES_URL` in `apps/server/.env` to its address, such as `http://photon:2322`. Your API asks it 240 times a minute at most, and leaves it alone for 30 seconds after a refusal. Show "© OpenStreetMap contributors" where the places are listed. Decision 030 gives the rules.
- From the French coast north of La Rochelle to the North Sea, the waves of a forecast come from a finer model that your API and your worker read from the Copernicus Marine Service's public store, with no account: about 1 MB for a forecast they do not hold, from `stac.marine.copernicus.eu` and the store its catalogue names. When it cannot be read a forecast has Open-Meteo's waves, and says so in its credits. Show the credit the forecast gives. Decision 037 gives the rules. Every forecast also takes the swell apart from the wind sea from the same service's store of the world, about 1 MB more for a forecast they do not hold: decision 038. Each of the two programs keeps up to 32 MB of what it read there in memory.
- The map colors the sea with tiles that each visitor's browser fetches from the Copernicus Marine Service. Your API reads only their description, two documents an hour. Keep the credit the map shows for them. Decision 018 says what that provider sees.
- A station whose `license.commercialUse` is `false` or `null` must stay out of anything paid. IPMA's stations, in Portugal, are among them: its terms allow no profit, and it asks to be told, at `webmaster@ipma.pt`, what its data is used for.
- The code's licence covers the code. The measurements stay under their providers' terms.

## What the licence asks

Tonnr is under the GNU Affero General Public License, version 3. Running it as it is asks nothing more of you. If you change the code and let other people use your instance, offer them the source of your version.

## Your legal texts

The web app has three pages that speak for whoever runs the instance: the terms of use at `/terms`, the privacy policy at `/privacy`, and the legal notice at `/legal`, which French law asks of a site. They are written for Téo's instance, and on yours they are your promises: you are the publisher and the controller of your accounts' data, not Téo.

- Name yourself, your hosts and the services that receive data in `apps/web/src/lib/legal.ts`. Both pages read them there.
- Read the texts again in `apps/web/messages/en.json` and `fr.json`, under `terms_`, `privacy_` and `legal_`: a setting you changed changes what they must say. Without Google sign-in, PostHog, Umami or mail, say nothing of them. With an SMTP server in place of Unosend, name it.
- When you change a text, change `LEGAL_UPDATED` in `apps/web/src/components/landing/legal-page.tsx`: the three pages show it as the date they last changed.
- The texts are no legal advice. Have them read for your country and for what your instance does.

## Product analytics

Optional: use your own PostHog project. Without these settings your instance sends no analytics and no error reports. Decisions 044 and 054 and [Analytics](analytics.md) give the contract.

- In `apps/server/.env` (or your hosted API's runtime environment), set `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` and `POSTHOG_ENVIRONMENT`.
- In `apps/web/.env` for local development, or `packages/infra/.env.<stage>` for a release, set `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST` and `VITE_POSTHOG_ENVIRONMENT`.
- Use the same project and environment for the API and its web app. The ingestion host is `https://eu.i.posthog.com` for EU or `https://us.i.posthog.com` for US. Environments are `development`, `dev` and `production`.
- Set all three together, or none. The deploy command passes browser values to the release build and refuses an incomplete group. A project token is public in the browser bundle; no personal API key is used. Tests and CI send nothing.
- Restart/deploy the API first, then deploy the web app. Easypanel's deploy hook does not copy ignored local environment files: add the API's variables in its service environment before restarting it. The worker needs none.
- The web app asks for permission on first product use, in one question that covers the analytics and the error reports. Anyone can refuse, then change their choice in the account tab, where a switch also turns off the error reports alone. `/ingest` forwards approved browser analytics, and the batches of the app for phones, to your fixed Cloud region without forwarding cookies, auth, query strings or incoming IP headers. The landing loads no SDK.
- The API reports its faults, the errors it logs with a status of 500 or more, to the same project: under the distinct ID `api`, with nothing of the request or the person, whoever chose what. The worker reports nothing.
- Optional, and apart from PostHog: Umami counts the pages read, the landing's too, with no cookie and no consent asked (decision 055). Set `VITE_UMAMI_SCRIPT_URL`, the address of your Umami's `script.js`, and `VITE_UMAMI_WEBSITE_ID` together, in `packages/infra/.env.<stage>` for the stage you want counted. Without them nothing loads. If you set them, `/privacy` names Umami already; if you do not, take it out of `RECIPIENTS` and of the texts.
- After a release, grant permission on a controlled browser and open the app. Check that exactly one `app_active` arrives in your project with the release environment and API commit. Reload and check the count stays one for the same identity/day. Create an alert and check `alert_created` arrives once. Filter local/pre-production/internal events out of production reports.
