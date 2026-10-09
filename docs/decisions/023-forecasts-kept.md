# 023. Forecasts kept in the database, and a budget of calls to their provider

Status: asked for by Téo on 2026-10-09. It amends decision 005, which kept a forecast in the API's memory for an hour, and decision 008, which planned the alerts on whatever forecast came. Not built: the forecast as it was issued, kept to compare it with what happened, and a limit on what one account asks.

## Context

Decision 005 fetches a forecast when it is asked for one and keeps the answer for an hour, in the memory of the program that asked. That memory empties at every restart, so at every deployment. The API and the worker each have their own, so the worker asks again for what the API holds when it checks the alerts.

Nothing limits what the instance asks. Sign-up is open, an account calls with its session without a limit, and each forecast costs two calls of the provider's free tier: 10,000 a day, 5,000 an hour, 600 a minute, 300,000 a month. A call that fails is asked again three times, and counts each time.

Decision 020 limits the keys of a developer account. It says itself that this does not keep the instance within its provider's allowance.

Téo asked why the instance calls the provider at each request rather than calling it once and keeping the answer. It cannot fetch everything once: the provider answers point by point, and the models' full grids need tools that TypeScript lacks, as decision 005 says. It can keep each answer where every program finds it.

## Decision

### Kept in the database

- A forecast is kept in the table `forecast_cell`, one row for each 0.05° cell that was asked for: when it was fetched, and what the provider answered, as columns of numbers with their hours in seconds.
- A row holds one span for every question: two days before the day it was fetched and eight days from it. A question for fewer days is a part of it, cut at read time by the day it is read on. Eight days, where the API gives seven at most, so that a row fetched before midnight still answers after it. The provider counts a request of ten days and nine values as one call, as it does a request of three days.
- What a row covers is read from its own hours, never worked out from when it was fetched. A row that does not cover every question of the day is asked for again, and one that does not cover a question does not answer it.
- The waves and the wind come from two requests. Their hours must be the same, one after the other without a gap, or the answer is refused: two requests sent on either side of midnight do not make one forecast.
- A point has no sea forecast when every wave height of the hours asked for is missing. That is decided on the part that answers the question, so the row of such a point is kept like any other and asked for again when it is no longer fresh.
- A row that cannot be read as the code expects, because the code changed, counts as missing.
- A forecast is fresh for two hours. Models are renewed every hour to every twelve hours. The worker checks the alerts every three hours, so each of its checks reads a forecast fetched since the last one.
- A question finds its answer in three places, in this order: the program's memory, which also makes two questions that arrive together share one fetch. Then the row, while it is fresh. Then the provider.
- The memory never makes a forecast last longer: it keeps a fresh one for ten minutes or until it stops being fresh, whichever comes first, and a forecast's age is checked again each time it answers.
- A forecast's age is counted on the database's clock, which every program shares: the moment a fetch starts is read there, and so is the moment a row is read. Between two readings a program adds the time that passed, which it measures on a clock that only goes forward: setting the machine's clock back makes no forecast younger.
- A fetch that started later wins. Of two programs that fetched a cell at the same time, both return the answer that is kept.
- A row fetched more than two days ago is deleted by the worker's nightly job, so it can stay up to three.
- The API and the worker read and write the same rows. `packages/conditions` still knows nothing about the database: the program gives it three functions, to read a row, to write one, and to spend a call. `packages/db` holds the ones that use Postgres.

### When the provider cannot be asked

- When the provider does not answer, or the budget is spent, a row that is no longer fresh still answers, for a day after it was fetched. The answer says so: `GET /v1/forecasts` and `GET /v1/spots/{id}/conditions` give when the forecast was fetched and whether it is `stale`.
- A stale answer is for someone who looks. The worker plans no alert on one: it leaves the spot's notifications as they are, and counts the spot, whether the older forecast shows a sea there or none. A run with such spots is `degraded`, as decision 022 names it.
- With no row to answer, the answer is `503`.
- After the provider failed to answer, the program asks it nothing for a minute, then lets one question try. A provider fails to answer when it cannot be reached, answers with an error of its own, or says the instance asks too much. A refusal of one question, or an answer that changed shape, stops nothing.
- A stale answer stays a minute in the program's memory, and never past its day. A failure is not kept.

