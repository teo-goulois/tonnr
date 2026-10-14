# 048. Wind stations beyond France, and one station for each place on the map

Status: accepted on 2026-10-14. Téo asked that day for wind stations outside France: Europe first, then Asia, then the Americas.

## Context

The map's wind came from France: Météo-France and OpenWindMap, with the Irish networks and NDBC around them. A search of 2026-10-14 checked the open networks of the three regions. `docs/data-sources.md` gives what each one answered.

Téo weighed two things. A surfer reads the wind at the coast, but a station inland serves whoever rides a lake or a wake park. And where networks meet, three stations can stand within a kilometre, three markers on top of each other.

## Decision

- Every station with a wind speed is stored, inland ones too, as decision 032 has it. No network is filtered by its distance to the coast.
- `v1.stations.list` takes `places`. With `measures=wind`, `"one"` keeps one station for each place: of the stations within 2 km of each other, the one that measured in the last two hours, then the one that gives gusts, then the one whose network measures most often, then an official one over a community beacon, then the first by id. `packages/api/src/wind-places.ts` holds the rule, as functions that read no clock and no database.
- When the box holds more places than the list's `limit`, the stations are kept further apart, 4 km, then 8 and so on, until they fit, and the answer says the distance in `apartKm`. A map that shows a country then draws the better station of each area all over it, rather than the first 500 by id: on 2026-10-14 those were AEMET's alone, over Spain, on a map of Western Europe. The map says "Zoom in to see them all" when `apartKm` is more than 2.
- Each station knows how far it stands from the shore, `station.shore_distance_km`: positive on land, negative at sea, 50 or -50 beyond. The worker writes it each time it stores a station, from Natural Earth's coastline, so a station that moved is measured where it is. `docs/data-sources.md`, "The shore", says what the coastline is.
- With `prefer=sea`, which the map asks for, a station at sea or within 10 km of the shore comes before the others once the stations are kept further apart than 2 km, after those that measured in the last two hours. At 2 km the order stays as above. No station is left out for being inland: an inland area keeps its own station where none by the sea stands within the distance, and zoomed in every place shows.
- Each distance weighs every station of the box again, so that every station left out has a better one within that distance. The cells that find a neighbour go round the antimeridian and reach further near a pole. Codex's review of 2026-10-14 found both faults in the first version, and in the second that the land's outline must be read ring by ring, made continuous across the antimeridian and closed through the pole for Antarctica, or whole bands of latitude take the sea for land.
- Beyond 20,000 wind stations in a box, the first 20,000 by id are weighed and the answer says `truncated`, which the map reads as "Zoom in to see them all".
- The choice is made each time the list is asked for, never as the stations are stored. When the station kept stops measuring, its neighbour takes its place at the next answer, and the API's other callers still read every station.
- The map of the web app asks for `"one"`. What says the wind at a break or a spot reads every station around it, and keeps the nearest that measured lately.
- The networks are added in this order, each one a provider module:
  1. DMI, Denmark, the Faroes and Greenland, and Rijkswaterstaat, the Netherlands: no key, one request for every station. Added with this decision.
  2. The JMA's AMeDAS, Japan: about 900 stations with wind, many on capes and the coast, in one file every ten minutes. Added the same day, without gusts: the file holds none.
  3. NOAA CO-OPS, the United States: the anemometers of the tide stations, on the shore itself, which NDBC does not carry. One request per station. Added the same day: 233 stations, read once an hour, one request a second, and a run stops at the first refusal: its firewall refused the server that asked 630 times in a minute.
- The airports' METAR come after these: one file for the whole world, but an airport says little of a beach. Added the same day, with IPMA, Portugal, whose terms allow no profit, and AEMET, Spain.
- AEMET asks for the key of a free account. It is `AEMET_API_KEY`, optional, and follows the rules decision 032 gave Météo-France's key.

## Rejected

- **Only the stations within a few kilometres of the coast**, against a coastline from Natural Earth. Téo kept the inland stations for the lakes and the wake parks.
- **The distance to the nearest break of the catalogue** as what makes a station of the coast. It says what surfers care for, but an instance without breaks would have no coast, and one whose catalogue covers some regions would favour them.
- **A weight that grows with the distance to the shore** in place of a band of 10 km. The coastline is generalized, and a few kilometres more or less on it say nothing.
- **Only the stations near a break of the catalogue.** An instance without breaks would show no wind.
- **Choosing at the time a station is stored.** A station that stops would leave its place empty until it was stored again.
- **Merging the stations of one place into one.** Their readings come at different times, with different averages and heights.

## Consequences

- A list asked for with `"one"` reads every wind station of its box, up to 20,000, before it keeps its limit. It costs the database more than a list of 500.
- A network not named in `wind-places.ts` is taken to measure every hour, as the airports, IPMA and AEMET do. A new wind provider names its interval there.
- Rijkswaterstaat's query names its 58 stations, read from its catalogue on 2026-10-14. A station it adds later waits for a change of the module. The catalogue is 2.2 MB, too much to read at every run, and no provider module keeps anything between two runs.
