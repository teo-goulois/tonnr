# 020. An admin app, developer accounts, and counted calls

Status: decided by Téo on 2026-10-09. It amends decision 019 on four points, named below.

Not deployed: no stage has an admin app yet. Not built: a console where a developer reads their own keys and calls, a record of what each operator changed, a limit on what an account calls with its session, a limit on calls made with a key that no longer works, and a budget of calls to the forecast provider. Téo left for later, the same day: checking an account's address, moderation, and closing sign-up.

## Context

Decision 019 gave the operator keys to hand out, and nothing to run them with: a key was made with `curl`, belonged to the operator who made it, and only said when it was last used. Nothing counted the calls, and nothing limited them.

Téo wants an admin app. In it he creates a developer account for whoever consumes the API, manages the keys of that account, and sees how much it calls. He also wants a limit on the calls and the list of the accounts that signed up.

Other APIs settle the question the same way once they have grown: a key belongs to an entity of its own, an account or a project, and not to a person who signs in. People leave, and programs stay.

## Decision

### Developer accounts

- A developer account is a row of the table `developer`: a name, a contact, a note, and a limit. The operator creates it for whoever consumes the API. It has no password and no session, and it is not one of the accounts that sign in.
- A key belongs to one developer account, for good. The operator makes it there and hands it over. Replacing a key keeps the account, its limit and its history.
- A key still reads the data everyone shares and nothing else. It never stands for an account that signs in, and decision 019's two refusals hold.
- An operator suspends a developer account, and resumes it. While it is suspended none of its keys works. A revoked key still never works again.
- A key works while it is not revoked, its developer account is not suspended, and its maker is still an operator.
- The developer accounts and the keys are the instance's: every operator lists them all, and revokes any key. This amends decision 019, where an operator saw only the keys they made. A key still records who made it, and `job operator-remove` still revokes the keys its account made: that account read them.
- An operator deletes a developer account, with its keys and their counts. That is how a contact is erased, and how a mistake is undone.
- The keys that exist when this arrives go to a developer account named after their maker, one for each maker.
- A key may have no developer account: the version before this one makes such keys, and decision 009 lets it run while this one starts. Such a key works by decision 019's rules, has no limit, and is listed apart, where an operator revokes it. A later version will give each of them an account and refuse a key without one.

### Counted calls

- The API counts each time a procedure that asks who calls is run. The health check, sign-in and the reference are not counted. Neither is a request that reaches no procedure: an address that is no route, or a body that cannot be read.
- A call to what runs the instance is not counted once its caller is accepted: an operator who reads the counts does not add to them. One that is refused is counted like any other.
- A count is a row of `api_usage`: the hour, who called, the procedure, what came of it, and how many calls. The hour is UTC's.
- Who called is a key, the accounts as a whole, or no one. A call with a session is counted with all the others of its kind, never under its account. A call that names a key the instance knows is counted under that key, even revoked or suspended. A call with no name, or with a key nobody made, is counted under no one.
- The procedure is named by its place in the router, such as `v1.stations.list`, whichever of the two transports carried the call.
- What came of it is one of five words:

  | Word       | The procedure                                                              |
  | ---------- | -------------------------------------------------------------------------- |
  | `answered` | returned its answer                                                        |
  | `refused`  | did not accept the caller: `UNAUTHORIZED` or `FORBIDDEN`                   |
  | `limited`  | refused a call over the limit: `TOO_MANY_REQUESTS`                         |
  | `invalid`  | refused the request for another reason of the caller's: a status below 500 |
  | `failed`   | failed for a reason of the instance's: a status of 500 or more, or a fault |

- Nothing else is kept of a call: no address, no agent, no time finer than the hour, and nothing of what was asked.
- The counts are for reading, and they are approximate. The API adds the calls up in memory and writes them every thirty seconds, each row added to what the table holds. No call waits on that write. A write that fails loses the counts it carried, and says how many in the log: sending them again could count them twice. An API that is killed loses the calls of its last thirty seconds, and one that is stopped writes them first.
- That same write notes the minute each key was last used while it worked. This replaces the write that decision 019 made on a key's call.
- A row is deleted thirteen months after its hour. The API does it when it starts and each time the hour turns.

### The limit

- A developer account has a limit of calls in an hour, shared by its keys, or none. The hour is UTC's.
- The limit does not read the counts above. Each call made with a working key adds one to a row of `developer_calls`, the account's for the hour, in the statement that finds the key. The database refuses the addition once the row holds the limit, so the limit holds across several API processes and across a restart.
- This is one write for each call made with a key. It replaces the read and the write that decision 019 made there. A call with a session writes nothing.
- A call is counted when it is let in, whatever comes of it. A call that the limit refuses is not counted, and neither is one made with a key that does not work.
- A call over the limit gets `429` with `Retry-After`, the seconds left in the hour.
- The limit shares the API fairly between those who consume it. It does not keep the instance within its forecast provider's allowance: an account calls with its session without a limit, and a call is not a provider's call.
- The admin proposes 100 calls an hour for a new account. The operator sets another number, or none.

### The admin app

