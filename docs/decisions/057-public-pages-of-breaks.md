# 057. A public page for each surf break

Status: decided by Téo on 2026-10-15, in three exchanges that evening. He agreed to the head, the sitemap, the pilot, the addresses by country and region with their hubs, a deployment with no further switch, and a first version with no descriptions. He asked that the forecast be on every page, since it is what sets the product apart: the worker keeps it, on the free tier for now, and [decision 058](058-forecasts-from-model-files.md), to be written after a trial he asked for the same evening, says whether the forecasts come from the models' open files instead of the provider's API. Descriptions written by a model from what is known of a break are a decision of their own, for later. Built on the night of 2026-10-15 to 2026-10-16, with [decision 058](058-forecasts-from-model-files.md): the pages, the hubs, the sitemap index, the Worker's cache, the worker's job and the addresses of the catalogue, with their migration. Tried on a copy of the catalogue, in English and in French, on a wide screen and a phone; not deployed. The worker's job refreshes every listed cell at each run, since decision 058 made a forecast cost no quota.

## Context

Production is live since 2026-10-15 (decision 052). The web app has seven public pages, each in four languages, listed in `PUBLIC_PAGES`, named in the sitemap, and sent with their canonical address and their address in each language. The Worker says `noindex` of every other address. Google Search Console knows the domain but Téo has not verified it yet.

Téo wants search traffic on what a surfer types: the name of a spot with the word surf, or "météo surf" and a name. That takes a page for each surf break, in each language, that a search engine may list and that is worth listing: Google treats thousands of pages that say the same few words as thin, and lists none of them.

The catalogue, measured read-only on 2026-10-15:

- 9,257 breaks. Every one has the places it lies in, in English, from its country down to its town: two to six of them, four for 6,588. 142 countries, 811 regions, 5,342 distinct paths of places. 793 paths say a place twice in a row, the town and its municipality. Every break has an offshore direction, and 9,108 a time zone.
- 2,407 say seven or more of their eleven characteristics: the pictograms of the guide book and the collected list's guides. 6,850 say three or fewer, and 6,049 of them nothing but the offshore direction. There is no middle: nothing stands between three and seven.
- None has a description. No account has written a line of a guide yet.
- 298 names are borne by two breaks or more, 144 within one country, 4 within one path of places.
- None names a source or a licence, so nothing of the kind is to be shown.
- What the lists said of the breaks is in `surf_break_listing`: the collected list's excerpts for 9,108 breaks, and the book's description, from 160 to 1,700 characters, and its lines on the entry, the access, the hazards and the rules for the 1,035 breaks merged or added from it. Only an operator reads them (decision 049), and none may be published: they are the lists' own texts.
- 19 forecast cells are kept. The forecast provider allows 8,000 requests a day for the whole instance, two for one forecast, and the people who look have 5,500 of them (decision 023). A crawler that asked a forecast at every break would spend them in an hour, and close the instance to visitors for the day (decision 039).

## Decision

### Addresses

- A break has a page under `/spots`, at the places it lies in, then its own slug: `/spots/spain/basque-country/mundaka`, and the same under each language's prefix, `/fr/spots/spain/basque-country/mundaka`. The places are the first two of `location`, the country and the region, as `fold` reads them: small letters, no marks, words joined by a dash. "Spot" is the word the app says to a reader. `/b/<id>` stays the short address a break is sent by (decision 056), and keeps leading to the map.
- Each place of the path is a hub page: `/spots` lists the countries, `/spots/spain` its regions and its listed breaks, `/spots/spain/basque-country` its listed breaks, with what each is like in a line. A hub is listed when it holds a listed break. The hubs are the path a search engine follows from the landing to a break, and they are built with the pages, not after.
- The slug is a column of `surf_break`, unique within its country and region, and never null. It is written once, when a break enters the catalogue: a migration writes one for every break that is there, and `job breaks`, a candidate added, a spot made public and a break added in the admin write one for a new break. It is the name folded. When that slug is taken in the same region, the nearest of the break's places is added, then the first six characters of its id.
- The path of places is written with the slug, as a column of its own, from `location` as it is that day. Neither follows a change: a rename, or a corrected `location`, changes the title and the breadcrumb, and not the address. An operator does not edit either, for now.
- A merge (decision 049) writes the address of the break that goes into `surf_break_alias`, with the break that stays: its address then answers a 301 to the other's. A deleted break's address answers 404, and its aliases go with it, by the database's cascade.

### Which breaks are listed

- Every break of the catalogue has a page, so that a link to it and a nearby break's link always open something. A search engine is asked to list the page when the break stands on its own: seven or more of its eleven characteristics are said, or it has a description, or a text of its guide was confirmed. Today that is 2,407 breaks, 9,628 addresses. The rule is a function that reads no clock and no database, `standsAlone` in `packages/api/src/pages.ts`, and the API answers it with the page as `listed`.
- The page of a break that is not listed says `noindex` in a `meta`, and the sitemap and the hubs leave it out. The breaks a page names nearby are listed ones first.
- The threshold is a number in the code. It widens as guides and descriptions fill in, since each of them lists a break by itself.

