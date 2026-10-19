# 071. Deleting an account, and blocking one

Status: accepted on 2026-10-19, with the rest of the report on the app for phones ([decision 069](069-an-app-for-phones.md)), which Téo asked for that day: "une app qui marche de A à Z". Neither store takes an app whose accounts cannot be deleted from inside it, and Apple takes none that shows what its accounts write with no way to block one: the report said so. It recommended deleting an account at once from the app and the web, keeping the confirmed lines of the guides and the public spots with no name on them, and a block that hides the blocked account from the one that blocked it. Téo disagreed with none of it, and so accepted it, including keeping the lines, where Apple leans the other way. It amends [decision 025](025-account-sessions-and-suspension.md), which left deleting an account unbuilt, [decision 041](041-community-guides.md), on what stays of a contribution, on friendships and on usernames, and [decisions 067](067-reports-of-the-waves.md) and [068](068-telling-the-reports.md), on who reads a report and who is told of it. What is marked "chosen here" is mine, and his to overturn.

## Context

Nothing deletes an account. The `account` router has `get` and `sendVerification`. The sign-in library's own deletion is not switched on. The admin's `accounts` router closes an account's sessions, suspends it and takes its username away, and decision 025 lists deleting one from the admin as not built. `/privacy` says "The app has no button to delete an account yet", and asks the person to write.

Apple's guideline 5.1.1(v) asks an app that makes accounts to delete them from inside the app, and does not count a mail to a person as enough outside regulated trades. Google Play asks for the same thing in the app, and for a web address, named in the Data safety form, where someone without the app asks for it. The GDPR owes it anyway (article 17).

Apple's guideline 1.2 asks an app that shows what its accounts write for four things: a way to filter it, a way to report it with answers that come in time, a way to block an abusive account, and an address to reach whoever runs it. Here accounts write guides (decision 041), reports with photos (decision 067) and usernames. A report is flagged, a line of a guide is contested before an operator, an operator takes a username away or suspends an account, and `/contact` gives the address. No account can block another.

The database already knows what goes with an account. The 46 foreign keys that point to `user` in `packages/db/src/schema` today either delete with it (38 of them) or are set to null (8). The 8 are the author of a contribution (`break_contribution.user_id`), a sponsor (`sponsorship.sponsor_id`), and what an operator did: who decided a contribution, a request to publish a spot or a candidate of a list (`decided_by` in `break_contribution`, `spot_publication` and `break_candidate`), who suspended an account (`account_suspension.operator_id`), who added a member to a developer account (`developer_member.operator_id`), and who did an action (`operator_action.operator_id`). Whatever way a row of `media` goes, a trigger of the database writes the keys of its files to `media_trash`, which the worker empties (decision 066), and a cascade deletes those rows like any other.

## Decision

### Deleting an account

