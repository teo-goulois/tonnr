# 039. An app open to visitors, which the operator may close to them

Status: accepted on 2026-10-12. Téo asked for it that day: "I would like no more restriction to an account, and that it be open to everyone. But if I want, when demand is strong, I would like a login wall with a message: a lot of demand right now, sign in or create your account to get in." It amends [decision 019](019-api-access.md), which gave `/app` to a signed-in account alone, and [decision 035](035-shared-lists.md), for which a shared list was the one page of `/app` that took no account. Not built: a limit on how often a visitor calls, and an instance that closes by itself.

## Context

Since decision 019 every call has a name: an account, a key, and since decision 035 the link of a shared list. Whoever opened `/app` with none of them was sent to the sign-in form, so a person who followed a link to the product met a form before they saw a map.

The web app already drew the map for someone with no account. It did so before decision 019, and again for the reader of a shared list: a panel that needs an account asks for one where it is needed.

Two things stood in the way. The API answered no request without a name. And a visitor costs something: each forecast that is not kept yet spends some of what the instance may ask its provider in a day (decision 023).

## Decision

- A visitor is whoever opens the web app with no account. `/app` takes them: the map, the buoys, the wind stations, the breaks of the catalogue, the forecasts and the tides. What belongs to an account still takes one: saving, spots, lists, alerts, and the search of places.
- The API answers a visitor: a request that carries no `Authorization` header and no session, and that names the web app's site in `Origin`, or else in `Referer`. It reads what a key reads, and nothing else.
- A request without a name that comes from anywhere else gets 401, as before. A program calls with a key.
- An operator closes the instance to visitors and opens it again: from the admin's page of the instance, or with `PUT /v1/visitors`. Each change is recorded with what else an operator does.
- Closed, the API answers a visitor 401, with `visitors: closed` in the error's `data`. The web app then shows, in place of the map, that a lot of people are here, with the form that signs in or creates an account. Whoever signs in there is at the address they were going to.
- It takes effect at each visitor's next call. The API reads the state at every call of a visitor, and a page that was open shows the wall as soon as it is refused.
- Closed, the instance answers the accounts, the keys and the links of shared lists as before. A link is still enough to read its list.
- `GET /v1/visitors` says whether the instance answers visitors, to anyone. The web app asks it before it draws the map.
- An instance answers visitors until an operator closes it.
- A visitor's calls are counted under `visitor`, all together, apart from the calls that name no one and come from elsewhere.

## Rejected

- **A variable of the environment.** Closing would take a new deployment of the API, minutes after the moment it was needed, and not from a phone.
- **An instance that closes by itself**, past some count of calls or some share of the forecast budget. Téo wants to decide. Nobody knows yet which number would say that demand is strong: the counts under `visitor` will show it.
- **An API that answers anyone, whatever `Origin` says.** A program would call without a key, and the developer accounts of decision 020 would have no limit worth the name.
- **Sending a visitor to `/login`.** The address they were going to would be lost, and the page could not say why it asks.
- **The state kept in the API's memory for some seconds.** Each process would close at its own moment. One row read by its key costs less than what the call goes on to read.

## Consequences

- Anyone reads the shared data of the instance through the web app, forecasts too, and leaves no name. Closing the instance is what its operator has against it.
- `Origin` is no secret. A program that writes the web app's address there reads as a visitor does, with no key and no limit. It shows in the counts under `visitor`, and closing the instance stops it.
- Nothing limits how often a visitor calls, as nothing limits an account (decision 019).
- The wall keeps out whoever will not make an account, and nobody else. Sign-up is open, and an address is checked only on an instance that sends mail (decision 026).
- A visitor whose page is open when the instance closes loses the map at their next call. Nothing of theirs is lost: a visitor has saved nothing.
- A visitor's units and layers are kept by their browser, as they were for the reader of a shared list.
- Each call of a visitor reads one row more.
- The web app of this decision needs the API of this decision. An older API answers 401 to every call of a visitor, and says nothing of a wall: deploy the API first.
