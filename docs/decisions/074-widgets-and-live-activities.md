# 074. Widgets, Live Activities and Live Updates

Status: accepted on 2026-10-19. Téo asked for it that day, with the app itself ([decision 069](069-an-app-for-phones.md)): "j'aimerais que tu penses aussi à des petits widgets et trucs comme ça, live activities sur iOS et Android". He did not answer the report's recommendation for them, so it was accepted with the rest of the report: widgets fed by the app, a session in progress on both systems, and a window that begins on the iPhone alone, since Google allows no alert as a Live Update. It amends [decision 031](031-alerts.md), where "it is on" is a push, which a Live Activity replaces on an iPhone that asks for one, and [decision 043](043-session-log.md), where a session is written from memory, and now may be timed while it lasts. It builds on [decision 072](072-push-to-the-apps.md), which sends to Apple and Google, and counts what the widgets ask as [decision 053](053-what-one-caller-may-ask.md) counts a forecast. What is marked "chosen here" is mine, and his to overturn.

## Context

The web app tells an account by push and in its list, and shows the sea to whoever opens it. A phone has places outside the app: the Home Screen and the lock screen for widgets, the lock screen and the Dynamic Island of an iPhone for a Live Activity, and on Android 16 the status bar and the lock screen for a Live Update.

A widget draws what its app gave it. In expo-widgets, which Expo makes, a widget runs no hook, no asynchronous work and no import: the app writes it a snapshot, on both systems, or a timeline of entries, on iOS alone, and asks the system to draw it again. The library is stable on iOS since SDK 56. SDK 58 added Android, on Glance, and a crash at launch there was fixed on 2026-10-16. The app itself runs in the background when the system chooses: on iOS a few times a day, on Android every quarter of an hour at most.

A forecast costs the provider two requests when nothing is kept, out of the people's share of 2,500 a day ([decision 023](023-forecasts-kept.md), as [decision 057](057-public-pages-of-breaks.md) shared the day anew). Each `forecasts.get` is counted to its caller (decision 053). A hundred phones that each refresh three places in cells of their own every two hours would ask the provider for more than the whole share.

An app starts a Live Activity only while it is in the foreground. From iOS 17.2, a push of Apple's can start one: push-to-start. Apple's pushes update and end it, and the system draws what they carry. No extension of the app reads them first. So Apple reads them, where it reads nothing of an alert's push, which is encrypted for the phone (decision 072).

Google's rules for Live Updates take what the person started and follows, such as a workout. They refuse "chat messages and alerts", ambient information about what is around the person, and activities that others start.

## Decision

### What the widgets read

- `v1.places.now`, at `GET /v1/places/now`, says what the sea does at a few places, and asks the forecast provider nothing. It sits in `v1` beside `places.search` of [decision 030](030-place-search.md): one finds a place by its name, the other says the sea there. The name is chosen here.
- It takes twelve places at most: breaks of the catalogue, stations, and spots. A spot is answered to its owner, and to an account that kept a list holding it ([decision 035](035-shared-lists.md)), as `lists.view` answers it. Any other spot is answered as missing. Twelve is chosen here.
- It is built on `protectedProcedure`. A widget shows the places of an account, and a visitor has none: signed out, a widget says so and opens the sign-in. It is named in `ANSWERS_AN_ACCOUNT` of `packages/api/src/access.db.test.ts`. It is not a tool of the MCP server: an assistant has `get_forecast`, the tides and the stations. Chosen here.
- For each place it answers what the page of a break reads, with the functions of `packages/api/src/pages.ts`:
  - The hours of the forecast that is kept for the place's cell, from the current hour to 48 hours ahead. `forecasts.kept` reads them from the store and asks nobody. Each hour has its height, peak period and direction, its wind, and how that wind meets the shore (`windAtShore`, from `shoreWind`, where the place knows its offshore bearing). The answer says when the forecast was fetched and whether it is stale.
  - The latest readings of the nearest buoy and of the nearest wind station, by `nearestStation`, each with its time.
  - The highs and lows of the next two days, computed as `nextTides` computes them, with the height now and its way.
  - Each source with its licence and attribution, as every answer gives them.
