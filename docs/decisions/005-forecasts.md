# 005. Forecast source

Status: accepted on 2026-10-08. Decision 023 changed how a forecast is kept and what the instance asks of the provider: read it for both.

## Context

The first release shows swell and wind forecasts for any point, and later for each saved spot. Running wave models, or decoding their gridded output, needs tools that TypeScript lacks.

## Decision

Forecasts come from Open-Meteo: its marine API for waves and swell, its weather API for wind. `GET /v1/forecasts` merges the two hour by hour.

- The API fetches a forecast when it is asked for one and keeps the answer, per 0.05° cell. Nearby points share an answer. Decision 023 says where it is kept and for how long: in the database, fresh for two hours.
- `packages/conditions/src/forecasts/open-meteo.ts` is the only module that knows the source.
- Every request to a provider, from the API or the worker, goes through `packages/upstream`, which sets the user agent, the timeout, and the retry policy. A request for a forecast is tried again once at most, and counted each time: decision 023.

## Why this is allowed

Open-Meteo's free API is for non-commercial use: private or non-profit sites and apps without subscriptions or advertising. Tonnr fits while it stays free and without ads. The data is CC BY 4.0, so the API returns the attribution with each forecast and marks commercial use as not allowed. The provider asks for a credit to DWD, the German weather service, beside its own, for the wave forecast: the attribution names both.

## Consequences

- The free tier allows 10,000 calls a day, 5,000 an hour, 600 a minute, and 300,000 a month. A forecast costs two calls, and more when one is tried again. The instance counts them and stays at four fifths of each limit: decision 023.
- A commercial Tonnr needs Open-Meteo's paid API or its own copy of the models.
- Open-Meteo says its accuracy near the coast is limited.
- A cell keeps its last forecast and no other. Comparing a forecast with what happened needs every forecast as it was issued, kept for the points that matter. That is not built.
- `pastDays` adds up to two days before today to an answer. Their hours are what the models last computed for them, so a panel can draw the model beside a buoy's readings. They are not the forecast as it was issued, and say nothing of how good a forecast was.
