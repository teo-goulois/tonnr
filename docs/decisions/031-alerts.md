# 031. An alert of its own, set on spots

Status: accepted on 2026-10-11, and being built: its rules are written and tested in `packages/conditions/src/alerts/`, and the first version still runs until the worker reads them. It replaces [decision 008](008-alerts.md), whose rules Téo had not confirmed. He answered six questions that day, and what follows is built from his answers. Where a rule is not his but follows from one, the text says "chosen here": those are his to overturn.

## Context

Decision 008 kept an alert inside the spot: the spot's criteria, and a switch. Téo tried a screen that set both at once and asked for two things instead (decision 006, "A spot without its alert"): a spot is a place, and its alert is another object. He calls the alert the most important part of the product.

The first version also had faults that no rule of it named. It announced a window in the middle of the night. It counted days in UTC. It kept one window a day. It sent nothing: an alert was a line in a panel that had to be opened. And it could not say that a window had begun.

## What Téo said

- **One alert for a spot.** Spots that lie side by side and work in about the same conditions may share one. An alert has a name.
- **When it speaks.** At three moments, each of which can be switched off: when a window takes shape and holds on two forecasts in a row; the evening before, in one message for all the spots of the next day; when an announced window goes or moves by more than two hours.
- **How far ahead** is a setting of the account, not of the alert.
- **Availability** is a setting of the account too: the alert stays quiet when its owner cannot go.
- **Strict conditions for now.** Later a window may come with a likelihood, "80% that it matches".
- **By mail**, with web push made ready.
- **"It is on"**: the alert says so when its window has begun, to remind its owner that it is live.
- **A setting for everything.**

## Decision

### The alert

- An alert belongs to one account, and only that account reads it. It has a name, the conditions that make its spots work, and a switch. The conditions are the criteria of decision 006, unchanged: swell height, period and direction, wind speed and direction, tide height and trend.
- An alert is set on one spot or on several, all of its account. A spot is in one alert at most. The conditions are checked at each of its spots, with that spot's own forecast and tide: spots that share an alert share what is asked of the sea, not the sea.
- An alert keeps the shortest window worth telling, two hours unless its owner says otherwise. Chosen here, and kept on the alert: a spot that works an hour around low tide is a matter of the spot, not of the person.
- An alert whose last spot is deleted, or taken out of it, is deleted with it.
- An account holds at most 100 alerts, and an alert at most 12 spots. Chosen here.
- `spot.criteria` and `spot.alerts_enabled` are gone. Each spot whose criteria were not empty, or whose alerts were on, gets an alert of its name, with those criteria and that switch. `v1` has not been released (decision 003), so the spot's answer loses the two fields, and `GET /v1/spots/{id}/conditions` becomes the alert's.

### The settings of an account

One set for all the alerts of an account, each with a default so that an account that sets nothing is told sensibly.

| Setting                       | Default                                                              | What it does                                                                                        |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| How far ahead                 | 3 days, 7 at most                                                    | A window that opens later than that is not told yet.                                                |
| Time zone                     | the browser's, when the account first saves its settings or an alert | Days, the evening, and the hours of availability are read in it. UTC until then.                    |
| Language                      | the web app's, at the same moment                                    | The language of what is sent.                                                                       |
| When a window takes shape     | on                                                                   | The first moment below.                                                                             |
| The evening before            | on, at 19:00                                                         | The second.                                                                                         |
| When a window goes or moves   | on                                                                   | The third.                                                                                          |
| When a window begins          | on, at its beginning                                                 | "It is on". It can be told ahead, by the time it takes to get there: up to four hours. Chosen here. |
| Daylight only                 | on                                                                   | A window is cut to the hours between dawn and dusk at the spot.                                     |
| Hours of each day of the week | any hour                                                             | A window is cut to the hours the account gives for that day. A day with none is a day off.          |
| A pause                       | none                                                                 | Until a date, nothing is told. Chosen here.                                                         |
| Quiet hours                   | 22:00 to 07:00                                                       | A message that would leave then waits for their end. Chosen here.                                   |
| By mail                       | asked with the first alert                                           | To the account's address, once it is checked (decision 026).                                        |
| Names in a mail's subject     | on                                                                   | Off, a subject says that an alert has news and names no spot. Chosen here.                          |
| By push                       | off                                                                  | Made ready: see below.                                                                              |

- A setting changes what is told from then on. It calls nothing off and tells nothing again, and a change of settings is never told as a change of the sea.

### Windows

- A **sea window** is a run of hours, at one spot, in which every condition is met. It runs from the first such hour to the end of the last.
- What an account can do with it are its **open hours**: the hours of the sea window that are in daylight at the spot when the account asks for daylight, inside the account's hours for that day, and outside a pause. They may come in several pieces, each at least as long as the alert's shortest window. A sea window with no such piece is kept in mind and not told.
- Every window that qualifies is told: a morning and an evening of one day are two.
- A sea window found at a look is the same as one known at that spot when the two overlap, or, failing that, when they begin within six hours of one another. Each known window is matched once, to the nearest.
- Hours are counted as time that passes, in the account's time zone: an hour that the clock skips does not exist, and one it repeats counts twice.

### The moments

The worker looks at each alert every three hours: at each of its spots, over the seven days ahead, whatever the account's setting, so that a window already told is followed to its end. It keeps what it saw of each sea window, in a table of its own, and decides from it. A look that could read no fresh forecast (decision 023) is no look: it counts for nothing and against nothing.

