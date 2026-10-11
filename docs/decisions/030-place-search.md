# 030. Finding a place by its name

Status: accepted on 2026-10-11. Téo asked for it the same day: whoever adds a spot must be able to search an address to find the place on the map. He was told the provider and has not objected.

## Context

A spot is placed on the map by hand. The map opens on a whole coast, and the place may be a beach whose name the surfer knows and whose position they do not. The catalogue of breaks finds a break by its name (decision 015). It knows no town, no street and no car park.

Finding those is a search service's work. None was among the instance's providers.

## Decision

- `GET /v1/places` gives the places whose name matches a search: a name, the places it lies in from the widest to the nearest, and a point. Given together, `latitude` and `longitude` bring forward the places near that point, and `zoom`, the zoom of the map the search is made from, says how wide near is. The order is the service's, which also weighs how well known a place is.
- The places are towns, their parts, and what has a name on the ground: a beach, a headland, a lake. Streets and houses are not asked for. With them, a search for Hossegor gave two streets of that name in other towns, then shops, and not the town. A spot is put on the map from a place, and the surfer then moves the marker.
- A place the service gives twice in the same words, as the two banks of a stream, is given once. The API asks for twice the places wanted, twenty at most, to have enough left.
- The API asks a Photon for them. Photon serves OpenStreetMap's names, needs no key, and is open source, so an instance can run its own. `PLACES_URL` names it. Without the setting the API asks Photon's public service, which asks to be used fairly and promises nothing.
- The browser does not ask the service itself. The operator chooses the provider, the service sees the instance's address and not each surfer's, and the mobile app will use the same route.
- The route takes an account's session and no key. The places are not data the instance holds, and a key that could search would make the instance a free door to someone else's service. Giving it to keys later is an addition (decision 003); taking it back would not be.
- An account searches 40 times a minute at most, and everyone together 240 times. Eight searches wait for the service at once. One search is one request, with no second try, and a request that fails counts as one.
- A service that refused, failed, or answered something else than a list of places is left alone for 30 seconds from then. Only a search the service calls wrong, with a 400, starts no rest: the fault is that search's, and the next one is another.
- Beyond its own limit an account is answered 429, whatever else is true. The other refusals are 503. All say in `Retry-After` when to ask again, the search that met the failure too: zero after a search the service called wrong.
- The limits, the rest and the kept answers are timed by the time since the process started, not by the clock of the day, which can be set back.
- An answer is kept ten minutes in memory, for the same search made again: the same words in the same case, the same language, and the same part of the map. Five hundred are kept at most. Nothing of a search goes into the database.
- The log holds no search: not the route's address (the API never logs what follows `?`), and not the address asked of the service, which a failure would otherwise print.
- The API sends the service what was typed, the language, the middle of the map to a tenth of a degree, and the map's zoom. It sends nothing of the account.
- Each answer names its source and its licence, as a forecast's does: OpenStreetMap, under the ODbL.
- One module knows Photon's format, `packages/api/src/places.ts`. A test gives it a function in place of the service.

## Rejected

- **Asking the service from the browser.** No route to write, and the map's tiles already come that way. But the operator could not choose the provider without building the web app again, each surfer's address and searches would go to a third party, and nothing would bound what one page asks of a free service.
- **Nominatim's public service.** Its policy forbids a search that follows the keys, and allows one request a second for a whole application.
- **A provider with a key** (MapTiler, Mapbox, Geoapify). A key is a secret more for every instance, their free tiers end, and their terms limit what may be kept of an answer.
- **Counting the requests in the database**, as the forecasts' are (decision 023). Open-Meteo states its allowance, and Photon states none: there is no number to hold the instance to. The counts are in memory until one is known.

## Consequences

- The counts and the kept answers are a process's. An instance that runs two APIs asks twice as much, and a restart forgets both.
- A self-hosted instance asks Komoot's public service until its operator names another. `docs/self-hosting.md` says what that service learns.
- The names are OpenStreetMap's. A spot that takes its name from a place keeps a name anyone could have written there.
- A place is a point and a name, with nothing about the sea. A beach found this way is where the search put it, which may be its car park: the surfer still places the marker.
- An address is not found: a street and a house number give nothing. Téo asked for a search "by an address" to find the place, and a town or a beach does that. Asking for streets again is one word in `LAYERS`.
- The public service gives names in English, French and German and its own default. The route takes the web app's two languages.
