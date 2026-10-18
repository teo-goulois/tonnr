# Product vision

Confirmed with Téo on 2026-10-08, and changed at his request on 2026-10-11: a spot and its alert are two things. Changed again on 2026-10-12: a spot is made public by a request, and shared through a list, the accounts that know a public spot write its guide, and an account has friends, made by a link of its own. Changed on 2026-10-13: a spot is found by its name, and an account keeps a log of its sessions. Changed on 2026-10-16: the sizes said in the sessions, and a line of the guide, say how big a break's waves run against the forecast, and an account says once what it is as a surfer. Changed on 2026-10-18: a session keeps its photos and videos, and accounts show the waves of a public break as they are, in reports. Update this file when the product changes. Decisions about how it is built go in `docs/decisions/`.

## Audience and problem

Surfers who want to know when their own spots work. Existing apps show buoy data and forecasts, then leave the surfer to check them and to judge each spot from memory. La Bouée (labouee.app) is the reference for data coverage. Its API is proprietary and by invitation.

## What Tonnr does

- A user adds a spot: a point on the map and a name. They find the place by searching for a beach or a town, or pick it from a catalogue of known surf breaks, then put a marker where the wave breaks. Their own point stays private. They may ask that it be made public: it joins the catalogue only once a moderator has checked that it is known to all, so that nobody publishes a secret spot by accident. Decision 034 gives the rules.
- The user may describe their spot as a surf guide would: its type, its bottom, the tides and the directions it likes.
- An account writes what it knows of a public spot, one line of its guide at a time: what the wave is like, how to get there, where to enter the water, what to watch for, and what the place asks of whoever surfs it. A moderator, or the accounts that keep the spot, confirm it: everyone then reads it, under its author's username. How crowded a spot is, how its locals take a visitor and the level it asks are answered by each account for itself, and shown as how the answers spread. What an account wrote and that was confirmed counts for a score and a rank, named after surfing's tours. Téo wants a surfer who arrives somewhere new to find how every spot works, written by the people who surf it. Decision 041 gives the rules. One line of the guide says how big the waves run against the forecast, in a few steps, with one sentence on why: decision 062.
- The user sets an alert on a spot, with the conditions that make it work: swell height, period and direction, wind, and tide. Tonnr tells them when measurements or forecasts match. Téo said on 2026-10-11 what an alert is and when it speaks: decision 031 holds it.
- A user keeps a log of their sessions: where, when, how long, a rating, a note, and their photos and videos, which they alone see (decision 066). Tonnr keeps what the sea did with each one, even for a session written later, and says from the best-rated ones what the user likes at a spot, which an alert is made of. Téo wants the conditions of an alert to come from what was surfed, not from memory. Decision 043 gives the rules. The sizes said in the sessions of everyone at a break add up to one figure that break's panel says: how many times the forecast its waves run, with the number of sessions it comes from, once five sessions of two accounts gave one. Two breaks a kilometre apart read the same forecast and are not the same size: decision 062.
- An account sends a report at a public break: photos and videos of the waves as they are, with how big they look and a few words. Each is checked to have been taken there in the last two hours, from what the file or the phone says, and to show the sea, by models that run on the instance. Everyone reads the reports of the week, under their author's username, and three accounts hide one until a moderator decides. Téo wants a surfer to see a break now, not only what the models say of it. Decision 067 gives the rules.
- A user keeps buoys, wind stations, surf breaks and their own spots as favorites and sorts them into lists. Decision 017 gives the model.
- A user shares a list by a link, with a password if they wish. Whoever has the link sees the map with that list alone, their private spots in it too, and needs no account. Decision 035 gives the rules.
- The map colors the sea by its wave height, between the buoys and for the days ahead. Decision 018 covers the source.
- A reader finds a spot, a buoy or a town by its name, from the map, whatever marks the name carries.
- Anyone opens the map without an account: the buoys, the breaks, the forecasts and the tides. An account is for what a user keeps: spots, lists and alerts. While demand is strong the map closes to visitors, by itself or when whoever runs the instance says so: they are then asked to sign in or to create an account. Decision 039 gives the rules.
- An account signs in with email and password, or with Google when the instance offers it. Decision 046 gives the rules.
- An account has a username, which is what others read of it. Email sign-up asks for it; a new Google account chooses one when the app needs it.
- An account is asked once, as it first opens the map, what it is as a surfer: its level, the waves it surfs from the smallest to the biggest, how well it reads a forecast, and its boards, each question to skip, with three lines on what the app does best before them. Every account is asked, those that existed before too, and may put it off. Téo wants the advice of an assistant, and of the app, to fit the person from the first day: decision 063.
- An account has a link of its own, which it sends or shows as a code. Whoever makes an account through it has the link's owner as sponsor, and the two are friends. An account that exists already and opens it becomes a friend. Friends read each other's username, rank and contributions, and nothing of each other's spots, alerts or lists. An account that was brought and then contributes counts for its sponsor.
- An API serves the data underneath: buoy measurements, forecasts, tides, and history. It asks who calls: an account, a program with a key that the operator gave it, or the web app for a visitor. An agent reads it through an MCP server, with a key, or as an account that signed it in: an assistant then reads that account's spots, alerts and sessions, and what it said of itself as a surfer, and changes nothing. Decisions 045 and 047 give the rules.
- Whoever runs an instance does it from an admin app: the developer accounts that hold the keys, how much each one calls, the accounts that signed up, what users ask to show to everyone, and whether the map is open to visitors. Decision 020 covers it.

Tonnr lives at `tonnr.app`. Decision 013 records the name.

Tonnr is free and not commercial for now. It is open source: the repository is public, and anyone may host an instance of their own. Decision 012 says what follows from that. Téo wants a better interface and richer notifications than La Bouée offers.

## First release

- The API and a small web app.
- Measurements from every buoy of the public networks, ingested continuously.
- Swell and wind forecasts, fetched per spot.
- Tides, computed from open harmonic constants. Téo rates them as essential. Decision 002 covers the source.
- History for a point, switched on when a user first shows interest in that point.
- Alerts when a spot is forecast to work. They are recorded and listed by the API, and sent by email to an account that said yes. The worker also sends them by web push to a browser that subscribed: an account switches push on in the web app, device by device, in the settings of its alerts.
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

- Sharing works by the link of a list. A friend reads no list of the other's that was not shared that way.
- Support is by email, and Téo answers it.
- Wind forecasts come from the same provider as wave forecasts.

## Open questions

- Which buoys of the five unchecked networks may be redistributed.
- Where a fuller list of surf breaks can come from. The open sources are thin, and the full lists are proprietary.