- **Found.** A window is told once two looks in a row have found it, it has open hours, and they begin within the days the account asks for. Two looks are three hours apart: the model may not have run again between them, and "two forecasts" is as much as an instance that asks one model can say.
- **Moved.** A told window whose sea has moved, and whose open hours now begin or end more than two hours from what was told, is told again.
- **Gone.** A told window that two looks in a row do not find, and that has not passed, is called off. A window that was never told goes without a word. One that comes back is a new window, to be found again.
- **The evening before.** At the hour the account chose, one message lists the open hours of the next day, alert by alert and spot by spot, of the windows two looks have found. It leaves when its hour has come, or later that evening when the worker was late, and never after midnight. An evening with nothing to list sends nothing.
- **It is on.** When open hours begin, the alert says so, once for each piece, whether the window was told before or not: the moments are switched one by one. It is told ahead by as long as the account asked. It needs a look no older than six hours that still found the window.
- An alert on several spots tells them together: one message for an alert and a look, with a line for each spot. "It is on" is told for the spots that begin in the same quarter of an hour.
- The evening message lists what "found" may have told an hour before. It is the day's recap, not news.

### What the buoy says

- "It is on" comes with the latest reading of the nearest wave station that the sea reaches freely (decision 011), within 60 km of the spot and no older than two hours: its significant height, its peak period and direction, and how old the reading is.
- The message does not say that the buoy confirms the window. A buoy measures the whole sea where it floats, wind sea included, and an alert asks for a swell at a beach: one cannot be held against the other. The reading is given for the reader to judge.
- Far from any buoy the message says the window has begun, and no more.

### What is sent, and how

- A notification is a row that does not change: which alert, which moment, and what it said of which spots and windows. The web app lists them and marks them read. A moment is told once: its row has a key that a second worker, or a retry, cannot write twice.
- For each way out the account chose, a notification has a delivery: when it may leave, until when it is worth sending, and what became of it. Quiet hours set the first. A message that waited is looked at again before it leaves: one whose window has gone or ended meanwhile is not sent.
- "Moved" and "gone" leave by a way out only when the window was told by it.
- The worker sends. It is the program that knows when a moment comes, and it now holds the instance's mail settings as the API does. `packages/mail` stays the one way out. This changes decision 026, where only the API sent mail.
- A mail goes to an account whose address is checked, on an instance that sends mail, and that said yes to mail when it made its first alert. Otherwise the notification stays in the list.
- An account is mailed at most 8 alert mails a day, counted apart from the mails that check its address, and the alerts take at most four fifths of the instance's daily mails. Days are UTC days. Past either, the delivery is marked as held back by the limit, and is not tried again. Chosen here.
- An alert mail is plain: no image, nothing loaded from elsewhere, no link that counts who followed it. It names the alert and the spots, gives the window in the account's time and the forecast in it, credits the forecast and the buoy, says when each was fetched, and links to the spot and to the settings.
- It carries the two headers that let a mail program switch alert mails off in one press, and a link to a page with one button that does the same. The link holds a token that does that and nothing else: it reads nothing and switches nothing on. It is the one route of the API that needs neither a session nor a key, and it is a `POST`: a program that follows the links of a mail switches nothing off.
- The log holds counts and kinds of failures. It names no alert, no spot and no address.
- Push is made ready, not sent yet. A delivery already names its way out, and the settings hold the switch. Adding push is a table of the browser's subscriptions, the web app's service worker, a pair of keys for the instance, and one more sender.

### Conditions stay strict

- An hour meets every criterion or does not.
- A likelihood needs a forecast that says how sure it is: several models, or a model's ensemble. The instance asks one model once. When it asks more, an alert may take a lowest likelihood, and a window may come with one.

## Rejected

- **Several alerts on one spot**, one for small clean days and one for big ones. It was the proposal put to Téo, and he chose one alert for a spot: fewer things to keep in mind, and fewer messages about the same beach.
- **Settings on each alert** for the moments, the days ahead and the availability. They describe the person, and a person with eight alerts would set them eight times.
- **Telling a window at first sight**, even one that begins within the day. Téo asked for two forecasts in a row, and the first version called off what it had just announced. A window that appears too late to be found twice is still told when it begins.
- **Saying that the buoy agrees, or does not.** It was the first draft of this decision. A significant height is not a swell height, and a wind sea can lift it over a threshold on a day without swell.
- **A message only when a buoy is near.** A buoy is offshore, sometimes down, and absent from most coasts. Silence would read as "nothing is happening".
- **The API sending the alerts' mail.** It has no clock of its own: it answers requests.

## Consequences

- An alert on a spot far from any tide station never meets a tide criterion (decision 006), and so never speaks. The editor says so before the alert is saved.
- The worker reads the mail settings. An instance that set them for the API alone sends no alert mail until the worker has them: `docs/self-hosting.md` says so.
- An alert costs two forecast requests per look for each cell of the model its spots stand in, sixteen a day, and neighbours share a cell (decision 023). Twelve spots along a coast can be twelve cells. The worker looks first at the alerts it looked at longest ago, so that an instance short of requests leaves none behind for good.
- Every fifteen minutes is how often the worker checks what begins. "It is on" can come up to that much late, and later when the worker is busy or down.
- The time zone is the account's. A spot abroad is told in the account's hours, and its daylight is its own.
- A mail that bounces, or that its reader marks as unwanted, is not known to the instance: it reads no report from its mail provider yet.
- The first version's notifications are dropped with its table's shape. Nothing had been sent.
- One model, one run at a time: an alert is as good as that forecast.
