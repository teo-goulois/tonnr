# 041. Guides that accounts write, and a rank for writing them

Status: decided by Téo on 2026-10-12. Nothing of it is built. He wants a surfer who arrives somewhere new to find "every spot with how it works", and said that he cannot write it alone: "it takes people everywhere who want to share." He asked that every contribution be kept from the start, for a score that is "social proof, and a flex for those who take part a lot", and added: "a sponsorship that succeeds brings points too."

## Context

A break of the catalogue says what it is like in the catalogue's words, and each of them may be null. Nothing says how to get there, where to enter the water, what to watch for, or how the line-up takes a stranger. A break cannot be corrected from the app (decision 024).

An account is seen by nobody else today. Its name is free text, not unique, read by the account and by the operator.

Téo first thought of points that buy a gift at a threshold: wax, a leash, a pad. He then chose what follows.

## Decision

### What an account writes

- An account contributes to a break of the catalogue, one line of its guide at a time: one of the catalogue's lists of words, or a short text on the access, on where to enter the water, on the hazards, or on the rules of the place.
- How crowded a break is, how its locals take a visitor, and the level it asks are not one account's to state. Each account gives its own answer, and the guide shows how the answers spread once enough accounts gave one.
- A contribution is a row: the account, the break, the line, the value, the time, and what became of it. Nothing overwrites one. The guide shows the latest confirmed value of each line.
- A value of a guide says where it comes from: the list the break was added from, or a contribution. Nothing is copied into a guide from `surf_break_record`.
- A guide is written on a break, which is public already: nothing here publishes a place. Decision 034 stays the one way a spot becomes a break.
- A break stays public, and what was written on it stays. When its author's account is deleted it names nobody, as a break made of a spot does.

### Who says it is right

- An operator reads a contribution before it shows, in the admin's moderation, beside the requests of decision 034. That is the first step and it does not last: one operator cannot judge a car park on another coast.
- Then the accounts that keep the break confirm a contribution, or contest it with a reason: they hold the break in a list, or have a spot of their own on it. What is contested comes to the operator.
- An account with enough confirmed contributions sees its lists of words shown at once, marked as waiting to be confirmed. A text always waits for someone to read it.

### The score and the rank

- The score is computed from the rows and kept nowhere. The scale may change, and then applies to everything already written.
- Only what was confirmed counts. A request of decision 034 that was accepted counts as a contribution, the ones made before this too.
- A rank is a threshold of the score, and is kept for life. The ranks carry the names of surfing's tours, from the QS to the CT.
- A rank shows beside the username on what the account wrote in a guide, in its own account panel, and to its friends.

### The username

- An account has a username: unique, public, and held to rules of length and of characters. Some are reserved. Sign-up asks for it where it asked for a name.
- A name given before is never shown as a username: it was not given to be public. Such an account chooses its username at its first contribution.
- An operator takes a username away in the admin app.

### Friends and sponsors

- An account has a link of its own. An account made through it has the link's owner as its sponsor, and the two are friends. An account that exists already and opens the link becomes a friend. There is no search of accounts and no request to answer.
- A sponsorship succeeds at the sponsored account's first confirmed contribution, and gives its sponsor points then.
- A friend sees the username, the rank, and the contributions. They see no spot, no alert and no list, but a list shared as decision 035 says.

### Order

The username first. Then contributions that the operator reads, with the score and the rank. Then the link. Then confirmations by the accounts that keep a break.

Later, in no order:

- A few photos of a break, each in a named place: the peak from the beach, the access, where to enter the water, the hazard at low tide. Each is looked at before it shows. An instance has nowhere to keep a file today.
- A community tab that says what to do nearby: the breaks with no guide, the contributions to confirm.
- A question the day after an alert told: was the account there, and how was it. The answers are summed over time and never shown as they come, so that nobody reads there where it is good now.
- A draw each month for a small gift, among the accounts that had a contribution confirmed that month: one ticket for each contribution, up to a cap.
- A ranking by season, which the rows allow.

## Rejected

- **Gifts at a threshold of points.** A price announced for a point makes people write for the gift: volume, invented guides, and text copied from a guide that someone else owns. Postage abroad costs more than the gift, and the instance would keep every contributor's address. The people who know a break would read it as pay for giving the break away.
- **A ranking by season as the first rank.** What there is to say of a coast ends. Whoever wrote all of theirs would have to touch it up to stay ranked.
- **A draw among the ten best.** They are the same ten every month, and they need no draw to write. A draw among all who contributed speaks to a newcomer.
- **A list of friends with a search and requests.** A link shown on a car park makes a friend in one step, and is the sponsorship too.
- **A sponsorship counted at sign-up.** It would pay for accounts that do nothing, and for false ones.
- **Stars on a contribution.** Whether it is right is what a reader can say.

## Consequences

- A break of the catalogue can be corrected from the app, by a contribution.
- An account is seen by others for the first time: by its username, its rank, and what it wrote. A break still names no account. A line of its guide names its author.
- The product vision assumes that there is no friends list. That ends with the link.
- An account agrees to a licence when it contributes, as it does when it asks to publish a spot. The catalogue's words go under the ODbL of decision 034. The licence of a text is not chosen: the ODbL is a database's.
- Not chosen either: the scale of points, the thresholds of the ranks, and how many answers make a spread worth showing.
- The tours' names are the World Surf League's. Whether they may stand as ranks is to check before the app is widely known.
- A draw is the instance's to answer for: its rules, and the address it asks of the winner and of no one else.
