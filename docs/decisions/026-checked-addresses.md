# 026. Checking an account's address by mail

Status: asked for by Téo on 2026-10-09, who chose the library and the provider. Since 2026-10-11 the worker sends mail too, for the alerts: [decision 031](031-alerts.md) says how, and what follows of who sends is changed by it. Since 2026-10-15 an account that forgot its password chooses another through a link it is mailed: "A forgotten password" below. Not built: changing an account's address, and a limit on the accounts one address of the network may create. The developer's console came with decision 027, which rests on no address.

## Context

An account gives an address when it signs up, and nothing checks it. Anyone signs up with anyone's address. So the instance can send that address nothing, and cannot take it for a sign of who the account is: alerts by mail, and a console where a developer reads the keys an operator made for their address, both wait for it.

The instance sends no mail at all today.

## Decision

### Sending mail

- The API sends mail through `@opencoredev/email-sdk`, with the adapter the instance's settings choose: Unosend when `UNOSEND_API_KEY` is set, any SMTP server when `SMTP_URL` is. `EMAIL_FROM` names the sender. The API does not start with both, nor with one and no sender.
- The library reports its use to its authors unless it is told not to. It is told not to.
- A mail is tried once, and whoever waits for it is answered within ten seconds. The library is given no second provider to fall back on, and tries nothing again: a mail that was accepted late would be sent twice. Through Unosend the request is ended at ten seconds. Through SMTP the connection is closed at ten seconds: `packages/mail` opens it itself, since the library's own SMTP adapter answers and lets the connection go on, and a mail could then leave after the answer.
- With neither, the instance sends no mail and checks no address. Everything else works as before.
- The API alone sends the mail that checks an address. Since decision 031 the worker sends the alerts' mail, through the same package and counted in the same day's limit.
- `packages/mail` is where a mail is written and sent. It knows the library and nothing of who signs in.
- The instance counts the mails it lets out in a day, in the table that counts the requests to a provider, and stops at `EMAIL_DAILY_LIMIT`, 200 unless set otherwise. A mail costs money or reputation, and sign-up is open. A day and an hour are those of the calendar, in UTC.
- An account is sent a mail to check its address three times an hour at most, and five times a day. Its count and the instance's are taken together or not at all, before the mail leaves: a mail that the provider then refuses stays counted. When both are full, the account is told of its own.
- What the log keeps of a mail that did not leave is the provider's name, the kind of failure and its status. Never the address, the link, nor what the provider answered.

### Checking an address

- Signing up sends the account a mail with a link, in the language the request asks for in `Accept-Language`. The account is signed in at once, as before: nothing waits for the link, and a mail that could not be sent does not undo the sign-up.
- The link is good for a day. It opens the API, which marks the address as checked and sends the browser on to the web app at `/verified`, or under its language's prefix, such as `/fr/verified` when the mail is in French: the link carries the language of its mail, so the page needs no guess. It signs no one in: the browser that follows it is signed in already, or signs in.
- A link that is too old or that was tampered with sends the browser to `/verified?error=TOKEN_EXPIRED` or `/verified?error=INVALID_TOKEN`. A link that was already followed works again until it is too old, and changes nothing.
- `POST /v1/account/verification` sends the mail again to the account that asks, in the language it names: its body is `{ "locale": "en" }` or `"fr"`, English without one. It answers 200 with `{ "sent": true }` when the provider took the mail, 409 when the address is already checked, 429 with `Retry-After` when the account has had its mails for the hour or the day, and 503 when the instance sends no mail, has sent its mails for the day, or the provider did not take this one. After a 503 the mail may still arrive.
- The sign-in library's own route, which sends the mail to an address given without a session, is switched off. Anyone could have it mail the addresses that are not checked yet.
- The mail is plain: who it is from, what the link does, and that it can be ignored. It is written in the language the request likes best of the web app's, and in English when it asks for none of them. It carries no image and no tracker, and is addressed to the address alone: the name an account chose is not put in a mail's headers.
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

### A forgotten password

Added on 2026-10-15, before the instance opens to everyone: an account that signed up with its address and a password had no way back in once it forgot the password.

