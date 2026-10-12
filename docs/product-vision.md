# Product vision

Confirmed with Téo on 2026-10-08, and changed at his request on 2026-10-11: a spot and its alert are two things. Changed again on 2026-10-12: a spot is made public by a request, and shared through a list. Update this file when the product changes. Decisions about how it is built go in `docs/decisions/`.

## Audience and problem

Surfers who want to know when their own spots work. Existing apps show buoy data and forecasts, then leave the surfer to check them and to judge each spot from memory. La Bouée (labouee.app) is the reference for data coverage. Its API is proprietary and by invitation.

## What Tonnr does

- A user adds a spot: a point on the map and a name. They find the place by searching for a beach or a town, or pick it from a catalogue of known surf breaks, then put a marker where the wave breaks. Their own point stays private. They may ask that it be made public: it joins the catalogue only once a moderator has checked that it is known to all, so that nobody publishes a secret spot by accident. Decision 034 gives the rules.
- The user may describe their spot as a surf guide would: its type, its bottom, the tides and the directions it likes.
- The user sets an alert on a spot, with the conditions that make it work: swell height, period and direction, wind, and tide. Tonnr tells them when measurements or forecasts match. Téo said on 2026-10-11 what an alert is and when it speaks: decision 031 holds it.
- A user keeps buoys, wind stations, surf breaks and their own spots as favorites and sorts them into lists. Decision 017 gives the model.
- The map colors the sea by its wave height, between the buoys and for the days ahead. Decision 018 covers the source.
- An API serves the data underneath: buoy measurements, forecasts, tides, and history. It asks who calls: an account, or a program with a key that the operator gave it.
- Whoever runs an instance does it from an admin app: the developer accounts that hold the keys, how much each one calls, and the accounts that signed up. Decision 020 covers it.

Tonnr lives at `tonnr.app`. Decision 013 records the name.

Tonnr is free and not commercial for now. It is open source: the repository is public, and anyone may host an instance of their own. Decision 012 says what follows from that. Téo wants a better interface and richer notifications than La Bouée offers.

## First release

- The API and a small web app.
- Measurements from every buoy of the public networks, ingested continuously.
- Swell and wind forecasts, fetched per spot.
- Tides, computed from open harmonic constants. Téo rates them as essential. Decision 002 covers the source.
- History for a point, switched on when a user first shows interest in that point.
- Alerts when a spot is forecast to work. They are recorded and listed by the API, and sent by email to an account that said yes. Sending them by web push is not built.
- A catalogue of surf breaks that the instance's operator fills once, from OpenStreetMap or from a file, each break with what is known of it: its type, its bottom, the tides and the directions it likes. Decisions 015 and 024 cover it. A user's spot joins it after moderation: decision 034.

A mobile app follows the first release. The API runs as its own service, and notifications are designed for mobile push from the start.

## Non-goals for the first release

- A mobile app.
- Commercial use and paid plans.
- Sofar Ocean data. Its terms forbid republication.
- Satellite altimeter passes.

## Facts

Checked on 2026-10-08. Provider details are in `docs/data-sources.md`.

- La Bouée lists 661 live buoys. At one reading every 30 minutes, that is about 12 million rows a year.
- For a point that is not a buoy, history comes from models: 92 days at forecast resolution, then the ERA5-Ocean reanalysis from 1940 on a 50 km grid.
- A forecast that is not stored when it is issued cannot be recovered. Comparing forecast and reality for a point starts when its history is switched on.
- Being free does not make every source usable. Cefas reserves its "non-commercial" stations for government and academic use.

## Assumptions

- Sharing works by invitation on each spot. There is no friends list yet.
- Support is by email, and Téo answers it.
- Wind forecasts come from the same provider as wave forecasts.

## Open questions

- Which buoys of the five unchecked networks may be redistributed.
- Where a fuller list of surf breaks can come from. The open sources are thin, and the full lists are proprietary.
