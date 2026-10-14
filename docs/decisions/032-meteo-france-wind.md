# 032. Météo-France's wind stations, and a provider that asks for a key

Status: accepted on 2026-10-11. Téo asked for the wind of Météo-France's stations that day, opened the account, and made the key.

## Context

Decision 007 left Météo-France's stations out, because its observation API asks for the key of an account. On 2026-10-11, 778 of its stations sent a wind speed, a reading every six minutes. Pointe du Raz, Ouessant, Socoa and Capbreton are among them.

The files of `meteo.data.gouv.fr` are no way around the key. The hourly files, one per department, are written once a day, and the 6-minute files hold rain only. `docs/data-sources.md` gives what was measured.

No provider had asked for an account before, so every instance fetched from every provider. A key is a secret that each instance gets for itself.

## Decision

- The worker fetches the API "Package Observations", version 2. One request gives every station of the network at one moment, about 1,900 of them.
- It keeps the wind and nothing else of a station: the speed `ff`, a mean over ten minutes, the direction `dd`, and the gust `raf10`, the strongest of those ten minutes, in metres per second. A station without a wind speed is not stored.
- Every station with a wind speed is stored, inland ones too, as OpenWindMap's are. Decision 048 keeps it so, and shows one station for each place on the map.
- A run asks for three documents: the list of stations, which names them, and the packages of two moments. The package of a moment was out three minutes after it with 692 of its 778 wind stations, and was written again six minutes later with the rest. A run takes the latest moment that is three and a half minutes old, and the one before it. It starts at minutes 4, 10, 16 and so on of each hour.
- The package of a moment that is not out yet is an empty list. It is read as no reading, and the next run asks for that moment again.
- The key is `METEO_FRANCE_API_KEY`, and it is optional. Without it an instance runs as before: the provider is not listed, it has no job, and the worker deletes the queue it left if it had one. Its stations and readings stay.
- The key travels in the header `apikey`, never in the address. An error keeps the address it was asking, and the state of the instance keeps that address's host.
- The network writes a name in capitals, `PTE DU RAZ`. It is stored as a place name is written, `Pte du Raz`.
- The network writes a calm wind as a speed of 0 from the direction 0, and the north as 360. A direction of 0 is stored as no direction.
- A reading is not marked validated. The API's documentation calls these values raw.
- A station is stored under the Licence Ouverte 2.0, with commercial use allowed and the attribution "Météo-France".

## Rejected

- **The files of `meteo.data.gouv.fr`.** No key, but a wind that is between two hours and a day old.
- **The targeted API**, which gives one station for a request. It would take 778 requests where the package takes one.
- **An OAuth2 token** in place of an API key. It lasts an hour, so the worker would hold the identifiers of the account's application and ask for a token every hour. An API key lasts up to three years.
- **Asking only for a moment whose package is complete.** One request less, and a wind that is 10 to 16 minutes old where nine stations in ten now give one of 4 to 10.
- **Keeping the list of stations in memory for an hour.** The list is written once an hour. No provider module keeps anything between two runs, and the list is 140 kB.

## Consequences

- An instance without a key shows none of these stations. `docs/self-hosting.md` says how to get a key.
- The account's subscription ends after two years, and a key at the end of the duration it was made with. The API then refuses the worker, and the page "Instance" shows the job as failed with the provider's status.
- A new key does not end the one before it. A key that leaked stays good until its own end.
- The worker sends three requests every six minutes. The subscription allows 100 a minute.
- 778 stations with a reading every six minutes are about 187,000 readings a day. The nightly job of decision 007 deletes them after seven days, which leaves about 1.3 million rows.
- OpenWindMap's licence asks that the sensors combined with its data be open. The Licence Ouverte is.
- The same account's key opens the targeted API once the account subscribes to it. That API gives Météo-France's moored buoys every hour, which are not fetched.
- A second provider with a key is added the same way: its key in `ProviderKeys`, in `apps/worker/src/ingest.ts`, and its place in `providersOf` and `retiredProviderIdsOf`.
