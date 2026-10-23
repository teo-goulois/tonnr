# 079. The catalogue names no other list

Status: decided by Téo on 2026-10-23, before the apps go to the stores. It amends what [decision 024](024-one-catalogue-of-breaks.md) returns of a break, and what [decision 045](045-mcp-server.md) says an answer names, for a surf break only.

## Context

A break kept the list it was read from: a page, an attribution and a licence, and the apps showed them. A break added from a candidate named its list and nothing else. The same catalogue then said two things. Some spots linked to "see its source". The others only said "Surf break".

The catalogue is Tonnr's own. Gathering what other lists said of a spot stays with the operator, in the admin and in the private research catalogue of [decision 065](065-private-catalogue-in-the-admin.md). What a person reads does not name another list.

## Decision

- A public answer of a break sets `source` to null: the provider, the page, the attribution and the licence. The fields stay, so a released client still reads them. `describeBreak` in `packages/api/src/routers/breaks.ts` is where. The catalogue's ODbL is stated once, on `/sources`, not on each break.
- The web app, the app for phones and the public page of a break say "Surf break", and nothing of a list. A measurement, a forecast, a tide and the map still name theirs.
- `/sources` says the catalogue is Tonnr's own, under the ODbL. That licence is the catalogue's, not the credit of another list. A spot an account asks to make public is still accepted under it, as [decision 034](034-public-spots.md) says, and the terms still say so. The row keeps that licence. A public answer of one break does not repeat a list's page or attribution.
- The admin still reads the list, the reference, the page, the attribution and the licence, and what a list said of the break. A merge can still keep one source or the other.

## Rejected

- **Removing `source` from the answer.** [Decision 003](003-api-versioning.md): a released version only grows.
- **Clearing the columns.** The operator still uses them, and whoever added a list still answers for it.
- **Hiding the credits of a measurement, a forecast, a tide or the map.** Those are not the catalogue.

## Consequences

- An agent that reads a break is told that `source` is null, and that the catalogue names no other list.
- A build already installed stops showing a list as soon as the API answers null. A new build never looks for one.