### What a page says

Server-rendered, in the reader's language, every string in `apps/web/messages/`:

- The name, and the places from the widest to the nearest, as a path over the title, each a link to its hub where one exists. The operator's description, when it has one: in the reader's language when it was written in it, else as it was written, marked with its language. Nothing of what a list said of the break: the operator reads it in the admin and writes their own words, as decision 049 has it.
- What the break is like, drawn as the guide draws it, with `CharacteristicsList` and its rows.
- The sea now: the nearest buoy that measures waves, within 100 km, and the nearest station that measured the wind lately, within 50 km, each with its latest reading and when it was taken. The wind is named by how it meets the shore, with `shoreWind`, since every break knows its offshore direction. Each station comes with its attribution and its licence.
- The tide of the day: the next highs and lows, in the break's time zone, UTC when it has none, computed as the map computes them, with the credit of its source.
- The week: for each of seven days, the largest wave height with its period and its direction, and the wind at midday with its direction, in the colors of `sea-scales.ts`, with the models' credit. It comes from the forecast kept for the break's cell, fetched as the next section says; with none, a sentence says that the forecast is on the map.
- The breaks nearby: eight at most, within 50 km, as links to their pages.
- One button, "Open on the map", to `/app?break=<id>`.
- The server writes a measurement in knots and metric units, and a reader whose account chose others sees theirs once the page is hydrated, through `useUnits` as everywhere.
- No picture of the map on the page, in this first version. The page is sent with the shared picture of a place, `og-place-<locale>.jpg`.

### Head

- The title says the name and what the page holds: "Surf at Mundaka: forecast, swell, wind and tide", with the product's name after it, in each language. The description is written from the data: the places, the type of break and its bottom, the tides and the swell it likes.
- `pageLinks` and `pageMeta` take the page's address: its canonical address, its address in each language and `x-default`, the Open Graph and Twitter tags. `isPublicAddress` recognises `/spots` and what stands under it in each language, so that the Worker sends no `X-Robots-Tag` for them.
- JSON-LD: a `Place` with its `geo`, its `address` by country and region, its `description`, and a `BreadcrumbList` of the places.

### What a page costs, and who asks for it

- One procedure answers a page: `pages.break`, `GET /v1/pages/breaks/{country}/{region}/{slug}`, built on `callerProcedure`. It answers the break with its confirmed words laid over, whether it is listed, the two stations, the tide, the week and the breaks nearby, or that the address moved, with the address to go to. One call of the API renders a page, each a few reads of the database and nothing asked of the provider. `pages.place` answers a hub, and `pages.listed`, `GET /v1/pages/breaks?page=<n>`, the addresses of the listed breaks with when they last changed, two thousand a page, for the sitemap.
- The week is read from the forecast kept for the break's cell, by a new function of `packages/conditions`, `forecasts.kept`: the row kept, while it is under a day old, marked stale past two hours (decision 023), and nothing asked of the provider. The question is not counted to its caller under decision 053, since it costs nothing. With no row, the page says that the forecast is on the map.
- The forecasts of the listed breaks are kept by the worker, which asks the provider for them, as it does for the alerts: a job `pages` refreshes the cells of the listed breaks, in slices spread over the day, within a share of the budget of its own. The 2,407 listed breaks stand in 1,901 cells, two requests each. The whole catalogue stands in 6,573.
- How often depends on what the instance pays its provider. Téo chose the free tier for now, until decision 058 says where the forecasts come from:
  - **The free tier**, 8,000 requests a day for the instance (decision 023). Each listed cell is refreshed once a day: 3,802 requests. The shares become 2,500 for the people who look, 3,900 for the pages and 1,600 for the alerts, and the instance closes to visitors at 2,000 of the people's. The week of a page is up to a day old, and says when it was fetched. The alerts' share pays for about 100 cells, where it paid for 150.
  - **The provider's Standard plan**, about 29 € a month for a million requests, 33,000 a day: a key and other addresses, as decision 023 foresaw. The instance then lets itself 26,000 a day. Each listed cell is refreshed every six hours, 15,200 requests, and the people and the alerts keep their shares and more. The key is a variable of the API and the worker, `OPEN_METEO_API_KEY`, and the budget's numbers follow its presence, in the code: decision 023's three things change together.
- The job reads the listed breaks, so a break that becomes listed, by a description or a guide, has its week at the job's next slice.
- The Worker asks as a visitor: it names the web app's site in `Origin`, which decision 039 lets a program do. While the instance is closed to visitors, the page answers 503 with `Retry-After`: a search engine comes back, and a cached copy serves while it lasts.
- The Worker keeps a rendered page an hour in Cloudflare's cache, the Cache API of its data center, a hub an hour and a sitemap a day, and serves them before rendering again. The answer says `Cache-Control: public, max-age=600, s-maxage=3600`. Only an answer of 200 or 301 is kept. Nothing of an account is read on these pages, so nothing personal is cached. Development has no cache.

### The sitemap