### The budget

- The instance counts each request it sends to the forecast provider, before it sends it, in the table `provider_calls`. A request that is tried again is counted again. The database refuses the count that would pass a limit, in one transaction, as it does for a developer account's limit. So the budget holds for the API and the worker together, and across a restart.
- It counts by the day, the hour and the minute, in UTC, and stays at four fifths of what the free tier allows: 8,000 a day, 4,000 an hour, 480 a minute. 8,000 a day is under the 300,000 of a month.
- The day's budget has two shares. The API may spend 5,500 for the people who look, and the worker 2,500 for the alerts, by its schedule or by hand. Neither spends the other's day. The hour and the minute are counted for both together.
- A request that fails is tried once more, half a second later, and not at all when the provider answered that the instance asks too much.
- The limits are written in the code, beside the provider's addresses. The paid plan has other addresses and a key, so one who pays changes the three together: none is a setting.
- A count is a number of requests the instance let out. It is not what the provider billed: a request that never arrived is counted too, so is one whose caller gave up between the count and the sending, and nothing is taken back.
- `GET /v1/instance` gives the calls of the day against each share, and the number of cells kept. The admin's page shows them.

### The provider's credit

- The provider asks for a credit to DWD, the German weather service, beside its own, for the wave forecast. The attribution returned with a forecast now names both.

## Rejected

- **Fetching every point once.** The provider's API has no "every point", and its grids are not for TypeScript to read.
- **A longer time in memory.** It would still empty at each deployment, and the worker would still not share it.
- **A row for each question**, as the memory's keys were: a cell, a number of days, a number of past days. One cell would be fetched once for the map's panel and once for the alerts.
- **A row without hours for a point with no sea.** Whether a point has a sea forecast depends on the hours asked for, and the provider's answer can change.
- **Keeping every forecast that was fetched.** That is the history the product wants one day, to compare a forecast with what happened. It is a table that grows without end and a product decision: which points, for how long. Here a cell keeps its last forecast.
- **The program's clock for a forecast's age.** Two programs on two machines would not agree on which fetch is the later one, nor on when two hours have passed.
- **Planning alerts on a stale forecast.** Yesterday's forecast would announce a window that today's has taken back, or call one off for want of news.
- **One count for the day.** The worker's first run after midnight could spend it all, and the provider's limits by the hour and the minute would be left to the provider to enforce.
- **Counting two calls for a forecast.** With three more tries for each request, two counted calls were up to eight sent.
- **A setting for the budget.** The API and the worker would each read it, and could disagree. It would also promise that a higher number is enough to use the paid plan.
- **A budget for each account.** It shares the allowance, and does not hold it: enough accounts pass any sum of limits. It is worth having beside this one, and is not built.
- **Counting the calls in `packages/upstream`**, where every call to a provider goes. That package knows nothing about the database, and only the forecasts have an allowance to hold today.

## Consequences

- A forecast can be two hours old where it was one. It can be a day old when the provider is down or the budget is spent, and says so.
- A deployment no longer costs the instance its forecasts.
- The first question for a cell after two hours waits for the provider, as before.
- Two programs that ask for the same cold cell at the same moment both fetch it, and both count. Within one program they share the fetch.
- The worker's share pays for about 150 cells with alerts, each fetched eight times a day with two requests, and for half as many on a day when every request is tried twice. Spots in the same cell share one.
- An account can still spend the people's share in a few minutes. The others then get stale answers or `503` until midnight UTC. The alerts keep their day, and wait when the hour or the minute is full.
- During a deployment the programs of the version before run beside the new ones for a moment, and count nothing. The budget holds once they have stopped.
- The provider counts by the address it sees. Another program that calls it from the same address is outside this count.
- A row is about twenty kilobytes before the database compresses it. A thousand cells are twenty megabytes.
- `fetchedAt` is when the instance fetched, not when the model ran. A forecast fetched a minute ago can come from a run that is hours old.
