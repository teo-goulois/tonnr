# 033. The units a reader chooses

Status: accepted on 2026-10-11. Téo asked for it that day: an account's settings hold its units, and every screen that writes a wind speed follows them.

## Context

Every screen wrote the wind in knots. A surfer may read it in knots, a paraglider in kilometres an hour, and a forecast bulletin in metres a second. Météo-France's stations brought readers who are not sailors.

The API answers in SI units, and its answers are the same for every caller: a key, the web app, and the mobile app to come. The wind's scale of colors, the alerts' thresholds and the charts are computed in knots in the web app.

## Decision

- A unit is a way of writing. The API's answers stay in SI units, and nothing the instance stores or computes changes with a reader's choice.
- The choice belongs to the account, so that it is the same on every device: `unit_preferences`, one row an account, read and written by `preferences.getUnits` and `preferences.saveUnits`. They take a session and no key, as the saved shortcuts do, and are not part of the versioned API.
- An account without a row has made no choice, and an app writes in the units it starts with: knots.
- The wind speed is the first unit: knots, kilometres an hour, metres a second or miles an hour. The heights, in metres, and the temperatures, in degrees Celsius, have no choice yet. Each will be a column of the same row.
- The web app keeps the choice in the browser too, so that a page opens in it before the account has answered. The account's answer wins.
- The web app goes on computing in knots: the colors, the thresholds and the curves. A value is turned into the reader's unit where it is written, through `apps/web/src/lib/units.ts`. An axis takes round figures in the reader's unit, set where they stand among the knots.
- A change is seen at once on every screen, and is saved after. When the account does not take it, the screens go back to what the account holds, and say so.
- The choice is in the account's menu: one press, and no page of settings to open.

## Rejected

- **Answers of the API in the caller's units.** One call less to convert on a screen. But an answer would differ from one caller to the next, a kept forecast would be kept in several units, and a key has no reader.
- **The choice in the browser alone.** No table and no route. But a reader would choose again on each device, and the mobile app could not read it.
- **Converting the readings where they enter the screens**, with the scale of colors turned into the same unit. Nothing to convert where a value is written. But every threshold and every scale would exist in four units, and a value kept in a memo would be stale after a change.
- **The Beaufort scale.** It is a scale of forces, not a unit: twelve steps that a curve cannot be drawn in.

## Consequences

- The API is deployed before the web app: a web app that asks an older API for the units gets an error, and writes in knots.
- An alert's wind threshold is written and set in the reader's unit, and kept in metres a second as before. A threshold set in knots can read one figure off in another unit, since both are rounded.
- A new screen that writes a wind speed calls `formatWind` or `windFigure`, and `useUnits` so that it is drawn again when the reader changes units.
- The mobile app reads the same two routes.