- `account.delete`, on `protectedProcedure`, at `DELETE /v1/account`. An account that has a password gives it again, in the body. An account without one, which signs in with Google or later with Apple, shows a session opened within the last ten minutes: the app or the web app first asks it to sign in again. Ten minutes are chosen here. The answer is 403 when the password is wrong or the session is older, with a code that says which, `data.refused`: `password` or `session`. Five wrong passwords in an hour, and the answer is 429 until the hour ends, so that a stolen session cannot be used to guess the password. Chosen here. Each try is counted before the password is compared, under `account-delete:<id>` in `provider_calls`, so that tries sent at once are held to the limit too: a right one ends the account, so only wrong ones ever count against one that stays. `account.get` says `hasPassword`, so that a client knows which to ask for. The ten minutes and the thirty days below are `FRESH_SIGN_IN_MINUTES` and `DELETED_USERNAME_DAYS`, in `packages/config/src/account.ts`, which the API and the web app read.
- An operator is refused with 409, as decision 025 refuses to suspend one: the operator's rights are taken away first, with `job operator-remove`. So the instance never deletes the last account that runs it by mistake.
- A suspended account has no session, and asks by mail as `/privacy` says, as does someone who lost their way in. The operator then deletes it from the server, with `job account-delete <account id> --write`, which deletes it as `account.delete` does: both run `deleteAccount`, in `packages/db/src/deletion.ts`, and the record says `account.delete_by_command`, which names no operator and which the admin reads as done by the command line. Chosen here, after a review found the mail promised with nothing behind it. An operator's account is refused there too. An operator still deletes no account from the admin: decision 025 left that unbuilt, and it stays so.
- One transaction. It holds the account with `holdAccounts` first, as decision 041 orders: a change of its friends, of a score or of what it has waiting then waits for it, or finds it gone. It then holds the line of each of its contributions that were never confirmed, with `holdLine`, and deletes those contributions. Last, it deletes the row of `user`, and the database does the rest. That row goes once whatever writes a row that names it has ended: a request of the account's own, or a job of the worker.
- In the same transaction, `recordAction`, which lives in `packages/db/src/actions.ts` so that the worker's command writes it too, writes `account.delete`, a new entry of `OPERATOR_ACTIONS`, in the operators' record. The record names the account by its id alone, as decision 025 has it, so that an operator who is written to afterwards reads that it was deleted, and when. Its `operator_id` is the account's own, which the deletion sets to null at once.
- An account that signed in with Apple ([decision 070](070-signing-in-from-the-app.md)) has its token revoked at Apple's as it is deleted, as Apple asks. The API asks Apple once for each link that kept a token, its refresh token when it has one, once the transaction has deleted the account, and the account is deleted whatever Apple answers. Chosen here. What asks is `appleRevocation`, in `packages/auth/src/apple-revocation.ts`, which the program gives the procedures as `apple`, with the client and the client's secret of decision 070. An instance that does not offer Sign in with Apple gives none, and asks Apple nothing. Google's tokens are deleted with their row of `account`.
- Analytics capture `account_deleted` on success, as every action's event is captured: under the account's opaque id, with nothing of its input. PostHog keeps the events it holds under that id, which then names no account the instance keeps.
- No mail says it afterwards: the account asked for it with its password or a fresh sign-in, and its address is no longer kept. Chosen here.

### What goes, and what stays

- With the account, by the database's cascade:
  - its sessions, so that every device is signed out at once;
  - the browsers and phones it is pushed to;
  - the assistants it signed in, with their tokens ([decision 047](047-agents-sign-in.md));
  - its spots, and its lists: a list it shared goes, and whoever kept it loses it ([decision 035](035-shared-lists.md));
  - its alerts and what they told;
  - its sessions with their photos and videos, and its reports with theirs;
  - the flags it gave, its answers to the three questions of a guide, what it said of others' contributions, its ranks, its link, its friendships, and its own sponsorship;
  - its profile, its preferences, what it looked at last, its memberships of developer accounts;
  - the counts of what it sent (`media_sent_hour`, `report_sent`).
- The keys it made while it was an operator go too. They stopped working when it stopped being one.
- Its contributions that were never confirmed go, deleted before the row: those that wait (`pending`, `shown`), and those refused, withdrawn or closed by another's confirmation (`superseded`), which were never a part of a guide. Left to the cascade, they would stay with no name on them. Deleting the refused, withdrawn and superseded ones is chosen here.
- What stays names nobody:
  - its confirmed lines, and the lines a later confirmation replaced, which are the history of a guide: the guide reads them under "A contributor", as `guide_by_nobody` says;
  - the rows that count a request of decision 034 that was accepted, and the breaks made of its spots, which never named it;
  - what it decided as an operator while it was one;
  - the sponsorships it made, with no sponsor, so that an account it brought is never sponsored a second time;
  - the operators' record, by id alone, for its thirteen months.
- What it changes for others:
  - A sponsor loses the 15 points of an account it brought that is deleted: a score is computed from rows, and these go. A rank once reached stays, as decision 041 says.
  - A contribution it confirmed stays confirmed.
  - A report it helped to hide stays hidden until an operator decides: hidden is a state of the report, not a count of flags.
  - A notice of another account that held its reports says that the report was taken down, as decision 068 says of a deleted report.
- Its files go within minutes: the worker empties `media_trash` every minute. An address of the bucket that was already given works until it expires: two hours at most on a screen (decision 066), and, for the picture of a report's push, an hour past the time the push is kept (decision 068).
- What counts its mails and its questions to the forecasts under its id, in `provider_calls`, goes within two days, as `/privacy` says. The database's backups keep a copy until newer ones replace them, as `/privacy` says too.
- The terms said all of this before anyone wrote: "What you wrote stays when your account is deleted, and then names nobody." That line and `privacy_keep_after` now say what was confirmed, since the rest goes.

### Its username

