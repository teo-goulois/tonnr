# 027. A console for whoever holds a developer account's keys

Status: asked for by Téo on 2026-10-09. Not built: making or revoking a key from the console, asking for a developer account without the operator, and a way for an operator to see the console as a member does.

## Context

Decision 020 gave the operator developer accounts: an entity for whoever consumes the API with keys, with a limit, and the counts of its calls. The one who holds the keys sees none of it. They learn that a key is revoked when it stops working, and that their limit is reached when the API says 429.

A developer account is not an account that signs in. Something must say which account, of those that sign in, may read which developer account.

## Decision

### Who reads a developer account

- An operator names the accounts that may read a developer account: its members. `developer_member` holds a developer account and an account, when it was added, and who added it.
- A member is named by the operator, from the admin, and by nothing else. An account is not made a member because its address is the developer account's contact, checked or not: whoever signed up with an address chose its password, and a checked address says only that someone who reads its mail followed a link. Decision 026 says so.
- The operator names an account by its identifier. The admin searches the accounts by name or address, and shows of each what tells it from another: its name, its whole address, its identifier, whether the address was checked, and whether it is suspended. An unchecked address is flagged and not refused: an instance that sends no mail checks none.
- `GET /v1/developers/{id}/members` lists the members, `POST` to the same adds one, and `DELETE /v1/developers/{id}/members/{accountId}` takes one out. They are an operator's, from the admin's site, as everything that runs the instance.
- Adding and removing a member is recorded with what operators do, once for each change: adding a member that is one, or removing one that is none, changes nothing and records nothing. The record names the developer account and the account, the account by its identifier alone, as decision 025 has it.
- An account may be a member of several developer accounts, and an operator may be a member.
- A member that is suspended reads nothing: it has no session. A developer account that is suspended is still read by its members, who see that it is.

### What a member reads

- `GET /v1/console` gives the developer accounts the caller is a member of. For each: its name, its limit, the calls its keys were let through in the hour, whether it is suspended, and its keys by name, with the first characters of each and when it was made, last used, and revoked.
- A key itself is not there. It was shown once, to the operator who made it.
- The operator's contact and note for the account are not there either, nor who the other members are: they are the operator's.
- `GET /v1/console/usage/series` and `GET /v1/console/usage/breakdown` give the calls of one of those developer accounts, as the admin's do, by hour or by day, by key or by procedure. They take a developer account's identifier, and nothing else that says whose calls.
- A developer account the caller is no member of answers 404, in the words of one that does not exist. Running the instance makes no one a member: an operator reads the developer accounts in the admin.
- Every query of the console names the caller: the check that refuses, and the query that reads after it.
- These take a signed-in session, and no key: a key reads shared data and stands for no account.
- A member changes nothing.

### Where

- The console is a part of the admin app, under `/console`. An account that is no operator is sent there from any page of the admin. A member of one developer account sees it at once, and a member of several chooses.
- An account that is a member of none is told its identifier, to give to the operator, and how an operator is named.
- An operator sees the admin as before, adds members from a developer account's page, and is sent to the admin from `/console`.
- The console has the admin's bar, with a palette and shortcuts of its own: the developer accounts of the reader, the theme, the language. None of an operator's pages, commands or shortcuts is mounted for it.
- An open page asks every thirty seconds what its account is a member of. A developer account that was taken from it leaves the screen, with what was read of it. The API's 404 for its calls is enough: the page does not wait to be told again what the reader is a member of.
- What a page of the admin loaded belongs to the account that loaded it. The session is a cookie of the browser's, which another tab changes: the page asks who is signed in every thirty seconds, a minute for an operator, and each time the reader comes back to it. When it is another account, or none, the page drops everything it holds before it draws anything for the new one. This is an operator's pages' rule as much as the console's.

## Rejected

- **Giving the console to the account whose checked address is the developer account's contact.** See above.
- **A page of the web app.** The web app is for someone who looks at the sea. What the API is consumed with and how much has one place, the admin, and its site is the one the API already trusts for it.
- **An app of its own.** A third app to deploy, for two screens.
- **Letting a member make and revoke keys.** It is what a developer would want next. It changes who answers for a key, and waits for its own decision.
- **Showing the key again.** The instance keeps its hash.
- **Asking that the console be called from the admin's site alone.** What a member reads is its account's to read, as its spots are. The door of `adminProcedure` is for what runs the instance.
- **A switch that shows an operator the console.** An operator reads more in the admin, of every developer account.

## Consequences

- The admin's site is opened by accounts that are no operators. What an operator does is still held by `adminProcedure`, which asks for an operator.
- A developer account with no member is as before: only the operator sees it.
- A member sees the names the operator gave the keys, and the procedures they called.
- Removing a member, or deleting its account, takes the console from it at its next call. A call that was let in before may still be answered.
- A page left open shows what it loaded until it has asked again. A tab that cannot reach the API keeps what it shows: it cannot learn that the reader changed.
- The console answers a page of the web app as it answers the admin: a script that ran in the web app with a member's session would read what the member reads. No other site reads it.
- More people sign in to the admin's site. What it shows of them and of the developer accounts is text, never markup.
- The calls a member makes to the console are counted as any account's, with no account named.
