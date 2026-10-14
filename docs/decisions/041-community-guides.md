# 041. Guides that accounts write, and a rank for writing them

Status: decided by Téo on 2026-10-12, who then asked that all of it be built, and left what was not chosen to whoever builds it. All of its order is built: the username, the contributions with the guide of a break in the web app and what an operator answers in the admin, what the accounts that keep a break say, the score and the rank, and the link that makes friends and sponsors. What it lists as later is not. He wants a surfer who arrives somewhere new to find "every spot with how it works", and said that he cannot write it alone: "it takes people everywhere who want to share." He asked that every contribution be kept from the start, for a score that is "social proof, and a flex for those who take part a lot", and added: "a sponsorship that succeeds brings points too."

## Context

A break of the catalogue says what it is like in the catalogue's words, and each of them may be null. Nothing says how to get there, where to enter the water, what to watch for, or how the line-up takes a stranger. A break cannot be corrected from the app (decision 024).

An account is seen by nobody else today. Its name is free text, not unique, read by the account and by the operator.

Téo first thought of points that buy a gift at a threshold: wax, a leash, a pad. He then chose what follows.

## Decision

### What an account writes

- An account contributes to a break of the catalogue, one line of its guide at a time: one of the catalogue's lists of words, or a short text on the access, on where to enter the water, on the hazards, or on the rules of the place. A text is three to five hundred characters, on one line, and says the language it is written in: the guide gives a reader the text of their language when someone wrote one, and another otherwise.
- How crowded a break is, how its locals take a visitor, and the level it asks are not one account's to state. Each account gives its own answer, and the guide shows how the answers spread once three accounts gave one. An answer is changed in place, goes with its account, and counts for nothing.
- A contribution is a row: the account, the break, the line, the value, the time, and what became of it. Nothing overwrites one: an account that writes a line again closes what it had waiting there, and the row stays. The guide shows the latest confirmed value of each line.
- A value of a guide says where it comes from: the list the break was added from, or a contribution. Nothing is copied into a guide from what a list said of a break, in `surf_break_listing` since decision 049.
- The catalogue's own columns are never written by a contribution. What was confirmed is laid over them when a break is read, by `GET /v1/breaks` as by the guide, so that a contribution that is refused later needs no undoing, and what the list said is never lost.
- A row keeps the terms its author agreed to when they sent it: the Open Database License for a list of words, as decision 034 has it for a break, and the Database Contents License for a text, which is the one that goes with the first for what a database holds. Téo left the choice open: it is made here, and is his to change before the instance has texts of other people.
- A guide is written on a break, which is public already: nothing here publishes a place. Decision 034 stays the one way a spot becomes a break.
- A break stays public, and what was written on it stays. When its author's account is deleted it names nobody, as a break made of a spot does.

### Who says it is right

- An operator reads a contribution before it shows, in the admin's moderation, beside the requests of decision 034. That is the first step and it does not last: one operator cannot judge a car park on another coast.
- An account that had three contributions confirmed sees its lists of words shown at once, marked as waiting to be confirmed. Such a list is not what the guide says yet: it stands beside the line, and `GET /v1/breaks` does not answer it. A text always waits for the operator.
- The accounts that keep the break say whether a list that shows is right: they hold the break in a list of their own, or have a spot of their own on it. Two of them confirm it, and it is then what the line says. An account confirms once it had a contribution of its own confirmed, and with a checked address where the instance checks addresses: keeping a break is one press, and would let an account made for it confirm whatever its maker wrote.
- An account that keeps the break contests what shows, confirmed or not, with a reason. A contest changes nothing by itself, so that contesting hides nothing: it comes to the operator, who refuses the contribution or keeps it. An account contests a contribution once. One that said a contribution is right may still contest it, once it knows better. One that contested it does not confirm it afterwards: a contest stays one, with its reason and its day.
- A list that was confirmed closes the others that showed on its line: they were written of what the line said before.
- Who confirmed and who contested is answered to no other account, and counted where it is said at all: a name would tell which breaks an account keeps. The operator reads who contested, as they read who asks to publish a spot.
- An operator refuses a contribution at any time, one that was confirmed too. The line then says what it said before.
- An account has thirty contributions waiting at most, writes sixty in a day and contests twenty.
- Two things done to a guide at the same moment each get an answer of the API, and neither a fault of the database. Whatever changes a contribution holds, in this order and no other, the rows of the accounts whose score or whose count it touches, then the line of the guide, then the contribution. A rank that two confirmations reach together is written by the second.

### The score and the rank

- The score is computed from the rows and kept nowhere. The scale may change, and then applies to everything already written.
- Only what was confirmed counts: 5 points for a list of words, 10 for a text. A line of a break counts once for an account, however often it wrote it.
- A request of decision 034 that was accepted counts 20. Accepting writes a row for it, on a line of its own, so that it still counts once its owner deletes the spot, and a migration wrote one for each request accepted before. That row is answered to its owner alone: a break still names no account.
- A contribution to a break that later leaves the catalogue still counts. A row keeps the id of the break it was written of, so that a line still counts once then, however often its author wrote it.
- The version before this one accepts a spot without writing its row. The API writes the rows that are missing each time it starts, so that a spot accepted while a version is being deployed is counted.
- A rank is a threshold of the score, and is kept for life: the QS from 20 points, the CS from 150, the CT from 600. A break described whole is 80 points. A rank is written the day it is reached, in `rank_award`, and stays when a contribution is refused afterwards and the score goes down.
- A rank shows beside the username on what the account wrote in a guide, in its own account panel, and to its friends.