- The username of a deleted account is nobody's for thirty days, so that no one takes it at once and passes for the account. The deletion writes it in `removed_username`, which holds the usernames an operator took away, with the day it is free again: a new column, `free_at`, null for a username an operator took away, which stays nobody's for good. The check in `packages/auth/src/username.ts`, `isUsernameKept`, refuses it until then. An operator who takes away a username that a deleted account left, and that was taken since, keeps it for good: the row's `free_at` goes back to null. Thirty days are chosen here. The worker's prune of every night deletes the rows whose day has passed, `forgetFreedUsernames` in `packages/db/src/deletion.ts`, so that the instance keeps a deleted account's username, and the day it was deleted, no longer than `/privacy` says: a review found them kept for good.

### Blocking an account

- `account_block` keeps one row for each account that blocked another: `blocker_id`, `blocked_id`, and when. Both point to `user` and go with either account. One row for each pair and each way. An account does not block itself, and blocks five hundred at most. Chosen here.
- `blocks.add`, at `POST /v1/blocks`, takes the username the account reads, and keeps the block by the two accounts' ids, so that it outlives a change of username. `blocks.list`, at `GET /v1/blocks`, answers each blocked account by its id, the username it has now and since when it was blocked. `blocks.remove`, at `DELETE /v1/blocks/{id}`, lifts a block. All three are on `protectedProcedure`. Their events are `account_blocked` and `account_unblocked`.
- Adding a block holds both accounts with `holdAccounts`, as `friends.remove` and `befriend` do. It then ends their friendship, which is written as ended by the blocker, and writes the block. A friendship being made by a link at the same moment is made first and ended, or waits and is refused.

### What a blocker no longer reads

- The blocked account's reports. `reports.list`, and so the panel of a break, leaves them out. The worker's `tell-reports` does not tell them to the blocker. A notice that holds other reports too names the newest of those others, and its push is written from those others. `reportNotices.list` leaves them out the same way.
- Its contributions that wait to be confirmed. `guides.get` leaves them out of a line. `contributions.confirm` and `contributions.contest` answer the blocker 404 for one of them, as for any contribution it cannot see. A confirmed line stays what the guide says, the same for every reader. Only its author is hidden.
- Its username. Everywhere the API answers another account's username to the blocker, it answers null: on a line of a guide, on a report, in a notice, as the owner of a shared list. The web app and the app then read it as they read a deleted account: "A contributor" on a line, "Someone" on a report.
- A friendship between them. No link makes another while the block stands, in either direction: `befriend`, in `packages/db/src/friends.ts`, refuses the pair. `friends.accept` answers the blocked account with the 403 it gives when the link's owner ended the friendship. It tells the blocker that it blocked this account, with `data.blocked`. `friends.open` answers the blocker the 404 of a link that opens nothing, since the link would name the account, with `data.blocked` too, so that `InviteDialog` says why: chosen here.
- The block goes one way only. The blocked account reads everything as before and is not told. It sees the friendship as ended, as it would after either side ended one. Chosen here.
- A block changes nothing else. A report keeps its flags (decision 067), and a contribution its review (decision 041): a block flags nothing and contests nothing, and an operator's tools are the same. A list of the blocked account's that the blocker kept stays until the blocker leaves it.
- A procedure reads the blocks of the account it answers, whether the call came with a session or through the account's assistant. A key, a link and a visitor have none.

### In the web app and the app

- The account's panel ends with a row that deletes the account, under signing out. It opens one step, `?panel=account&settings=delete`. The step says what goes and what stays, asks for the password or a new sign-in, and has the button. Once the account is deleted, the web app signs out, resets its analytics as it does when the account changes, and opens the map as a visitor. Chosen here.
- The app has the same row in its account tab, among the actions that destroy something, with the system's own confirmation. Once the account is deleted, it clears what signing out clears: the keychain, the caches, the widgets' data and the Live Activities (decision 070).
- Google Play's form names `/privacy`'s paragraph on deletion, `/privacy#delete`. That paragraph names the app and its publisher, says the steps, and links to the step above. Someone who is signed out signs in there first, even while the instance is closed to visitors. Chosen here.
- A block is made from the menu of a report, beside its flag (`ReportsPanel`), from the name of the author of a line of a guide, which opens a menu (`Author`, in `BreakGuide`), and from a friend (`FriendsPanel`). Each asks first, in `BlockDialog`, what the block hides and that the other is not told. A visitor who presses the name of an author is asked for an account, through `useAuthPrompt`, and then asked as an account is. A report's menu is an account's, as its flag is, so a visitor finds no block there: chosen here. The blocked accounts are listed one step into the account's panel, `?panel=account&settings=blocked`, each with a button that lifts the block, and the command palette leads there. The route answers all of them through `useBlocks`, in `apps/web/src/routes/app/-blocks.ts`. The app has the same, in its own menus.

