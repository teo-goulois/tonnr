# 002. Tide source

Status: accepted on 2026-10-08.

## Context

Tides are essential to the first release. SHOM publishes the official predictions for French ports and licenses them. A free service pays 100 € per port and per channel each year. La Bouée uses SHOM. `docs/data-sources.md` has the details and the alternatives that were checked.

## Decision

Tonnr computes tides from open harmonic constants, with the Neaps predictor and its station database. The French stations come from TICON-4. The first release ships with this alone.

After the app is released, Téo will ask SHOM for a contract that covers the free app.

`packages/conditions/src/tides/tide-prediction.ts` is the only module that knows where tides come from. Procedures call it, and the alert engine will too. A SHOM-backed source would replace or extend that module.

## Consequences

- Heights are measured from the lowest astronomical tide the database computes, and the API returns that datum name. At Brest this reads 0.33 to 0.44 m below SHOM's figures.
- Times were within 10 minutes of SHOM on a two-port, one-day comparison. A wider validation against open tide-gauge observations is still to do.
- The API computes the tide coefficient itself, since 2026-10-16: see "The coefficient" below.
- A point more than 100 km from a station gets no tide. A global tide atlas could fill that gap later.
- 29 of the 148 French stations are licensed for non-commercial use only. The API returns each station's license.
- The tide database reads a data file next to its own module, so it must stay out of the server bundle. It is a direct dependency of `apps/server` for that reason.
- The database and predictor versions are pinned in the pnpm catalog. `tide-prediction.test.ts` pins Brest's output, so an upgrade that shifts predictions fails the check.

## The coefficient

Added on 2026-10-16, at Téo's request.

The tables of France and Spain print a coefficient with each high water: the amplitude of the semi-diurnal tide at Brest over its unit of height, 3.05 m, times 100, from 20 at the weakest neap tides to 120 at the strongest spring tides. It is defined by astronomy and Brest's constants, so it needs no SHOM data. `packages/conditions/src/tides/coefficient.ts` sums Brest's semi-diurnal constituents from the tide database and reads the coefficient of each of its high waters. On 1 to 9 October 2026 that gave the published coefficients within 2, and a test pins one day of them.

A local high water takes the coefficient of the Brest high water nearest in time, which moves by a few points from one tide to the next. `tides.extremes` gives it on the Atlantic and Channel coasts of France and Spain, where the tables print one, and null elsewhere and at a low water: the Mediterranean has next to no tide, and other countries do not use the figure. The tide's panel writes the day's coefficients beside its date.

## Rejected

- A SHOM license now. It costs money per port before the app has users.
- maree.info as a source. Its terms forbid automated extraction, and its data is SHOM's.
- Open-Meteo's modelled sea level. Its documentation calls it unreliable near the coast.