### The username

- An account has a username: unique, public, and held to rules of length and of characters. Some are reserved. Sign-up asks for it where it asked for a name.
- It is three to twenty letters without accents, digits and underscores, and is kept in small letters whatever was typed: two usernames never differ by a capital.
- The sign-in library keeps it, with its own plugin, and asks every account for a name: a new account gives its username there. No account signs in by its username: that route of the library is closed.
- A name given before is never shown as a username: it was not given to be public. Such an account chooses its username at its first contribution, or in its account's panel.
- An account changes its username when it likes, for another: it does not go back to none, since what it wrote would then name nobody at its own word. The one it had is free again, and what it wrote reads under the new one.
- An operator takes a username away in the admin app. Nobody takes that one again, the account it was taken from no more than another: `removed_username` keeps it, and names no account. The record of the operator's action does not hold it. The sign-in library checks a username, then writes it: a username is read again once it is written, and taken off when it was removed in between.

### Friends and sponsors

- An account has a link of its own. An account made through it has the link's owner as its sponsor, and the two are friends. An account that exists already and opens the link becomes a friend. There is no search of accounts and no request to answer.
- The link ends with sixteen random bytes, kept as they are, and its address in the web app is `/i/<token>`, which the app also draws as a code for a camera. Whoever has the link reads whose it is, a username and a rank, before they sign up. An account gives itself a new link when it likes: the one before then opens nothing, and the friends it made stay.
- The link goes with the sign-up, and the sign-in library reads it once the account is made: only an account made through a link has a sponsor. An account that exists already, however young, becomes a friend and no more. An account has one sponsor, for good.
- Opening a link makes nothing by itself: an account becomes a friend at its own word, and has a username by then, since a friend is read by it.
- A sponsorship succeeds at the sponsored account's first confirmed contribution, and counts 15 points for its sponsor then.
- A friend sees the username, the rank, and the contributions that were confirmed. They see no spot, no alert and no list, but a list shared as decision 035 says, and no score: with what was written, a score would say how many accounts the friend brought. A spot the friend asked to make public is not among its contributions: a break names no account.
- Either ends a friendship. The other does not make it again by a link it still holds: whoever ended it does, by opening the other's. An account has two hundred friends at most.

### Order

The username first. Then contributions that the operator reads, with the score and the rank. Then the link. Then confirmations by the accounts that keep a break.

Later, in no order:

- A few photos of a break, each in a named place: the peak from the beach, the access, where to enter the water, the hazard at low tide. Each is looked at before it shows. An instance has nowhere to keep a file today.
- A community tab that says what to do nearby: the breaks with no guide, the contributions to confirm.
- A question the day after an alert told: was the account there, and how was it. The answers are summed over time and never shown as they come, so that nobody reads there where it is good now.
- A draw each month for a small gift, among the accounts that had a contribution confirmed that month: one ticket for each contribution, up to a cap.
- A ranking by season, which the rows allow.
- An emblem for each rank, in place of its initials. Three were drawn on 2026-10-12, with the way from one rank to the next and a word to the account the day it reaches one. Téo set them aside the same day: the branch `prototype/rank-emblems` keeps them.

## Rejected

- **Gifts at a threshold of points.** A price announced for a point makes people write for the gift: volume, invented guides, and text copied from a guide that someone else owns. Postage abroad costs more than the gift, and the instance would keep every contributor's address. The people who know a break would read it as pay for giving the break away.
- **A ranking by season as the first rank.** What there is to say of a coast ends. Whoever wrote all of theirs would have to touch it up to stay ranked.
- **A draw among the ten best.** They are the same ten every month, and they need no draw to write. A draw among all who contributed speaks to a newcomer.
- **A list of friends with a search and requests.** A link shown on a car park makes a friend in one step, and is the sponsorship too.
- **A sponsorship counted at sign-up.** It would pay for accounts that do nothing, and for false ones.
- **A sponsor for any young account that opens a link.** An account of a few days is one that exists: only the sign-up says that an account was made through a link.
- **Stars on a contribution.** Whether it is right is what a reader can say.
- **A username kept as it was typed, beside the one in small letters.** The library offers that second form and checks nothing of it: an account could write another's username there, and be read under it.

## Consequences

- A break of the catalogue can be corrected from the app, by a contribution.
- An account is seen by others for the first time: by its username, its rank, and what it wrote. A break still names no account. A line of its guide names its author.
- The product vision assumes that there is no friends list. That ends with the link.
- An account agrees to a licence when it contributes, as it does when it asks to publish a spot, and the terms of use of the web app say which.
- The scale of points, the thresholds of the ranks and the numbers above were not Téo's: he left them to whoever built this. They are constants of `packages/api/src/community.ts`.
- The tours' names are the World Surf League's. Whether they may stand as ranks is to check before the app is widely known.
- A draw is the instance's to answer for: its rules, and the address it asks of the winner and of no one else.