- `/sitemap.xml` becomes an index of sitemaps: `/sitemap-pages.xml` for the pages of `PUBLIC_PAGES` and the listed hubs, and `/sitemap-spots-<n>.xml`, each of two thousand breaks in four languages, with their `lastmod`. The Worker writes them from `pages.listed`, and keeps each a day in the cache.

### Private spots

- A page reads `surf_break` and nothing else. A spot of an account has no page, no slug and no entry in a sitemap: it is its owner's, as decisions 034 and 035 say.

### Docs in the same change

`AGENTS.md`, the lines of decisions 021, 023, 024, 049 and 053 that this one amends, `/llms.txt`, which names the pages and the routes, `/design-system` for a component the page adds, and `docs/self-hosting.md`, which says that a listed stage serves these pages and what they take of the forecast budget. The landing gains no card: the pages say what the app does, and are not a thing it does.

### The pilot

The whole is built and tried on ten breaks first, well filled and in three countries: Mundaka, Zarautz and Sopelana in Spain, Capbreton, Les Estagnots and La Madrague in France, Baleal, Consolação, Tonel and Praia da Cordoama in Portugal. They are tried locally against the production API, read-only, and shown to Téo through a tunnel. The headers, the head's tags and the JSON-LD are checked with `curl`. Then it is deployed, the API first, with the rule that lists every break that stands on its own. Téo verifies the domain in Search Console and submits the sitemap.

## Rejected

- **The whole path of places in the address**, `/spots/spain/basque-country/biscay/mundaka/mundaka`. The paths are two to six places deep, 793 say a place twice, and a town often has one break, whose name is the town's: its hub would be a page of one line, which a search engine treats as thin. The country and the region give the hubs their substance, and the page's breadcrumb says the whole path.
- **A flat address**, `/spots/mundaka`. Téo wants the places in it, and the hubs give the pages a path from the landing, which helps a search engine more than the sitemap alone.
- **An id in the address**, `/spots/mundaka-2d2088`. It needs no column and never collides, but a reader and a search engine both read a slug better, and the places solve most collisions.
- **A slug that follows the name**, or a path that follows a corrected `location`. Every change would break the addresses a search engine holds, or need a redirection to keep. The name is in the title, which may change freely.
- **A page for the listed breaks alone.** A break's page would then appear or disappear as it is written up, and a link to a break left out would open nothing.
- **A key held by the Worker**, so that the pages read whatever the instance says of visitors. A secret for each stage, in `docs/self-hosting.md`, and a developer account's limit by the hour to tune for crawlers. The pages are the web app's, and are closed when it is.
- **A procedure that ignores the closure to visitors.** Only what a link does is built outside it (decisions 039 and 056), and the closure is what an operator means when they close the instance.
- **Asking the provider from the page, when its cell is cold.** A crawler sweeping the catalogue would spend whatever share the pages had in its first hours, and the pages it reached after would go without their week. Téo chose a page that shows the week whatever the hour, which only the worker can keep.
- **A share spent by the pages, first come first served**, 1,000 requests a day: Téo's first word, before he asked for the week on every page.
- **The forecast of every break of the catalogue**, 6,573 cells. Twice what the listed ones take, for pages nobody is asked to list.
- **Caching the API's answers instead of the page.** The page is what a crawler asks; caching it saves the render too, which is the Worker's own cost.
- **A picture of the map for each break.** It takes a rendering of tiles for each break, their licence and their cost. The shared picture serves until the pages have readers.
- **Publishing what a list said of a break**, or a text written from it by a model. Decision 049 keeps a description to the operator's own words, the lists' texts are theirs, and a search engine treats generated text as thin.

## Consequences

- The migration writes 9,257 slugs and paths in one transaction, and holds the catalogue while it does, as every change of the catalogue does (decision 049).
- A break of the collected list says no source, so its page shows none: only the stations, the models and the tides are credited.
- 149 breaks have no time zone: their tide is written in UTC, and the admin lets an operator give them one.
- A break of which only the offshore direction is known has a page nobody is asked to list. It still names the sea now and the tide, and leads to the map.
- A page is up to an hour behind the sea in each data center, and a tide read at the hour's end is an hour old. The map is for the hour by hour.
- On the free tier, the people who look have 2,500 requests a day where they had 5,500, and the instance closes to visitors at 2,000 of them (decision 039), which is a few hundred cold cells. The pages then still answer, from what the worker keeps, and the paid plan lifts both.
- The worker's job is one more that `GET /v1/health` and the admin's page of the instance know (decision 022), and `docs/self-hosting.md` says what it spends.
- The hubs name the places in English, as `location` holds them, in every language. A translation of the countries is for later, with their codes.
- A break renamed in the admin keeps its slug, so an address may say a name the break no longer has. An operator who wants another address waits for a later decision.
- The sitemap of a stage lists every break that stands on its own at once. A search engine crawls at its own pace, so the pages enter its index over weeks.
- The Cache API is a data center's, so the first reader of a page in each one renders it. Cloudflare's tiered cache is not asked for.
- The pages of a stage that is not listed exist too, and say `noindex` through the Worker as every page of such a stage does.