- The admin is an app of its own, `apps/admin`, at an address of its own. It has the web app's stack: TanStack Start, the components of `packages/ui`, the Tonnr theme, and its messages in English and in French. It deploys to Cloudflare as the second app of a stage of decision 021: `pnpm run deploy:admin <stage>`, for a stage that names a host for it in `ADMIN_DOMAIN`. A stage that names none has no admin app, and deploys as it did before.
- It shows the developer accounts with their keys, the calls by hour and by day, by developer account, by key and by procedure, and the accounts that signed up, with their name and address. It only reads those accounts.
- A day is the reader's. The counts are by UTC's hour, so a day is exact where the clock is a whole number of hours from UTC, and off by part of an hour elsewhere.
- It is built for a wide screen first and stays usable on a phone. Decision 014's rule of the phone screen is for `/app`, which a mobile app will follow: the admin has no mobile app to come.
- An operator signs in to it with the account and the session of the web app. The admin creates no account. To an account that is no operator it shows the account's id and the command that makes it one.
- The API learns the admin's address from `ADMIN_ORIGIN`, which is optional. It then lets that site sign in and call, as it does the web app's. The address must not be the web app's.
- The session cookie is the API's. A browser sends it from the admin only when both addresses belong to one site, such as `admin.example.org` and `api.example.org`.

### Who may run the instance

- What runs the instance is built on `adminProcedure`: the developer accounts, the keys, the counts, and the list of accounts. It takes an operator's session, as `operatorProcedure` does, and one thing more: the request must say that it comes from the admin's site, in `Origin` or else in `Referer`.
- The admin's site is `ADMIN_ORIGIN`. An instance that sets none has no admin app, and its admin's site is the API's own address.
- A request that names the web app's site is refused there, the operator's too. A fault in the web app's pages, which draw what data providers and users wrote, then cannot make a key or read the accounts with the operator's session.
- A request that names no site is refused as well. A script holds its cookie itself, and sends `Origin` on these calls as it already does on a write.
- This rests on what a browser does: it names the site on every call whose answer a page of another site can read, and on every write. And on the transports: the one the apps use takes a write by `POST` only.
- The private list of decision 016 stays on `operatorProcedure`: the web app shows it to its operator.

## Rejected

- **An account that signs in, promoted to developer.** It ties a key to a person and to an address the instance does not check, and it would put the operator's own programs under their personal account. A sign-in can be tied to a developer account later, once addresses are checked.
- **A key for every account, made by its holder.** Decision 019 refused it, and Téo still hands the keys out himself.
- **A record of each call.** It costs a write on every call and keeps an address for each, which is personal data to protect, to announce and to delete. The counts answer what Téo asked.
- **Counts by day.** A day in UTC is not the operator's day.
- **A limit read from the counts in memory.** Two calls that arrive together both pass, a restart forgets the hour, and two processes each give the whole allowance. Writing the counts again after a doubtful failure would count calls twice, and refuse an account that is under its limit.
- **PostHog, Téo's default for analytics.** These counts are a part of the product, and an instance that someone else hosts must have them without an account elsewhere. Measuring how people use the apps is another question, not decided here.
- **A part of the web app reserved to operators.** Nothing to deploy and nothing to configure, but the admin would share the site of the pages that draw other people's data, and the API could not tell one from the other.
- **Limiting each key.** Two keys would give twice the allowance, and the limit would have to be set again at each replacement.
- **A window that slides.** The clock's hour is the hour the counts already have, and the limit shares an allowance: it is not a rate by the second.
- **Accepting a request that names no site.** A page at the API's own address, such as the reference, reads the answer to such a request.

## Consequences

- `POST /v1/keys` now takes the developer account, and every call to what runs the instance names its site. A script written for decision 019 has to change on both points. `docs/self-hosting.md` shows how.
- While a new version starts, the one it replaces knows no developer account: a key it makes has none, and it still takes the keys of an account that was just suspended.
- A calendar hour lets through twice the limit across its turn: the end of one hour, then the start of the next.
- A key used in the last thirty seconds may not show it yet, and the counts on screen are that late. The calls an account has left in the hour are exact.
- A key's hourly counts show when a developer account calls and what it asks for. They are the operator's to read, and they are not anonymous.
- An operator reads the name and the address of every account. `docs/self-hosting.md` says so.
- The log of the API no longer writes what follows `?` in an address, nor the request that a procedure refused: both could hold an address someone typed.
- Nothing records which operator changed a limit, suspended an account or deleted one. A key records who made it and when it was revoked.
- A key that no longer works still costs the instance a read at each call, and nothing limits those.
- Deleting the account of an operator still deletes the keys it made, and their counts with them.
- The admin is a second site to deploy and to name in the API's settings. Decision 021 gave the API one web origin and refused a list of them: the admin's is a second address, one, named by whoever hosts the instance, and on the API's site. It is not a way to let a page on a developer's machine call an instance online, and decision 021's reason against that holds for the admin too.
- Putting the admin online takes three things in this order: the API at a version that knows `ADMIN_ORIGIN`, that value set to the admin's address, and the admin deployed at that address. Until then the admin answers nobody's sign-in.
- A stage that had an admin app and stops naming its host leaves the stack without it, and its Worker in place: by Alchemy's source, a deployment of one app touches no other, declared or not. That is read, and not tried. Nothing takes the admin's Worker down, as nothing takes a stage down: decision 021.
- The admin and the web app share one sign-in. Signing out of one signs out of the other.
- On an instance without `ADMIN_ORIGIN`, the pages at the API's address may run the instance: the reference is one, and it loads its script from a CDN. Its version is now pinned. An operator who wants that page kept apart sets `ADMIN_ORIGIN`.
