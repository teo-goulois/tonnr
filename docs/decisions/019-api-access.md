# 019. An API that asks who calls

Status: decided by Téo on 2026-10-09 and built the same day. Amended the same day by [decision 020](020-admin-and-developer-accounts.md) on four points: a key belongs to a developer account, the keys are the instance's and not their maker's, what runs the instance takes a request from the admin's site, and a key's last use is written with the counts of calls. Decision 020 also gives a developer account a limit. Not built: a limit on what an account calls with its session, a way for a phone app to sign in, and a way to close sign-up.

## Context

The API answered anyone. Whoever found its address could read every route, and each call to the forecasts spent some of what the instance may ask its forecast provider in a day.

Téo wants every call to have a name on it: an account for a person, a key for a program. He wants to be the only one who makes keys. And decision 016 left the private list of breaks without a reader, because nothing could tell the operator from anyone else.

## Decision

- Every procedure asks who calls. The health check answers anyone, and so do sign-in and the reference: the spec and its page.
- A caller is an account, known by the session cookie that sign-in gives, or a program, known by an API key in `Authorization: Bearer`.
- Anyone can still create an account. Only an operator of the instance makes keys.
- A key reads the data everyone shares: stations, forecasts, tides, maps, the catalogue of breaks, and a spot its owner made public. It never stands for an account. Spots, lists, notifications and preferences take a session.
- A request that carries an `Authorization` header is judged on it alone. A header that is not one working key is refused, even beside a good session.
- An operator is an account listed in the table `operator`. No procedure writes that table. `job operator <account id>` does, from the server.
- That command takes the account's id, which the account reads, signed in, at `GET /v1/account`. It does not take an address: the instance does not check addresses, so whoever registered the owner's address first would be made operator in his place.
- A key is 32 random bytes. It is shown once, when it is made, and stored as its SHA-256. A list shows its first eight characters.
- An operator lists and revokes keys with their session: the keys they made, until decision 020 gave every operator all of them. A key cannot make, list or revoke keys.
- A key works while it is not revoked and its maker is an operator. `job operator-remove` revokes the maker's keys for good: they stay dead if the account is made an operator again.
- The private list of decision 016 is read by an operator's session, at `GET /v1/private-breaks`, and by nothing else. No key reads it: a key is made to be handed to a program, and can be handed on.
- A write that arrives with a cookie has to name a site the API trusts, in `Origin` or else in `Referer`: the web app's address, or the API's own. One that names another site, or none, is refused, so that a page elsewhere cannot write with a visitor's session. A script that writes with a session sends `Origin` itself.
- Every answer says `Cache-Control: private, no-store`: it was given to one caller.
- In the web app, `/app` takes a signed-in account.

## Rejected

- **A key for every account.** Téo wants to know each program that calls, so he hands the keys out himself.
- **A key that acts as its maker.** Whoever receives it could read the maker's spots and notifications, and delete them.
- **Naming the operator by address.** See above.
- **The sign-in library's API-key plugin.** It ties a key to a user's account, and here a key must carry no account. The table and the forty lines that check a key are less than the plugin.

## Consequences

- Sign-up is open, so anyone can create an account and read the shared data with its session, from a script as well. A key does not keep strangers out: it lets a program call without an account's password, and lets Téo know which program calls.
- Nothing limits how often an account calls. Decision 020 limits the keys of a developer account.
- A client that called without a name gets 401. No version of the API was released under decision 003, so nothing was promised to it.
- No cache between the API and its callers may keep an answer, where decision 003 expected one to.
- An instance without an operator works for its accounts. It has no key, and nobody reads its private list.
- A sign-up answer still tells whether an address has an account.
- While a new version starts, the one it replaces still answers anyone, until it stops.
- How a phone app signs in is not decided. It will not be with a key.
