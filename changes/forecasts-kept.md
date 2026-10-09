---
type: improved
---

## Forecasts that outlast a restart, and say how old they are

A forecast is now kept in the database, where the map, your spots and the alerts all read it. It no longer has to be fetched again after each update of the service. When the forecast provider cannot be reached, the forecast you see is the last one that was fetched, for a day at most, and the API says so with `fetchedAt` and `stale`. An alert is never sent on such a forecast.
