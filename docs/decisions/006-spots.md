# 006. Spots and their criteria

Status: accepted on 2026-10-08. Amended on 2026-10-12 by [decision 034](034-public-spots.md): a spot is its owner's alone, and is made public by a request an operator accepts, no longer by its `visibility`. Amended on 2026-10-11, when the web app got the screen that adds a spot and Téo asked that a spot and its alert be two things: see "A spot without its alert" below.

## Context

A spot is what the product is built around: a point, a name, and the conditions that make it work. Alerts will be computed from it.

## Decision

- A spot belongs to one user and is theirs alone. A spot that is not the caller's is reported as missing, so its existence stays private. The API never exposes the owner, only whether the caller is the owner. Until decision 034 a spot was private or public, as its owner set it.
- Criteria are stored as one JSON column and validated by `criteriaSchema` in `packages/conditions/src/spots/criteria.ts`. They cover the swell (height, period, direction), the wind (speed, direction), and the tide (height, rising or falling). A direction is a sector that runs clockwise from one bearing to another and may pass through north.
- A criterion left out is not checked. A criterion on a value that is unknown for an hour, such as the tide far from any station, counts as not met.
- `GET /v1/spots/{id}/conditions` gives, hour by hour, the forecast and the tide, the criteria that hour does not meet, and the windows during which every criterion is met. The alert engine will use the same computation.
- An account holds at most 100 spots.
- A spot may start from a break of the catalogue. Decision 015 covers the catalogue.

## Consequences

- A spot is shared with chosen people through a list that holds it, by the list's link: [decision 035](035-shared-lists.md).
- Conditions come from the forecast only. A buoy measurement does not yet confirm that a spot works now.
- Tide heights are measured from the datum the tide source uses (decision 002), so a tide criterion means that datum.
- Changing the shape of the criteria means migrating the stored JSON.

## A spot without its alert

Asked by Téo on 2026-10-11, after he tried three prototypes of a screen that set a spot and its conditions together: "I want the alert and the creation of a spot to be two different things."

- Adding a spot is finding the place, putting a marker, and naming it, in that order. The web app does it from the map: the search of places (decision 030) and the catalogue of breaks find the place, a press on the map or the marker dragged puts the point, and the spot is saved with a name.
- The web app saves a spot with no criteria and its alerts off, which the API has always taken. It sends the name the user confirmed, with the break's id when the marker still stands on a break of the catalogue, and with the point alone once the marker was moved.
- A spot may then be described, for the "Guide" tab of its panel: its owner presses the words that apply, among those the catalogue has for a break. Nothing is required. The spot keeps what was said in one JSON column, `characteristics`, null while nothing is said, each list once through and in the catalogue's order. `PATCH /v1/spots/{id}` leaves it alone when it is left out, replaces all of it when it is given, and clears it on null.
- A spot made from a break takes nothing of what the catalogue says the break is like. A list an operator added may not be republished (decision 024), and a spot can be made public (decision 034): what is said of a spot is its owner's alone.
- The web app offers to describe a spot once, when it has just been saved, and the offer may wait. The direction the wind blows off the shore is kept when the API is given it, and the web app does not ask for it.
- An alert is to be offered next, and is not built. What an alert is, how many a spot has, and when it speaks are being decided with Téo, in a decision that will replace 008.
- Until then `criteria` and `alerts_enabled` stay on the spot, and the worker reads them as before. The web app sets neither, so no alert is computed for a spot it made.
- The user's spots stand on the map above the catalogue, each a disc with a pin where a break has a wave, and are listed apart from the lists of decision 017. Since 2026-10-12 a list may hold them too.
- The web app says that a spot is private where it is added and where it is read: only its owner sees it.
- The web app warns when the marker stands within 150 meters of a spot the account already has, and saves all the same if asked: two spots may share a place, and a name.