- A place whose cell nobody had kept in the day gets no forecast hours. `forecasts.kept` answers nothing of a forecast more than a day old. Such a place shows what its buoy and its wind station measured, and the tide.
- A call counts one question in the caller's hour, as a forecast does, however many places it names: `admitForecastQuestion`. It costs the provider nothing, which is why decision 057 does not count the page of a break. But Cloudflare's cache answers a page for an hour, and nothing stands in front of a phone: counting the call stops an app that calls in a loop where a forecast would be stopped. Chosen here.

### The widgets

- The widgets are made with expo-widgets, first on iOS. On Android, Glance through expo-widgets is tried before it is relied on. If it fails there, react-native-android-widget, with its plugin for Expo, is the fallback. Chosen here.
- Three on the Home Screen. One place, with the height and the period in the colour of the height's scale, the wind with how it meets the shore, and the tide. One place with its next hours. The first three places of the favourites list, one on each line. On the lock screen, the height alone, or the height, the wind and the tide. Its place is chosen when the widget is added, among the account's saved places, where the system lets a widget be set up (iOS 17 and later). A widget without one shows the first place of the favourites.
- The app writes each entry as the widget will show it. The figures are in the account's units ([decision 033](033-units.md)), the words in the app's language, and the colours those of `sea-scales.ts`, the app's own scale, as the map draws it. A widget imports nothing and reads no message. `sea-scales.ts` therefore leaves `apps/web/src/lib/` for one of the packages the app may import at run time (decision 069), since its screens need it as well. Chosen here.
- The app writes the widgets' data:
  - whenever it runs;
  - when the account changes a widget's place, its units or its language;
  - in a background task that it asks for every hour, and that the system runs when it chooses.
- On iOS the data is a timeline: an entry for each hour, 24 to 48 hours ahead, as far as the kept forecast goes. Each hour shows itself when it comes, without the app. On Android there is no timeline: the widget shows the snapshot of the app's last run.
- Each entry says when its forecast was fetched. Once the last entry has passed, the widget asks for the app to be opened, and shows no figure older than its own forecast. Chosen here.
- A press opens the place in the app, `?break=`, `?spot=` or `?station=`, read by the one parser of [decision 073](073-links-that-open-the-app.md).
- A widget credits no one, since it has no room, as a push credits no one (decision 031). The screen it opens credits each source. This is to weigh against what the licences ask, as for a push.
- The widgets' data stays on the phone, in the space the app shares with its extensions, `group.app.tonnr`. Signing out clears it ([decision 070](070-signing-in-from-the-app.md)). A widget on the lock screen shows what the account put there to whoever holds the phone, the name of a spot of its own included.

### A session in progress

- The account starts a session as it begins:
  - from the "+", whose choice of a session asks whether it begins now or was surfed before;
  - from the widget of a place;
  - from a control of iOS 18, in the Control Center, on the lock screen or on the Action button.

  Each opens the app, which starts the session's Live Activity on iOS, or its Live Update on Android: an activity is started by its app in the foreground. The "+" takes the place in view, or asks where with the search, as the session form does. The widget takes its own place, and the control the place looked at last ([decision 042](042-recent-views.md)). Chosen here.

- It shows the place's name, the time since the start, the next high and low, and the wind as it was measured at the start, with its time. Its figures come from `places.now` once, at the start. The time counts on the phone, with nothing sent.
- Nothing tells the API that a session is in progress. The phone keeps the start and the place until the session is written, as decision 043 writes it. Chosen here.
- Ending it, from the activity, the notification or the app, opens the session form with its place, its start and its length. The length is rounded to five minutes, between a quarter of an hour and eight hours, the bounds of decision 043. The rest is asked as the form asks it. Chosen here.
- iOS ends a Live Activity after eight hours, the longest that the session form of decision 043 offers. A session that was never ended is offered to be written the next time the app opens, at the length the account gives it. The same goes for an activity the account swiped away. Chosen here.
- On Android 16 it is a Live Update: an ongoing notification that asks to be promoted (`POST_PROMOTED_NOTIFICATIONS`, `setRequestPromotedOngoing`), with a chronometer and an action that ends it. Google allows it because the account started it. The system promotes it when it judges fit. Below Android 16, or when it is not promoted, it is an ordinary ongoing notification. Neither expo-notifications nor expo-widgets makes it, so a small module of the app's own, in Kotlin, does.

### When a window begins, on an iPhone

