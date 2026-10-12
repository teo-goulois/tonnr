# 035. A list shared by a link

Status: accepted on 2026-10-12. Téo asked for it that day: from the lists, "share a list: it makes a link one sends to friends", who then "have a map with only the spots, buoys and so on that the list holds", and a password one may put on it. Asked whether a friend needs an account, he answered: "no, the link is enough, but with the possibility for the friend to create an account and see the shared list among their lists."

## Context

A spot is its owner's alone (decision 034), and so is a list (decision 017). The product vision wanted a spot "shared with chosen people", by an invitation on each spot, and nothing of it was built.

Surfers share places a few at a time, with people they trust: a list is that. And the people they send it to have no account yet.

Decision 019 gives every call a name: an account, or a key. A friend with a link is neither.

## Decision

- The owner of a list shares it with `PUT /v1/lists/{id}/share`, which makes its link: sixteen random bytes, kept as they are in `station_list_share`, so that the owner copies the link again. The web app's address for it is `/l/<token>`.
- Whoever has the link reads the list: its name, its stations and its breaks by their ids, and the owner's spots in it, whole. Nothing else answers a spot to anyone but its owner. They read, and change nothing.
- A link is a third kind of caller. A request that carries `Authorization: List <token>` is judged on it alone, as a key is: it reads what everyone shares (stations, breaks, forecasts, tides, the map of the sea), and nothing of an account. The web app sends it for a visitor who is not signed in, so that the friend gets the map itself, with the list alone on it.
- Its calls are counted under `link`, all lists together.
- The owner may ask a password of whoever opens the link: at least four characters, kept as its scrypt. `POST /v1/shared/open` answers `locked` until it is given one. With the list it answers a pass, the SHA-256 of the link and of what is kept of the password, which the reader sends from then on: `List <token>.<pass>`. A new password or a new link ends it.
- A link takes ten wrong passwords in a quarter of an hour, then none for the rest of it, the right one either. The count is in the database.
- An account that has the link may keep the list: `POST /v1/shared/join`. It then reads it without the link, at `GET /v1/lists/{id}/view`, and `GET /v1/lists` names it under `joined`. It lets go of it with `DELETE /v1/lists/{id}/membership`. An account keeps fifty lists of others, and a list is kept by a hundred accounts.
- The owner gives the list a new link with `POST /v1/lists/{id}/share/renew`: the link before opens nothing, and the accounts that kept the list still read it. `DELETE /v1/lists/{id}/share` ends it for all of them.
- The web app shows a list alone on the map: its own (`/app?list=<id>`), one that was kept, and one opened by its link (`/app?shared=<token>`), which is the one page of `/app` that takes no account.
- A reader may copy a shared spot into their own: it is then a spot of theirs, with the name, the point and what was said of it, and they set their own alert on it.
- The web app says, where a list is shared, how many private spots it will show to whoever has the link.

## Rejected

- **Procedures of their own for a link's reader**, one for the forecast at a point of the list, one for its tide, and so on. The web app would need a second map and a second panel for them. A link that calls as an account does reuses every screen.
- **An account for every reader.** Téo wants the link to be enough: a friend who must sign up first does not open it.
- **A link kept as its hash.** The owner could not copy it again, and the database it would be hidden from holds the list itself.
- **The password asked when a list is created.** A list that is not shared is its owner's alone, and a password would keep nobody out of it. It is asked where the list leaves the account.
- **Sharing a spot by an invitation of its own**, as the product vision assumed. A list of one spot does it.

## Consequences

- A link that leaks reads the shared data of the instance without an account, forecasts too, which spend some of what the instance may ask its provider. Sign-up is open, so an account does as much. The owner ends a link by a new one.
- Nothing limits how often a link calls, as nothing limits an account (decision 019).
- A reader can copy what they read, and a copied spot is theirs: they may ask to make it public. The moderation's count of other accounts that keep a spot at the same place (decision 034) is what tells the operator.
- The owner sees how many accounts kept the list, not who. A reader without an account leaves no trace but the count of calls.
- A list that is deleted takes its link and its members with it. An account that is deleted leaves the lists it kept.
- The pass is kept in the browser's storage, by link. Whoever uses that browser reads the list.
