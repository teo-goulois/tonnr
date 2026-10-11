# 031. An alert of its own, set on spots

Status: accepted on 2026-10-11, and being built. Built: the alert and the settings in the API, the rules in `packages/conditions/src/alerts/`, the worker's look, which writes "found", "moved" and "gone", its lighter pass every quarter of an hour, which writes "it is on" and the evening before, and the web app's screens: the alert of a spot, said in one sentence in the spot's panel, and what was told, the alerts and the settings under the bell. Not built yet: the mail, with the quiet hours that hold it back, and push, which the settings show as to come. It replaces [decision 008](008-alerts.md), whose rules Téo had not confirmed. He answered six questions that day, and what follows is built from his answers. Where a rule is not his but follows from one, the text says "chosen here": those are his to overturn.

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
- An alert asks at least one thing of the sea: with no condition every hour would be a window. A range with neither a least nor a most asks nothing, and is not kept.
- An alert starts over when its conditions change, when it is switched off, and at a spot that is moved: what it saw of the sea and what it told there are forgotten, and nothing is called off. The sea is another under other conditions, and at another place. Chosen here.
- `spot.criteria` and `spot.alerts_enabled` are no longer read. Each spot whose criteria were not empty gets an alert of its name, with those criteria and the spot's switch. A range with neither end is left out on the way, and a spot with no criteria gets no alert, whatever its switch said. The two columns stay one release more, for the version that still reads them while this one is deployed (decision 009), and the release after drops them. It first gives an alert to each spot that has criteria and no alert, which the version before may have made meanwhile. A change of criteria made through the version before while this one is deployed, to a spot that has its alert already, is not carried over: no screen ever set a spot's criteria. `v1` has not been released (decision 003), so the spot's answer loses the two fields, and `GET /v1/spots/{id}/conditions` becomes `POST /v1/alerts/preview`, which tries conditions at spots before they are saved.

### The settings of an account

One set for all the alerts of an account, each with a default so that an account that sets nothing is told sensibly.

| Setting                       | Default                                                              | What it does                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How far ahead                 | 3 days, 5 at most                                                    | Today and that many days after it, on the account's calendar. A window that opens later is not told yet. Five is as far as the forecast holds whole days ahead of any account's today: it reaches seven days, counted from the UTC day. |
| Time zone                     | the browser's, when the account first saves its settings or an alert | Days, the evening, and the hours of availability are read in it. UTC until then.                                                                                                                                                        |
| Language                      | the web app's, at the same moment                                    | The language of what is sent.                                                                                                                                                                                                           |
| When a window takes shape     | on                                                                   | The first moment below.                                                                                                                                                                                                                 |
| The evening before            | on, at 19:00                                                         | The second.                                                                                                                                                                                                                             |
| When a window goes or moves   | on                                                                   | The third.                                                                                                                                                                                                                              |
| When a window begins          | on, at its beginning                                                 | "It is on". It can be told ahead, by the time it takes to get there: up to four hours. Chosen here.                                                                                                                                     |
| Daylight only                 | on                                                                   | A window is cut to the hours between first light and last at the spot: the sun less than six degrees under the horizon, about half an hour before it rises and after it sets. Chosen here.                                              |
| Hours of each day of the week | any hour                                                             | A window is cut to the hours the account gives for that day. A day with none is a day off.                                                                                                                                              |
| Away until                    | no date                                                              | No hour before that date is open, so none is told. A window after it is told as any other. Chosen here.                                                                                                                                 |
| Quiet hours                   | 22:00 to 07:00                                                       | A message that would leave then waits for their end. Chosen here.                                                                                                                                                                       |
| By mail                       | asked with the first alert                                           | To the account's address, once it is checked (decision 026).                                                                                                                                                                            |
| Names in a mail's subject     | on                                                                   | Off, a subject says that an alert has news and names no spot. Chosen here.                                                                                                                                                              |
| By push                       | off                                                                  | Made ready: see below.                                                                                                                                                                                                                  |

- A setting changes what is told from then on. It calls nothing off and tells nothing again, and a change of settings is never told as a change of the sea. The look that follows a change of the account's hours, daylight, absence or zone, or of the alert's shortest window, first cuts what was told again, as the sea known until then would have been told under the hours as they are now, and says nothing of it. Hours that the change closed are forgotten, hours that it widened stay told, and hours that it opened elsewhere in the day are told as any new ones: at that look a told window is followed only where it overlaps what is found, and is not said to have moved to hours the change may have opened. Then it reads the forecast as any look does: a window the sea leaves at that same look is still called off after two.
- The time zone and the language are offered by the device with each thing it saves, and taken by an account that has none yet, and by no other: the database decides, so that two devices at once do not take one another's place. A zone that the account chooses is taken as it is.
- A moment that is switched off is not written anywhere: the web app's list has it no more than the mail. Hours that "found" did not tell are not followed, so nothing is said of what becomes of them. With changes switched off, what was told is kept in line with the sea, without a word.

### Windows