- On an iPhone with iOS 17.2 or later, "it is on" (decision 031) may start a Live Activity in place of the alert's push: the lock screen and the Dynamic Island show it until the window ends.
  - It shows the height and the period with the arrow of their direction, the wind with how it meets the shore, the tide with its next high or low, and the nearest buoy's reading with its age.
  - It shows how far the window has gone, and until when it lasts.
  - Its buttons open the app, to log a session at the place or to pause the alert for the day, the "Not today" of decision 072.
- It has a switch of its own, on each iPhone, in the row "On this device" of the alerts' settings. The switch is off until the account turns it on there. Before it is turned on, its words say what Apple reads. Chosen here.
- While the switch is on, the app gives the push-to-start token that iOS gives it. The token goes with `push.registerApp` and `push.renewApp` of decision 072, and is kept on the device's row of `push_subscription`. It is null while the switch is off. The app gives the token again whenever iOS changes it. It takes the token back when the system's own switch for the app's Live Activities is off, which it reads each time it comes to the foreground.
- A start leaves by the rules of the push it replaces: after the quiet hours, once, and counted among the 24 pushes of a day. What it told is kept as that push's would be (`alert_spot.pushed`, `alert_spot.push_begun`). It goes to every iPhone of the account whose switch is on. The account's other devices get the push of decision 072. When APNs refuses the start, the push of decision 072 leaves to that iPhone in its place. When APNs takes it, nothing says whether the system showed it.
- One activity for a notification of "it is on": an alert, and the places that begin in the same quarter of an hour. It shows the first of them and how many more. A beginning of the same alert while its activity runs updates that activity, and starts no second one. iOS caps how many activities run at once, and decision 031 already gathers an alert's places in one message. Chosen here.
- The worker sends pushes of the type `liveactivity` to `app.tonnr.push-type.liveactivity`, signed with the key of decision 072: one to start the activity, then its updates and its end. `packages/push` writes them, in the shape expo-widgets reads: the name of the activity and its properties as a string of JSON.
- `live_activity` keeps each activity the worker started. A row holds:
  - the account;
  - the device, with which it goes;
  - the notification;
  - the alert, set to null when the alert is deleted, so that the worker still ends its activity;
  - the activity's own token, null until the app gives it;
  - until when the window lasts;
  - when the activity ended;
  - a hash of what it last showed.

  The token is kept as a device's address is (decision 031): it is never logged, and the API never gives it back. A query on it runs through `quietly`.

- As iOS starts the activity, it wakes the app in the background and gives it the activity's token. The app gives it to the API with `push.activityStarted`, and gives it again when iOS changes it. `push.activityEnded` says that the account dismissed the activity, or that the app ended it, and the worker then sends it nothing more. Both hold the account's row, then the caller's session, then the device, then the activity, in the order of decision 031. Both are named in `ANSWERS_AN_ACCOUNT`.
- The start is handed over in the second step of the push it replaces (`handBy`, in `apps/worker/src/deliveries.ts`). The row of `live_activity` is written in the same transaction, after the devices.
- A job of the worker of its own, every quarter of an hour, updates the activities that run and ends those that should end. It is run through `attemptOf` and listed there, so that the instance's page knows it ([decision 022](022-instance-state.md)). It reads no forecast:
  - the hour now among the window's hours, which `alert_window.hours` keeps as the last look read them (decision 031);
  - the buoy, by `wavesNear`;
  - the wind of the nearest station that measured it lately, read beside `wavesNear` in `apps/worker/src/stations.ts` as the API's `nearestStation` reads it, since the worker does not import `packages/api`;
  - how that wind meets the shore, by `shoreWind`;
  - the next high or low, by `predictTideExtremes`, which computes it.

  It sends an update only when what the activity shows has changed, at the low priority Apple keeps for updates. An activity whose window moved ("moved") is given its new end.

- It ends an activity:
  - when its window is gone, by a look that called it off;
  - when its alert was switched off, changed or deleted;
  - when the account is suspended or away, or paused the alert for the day;
  - when the switch was turned off.

  The worker sees each of these at its next pass, so up to a quarter of an hour late. Its start sets the end of the window as the moment it is stale and the moment it goes. So an activity whose token never reached the API, or that the worker can no longer reach, still goes when its window ends. The countdown runs on the phone.

