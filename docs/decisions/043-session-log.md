# 043. An account keeps a log of its sessions, with what the sea did

Status: accepted on 2026-10-13. Téo asked for it that day: a session added from the "+", a logbook to draw a recap from, a rating on each session, and everything the sea did kept beside a rated one, "dans le but de pouvoir cerner les conditions qu'il aime sur ce spot". He warned that a session may be written later. He left the rest to choose: what is marked "chosen here" is his to overturn.

## Context

A surfer judges a spot from memory, and an alert asks them for the conditions that make it work. Nothing recorded what the sea did the day a session was good, so the conditions of an alert were a guess.

The instance keeps a forecast two days ([decision 023](023-forecasts-kept.md)). A session written the week after had nothing to read: the hours it lasted were gone.

## Decision

- A session is an account's: where, when it began, how long, a rating from 1 to 5 or none, and a note. It is at a break of the catalogue or at a spot of the account's own. `surf_session` keeps the place's name and its point as the session's own, and the place's id while the place is there: a session outlives its spot and its break.
- What the sea did is read when the session is written, and kept with it in `conditions`, as a copy that follows nothing. Chosen here: every session has it, rated or not. A log reads better with the sea on every line, and a session rated the week after already has what was read while it could be.
- The conditions hold what the models last computed of the session's hours, from the hour it began in to the one it ended in; the tide, where it is predicted nearest; what the nearest buoy and the nearest wind station measured meanwhile; and the way the shore faces, as the place said it then.
- For the two days the instance keeps, the hours are the forecast's in force: the finer waves and the swell apart with them, and no request more. Further back they are asked of Open-Meteo by their dates, each time, at the price of a forecast: two requests of the people's share. They are then the provider's own models: the whole sea, the wind and the weather, and no swell apart. Nothing keeps them but the session. `forecasts.over`, in `packages/conditions`, does both.
- The models are asked 90 days back. Open-Meteo's weather answered 92 days back on 2026-10-13, and its waves further. A session further back keeps the tide and the stations alone.
- These hours are what the models last computed, not the forecast as it was issued: the nearest the instance has to what happened.
- A session is written whatever the provider does. `modelMissing` says why the models gave nothing: no sea at the point, too long ago, or not to be asked then. In that last case, changing the session, or sending it again as it is, asks once more.
- An account has days of the past read 20 times an hour, counted in the API's memory. Beyond, its sessions are written and wait. Chosen here, so that no account spends the day's requests by writing sessions and deleting them.
- The tide is computed, for any day. A buoy is read when it is within 60 km and not known to be sheltered, as "it is on" reads it ([decision 031](031-alerts.md)), and a wind station within 30 km, each on what it measured from an hour before the session to an hour after it. The instance keeps the readings of a station that measures the wind alone seven days: an older session has none.
- A session's figures are read at its middle: the models' for the waves, the wind and the weather, since an alert reads those, with the buoy and the wind station beside them. `sessionFigures` computes them from the copy each time, so that they may be read another way later.
- When a session moves in time, its conditions are read again. A rating or a note changes nothing of them.
- What an account likes at a place is read from the sessions it rated 4 or 5 there, once there are three: the heights, the tides and the bearings they span, the shortest period, the strongest wind. It is said as the conditions of an alert are, by `likedConditions`, so that an alert is begun from it at a spot of the account's own. Chosen here: the numbers, and that the web app computes it from the place's sessions.
- An account keeps 2,000 sessions. A session has begun when it is written, a quarter of an hour of a clock's error forgiven, and is no more than ten years old.
- The procedures are `sessions.create`, `list`, `get`, `update`, `delete` and `recap`, in the versioned API, for a session alone. Nobody else reads an account's sessions: no friend, no list, no link.
- In the web app the "+" of a phone's bar has a third choice, a session: it asks where, then when, how long, the rating and the note. The form is three lines and a few words, which Téo asked to be "plus natif" and "très minimaliste, clean et crisp" on 2026-10-13: the day and the hour each on a pill that opens the device's own picker, the length on a pill that opens its own list, every quarter of an hour up to four hours and every half hour up to eight, and five stars. The panel of a break and of a spot has a tab for the sessions surfed there, with what the account likes there. The log is one step into the account's panel, `?panel=account&settings=sessions`, with what it comes to. Chosen here.

## Rejected

- **The conditions of a rated session alone**, as it was first said. Fewer requests for sessions written late. But a session rated afterwards would have had to be read then, further from the day, and a line of the log without the sea says little.
- **Keeping every forecast as it was issued**, which decision 023 set aside. It would answer any session, and compare a forecast with what happened. It is a table without end, for hours of which nearly none is ever surfed.
- **A job of the worker that reads a session once it has ended.** The buoy would have every reading of the session. But a session is nearly always written afterwards, and the log would wait for its conditions.
- **The stores of Copernicus Marine for older hours**, which hold months of the swell apart. It asks for a reader of a span of the past in what reads them, which reads from three days back to the model's last hour. To take up again if the swell of an old session is missed.
- **A reanalysis beyond 90 days**, which Open-Meteo serves from another address. Another shape of answer and other models, for sessions few will write.
- **A session at a buoy, or at a point of the map.** A session is where there is a wave, and its tab needs a panel.

## Consequences

- The API is deployed before the web app. The migration that adds the table is applied as the API starts.
- A session written more than two days after it was surfed costs two requests of the people's share, and has no swell apart.
- `SessionConditions` is the shape of what is kept. Changing it means reading both shapes, or migrating the rows.
- Sessions go with their account, by the database's own cascade.
- Not built: a session's photos and its board, sessions shown to friends, a recap of the year sent by mail, a session read from a watch, and an alert begun at a break of the catalogue, which first needs a spot made of it.
