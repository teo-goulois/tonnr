# 064. An alert set on a surf break of the catalogue

Status: accepted on 2026-10-17, and built the same day. Téo asked for it the evening before, after setting an alert from the "+" on a break he had looked at: "when you create an alert on a public spot, it should not become private: the public spot stays, and you just put an alert on it. Public or private, it is the same flow." The app had made a private spot of the break, and he saw two spots on the map. He asked what each way gave before choosing, and chose this one. It amends [decision 031](031-alerts.md), which set an alert on spots alone, and [decision 059](059-the-sea-now-in-a-sentence.md), whose button made that private spot first.

## Context

An alert first lived inside a spot, as its criteria and a switch (decision 008). When Téo asked that the two be apart (decision 006, "A spot without its alert"), the alert became an object of its own, still set on what it came from: the account's spots (decision 031). The catalogue was where a spot started, and nothing said that a break could not take an alert. Nobody had asked.

So an alert begun at a break needed a spot first. Decision 059 led the reader to make one, and since 2026-10-16 the app made it in silence, named after the break and at its point. The account then had a second marker on the map for one place, a copy that a later change to the catalogue does not follow, and a spot counted against its hundred that it never asked for.

The private spot has two things a break does not: it stays where it was put whatever an operator does to the catalogue, and its owner may put it on the peak they surf. Both remain, for whoever makes a spot.

## Decision

- An alert's places are spots of its account's own and surf breaks of the catalogue: one at least, and twelve together at most. Any account may set an alert on any break, and the alert is still its own alone. An alert may hold both kinds.
- `alert_spot` and `alert_window` name a place by `spot_id` or by `break_id`, one and never both, and `place_id`, which the database writes as whichever is set, keys them with the alert. A spot's id and a break's are UUIDs, so one `place_id` names one place. A version of the worker or the API that still writes `spot_id` alone keeps working while the next is deployed (decision 009).
- The worker reads a place's point and name from the spot or from the break, and looks at both alike. A notification's line names its place by `spotId`, the place's id, and adds `breakId` when it is a break. Its mail and its push open `?break=` for a break and `?spot=` for a spot.
- `alerts.create`, `alerts.update` and `alerts.preview` take `breakIds` beside `spotIds`. An alert says `spotIds`, `breakIds`, and `places`, its places in order with their names, so that a client names a break without reading the catalogue. The preview answers each place under `spotId`, its id, with `breakId` for a break. A break that is not there is 404, as another account's spot is.
- The catalogue keeps its alerts in step:
  - An alert set on a break counts as a use of it, so an operator cannot delete it and merges it instead.
  - A merge carries the alerts of the break that goes to the one that stays: an alert that held both holds it once.
  - What the looks saw at a break that moves, by an edit or a merge, is forgotten, as at a spot that moves.
  - Removing a list's breaks takes them out of the alerts they were in. An alert left with no place goes, and the others are read anew.
- In the web app, the panel of a break has a tab of the account's alerts there, as a spot's has. The "+", the menu of a panel, the button of a break's page, and what was liked in the sessions at a break all begin an alert at the break, in the sheet an alert is written in. No spot is made.
- On 2026-10-17 production held no spot and no alert, so nothing was moved.

## Rejected

- **A private spot hidden behind the break.** Keep making a spot, but draw it as the break and leave it out of the lists. Only the web app would change. The account would still hold a copy it cannot see, frozen where the break stood that day and counted against its spots, and the day it made a spot of its own there, it would find two. It hides the problem rather than solving it.

## Consequences

- An alert at a break follows the catalogue: a break that an operator moves takes its alerts with it, which is usually the point of correcting it.
- An account that wants its alert on the exact peak it surfs makes a spot, as before.
- Every reader of an alert's places says both kinds: the mails, the pushes, the lists of alerts, and the tools of an assistant (`list_my_alerts`).
- The API must be deployed before the web app: an API that knows no `breakIds` would refuse an alert set on a break alone.