- What Apple reads:
  - the figures and the times of the window, of the tide and of the buoy's reading;
  - the id of the alert and the id of the notification, which name nothing to whoever does not hold the account;
  - the token.

  Apple never reads a name. A break's id is not sent either, since anyone reads a break's name from its id (`breaks.named`, [decision 056](056-sending-a-place.md)). Neither is a station's. The alert's name, and the place's name for an alert on one place, come from what the app wrote in `group.app.tonnr`, keyed by the alert's id. An alert the app has not read yet shows no name. Whether expo-widgets lets a Live Activity read that space is to try. If it does not, the activity is a Swift target of its own, or it names nothing. The alert that the start lights the screen with is a string of the app's own, in its language, and says no name.

### On Android, a window that begins

- "It is on" stays a push, encrypted as decision 072 says. The app's own service posts it on the channel `begins` of decision 072, and the notification goes by itself when the window ends (`setTimeoutAfter`). Google does not allow alerts as Live Updates.

### Shortcuts

- The app's icon has its quick actions, on both systems: log a session, a new alert, search.
- The control "Start a session" is iOS's. Whether expo-widgets draws a control is to try. If it does not, the control is a small Swift target of its own.

## Rejected

- **Live Updates for alerts on Android.** Google's rules refuse alerts, ambient information and activities that others start. A notification that goes when its window ends says the same, within the rules.
- **A widget that asks the API itself**, through a timeline of its own in Swift and a worker in Kotlin. It would show fresher figures on a phone whose app seldom runs. But it needs a client of the API in two more languages and the session's cookie in the widget. It is kept as the fallback if the timelines that the app writes prove too stale.
- **Voltra** (Callstack), which draws the widgets and the activities of both systems and writes their pushes from the server. It is one more library between the worker and the app. Its pushes would follow its shape, as they now follow expo-widgets', and it is a second library beside Expo's own.
- **`forecasts.get` from the background task.** Every refresh could ask the provider, and the people's share of decision 023 cannot pay for phones that refresh on their own.
- **`pages.break` as the widgets' feed.** It answers by a break's address, takes no spot of an account's own, and says much a widget does not show.
- **Silent pushes to refresh the widgets.** iOS throttles them as it likes, and the widgets would wait on the worker.
- **A Live Activity started by the app from the encrypted push.** An app starts one only in the foreground. Push-to-start, which Apple reads, is the only way from a push.
- **The broadcast channels of iOS 18**, one push for everyone who follows a break. An alert is an account's own, and expo-widgets asks for pushes by token only.
- **A Live Activity for each place.** iOS caps how many run at once, and an alert already tells its places in one message.

## Consequences

- On an iPhone whose switch is on, the figures and the times of a window that begins go to Apple in clear. It is the one thing the instance sends that is not encrypted for the phone. Set against the tide tables, the tide's times and heights tell roughly which coast the window is on. In the same change, in the four languages and with `LEGAL_UPDATED`, `/privacy` says:
  - what Apple reads;
  - that the switch is off until it is turned on;
  - that the widgets' data stays on the phone.
- A widget is as fresh as the app's last run. A phone whose app has not run for two days shows that it has nothing left to show. A place has kept forecast hours when someone asked for its cell in the day: a listed break's cell is kept daily by the worker (decision 057), and an alert's place every three hours (decision 031). A spot of an account's own that no alert watches is kept only once the app has read it.
- The worker's payloads for a Live Activity follow expo-widgets' shape. Changing the library changes the worker too.
- The worker has one more job, every quarter of an hour, which sends nothing while no activity runs. An instance whose worker holds no key of Apple's starts no activity: the app offers no switch there, since it then has nothing to turn on (decision 072).
- iOS lets a widget be drawn again a limited number of times a day, and throttles push-to-start. A start that it holds back may show late or not at all, while the account's other devices have the push.
- No event is added to PostHog. The counts of the calls of `places.now` say how often widgets ask.
- AGENTS.md names `places.now`, `live_activity` and the job in the change that builds them.
- Nothing of it is built on 2026-10-19. It comes after the app's first version, in this order:
  1. `places.now`;
  2. the widgets on iOS;
  3. a session in progress, on both systems;
  4. the quick actions and the control;
  5. the widgets on Android, after their trial;
  6. once the APNs sender of decision 072 runs, the Live Activity of a window that begins, with its switch, `live_activity`, the worker's job and `/privacy`.
