# 053. What one caller may ask of the forecasts, and an instance that keeps up under a sweep

Status: asked for by Téo on 2026-10-15, before the release, after an audit of what the instance asks its providers and what could make it ask too much. Codex (gpt-6.1-sol) challenged the audit and found the loop at the poles. It amends [decision 019](019-api-access.md) and [decision 039](039-visitors.md), which limited nothing an account or a visitor calls, [decision 023](023-forecasts-kept.md), which left "a limit on what one account asks" unbuilt, [decision 037](037-finer-wave-model.md), which bounded the store's pieces by their weight and read them beside Open-Meteo, and the retries of `packages/upstream`. Built the same day. Not built: a limit on the calls themselves, which decision 020 keeps to the keys.

## Context

The budget of decision 023 holds the quota of the forecast provider for the instance as a whole. It does not hold the service: one caller sweeping distinct cells spends the day's share for the people who look in an hour or two, and the instance then closes to visitors until midnight UTC, and answers the accounts with older forecasts or 503. An account, a visitor, the link of a shared list and an assistant signed in as an account could each do it, with no limit of their own.

Four smaller things could make the instance ask more than it meant to. A forecast asked for at a pole never answered: the search of the store's cells near the point counted columns beyond what a number counts by one, and the loop never ended, holding the whole process. The stores of Copernicus Marine were read beside Open-Meteo, so a question the budget refused still asked them, two points that needed one piece at the same moment fetched it twice, and a store that failed was asked again by every cold forecast, each waiting ten seconds on it. A forecast that the provider answered too short was written and then asked for again at every question. And `packages/upstream` tried a request again after a 429, which is the answer that asks it not to.

The web app asked the API who was signed in at every navigation, so at every press on the map.

## Decision

### A caller's hour

- A question of the forecasts is counted to its caller, by the hour, in UTC: `GET /v1/forecasts`, `POST /v1/alerts/preview`, and a session of the log that reads what the sea did. Each is one question, whatever it costs the provider: a forecast that is kept costs nothing, and the question is counted the same.
- An account may ask 600 in an hour, the link of a shared list 300, and a visitor 300. A visitor is known by the address the request comes from, as the proxy says it: `X-Real-IP`, else the last address of `X-Forwarded-For`, else the connection's. A household or an office shares one. A visitor whose address nothing says is counted with every other such visitor.
- A key is not counted here: decision 020 holds it to its developer account's limit.
- The question is counted before it is asked, in the table of decision 023's counts, under a name of its own, in one transaction, as the budget is: the limit holds for every process of the API together. The nightly job prunes the rows with the budget's.
- Past the limit the answer is 429, with `Retry-After` saying when the hour turns. The numbers are written in the code, beside the budget: `packages/api/src/forecast-callers.ts`.

### A store read once, after the provider

- The two stores of Copernicus Marine are read once Open-Meteo has answered. A question the budget refuses, or that the provider fails, asks nothing of them.
- The pieces of a store are kept in the program's memory by their number, 48 at most, for half an hour: two points that need one piece at the same moment share its fetch. The layout is kept an hour the same way.
- A store that could not be read, or took longer than the ten seconds a point waits, is left alone for a minute. The forecasts of that minute go without it.
- The cells near a point are searched inside the grid alone, however many a reach would cover: at a pole, none.

### A short forecast, and a refusal

- A forecast that does not cover the day is asked for again after ten minutes, not at every question. Meanwhile the questions it covers are answered from it, and the others refused, as before.
- `packages/upstream` tries a request again after a network failure or an error of the provider's. Not after a 429: the provider asked not to.

### The web app

- The route of `/app` keeps the session it read for a minute, and asks the API again after it, or as soon as someone signs in or out.

### The admin

- The overview of the admin app starts with the instance in a glance: the accounts, with those active this week and the new ones, the calls of the last twenty-four hours by kind of caller, the day's forecast budget, whether the map opens to visitors, and whether the worker runs with its jobs on time. `GET /v1/instance/overview` answers it.

## Rejected

- **A limit on the calls themselves, for an account or a visitor.** The forecasts are what a caller spends for everyone; the rest of the API reads the database. Decision 020 limits the keys, and the counts under `visitor` and `session` show whether more is needed.
- **Counting a caller's requests to the provider, not their questions.** The provider is asked deep in `packages/conditions`, which knows no caller. A question is counted where the caller is known, and a forecast that is kept answers it for nothing.
- **A limit by account in the sign-in library.** Its limit is by process and in memory, and covers its own routes alone.
- **Keeping Copernicus beside Open-Meteo, and giving up the stores when the budget refuses.** Simpler to ask them after: a cold forecast takes a few tenths of a second more.
- **Not writing a forecast that came out short.** The questions it covers would go unanswered, and the provider asked again at once.

## Consequences

- A caller that sweeps cells is stopped at a few hundred questions an hour: with the hour's budget of 4,000 requests shared by all, the day's share takes several addresses or accounts to spend.
- A person who looks at spots all day does not meet the limit: ten forecasts a minute for an hour would.
- Behind a proxy that does not set `X-Real-IP` or `X-Forwarded-For`, every visitor shares one address and one limit: `docs/self-hosting.md` says what a proxy must do.
- A cold forecast inside the fine zone reads the stores after the provider: about 0.2 s later than before.
- The route of `/app` learns of a session that ended elsewhere a minute late, at most: the API refuses what the session no longer allows all the same.
