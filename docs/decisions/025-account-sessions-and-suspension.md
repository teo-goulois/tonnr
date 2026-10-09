# 025. Closing an account's sessions, and suspending an account

Status: asked for by Téo on 2026-10-09. Not built: deleting an account from the admin, taking down what an account shared, and closing sign-up.

## Context

Decision 020 gave the operator the list of the accounts that signed up, and nothing to do with one. An account that misuses the instance keeps its sessions, and signs in again when it likes. An operator whose own device is lost cannot close the session it holds.

Sign-up is open, and an account calls the API with its session without a limit. Decision 023 holds what the instance asks of the forecast provider, and says that one account can still spend the day's share of everyone.

## Decision

### What an operator sees of an account

- `GET /v1/accounts/{id}` gives an account: its name, its address, whether the address was checked, when it signed up, whether it is an operator, whether it is suspended and since when, how many sessions it has open, and when one of them was last opened or renewed. Nothing of what the account keeps.
- `GET /v1/accounts` says of each account whether it is suspended.
- A session is renewed about once a day while it is used. So the last renewal says that the account was there that day, not at what minute. A session past its end is not counted, whether the sign-in library has deleted it yet or not.
- The address a session came from and the browser it named are kept by the sign-in library and are not given: decision 020 keeps no address of a caller.

### Closing its sessions

- `DELETE /v1/accounts/{id}/sessions` closes every session of an account. Each device signs in again. A request that was already let in goes to its end, and a sign-in that arrives at the same moment can open a session that stays: closing sessions keeps nobody out, suspending does.
- It works on any account, an operator's and one's own included: it is what an operator does when a device is lost.

### Suspending it

- `PATCH /v1/accounts/{id}` with `suspended` suspends an account, or lets it in again.
- A suspended account has a row of `account_suspension`: since when, and by which operator.
- Suspending closes the account's sessions, in the same transaction. From then on the account cannot sign in: the sign-in answers 403 with the code `ACCOUNT_SUSPENDED`, which an app turns into words of its own.
- A sign-in that was under way when the account was suspended does not get through. The session it opened is closed as soon as it is opened, and the sign-in is refused like any other: it waits for the suspension to be written, then sees it. When an operator lets the account in again before that sign-in has ended, the sign-in gets through, as one made a moment later would: the account is let in.
- An operator is not suspended. The API answers 409: take the operator's rights away first, with the command that gave them. That command refuses to make an operator of a suspended account. So no operator locks another out, nor themselves.
- What the account owns stays: its spots, its lists, its notifications. What it shared stays visible. The worker stops checking the alerts of its spots, which would spend the forecast provider's budget for no one: it looks before it asks for a spot's forecast, and again before it writes. A forecast it had already asked for stays counted.
- Letting the account in again deletes the row. Its sessions were closed and stay so: it signs in.

### The record

- The three actions are recorded with the others, in the transaction that does them: `account.sign_out` with the number of open sessions it closed, `account.suspend`, `account.resume`. Closing the sessions of an account that has none open records nothing.
- The record names the account by its identifier and keeps neither its name nor its address: a record lasts thirteen months, and an account that was deleted leaves only that identifier in it. The API gives the name the account has now, or none.
- `GET /v1/actions` gives the action as a word, which a later version may add to. A program that reads it has an answer for a word it does not know, as the admin has.
- Suspending an account that is suspended, and letting in one that is not, change nothing and record nothing.

### The admin

- The list of accounts marks the suspended ones, and each account has a page: what the API gives, the two actions, and what operators did to it.

## Rejected

- **The sign-in library's own admin plugin.** It bans an account and closes its sessions. It also brings a role on each account, which would be a second way to be an administrator beside the `operator` table, and lets one account act as another. Its routes answer under `/api/auth`, outside the rules that every admin procedure follows: the admin's site, the count, the record.
- **A column on the account's row.** The sign-in library writes that table and generates its schema: a table beside it leaves both alone.
- **Checking the suspension at each call.** It is one more read for every call with a session. Closing the sessions and refusing the sign-in does the same, and the sign-in that races the suspension is caught by a lock on the account's row.
- **Hiding what a suspended account shared.** That is moderation: which spot, shown to whom, and what its followers see. It is a decision of its own, and is not built.
- **Keeping the account's name in the record**, as a developer account's is. A developer account is a label the operator wrote. An account is a person.

## Consequences

- A suspended account that has an API key through a developer account keeps it: keys belong to developer accounts, which the operator suspends apart.
- Nothing tells the account that it is suspended, beyond the refusal when it signs in.
- An account suspended by mistake has lost nothing but its sessions.
- An operator who closes their own sessions is signed out of the admin at once.
- The API and the worker of the version before this one know no suspension. In the deployment that brings it they run beside the new ones for a moment: a sign-in through the old API, or the old command that names an operator, would undo a suspension made in that moment. Suspend once the deployment is over.
- The web app shows the sign-in's refusal as it comes. Words for `ACCOUNT_SUSPENDED` are to be added there.
