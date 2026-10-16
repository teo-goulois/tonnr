# 033. The units a reader chooses

Status: accepted on 2026-10-11. Téo asked for it that day: an account's settings hold its units, and every screen follows them. It began with the wind speed, and he asked the same evening for every measurement.

## Context

Every screen wrote the wind in knots. A surfer may read it in knots, a paraglider in kilometres an hour, and a forecast bulletin in metres a second. Météo-France's stations brought readers who are not sailors.

The API answers in SI units, and its answers are the same for every caller: a key, the web app, and the mobile app to come. The wind's scale of colors, the alerts' thresholds and the charts are computed in knots in the web app.

## Decision

- A unit is a way of writing. The API's answers stay in SI units, and nothing the instance stores or computes changes with a reader's choice.
- The choice belongs to the account, so that it is the same on every device: `unit_preferences`, one row an account, read and written by `preferences.getUnits` and `preferences.saveUnits`. They take a session and no key, as the saved shortcuts do, and are not part of the versioned API.
- An account without a row has made no choice, and an app writes in the units it starts with: knots.
- Five measurements have a choice, each a column of the row. The wind speed is in knots, kilometres an hour, metres a second or miles an hour. The heights of the waves and of the tide are in metres or feet. The temperatures of the water and of the air are in degrees Celsius or Fahrenheit. A distance is in kilometres or miles, and a rain in millimetres or inches. A period stays in seconds and an energy in kilojoules.
- A demo of the guides that teach how to read a forecast ([decision 060](060-learning-to-read-a-forecast.md)) offers the choice of a unit beside its figure, through the same control and the same path: the browser keeps it, and the account when one is signed in, so that a reader who picks feet in a lesson reads feet on the map.
- `preferences.saveUnits` takes the units that change and leaves the others as they are. An app that knows fewer measurements than the API does not undo the choice of another.
- The web app keeps the choice in the browser too, so that a page opens in it before the account has answered. The account's answer wins.
- The web app goes on computing in knots and in the metric units: the colors, the thresholds and the curves. A value is turned into the reader's unit where it is written, through `apps/web/src/lib/units.ts`. An axis takes round figures in the reader's unit, set where they stand among the values.
- A change is seen at once on every screen, and is saved after. When the account does not take it, the screens go back to what the account holds, and say so.
- The choices are a line for each measurement in the account's panel, with its other settings: [decision 040](040-phone-navigation.md). They were first a dialog, opened from the account's menu.

## Rejected

- **Answers of the API in the caller's units.** One call less to convert on a screen. But an answer would differ from one caller to the next, a kept forecast would be kept in several units, and a key has no reader.
- **The choice in the browser alone.** No table and no route. But a reader would choose again on each device, and the mobile app could not read it.
- **Converting the readings where they enter the screens**, with the scale of colors turned into the same unit. Nothing to convert where a value is written. But every threshold and every scale would exist in four units, and a value kept in a memo would be stale after a change.
- **The Beaufort scale.** It is a scale of forces, not a unit: twelve steps that a curve cannot be drawn in.

## Consequences

- The API is deployed before the web app: a web app that asks an older API for the units gets an error, and writes in knots.
- An alert's thresholds are written and set in the reader's units, and kept in SI units as before. A threshold set in one unit can read one figure off in another, since both are rounded.
- A new screen that writes a measurement calls the function of `units.ts` for it, such as `formatWind` or `formatHeight`, and `useUnits` so that it is drawn again when the reader changes units.
- The tide's axis keeps its figures where the metres put them, and writes them in the reader's unit: in feet they are not round. The curves of the waves and of the wind take round figures in either unit.
- An alert's thresholds of height are set by the half foot in feet, and by the tenth of a metre in metres.
- The mobile app reads the same two routes.
