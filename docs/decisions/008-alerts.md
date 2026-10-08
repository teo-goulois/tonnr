# 008. Alerts

Status: accepted on 2026-10-08. First version, with rules proposed to Téo and not yet confirmed by him.

## Context

The product's point is to tell a surfer when a spot works. A forecast changes from one model run to the next, so a naive alert would announce a window, withdraw it, and announce it again.

## Decision

- Alerts are switched on per spot, with `spot.alerts_enabled`.
- Every three hours the worker evaluates each such spot over the next three days, with the same computation as `GET /v1/spots/{id}/conditions`.
- `planNotifications` in `packages/conditions/src/alerts/plan.ts` decides what to tell the owner. It is a pure function, and its tests are the specification:
  - A day gets one "window found" notification, for its longest window of at least two hours. A day is a UTC day, the one on which the window starts.
  - A window that overlaps an announced one is the same window, even when it runs on from an earlier day. Later evaluations keep its notification up to date without telling the owner again.
  - A window that is missing from two evaluations in a row, and has not passed, gets one "window cancelled" notification.
- An evaluation locks its spot and reads it again before writing, so it writes nothing for a spot that was changed or switched off while the forecast was being fetched, and two evaluations of one spot cannot overlap.
- A notification is a row of `notification`. The API lists a user's notifications and marks them as read.

## Consequences

- Nothing is sent yet. Email and push need a sending service, which Téo has not chosen. They will read the same rows.
- A window that comes back after it was called off is not announced a second time.
- Days are UTC days. A surfer in another time zone can get a window attributed to the neighbouring day.
- Each spot with alerts costs two forecast requests per evaluation when its grid cell is not cached. Open-Meteo's free tier allows about 600 such spots at this rhythm.
- Only the forecast triggers an alert. A buoy measurement does not yet say "it works now".
