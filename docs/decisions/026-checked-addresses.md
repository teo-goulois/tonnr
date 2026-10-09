# 026. Checking an account's address by mail

Status: asked for by Téo on 2026-10-09, who chose the library and the provider. Not built: mail for anything else (an alert, a lost password), changing an account's address, and a limit on the accounts one address of the network may create. The developer's console came with decision 027, which rests on no address.

## Context

An account gives an address when it signs up, and nothing checks it. Anyone signs up with anyone's address. So the instance can send that address nothing, and cannot take it for a sign of who the account is: alerts by mail, and a console where a developer reads the keys an operator made for their address, both wait for it.

The instance sends no mail at all today.

## Decision

### Sending mail

- The API sends mail through `@opencoredev/email-sdk`, with the adapter the instance's settings choose: Unosend when `UNOSEND_API_KEY` is set, any SMTP server when `SMTP_URL` is. `EMAIL_FROM` names the sender. The API does not start with both, nor with one and no sender.
- The library reports its use to its authors unless it is told not to. It is told not to.
- A mail is tried once, and whoever waits for it is answered within ten seconds. The library is given no second provider to fall back on, and tries nothing again: a mail that was accepted late would be sent twice. Through Unosend the request is ended at ten seconds. Through SMTP the library holds the connection until the server has said nothing for ten seconds, which can be a few seconds after the answer.
- With neither, the instance sends no mail and checks no address. Everything else works as before.
- The API alone sends mail. The worker does not.
- `packages/mail` is where a mail is written and sent. It knows the library and nothing of who signs in.
- The instance counts the mails it lets out in a day, in the table that counts the requests to a provider, and stops at `EMAIL_DAILY_LIMIT`, 200 unless set otherwise. A mail costs money or reputation, and sign-up is open. A day and an hour are those of the calendar, in UTC.
- An account is sent a mail to check its address three times an hour at most, and five times a day. Its count and the instance's are taken together or not at all, before the mail leaves: a mail that the provider then refuses stays counted. When both are full, the account is told of its own.
- What the log keeps of a mail that did not leave is the provider's name, the kind of failure and its status. Never the address, the link, nor what the provider answered.

### Checking an address

- Signing up sends the account a mail with a link, in the language the request asks for in `Accept-Language`. The account is signed in at once, as before: nothing waits for the link, and a mail that could not be sent does not undo the sign-up.
- The link is good for a day. It opens the API, which marks the address as checked and sends the browser on to the web app at `/verified`, or at `/fr/verified` when the mail is in French: the link carries the language of its mail, so the page needs no guess. It signs no one in: the browser that follows it is signed in already, or signs in.
- A link that is too old or that was tampered with sends the browser to `/verified?error=TOKEN_EXPIRED` or `/verified?error=INVALID_TOKEN`. A link that was already followed works again until it is too old, and changes nothing.
- `POST /v1/account/verification` sends the mail again to the account that asks, in the language it names: its body is `{ "locale": "en" }` or `"fr"`, English without one. It answers 200 with `{ "sent": true }` when the provider took the mail, 409 when the address is already checked, 429 with `Retry-After` when the account has had its mails for the hour or the day, and 503 when the instance sends no mail, has sent its mails for the day, or the provider did not take this one. After a 503 the mail may still arrive.
- The sign-in library's own route, which sends the mail to an address given without a session, is switched off. Anyone could have it mail the addresses that are not checked yet.
- The mail is plain: who it is from, what the link does, and that it can be ignored. It is written in French for a request that asks for French, and in English otherwise. It carries no image and no tracker, and is addressed to the address alone: the name an account chose is not put in a mail's headers.
- `GET /v1/account` says whether the address is checked, and whether this instance checks addresses.

### What an unchecked account may do

- Everything it does today. The check is not a door: an instance that starts checking has accounts that never were checked, its operator's among them.
- What is built on a checked address asks for one when it is built.

### The web app

- On an instance that checks addresses, the menu of an account whose address is not checked says so, and offers the mail again. On another instance it says nothing.
- After a sign-up, the app tells the account to expect a mail at its address, and where to ask for another. It does not say that one was sent: a sign-up succeeds whether its mail left or not, and does not say which.
- The page at `/verified` tells an account that is signed in about its own address, which it reads from the API: the link may be another account's, and the page can be opened without a link. Without a session it knows only the word the API put in its address. It says that a link was too old or did not work. An address with no word proves nothing, since anyone can write it: the page then says only that the link leads here once the address is checked, and offers to sign in.
- A new mail is sent when the reader asks for one, never by the page alone.

### The admin

- An account's page says whether its address is checked, as it does since decision 025.
- The page of the instance says whether mail is set up, through what, and how many mails were counted today against the limit.

## Rejected

- **Refusing the sign-in of an unchecked account.** Every account that exists would be locked out the day the instance starts checking.
- **A sign-in by a link in a mail, without a password.** It makes the mail provider a part of every sign-in.
- **One provider, written into the code.** Someone who hosts an instance has a mail server of their own or another provider. The library gives SMTP for the price of a setting.
- **A mail in both languages at once.** It is twice as long, and reads like a form.
- **Tracking who opens the mail.** The instance has no use for it, and the reader did not ask for it. The provider's own tracking is a setting of the provider's account, to leave off.
- **A link that signs in.** It would be a second key to the account, good for a day, in a mailbox and in the provider's records.
- **A limit by the address of the network a sign-up comes from.** The API sits behind proxies, and which header to believe depends on them. Decision 020 keeps no address of a caller either. The day's limit holds the mails meanwhile.

## Consequences

- The mail provider learns the address of everyone who signs up, when, and the link itself. `docs/self-hosting.md` says so.
- A checked address says that someone who reads its mail followed a link. It does not say that the account is theirs: whoever signed up with the address chose the password. Nothing may be given to an account for its address alone.
- An address can be given by someone who does not hold it: its holder gets a mail, which says what to do, which is nothing. Three an hour and five a day at most.
- Someone who signs up again and again with addresses made up spends the day's mails. The accounts that sign up after that get no mail that day, and ask again the next. The page of the instance shows the count.
- The count of an account's mails is kept under the account's identifier for two or three days, until the worker's nightly job deletes it. It is not one of the counts of calls of decision 020, which name no account.
- A mail that is not delivered leaves the account unchecked. The account asks again.
- The link is a signed token, not a row: it cannot be taken back before its day is over.
- An account that never follows the link loses nothing today.
- A suspended account that follows its link has its address checked, and is no more signed in than it was.
- The sign-in library writes in the log the address a link would end on when it refuses it. The instance's own links end on `/verified`, which names no one.
- An instance without a web app sends a link that ends on the API's own answer, with no page.