## Rejected

- **Deletion by mail**, as `/privacy` says today. Neither store takes it, and a person who is answered within a month has waited a month for something one press does.
- **The sign-in library's own deletion**, at `/api/auth/delete-user`. It answers outside the versioned router, the count of calls and `recordAction`, as its admin plugin did for decision 025. It deletes the row with none of decision 041's order, and its idea of a fresh session is the one every session is given.
- **A grace period** before the account goes, during which it could come back. The account asked, with its password or a fresh sign-in. A grace period would keep everything for a month for a person who said to delete it, and the stores take an account deleted at once. Chosen here.
- **Deleting the guide lines with the account.** A confirmed line is what the guide says, and other accounts confirmed it and read it. It was given under the ODbL or the DbCL, and the terms said it stays. Deleting it would make each of its lines say what they said before, for every reader. Apple's page on deleting an account leans the other way, toward deleting what an account shared unless the law keeps it. Téo accepted keeping them.
- **A block that hides everything the blocked account wrote**, its confirmed lines too. The blocker would read a guide that says what it said before the line was confirmed, unlike everyone else's. A block hides the author, not the guide.

## Consequences

- Each store's first review finds deletion inside the app and blocking. Google Play's Data safety form has its web address.
- `/privacy` changes in every language, with `LEGAL_UPDATED` in `apps/web/src/components/landing/legal-page.tsx`:
  - `privacy_rights_delete` says how an account deletes itself, in the app and on the web, and that writing still works;
  - `privacy_keep_after` says what was confirmed;
  - the operators' record keeps the day an account was deleted, by its id;
  - an account's blocks are kept, read by it alone, until it lifts them or either account goes.
- The terms change too. `terms_service_leave` says where an account deletes itself, and `terms_guide_rights` says that what was confirmed stays.
- `docs/analytics.md` lists `account_deleted`, `account_blocked` and `account_unblocked`. The four procedures are named in `ANSWERS_AN_ACCOUNT`, in `packages/api/src/access.db.test.ts`.
- The two steps of the account's panel, `delete` and `blocked`, are new values of `settings` on `/app`, in `mapSearch` (`apps/web/src/lib/map-search.ts`). The reader of links of [decision 073](073-links-that-open-the-app.md), `readAppLink` in `packages/config/src/links.ts`, names `settings` among `MAP_PARAMETERS` already and passes its value on as written: the screen that opens checks it. So a link to either step opens it in the app too, once the app has the step.
- A migration adds `account_block` and the day a name of `removed_username` is free again. Deploy the API before the web app and the app. The tables that later decisions add, `live_activity` of [decision 074](074-widgets-and-live-activities.md) among them, point to `user` in the same way, and each says whether it deletes with it or is set to null.
- The public page of a break ([decision 057](057-public-pages-of-breaks.md)) is drawn for everyone alike and kept an hour in Cloudflare's cache: it shows a report whatever its reader blocked. A block applies in the app and the web app's map.
- A block is not a ban. The blocked person can make another account, and sign it up through the blocker's link: the blocker gives itself a new one with `friends.renewLink`. Flags, contests and suspension stay the operator's tools.
- Built on 2026-10-19: `account.delete`, with the username kept thirty days and `account.delete` in the operators' record, which the admin reads as "Deleted its own account"; the web app's step, `DeleteAccount`, with its row at the end of the account's panel, its line in the command palette, and `/privacy#delete`; `/privacy` and the terms in every language. What revokes Apple's tokens is written and called, and the server gives it to no procedure until decision 070 gives the instance Apple's settings and the client's secret. Then `account_block` and its three procedures, with what `reports.list`, `reportNotices.list`, the worker's `tell-reports`, `guides.get`, `contributions.confirm` and `contest`, `friends.open` and `accept`, and `shared.open` leave out, in `packages/db/src/blocks.ts`; the web app's menus, `BlockDialog`, the step `BlockedAccounts` with its row in the account's panel and its line in the command palette, and the line of `/privacy` that says the blocks are kept. Not built yet: the app's screens for both.
