# 039. An app open to visitors, closed to them while demand is strong

Status: accepted on 2026-10-12. Amended on 2026-10-15 by [decision 053](053-what-one-caller-may-ask.md): a visitor, known by their address, may ask so many questions of the forecasts in an hour. Téo asked for it that day: "I would like no more restriction to an account, and that it be open to everyone. But if I want, when demand is strong, I would like a login wall with a message: a lot of demand right now, sign in or create your account to get in." It amends [decision 019](019-api-access.md), which gave `/app` to a signed-in account alone, and [decision 035](035-shared-lists.md), for which a shared list was the one page of `/app` that took no account. Amended the same day: Téo asked whether a number could say that demand is strong, and the instance now closes by itself at one. Not built: a limit on how often a visitor calls, and a way for an operator to keep the instance open past that number. [Decision 069](069-an-app-for-phones.md) amended it on 2026-10-19: a visitor is also whoever opens the instance's app for phones with no account, which names its origin in `expo-origin`.

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
- An instance answers visitors until an operator closes it, or demand is strong.
- Demand is strong once the instance has sent, in a day, four fifths of the requests it lets itself send its forecast provider for the people who look: 4,400 of the 5,500 of decision 023. The instance then closes to visitors by itself, as if an operator had, and the last fifth is left to the accounts.
- It opens again by itself when the day turns, in UTC, as the count does. Nothing is written and nothing runs: the API reads the day's count at each call of a visitor, beside the operator's word.
- An operator's closing holds whatever the count says. An operator who opens the instance while demand is strong is told that it stays closed until the day ends.
- The number is written in the code, as the budget it is a part of: it is no setting.
- A visitor's calls are counted under `visitor`, all together, apart from the calls that name no one and come from elsewhere.

## Rejected

- **A variable of the environment.** Closing would take a new deployment of the API, minutes after the moment it was needed, and not from a phone.
- **Strong demand as a number of calls to the API.** Nobody knows yet how many the server takes: the counts under `visitor` will show it. What the instance may ask its forecast provider is the one limit it already counts, and the one a visitor spends for everyone.
- **The hour's count as well as the day's.** The API and the worker share it, so the worker's look at the alerts, every three hours, would close the instance to visitors with nobody there. The hour's own limit already stops a burst.
- **A wall that falls before the day ends.** The requests it kept back would be spent in the hour that follows.
- **An API that answers anyone, whatever `Origin` says.** A program would call without a key, and the developer accounts of decision 020 would have no limit worth the name.
- **Sending a visitor to `/login`.** The address they were going to would be lost, and the page could not say why it asks.
- **The state kept in the API's memory for some seconds.** Each process would close at its own moment. One row read by its key costs less than what the call goes on to read.

## Consequences

- Anyone reads the shared data of the instance through the web app, forecasts too, and leaves no name. The instance closes to them at four fifths of its day, and its operator may close it before.
- An instance that closes by itself stays closed until midnight, UTC's, which is one or two in the morning in France. A visitor who comes that evening meets the wall.
- The number says what the instance spent, not who spent it: a day when the accounts alone ask 4,400 requests closes the instance to visitors too.
- A forecast that is kept costs nothing, so many visitors who look at the same places are not strong demand. A few who look everywhere are.
- An operator cannot keep the instance open past the number. The day's last fifth would go to visitors, and then nobody would get a forecast that is not kept.
- `Origin` is no secret. A program that writes the web app's address there reads as a visitor does, with no key and no limit. It shows in the counts under `visitor`, and closing the instance stops it.
- Nothing limits how often a visitor calls, as nothing limits an account (decision 019).
- The wall keeps out whoever will not make an account, and nobody else. Sign-up is open, and an address is checked only on an instance that sends mail (decision 026).
- A visitor whose page is open when the instance closes loses the map at their next call. Nothing of theirs is lost: a visitor has saved nothing.
- A visitor's units and layers are kept by their browser, as they were for the reader of a shared list.
- Each call of a visitor reads two rows more: the operator's word, and the day's count.
- The web app of this decision needs the API of this decision. An older API answers 401 to every call of a visitor, and says nothing of a wall: deploy the API first.
