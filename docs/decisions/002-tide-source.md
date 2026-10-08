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
- The API returns no tide coefficient.
- A point more than 100 km from a station gets no tide. A global tide atlas could fill that gap later.
- 29 of the 148 French stations are licensed for non-commercial use only. The API returns each station's license.
- The tide database reads a data file next to its own module, so it must stay out of the server bundle. It is a direct dependency of `apps/server` for that reason.
- The database and predictor versions are pinned in the pnpm catalog. `tide-prediction.test.ts` pins Brest's output, so an upgrade that shifts predictions fails the check.

## Rejected

- A SHOM license now. It costs money per port before the app has users.
- maree.info as a source. Its terms forbid automated extraction, and its data is SHOM's.
- Open-Meteo's modelled sea level. Its documentation calls it unreliable near the coast.
