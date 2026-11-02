# 080. What the app for phones keeps to read without network

Status: asked by Téo on 2026-11-02: a buoy or a spot read at home should still show at a beach with no network. It adds to [decision 069](069-an-app-for-phones.md) what the app keeps on the phone, and to [decision 070](070-signing-in-from-the-app.md) what signing out forgets.

## Context

The app held what the API answered in TanStack Query's memory, for five minutes after a screen stopped reading it, and lost it when the system closed the app. A sheet opened without network then showed nothing. One that was open and asked again showed "not found" for a break or a spot, because a failed refresh read as a missing place.

A surfer reads the forecast the evening before, and opens it again at the beach at dawn, often with no network and often after the system closed the app.

## Decision

- The app keeps the answers of `KEPT_PROCEDURES`, in `apps/native/src/lib/kept-answers.ts`: the forecast, the tide, a station and its readings, the stations and the breaks of the map, a break, its guide and how big its waves run, and the account's spots and lists, which lead to them. It keeps nothing else of the account, and nothing that changes with what is typed. A procedure that is added there is typed against the router.
- `apps/native/src/lib/answer-store.ts` writes each of those answers as it comes, into a SQLite database of its own in the phone's cache, which no backup takes. It is TanStack Query's per-query persister (`experimental_createQueryPersister`), given to every query of the client in `src/utils/orpc.ts`. A query that has nothing in memory reads its kept answer first, shows it, and asks the API for a newer one when it is older than its minute. The newer one takes its place.
- An answer is written as oRPC's transport writes it, so that its dates stay dates.
- The phone forgets an answer a week old, and the oldest ones beyond 32 MB, each time the app starts and every 25 answers it writes. `KEPT_VERSION` changes when the app reads an answer that one kept by an older version could not give. Then the phone forgets them all once. A version of the API only adds to what it answers ([decision 003](003-api-versioning.md)), so an update of the app's JavaScript does not throw them away. An update applies at the start after it downloads, which can be the start at the beach.
- A tide does not change with the day it was asked for. When the API cannot be reached, the tide kept at the same point stands for the span asked, cut to it. A tide read the evening before then shows the morning's.
- An answer in hand stands until the API says that what it asked is gone: `isGone` there. A break, a spot, a station, a list or a session's place shows what was kept when the network fails, and says "not found" only on the API's `NOT_FOUND`, or with nothing in hand.
- A place's sheet says when its forecast or its readings could not be read again, and when they were read: "No connection · updated 3 hr. ago" when the network did not answer, "Couldn't refresh" when the API refused.
- The queries still do not know whether the phone has network: one asked without it fails, and shows what was kept. A query that waits for the network would not read the kept answer, which the persister reads inside the query's own fetch. When `expo-network` says the network came back, the queries in view that are not new are asked again.
- Signing out, deleting the account and another account signing in forget every kept answer, as they empty the memory: `forgetOnPhone`. An answer that comes for a query the client already let go of is not written.
- `/privacy` says it, in every language.

## Rejected

- **Keeping the whole cache in one value** (`PersistQueryClientProvider`). It writes everything at each change. The buoys alone are 380 kB, and each view of the map adds half a megabyte, so the phone would write megabytes every second while the map moves.
- **TanStack Query's `onlineManager` fed by `expo-network`.** Without network, a query would wait and never read what was kept. With `networkMode: "offlineFirst"` it would read it, but a screen with nothing kept would wait in silence instead of saying it failed, and some fifty screens would each need to tell that apart.
- **Busting the kept answers at each update.** It throws away the answers on the very start the person is at the beach.
- **The phone's `localStorage`.** It is the same SQLite, but read on the JavaScript thread, and it is not a cache: the backup would take it, and the system would never empty it.
- **Keeping it in the web app.** A browser reads the web from a network.

## Consequences

- A sheet opened without network shows the last forecast, readings, tide and guide the phone read for that place, within the week, with the line that says when they were read. The map draws the buoys, the account's spots and the breaks and wind stations of a view it already showed.
- The sea's colours and arrows are drawn from tiles the app asks as the map moves, and the basemap is MapLibre's own cache. Neither is kept by this decision.
- Writing and reading an answer runs on SQLite's own thread. Only serializing it runs on the JavaScript thread: a few milliseconds for the buoys.
- `@tanstack/query-persist-client-core` is pinned to the version of `@tanstack/react-query` in force, so that both share one `@tanstack/query-core`. A bump of one bumps the other.
- It is JavaScript alone. An update of the app's JavaScript brings it to builds already installed.
