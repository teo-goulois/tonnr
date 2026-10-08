# 005. Forecast source

Status: accepted on 2026-10-08.

## Context

The first release shows swell and wind forecasts for any point, and later for each saved spot. Running wave models, or decoding their gridded output, needs tools that TypeScript lacks.

## Decision

Forecasts come from Open-Meteo: its marine API for waves and swell, its weather API for wind. `GET /v1/forecasts` merges the two hour by hour.

- The API fetches a forecast when it is asked for one and keeps the answer for an hour, per 0.05° cell. Nearby points share an answer.
- `packages/conditions/src/forecasts/open-meteo.ts` is the only module that knows the source.
- Every request to a provider, from the API or the worker, goes through `packages/upstream`, which sets the user agent, the timeout, and the retry policy.

## Why this is allowed

Open-Meteo's free API is for non-commercial use: private or non-profit sites and apps without subscriptions or advertising. Tonn fits while it stays free and without ads. The data is CC BY 4.0, so the API returns the attribution with each forecast and marks commercial use as not allowed.

## Consequences

- The free tier allows 10,000 calls a day, 5,000 an hour, and 600 a minute. A forecast costs two calls. The cache is in memory, so it empties when the API restarts and is not shared between instances.
- A commercial Tonn needs Open-Meteo's paid API or its own copy of the models.
- Open-Meteo says its accuracy near the coast is limited.
- Forecasts are not stored. Comparing a forecast with what happened, and alerts on a spot, need the worker to fetch and store them per spot. That is not built.
