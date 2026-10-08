# 007. Wind stations

Status: accepted on 2026-10-08. Replaces the rule of decision 004 that only stations reporting a wave height are stored.

## Context

Surfers read the wind next to the swell, and La Bouée shows wind stations on its map. Wind comes from stations that have no wave sensor, and they report far more often than buoys.

## Decision

- A station is stored when it reports waves or wind. `station.reports_waves` and `station.reports_wind` record what it has been seen to report, and the API exposes them as `measures` and filters on them.
- A wind reading is a row of `reading` without a wave height. Wind is stored in metres per second.
- Sources, each a provider module like the buoys:
  - NOAA NDBC, whose file already carried the wind of its buoys and coastal stations.
  - OpenWindMap, the community network that took over Pioupiou, read from one request for all stations.
- A reading without a wave height is deleted after seven days, by a nightly job. Keeping a station's history longer waits for the feature that switches history on when a user asks for it.

## Consequences

- OpenWindMap's license asks that the other sensors an application combines with its data be open too. The NDBC stations relayed for partners have unchecked terms, so this needs settling with OpenWindMap, or those stations dropped, before a public release.
- Météo-France's stations are not integrated. Its observation API needs a free key, to be set as `METEO_FRANCE_API_KEY`.
- Airport observations (METAR) are a checked candidate for worldwide coverage and are not integrated. They need a coastal filter to keep their volume down.
- A wind station's reading can be at most ten minutes old, the polling interval.