- A **sea window** is a run of hours, at one spot, in which every condition is met. It runs from the first such hour to the end of the last.
- What an account can do with it are its **open hours**: the hours of the sea window that are in daylight at the spot when the account asks for daylight, inside the account's hours for that day, and after the date it is away until. They may come in several pieces, each at least as long as the alert's shortest window. A sea window with no such piece is kept in mind and not told.
- An hour of the forecast is open whole or not at all. It is in daylight when most of it is, and inside the account's hours when they cover all of it, wherever the account's midnight falls in it.
- What is told are open hours, piece by piece. A sea window that lasts three days is three mornings to an account that goes in the morning, and each is found, moved or gone for itself. Every piece that qualifies is told: a morning and an evening of one day are two.
- A sea window found at a look continues every window known at that spot that it overlaps, and is as sure as the surest of them: one that splits leaves two that are as sure as it was. Failing an overlap, it continues the nearest known window that nothing else does, when the two begin within six hours of one another.
- What told hours have become is read the same way, from where they were at the last look that found them: the open hours found that overlap them, all of them together, so that an hour's dip in the middle of a morning is no news. Failing an overlap, the nearest open hours that begin within six hours of them and that no other told hours are at. Two told pieces that join become the same hours, and move or go together.
- Hours are counted as time that passes, in the account's time zone: an hour that the clock skips does not exist, and one it repeats counts twice.

### The moments

The worker looks at each alert every three hours: at each of its spots, over the seven days ahead, whatever the account's setting, so that a window already told is followed to its end. It keeps what it saw at each spot, the sea windows in a table of their own and the hours it told beside the spot, and decides from it. A look counts when it comes at least two and a half hours after the one before, whoever runs it and however long its run took to come to the alert: a forecast is fresh for two hours (decision 023), so two looks have read two forecasts, fetched apart. A spot whose forecast is not fresh, or cannot be had, is not looked at: it counts for nothing and against nothing there, and the alert's other spots are looked at without it.

- **Found.** Open hours are told once two looks in a row have found their sea window, they begin within the days the account asks for, and more than half an hour of them is left. Two looks are three hours apart: the model may not have run again between them, and "two forecasts" is as much as an instance that asks one model can say.
- **Moved.** Told hours that now begin or end more than two hours from what was told are told again, by the first look that finds them so. A beginning that has passed counts as now. A smaller move is held against what was told, so that two of them add up.
- **Gone.** Told hours of which two looks in a row find nothing, and that are not over, are called off: the sea window went, or left the account's hours. Hours that were never told go without a word. Hours that come back are new: they are told once their sea window has been found by two looks in a row.
- **The evening before.** At the hour the account chose, one message lists the open hours of the next day, alert by alert and spot by spot: those of the windows two looks have found, and those that were told and that the last look still found. It needs a look no older than six hours. It leaves when its hour has come, or later that evening when the worker was late, and never after midnight. An evening with nothing to list sends nothing. A day is listed once, and a day of which half or more lies in the one listed last is that day: an account that changes its time zone is not sent the same day again.
- **It is on.** When open hours begin, the alert says so, once for each piece, whether the window was told before or not: the moments are switched one by one. Each piece it said so of is remembered, so that hours that appear before others that were said ahead are said too. It is told ahead by as long as the account asked, and no longer once half an hour or less of the piece is left. It needs a look no older than six hours that still found the window.
- An alert on several spots tells them together: one message for an alert, a moment and a look, with a line for each spot. "It is on" is told for the spots that begin in the same quarter of an hour.
- The evening message lists what "found" may have told an hour before. It is the day's recap, not news.

### What the buoy says

- "It is on" comes with the latest reading of the nearest wave station that the sea reaches freely (decision 011), within 60 km of the spot and no older than two hours: its significant height, its peak period and direction, and how old the reading is.
- The message does not say that the buoy confirms the window. A buoy measures the whole sea where it floats, wind sea included, and an alert asks for a swell at a beach: one cannot be held against the other. The reading is given for the reader to judge.
- Far from any buoy the message says the window has begun, and no more.

### What is sent, and how

- A notification is a row that does not change: which alert, which moment, and what it said of which spots and windows. The web app lists them and marks them read. A moment is told once: its row has a key that a second worker, or a retry, cannot write twice.
- For each way out the account chose, a notification has a delivery: when it may leave, until when it is worth sending, and what became of it. Quiet hours set the first: a message made in them leaves at the first moment after them that the clock really shows, when it is set back as when it is set forward. A message that waited is looked at again before it leaves: one whose window has gone or ended meanwhile is not sent.
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
- This release is deployed in an order: the API first, and the worker once the API of the version before has stopped. Whatever writes to an alert's spots holds the alert before the spot, as the worker does for the whole of a look, so that two of them never wait for one another. The API of the version before deletes a spot the other way round. `docs/self-hosting.md` says so to whoever updates an instance.
- A new alert waits for the worker's next look, up to three hours, and tells what it finds at the one after: its first message comes three to six hours after it was made. The screen that sets it shows what the conditions give meanwhile.
- Every fifteen minutes is how often the worker checks what begins. "It is on" can come up to that much late, and later when the worker is busy or down.
- The time zone is the account's. A spot abroad is told in the account's hours, and its daylight is its own.
- A mail that bounces, or that its reader marks as unwanted, is not known to the instance: it reads no report from its mail provider yet.
- The first version's notifications are not carried over. They stay in their table, `notification`, which nothing reads any more and which the release after drops with the spot's two columns. Nothing had been sent. What an alert tells is kept in `alert_notification`.
- Nothing deletes a notification yet. The list shows the newest, and the table grows by a few rows for an alert and a day.
- One model, one run at a time: an alert is as good as that forecast.