- The sign-in library's own flow does it. `POST /api/auth/request-password-reset` takes an address and answers the same `200` whether an account has it or not. The library then makes a token of 24 characters, kept in its `verification` table, and the API mails a link to the account.
- The mail is sent after the answer, not before it: an address with an account would otherwise be answered later than one without, by the time the mail takes to leave, and the time would tell which. A mail that does not leave is not said either: the log says why, and nothing of whom.
- It goes out through the same provider as the mail that checks an address, counted in the instance's day. An account is sent three such mails an hour at most, and five a day, counted apart from its checks: a stranger who asks for another's password again and again spends that account's resets, not its checks, and never more than five mails a day.
- It is written in the account's language: the one its alerts are sent in once that is known, and before, the one the request asks for, which the web app sets to the language of its page. Its words are those of the check's mail, in each language of `LOCALES`, with what the link does, how long it works, that choosing signs the account out everywhere, and that it can be ignored.
- The link opens the web app at `/reset-password?token=…`, under the prefix of the mail's language. It works once and for an hour, the library's own default: the token is deleted as it is used, and refused after its hour. The page says `noindex` and sends no referrer, since its address holds the token. It does not ask the API first whether the token works: it learns that when the new password is sent, and offers a new link.
- Choosing a new password closes every session of the account, by the library's `revokeSessionsOnPasswordReset`. Someone who held a session, the browser of whoever stole the password included, is out. The browsers it pushes to go with their sessions, as when the account signs out there: decision 031. The account then signs in with the new password, on the sign-in page the web app leads it to.
- An instance that sends no mail offers no reset: the route answers `400` with `RESET_PASSWORD_DISABLED`, and the web app says that this instance cannot send a link.
- The web app's sign-in form offers "Forgot your password?", which leads to `/forgot-password`. That page asks for the address and says, whatever the answer, that a mail is on its way if the address has an account.

### Ideas from the landing

Added on 2026-10-14.

- The last column of the landing's ideas opens a form: a first name, an address and an idea. The API sends it by mail to `CONTACT_EMAIL` in `packages/config/src/app.ts`, the address of whoever makes the product, as the repository is theirs. Its subject is `Feature from landing: ` and the first name, and an answer goes to the address given.
- `v1.ideas.send` takes a person on a page of the web app: a visitor, whether or not the instance answers visitors, or an account. It takes no key and no link.
- The instance sends 20 ideas a day at most, counted with its mails for the day, before each leaves.
- Nothing of an idea is kept: the mail is all there is of it. The API checks the address as a sender's, and a first name on one line.
- An instance that sends no mail, or has sent its ideas for the day, says so, and the form gives the address to write to.

### Messages from the contact page

Added on 2026-10-15.

- `/contact` holds the same form, for whatever a person wants to say: a question, a bug, a source that is missing, or a request for a key. Every link that asked for an issue on GitHub leads there, since most readers do not know what an issue is.
- It goes through `v1.ideas.send` with `about: "message"`, which the input may leave out for an idea. Its subject is `Message from contact: ` and the first name.
- An idea and a message are counted together: the instance sends 20 of them a day at most.

## Rejected

- **Refusing the sign-in of an unchecked account.** Every account that exists would be locked out the day the instance starts checking.
- **A sign-in by a link in a mail, without a password.** It makes the mail provider a part of every sign-in.
- **One provider, written into the code.** Someone who hosts an instance has a mail server of their own or another provider. The library gives SMTP for the price of a setting.
- **A mail in both languages at once.** It is twice as long, and reads like a form.
- **Tracking who opens the mail.** The instance has no use for it, and the reader did not ask for it. The provider's own tracking is a setting of the provider's account, to leave off.
- **A link that signs in.** It would be a second key to the account, good for a day, in a mailbox and in the provider's records.
- **A link `mailto:` in place of the form.** It needs a mail program set up on the device, which many phones and shared computers lack, and loses the idea of whoever has none.
- **Sending the idea to the address given, as a copy.** Anyone could then have the instance mail any address, with words of their own in it.
- **A link that opens the API, which sends the browser on to the page, as the check's does.** The page then gets the token in its address all the same, one step later. The library's route that does it, `GET /api/auth/reset-password/:token`, stays: it leads only to the instance's own sites.
- **Signing the account in once it chose a new password.** The library does not, and the page knows the token alone, not the address. A sign-in with the new password proves it was written as meant.
- **A new password that leaves the sessions open.** Whoever asks for one may be locking out someone who took the account.
- **Sending the mail before answering, so that the page can say when it failed.** It tells anyone which addresses have an account.
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
- Someone who sends ideas again and again spends the day's 20, and the ideas sent after that day are told to write by mail. The address given is not checked: an answer to an idea may go to someone who did not send it, as a mail from whoever makes the product, which they read or not.
- Anyone who knows an address can have its account sent a link for a new password, five times a day at most. The link does nothing until it is followed, and the mail says so.
- A token for a new password is a row, unlike the check's: it is taken back as it is used. One that was asked for and never used stays good for its hour, as a second key in the mailbox: asking again does not take it back.
- A new password closes the sessions of the web app, not what an assistant was let read through decision 047: the account disconnects an assistant from its panel.
- A Google account that has no password can be given one through the same link, since following it proves the mailbox: the library adds the password to the account.
- An instance that someone else runs sends the ideas of its landing to the same address, through its own mail, until its operator changes `CONTACT_EMAIL`.
