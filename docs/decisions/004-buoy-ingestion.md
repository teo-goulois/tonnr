# 004. Buoy ingestion and data model

Status: accepted on 2026-10-08.

## Context

Buoy measurements come from many providers. Each has its own format, update rhythm, and terms. The API must show every station's license, and the database must stay portable (decision 001).

## Decision

- `apps/worker` runs one job per provider on a pg-boss schedule. It also runs each provider once at startup.
- A provider is one module in `apps/worker/src/providers/`. It returns a snapshot: the stations the provider publishes now and their recent readings. It knows the provider's URLs and format, and nothing about the database.
- Saving a snapshot twice changes nothing the second time. Stations are upserted, and a reading that already exists for a station and time is left alone. A failed run is not retried, since the next run fetches the same data.
- A parser that meets a format it does not know returns a `FormatError`. It does not guess.
- A parser drops a row whose date or position cannot be real and counts it, and the worker logs the count. It treats a measurement outside what the sea can do as missing.
- A station id is `<provider>-<the provider's own id>`, in lower case, such as `candhis-06403`.
- `station` carries its license type, license URL, attribution, and whether commercial use is allowed. Commercial use is null when the owner's terms have not been checked.
- `station.latest_observed_at` points at the latest reading, so listing stations with their latest reading is a plain join.
- `reading` has one column per measurement, with the unit in the column name. Peak, mean, and significant wave periods each have a column, since providers publish different ones.
- Only stations that report a wave height are stored.

## Consequences

- `reading` is not partitioned yet. At about 12 million rows a year it does not need to be. Partition it by month with native partitioning before queries slow down.
- CANDHIS has no API. Its parser reads JavaScript variables in two kinds of pages, so it breaks when Cerema changes them. `candhis.test.ts` holds examples of the current format. A run makes one request per real-time campaign, two at a time.
- NDBC relays buoys owned by partners. They are stored with the license type `ndbc-partner` and an unknown commercial use.
- A snapshot carries only what the provider shows now: the latest observation for NDBC, two days for CANDHIS. Fetching older history when a user asks for it is not built.
- The worker has no Dockerfile yet.
