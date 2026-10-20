# 072. Push to the apps, through Apple and Google, encrypted for the phone

Status: accepted on 2026-10-19. Téo asked that day for an app "qui marche de A à Z. Connexion, notification poussée, etc. avec les flow natifs" ([decision 069](069-an-app-for-phones.md)). The report I sent him recommended that the instance push to the apps through Apple's and Google's own services, with no library and no service of Expo's, and that what a push says stay encrypted for the phone that reads it, as it is for a browser. He accepted it with the rest of the report. It amends [decision 031](031-alerts.md), "Push", which pushed to browsers alone, and [decision 068](068-telling-the-reports.md), whose photo an iPhone never showed. What is marked "chosen here" is mine, and his to overturn. What a Live Activity is sent is [decision 074](074-widgets-and-live-activities.md)'s, and not this record's.

## Context

An instance pushes to browsers. A browser that its user lets be notified gives the address of its subscription at a push service, Google's, Mozilla's, Apple's or Microsoft's, and two keys. `push.subscribe` keeps them in `push_subscription`, with a label, the session they were given in, and when the browser last said so again. The worker writes a push as it leaves, encrypts it for the browser by RFC 8291, signs the request with the instance's pair of keys by RFC 8292, and posts it to that address with `node:https`, on a connection of its own (`packages/push`). The push service reads the address and the time, and nothing of the alert, which `/privacy` says in four languages.

An app on a phone has no such address. Apple's service, APNs, and Google's, FCM, give an app a token instead, and take a push for it only from whoever holds a key of the app's: on iOS a key of the Apple developer team that signs the app, on Android an account of the Firebase project the app is built with. Neither asks for an encrypted body. What a push says reaches each of them in clear, and the phone shows it as it came, unless the app decrypts it first. Expo's push service stands in front of both for an app built with Expo, and reads what goes through it.

On an iPhone, Safari pushes to a web app only once it is on the Home Screen, and shows no picture: the push of a report said its words and never showed its photo (decision 068).

## Decision

### Apple's and Google's services, from `packages/push`

- The worker pushes to an app itself, from `packages/push`, as it pushes to a browser: to APNs over HTTP/2, with `node:http2`, and to FCM's HTTP v1 API, with `node:https`. There is no library, and no service between the instance and them: Apple and Google are the only ones a push to an app goes through.
- APNs is asked at `api.push.apple.com`, or at `api.sandbox.push.apple.com` for a device whose build said it is a development one. The request names the device by its token, in its path, and the instance by a token signed with ES256 from the team's key, the `.p8` file Apple gives: the key's id, the team, and when it was signed. Apple refuses a token older than an hour, and one made anew more often than every twenty minutes: the pusher signs another after forty. Chosen here.
- FCM is asked at `fcm.googleapis.com/v1/projects/<project>/messages:send`, with an access token that Google gives for an hour in exchange for a token signed with RS256 by the project's service account, for the scope of messaging alone. The pusher asks for the next one five minutes before the hour ends, through `node:https`, and follows no redirection. The service account is given FCM's role and no other. Chosen here.
- Apple asks a provider to keep its connections open and send many pushes on each: a connection opened for every push may be taken for an attack. So the pusher keeps one HTTP/2 session to each of Apple's two hosts while it sends, and opens it again when Apple or the network closed it. A session that sent nothing for a minute is closed, and the next push opens another: a worker sends in bursts, every quarter of an hour. Chosen here.
- Decision 031 says that a push that is given up "has its connection closed". For APNs this becomes: its stream is cancelled, with HTTP/2's `RST_STREAM`. What was not sent by then is not sent, nothing more of its answer is read, and the session goes on for the other pushes, unless Apple had not begun to answer the push: the connection may then be half open, which TCP tells only after minutes, while every push on it would wait its ten seconds holding its account's rows. That session takes no new push, the next opens another, and what is under way on it ends on its own. Chosen here, after a review. A push whose stream was cancelled after it was sent whole may have reached Apple, and is `failed`, as a push given up is now. FCM's requests each keep a connection of their own, as a browser's do, and 031's rule stands for them as it is written.
- A push is still given ten seconds for all the devices of an account together, of every kind. The reason in an answer is read too, a few hundred bytes at most, within those seconds: Apple and Google say why in the body, where a browser's push service says it in the status.
- The log says how a push was not taken, by the service's status and reason, as `push: not taken (apns BadDeviceToken)`. It never holds a token. A token is to an app what an address is to a browser, and is kept as one is.

### Encrypted for the phone, as for a browser

- What a push says to an app is encrypted as it is for a browser, by RFC 8291, with the same `encryptPush` (`packages/push/src/encrypt.ts`). The first time push is switched on in the app, the app makes a pair of keys of the curve P-256 and a secret of sixteen bytes, and gives the public key and the secret as a browser gives its `p256dh` and its `auth`. The private key never leaves the phone. The API checks the two as it checks a browser's.
- On iOS the private key and the secret are kept in the keychain, in a group the app shares with its extension for notifications, readable once the phone has been unlocked after it started. On Android they are kept encrypted under a key of the Keystore. Signing out deletes them ([decision 070](070-signing-in-from-the-app.md)).
- Apple and Google then learn of a push what a browser's push service learns: the phone's token, when the push left, until when it is worth keeping, how urgent it is, and its size. Apple also reads the line that stands in for the push, which says only that an alert has news, in the account's language, and a collapse id that names nothing (see "On an iPhone"). `/privacy` stays true: a push is "encrypted so that the service cannot read it", Apple's and Google's for an app as much as a browser's.
- A Live Activity is the exception. No extension reads its push before the system shows it, so Apple reads its figures and its times. Decision 074 says what it carries, and the switch it is behind.

### On an iPhone

- An alert's push to an iPhone is an `alert` push marked `mutable-content`. It holds a line that stands in for it, and the encrypted body in base64url: `{"aps": {"alert": {"title": <the line>}, "mutable-content": 1}, "encrypted": <the body>}`, and nothing else, so that the thread, the category and the count are the extension's to set. That line is the one the web app's service worker shows for a push it cannot read, in the account's language, and is the same for an alert and a report, so that Apple cannot tell the two apart. Chosen here.
- The app's Notification Service Extension opens the push before it is shown. It is a target of its own, `app.tonnr.notifications` (decision 069's identifiers), which a config plugin adds to the build ([decision 075](075-building-and-updating-the-apps.md)). It decrypts the body with CryptoKit, and sets the title, the body, the thread, the category, the interruption level, the count on the app's icon, and what a press opens.
- A report's push carries the address of its first photo's thumbnail (decision 068). The extension downloads it from the bucket and attaches it to the notification, so the iPhone's app shows the photo that Safari never did. The thumbnail is a WebP ([decision 066](066-photos-and-videos-of-a-session.md)), and Apple lists JPEG, GIF and PNG among what a notification attaches: the extension writes it again as a JPEG. A picture that does not come in time is left out, and the words are shown without it.
- The extension has about thirty seconds, and little memory. What it cannot open in time is shown as the line that stands in for it, as a browser shows a plain line (decision 031): a key it cannot read before the first unlock after the phone started, a body it cannot decrypt, a crash. It never drops a push.
- Apple's headers are the app's id as the topic; priority 10, or 5 for the evening before, which Apple may then hold back to spare the battery; the moment until which the push is worth keeping, as for a browser; and, as the collapse id, a hash of the push's tag keyed with the device's own secret: the first 22 characters, in base64url, of its HMAC-SHA256 under a key drawn from the device's `auth` by HKDF-SHA256 for that use alone, since RFC 8291 keys an HMAC with `auth` itself to encrypt the push. Chosen here, after a review. A newer word on the same thing then takes the older one's place on the phone, and Apple reads nothing of what it is. The tag of a report's push names its break, whose id anyone can read in the catalogue: hashed without a key, it would tell Apple which break. Chosen here.
- An APNs payload holds 4 KB, and the encrypted body is written in base64url inside it, so what a push says holds about 2,800 bytes there, where a browser's holds 3,993. A report's picture still goes with the words while both fit, and the words go alone otherwise, now under each way out's own limit.

### On Android

- A push to Android is a data message of FCM, with nothing for the system to show by itself: the encrypted body in base64url as its one field, `encrypted`, priority `HIGH`, or `NORMAL` for the evening before, and how long it is worth keeping as its `ttl`, four weeks at most, as for a browser. Its limit is 4 KB too, so the same 2,800 bytes or so.
- The app's own `FirebaseMessagingService`, written in Kotlin in a module of the app, receives it whether the app is open or not. It decrypts it, and posts the notification on the channel of its moment, under its tag so that a newer word takes the older one's place, grouped by its thread, with its actions, and with the thumbnail as a large picture for a report. It takes the place of the service that expo-notifications brings, and must still pass on to it a new token from Google and a press on a notification: this is to be checked as it is built.
- The notification of "it is on" goes by itself when its window ends, which the push says (decision 074).
- It posts something for every push, and the line that stands in for it when it cannot read it. FCM lowers the priority of an app whose urgent messages show nothing, as a browser takes back the right to push from a site whose pushes show nothing.
- There is no collapse key. Google would read it, and keeps four collapse keys at most for a phone that is off, with no say in which. A phone that was off receives each push that is still worth keeping, and shows the newer in the older's place by its tag. Chosen here.

### A device of an app

- A phone is a row of `push_subscription`, as a browser is, with four columns that tell them apart:
  - `kind`: `web`, `ios` or `android`.
  - `token`: the token that APNs or FCM gave, in a column of its own and unique. A browser has its `endpoint` instead, which is null for a phone.
  - `environment`: `development` or `production`, for an iPhone, which the app reads from its build.
  - `app_id`: the bundle or the package the build was made with.
- A check of the database holds the shape of each kind. Chosen here.
- Decision 074 adds to an iPhone's row the token that starts a Live Activity, which comes with the same procedures.
- `p256dh` and `auth` stay as they are: the app gives its own. The cap of ten devices counts every kind together.
- A phone's device goes with its session, as decision 031 says of a browser's: when the account signs out on that phone, or is suspended, and not when the session merely runs out, which decision 070 makes ninety days.
- A token that another account kept is this phone's, which another account has signed in to now. It becomes a device of the caller's under a new id, as an address does.
- `push.registerApp` (`POST /v1/push/apps`), `push.renewApp` (`POST /v1/push/apps/renew`) and `push.forgetApp` (`POST /v1/push/apps/forget`) do for a phone what `subscribe`, `renew` and `forget` do for a browser. The body holds the kind, the token, the environment, the app's id, the two keys and a label, which the app writes from the phone's model.
- They hold the account's row, then the caller's session, then the rows of `push_subscription` in the order of their ids. They run their queries through `quietly`, and name a device by the UUID the API made.
- They count as `push_subscribed` and `push_disabled`, whose platform the app's `X-App` header says (decision 069). Chosen here: no events of their own.
- `push.remove` and `push.devices` take every kind, and `devices` says each device's kind, so that an account tells a phone from a browser.
- The token comes in the body, and goes into no answer, no refusal and no log. Chosen here:
  - The API takes an iPhone's token when it is hexadecimal, of 64 to 200 characters.
  - It takes an Android phone's when it is written in FCM's letters, digits and `-_:`, of 1,024 characters at most.
  - It takes an iPhone whose app id is the instance's `APNS_TOPIC`.
  - It refuses a kind the instance does not push to with 503, as it refuses a browser when the instance holds no pair of keys.
- `push.key` also says which apps the instance pushes to, `apps: { ios, android }`: an added field, as [decision 003](003-api-versioning.md) allows.
- The app makes its device when the system lets it notify. It says it again each time the app starts, and whenever the system gives it another token.
- It forgets its device when the person switches push off in the app, or turned notifications off in the system's settings, which the app reads as it comes to the foreground: Apple still takes a push for an app whose notifications are off, and the phone shows nothing.
- A device that `renewApp` answers 404 for was removed from another device: the phone lets go of it and of its keys, as a browser does.
- An app that signs in again, after a reset of its password among other reasons, makes its device again.
- `isPushEndpoint` takes Safari's host, `web.push.apple.com`, and no other of Apple's. `.push.apple.com` took in APNs's own hosts too, where a browser's push has no business.

### What the worker sends to

- A notification still has one delivery for push. It goes to every device of its account, of every kind, when it is handed over (`handBy` in `apps/worker/src/deliveries.ts`), and so does the push of a notice of reports (`hand` in `apps/worker/src/report-notices.ts`). Each device is sent its push by its kind's way out.
- Most of it stays one for the account, whatever its devices are:
  - the claim, the two steps, what is held and in what order;
  - the 24 alert pushes and 6 report pushes an account is sent a day;
  - what push told at a spot, `alert_spot.pushed`.
- A device of a kind this worker cannot reach is passed over. A push that has no device it can reach is given up.
- What comes of a push to one device keeps the four outcomes of `packages/push`:
  - `taken`: 200, from Apple or Google.
  - `gone`: APNs's 410; its 400 `BadDeviceToken` or `DeviceTokenNotForTopic`, from the host of the environment the app said and under the app's own id; FCM's `UNREGISTERED` and `SENDER_ID_MISMATCH`. The device is deleted, as a browser's is.
  - `failed`: a 5xx, no answer within the ten seconds, a stream or a connection that broke. The push may have left.
  - `refused`: every other answer, a 429 among them, as a browser's push service's 429 is now. The push did not leave. Apple's refusal of the instance's own token, `ExpiredProviderToken` or `InvalidProviderToken`, is one of these, and the log names it.
- `pushOutOf` gives the worker what it pushes with when any of the three ways out is set: the pair of keys for browsers, Apple's key, Google's account. An instance with no pair of keys for browsers can still push to its apps. It still needs `CORS_ORIGIN`: a push names the page it opens by the web app's address.

### What a push says

- `Push`, in `packages/push/src/index.ts`, gains what an app reads and a browser leaves out: its thread, its category, the ids of what it is about, its interruption level, the count of what the account has not read, and on a push that offers "Not today" the end of the day it speaks of, `pauseUntil`. The service worker reads `title`, `body`, `url`, `tag` and `image` as before, and the browsers' pusher sends nothing more.
- The thread groups what is told of one thing: `alert:<id>` for an alert's push, `evening` for the evening before, `report:<break id>` for a notice of reports. Chosen here.
- The ids are the notification's, the alert's and the notice's. Opening an alert's push marks its notification read, through `notifications.markRead`, as the web app's list does. Opening a report's push marks its notice read once the break shows, as decision 068 says. `alertPush` now takes the notification's id, which it did not have.
- The page a push opens stays the web app's address, `url`. The app reads its query as the web reads it, and leaves out the part that names the language ([decision 073](073-links-that-open-the-app.md)).
- The interruption level of "it is on" is time-sensitive: it comes through a Focus that lets such notifications through, since being late costs the session. The app asks Apple for the right to that level, and a person can turn it off for the app in the system's settings. The evening before is passive, with no sound and no lit screen, since it is a recap. The other moments are active. Chosen here.
- The count on the app's icon is what the account has not read, its notifications and its notices, as the alerts' tab counts them: fifty of the notifications at most, the page the tab lists (`UNREAD_NOTIFICATIONS_COUNTED` in `packages/config/src/unread.ts`), and the notices the account reads, without those that told only reports of an account it blocked (`toldOthers` in `packages/db/src/blocks.ts`, decision 071). The worker reads it as the push is handed over, when an app is among the account's devices, since a browser reads no count, and the extension sets it on iOS. The app sets it again when it opens and when it reads one. On Android the launcher counts what the app shows.

### What a push lets the person do

- A press on a push opens what it speaks of. Its category gives it more, which a long press shows:
  - "Not today", on the push of an alert whose hours are today: that alert is paused until the end of the account's day. An alert's push offers it when it is a window found, moved, or news of both, and some of the hours it tells fall in what is left of the account's day as the push is written. Chosen here.
  - "Log a session", on "it is on": the app opens the form of a session at the place, starting now.
  - The evening before opens what the alerts told, and a report's push opens the break on its reports. Neither has more, and nor has "gone".
- The app registers its categories with the system as it starts, each action in the four languages. Chosen here.
- "Not today" writes `alert.away_until`, a new column, through `alerts.pauseToday` (`POST /v1/alerts/{id}/pause`). The API computes the end of the day by its own clock, in the account's time zone, or UTC's while it has none: the phone's clock is not asked. The push carries the end of the account's day as it was written, `pauseUntil`, which the app gives back as `until`: the pause ends at the earlier of the two, and a day that is over is refused with 409 and pauses nothing, so that a "Not today" pressed after midnight, or an action the system runs late, pauses no day the push did not speak of. Chosen here, after a review. It holds the alert as a change of it does, and does not have it read anew: the look that follows reads the pause, which changes how the alert's hours are cut.
- Until then no hour of that alert is open, by mail or by push, as no hour of any alert is before the account's own `away_until`: `cutOf` and the availability in `packages/conditions/src/alerts/settings.ts` read the later of the two. What the alert told stays told, and the look that follows cuts it without a word, as decision 031 says of a change of the account's hours. The stamp a message is written from holds the pause, so a push of that alert on its way is written anew without today.
- `alerts.update` lifts the pause with `awayUntil: null`, and takes no other date: a pause is made by "Not today" alone. `alerts.get` and `alerts.list` say it, and answer null once it is over: the row keeps its moment, which pauses nothing. Its event is `alert_paused`. Chosen here. Switching the alert off would forget all it saw and told, and the account's own absence would pause every alert.
- "Not today" runs without opening the app where the system lets it, with the session the app keeps. Where that cannot be relied on, as with an app its person closed, it opens the app on the alert and asks there. This is to be tried on both systems as it is built.

### Android's channels

- The app makes five channels, each named in the four languages:
  - `alerts`, for what a window does: "found", "moved", "gone";
  - `begins`, for "it is on", of high importance, which shows over what is open and makes a sound;
  - `evening`, for the evening before, of low importance and silent;
  - `reports`, for the notices of reports;
  - `sessions`, which decision 074's Live Update of a session in progress uses.
- A person changes each channel in the system's settings. The app cannot raise a channel's importance once it is made, and only its person can, so the importances are chosen once, before the first build. Chosen here.

### The settings, on the phone

- The alerts' settings in the app have the row "On this device", as the web app's `PushSetting` has, in words of its own for each state:
  - on, off, a request on its way, and one that failed;
  - an instance that pushes to no app;
  - a system that was never asked;
  - a person who said no, with a press that opens the system's settings;
  - on Android, a channel that was switched off.
- Under that row are the account's devices, each with its kind, and a press that removes one.
- The moments, the quiet hours and the switch of the reports are the account's, read by the app as by the web: decision 031's settings.
- The system asks whether the app may notify when the account saves its first alert or switches push on, and never as the app opens: a person asked before knowing what for says no. Chosen here.
- On iOS the app says it has notification settings of its own, so the system's page of the app's notifications leads to that row.
- A phone with the web app on its Home Screen and the app installed is two devices, and is told everything twice. The settings list both, and the person removes one. Chosen here, rather than guessing that two devices are one phone.

### The instance's settings

| Variable           | Read by            | What it is                                                                  |
| ------------------ | ------------------ | --------------------------------------------------------------------------- |
| `APPLE_TEAM_ID`    | the API and worker | The team of the Apple developer account that signs the app.                 |
| `APNS_KEY_ID`      | the worker         | The id of the team's key for APNs.                                          |
| `APNS_PRIVATE_KEY` | the worker         | That key, the `.p8` file's text. Sensitive.                                 |
| `APNS_TOPIC`       | the API and worker | The bundle the iOS app is built with: `app.tonnr` for Téo's instance.       |
| `FCM_PROJECT_ID`   | the API and worker | The Firebase project the Android app is built with.                         |
| `FCM_CLIENT_EMAIL` | the worker         | The project's service account, which may send messages and do nothing else. |
| `FCM_PRIVATE_KEY`  | the worker         | That account's private key. Sensitive.                                      |

- They are declared in `apps/server/.env.schema`, as the pair of keys for browsers is, and picked by the worker's schema (`APPLE_*`, `APNS_*`, `FCM_*`). `APPLE_TEAM_ID` is declared once, for Sign in with Apple and for the pushes, which name the same team ([decision 070](070-signing-in-from-the-app.md)). The API reads the two that say whether the instance pushes to an app, which are not secret, and the team for Sign in with Apple.
- A worker that holds some of the three `APNS_*` and not all of them with the team, or some of Google's three and not all, does not start, and says which variable is missing, as it does for the pair of keys. The team alone, which Sign in with Apple reads, pushes to no iPhone.
- Where the API and the worker are services of their own, each with its own variables, as on Téo's Easypanel, the worker is given its seven before the API its two: an API that names `APNS_TOPIC` beside a worker without Apple's key takes iPhones that no one pushes to.
- One key of Apple's serves both of its hosts and every app of the team.
- The keys stay out of the repository, with a copy of each in Téo's password manager (decision 075).

### Tests

- `testApns` and `testFcm`, in `packages/push/src/testing.ts` beside `testPusher`, stand for Apple's and Google's services. They take in memory what the pusher sends, check its headers and its signed token, and answer as a test tells them to, with a status and a reason. They read each push as the app would, decrypting it as `testReceiver` decrypts a browser's. No test and no run of CI asks Apple or Google ([decision 012](012-open-source.md)).
- The extension's decryption in Swift and the service's in Kotlin are each tested against RFC 8291's own example, the one `encrypt.test.ts` checks `encryptPush` against, so that all three agree.

## Rejected

- **Expo's push service.** It is one more party, which reads every push it carries. It needs an account at Expo and an Expo token on the worker. It learns that a token is dead only from a receipt asked for later. It carries no Live Activity, which Expo's own guide sends to APNs directly. Once a push is encrypted, it would save nothing.
- **Pushes in clear**, with an extension only for the picture. That is simpler on the phone, but Apple and Google would read each push's words: the alert's name, its spot, its hours, a report's author and note. `/privacy` would change in four languages, against what decision 031 built for browsers.
- **A table of its own for the apps' devices.** Two tables would hold each rule twice: the cap of ten, the session, the order of the locks, what the worker holds as it hands a push over. A device of an app differs by four columns.
- **A library**, such as node-apn or firebase-admin. Each brings its own request, which is the part that has to be ours (decision 031), and firebase-admin brings much of Google's SDK into the worker's image.
- **The tag itself as the collapse id, and a collapse key on FCM.** Apple and Google would read which alert and which break a push is about. A hash keyed with the device's secret says nothing to Apple, and Android replaces a notification by its tag on the phone.

## Consequences

- The apps in the stores are pushed to by Téo's instance alone: the key of Apple's team and the Firebase project are his. Another instance pushes to the app it builds, with a key and a project of its own, which `docs/self-hosting.md` says. A relay that passes on the encrypted pushes of other instances to the store's apps would read nothing, and could be added later. It is not built.
- With the server's side, these changed in the same change: `docs/self-hosting.md`, "Alerts by push", gained the seven variables and says what Apple and Google learn; `/privacy` names Apple's and Google's services for the apps, and says that the app registers with Google through Firebase on an Android phone, in four languages, on `LEGAL_UPDATED` 2026-10-19; and AGENTS.md's paragraph on `packages/push` says that Apple's requests go through `node:http2`, where a push that is given up has its stream cancelled.
- `push.registerApp`, `push.renewApp`, `push.forgetApp` and `alerts.pauseToday` are named in `ANSWERS_AN_ACCOUNT`, in `packages/api/src/access.db.test.ts`. `docs/analytics.md` lists `alert_paused`, and says that `push_subscribed` and `push_disabled` come from the apps too.
- The app holds encryption of its own, beyond HTTPS. What Apple asks about an app's encryption as it is uploaded is to be answered with that in mind, before the first build is sent (decision 075).
- An Android app that its person force-stopped receives nothing until it is opened again, and some makers' battery savers delay data messages. The most the worker can do is send them urgent.
- The count on the icon is right when the push leaves. A notification read on another device leaves it high until the next push, or until the app next opens.
- The migration `app-push` adds `kind`, `token`, `environment` and `app_id` to `push_subscription`, lets `endpoint` be null, and adds `away_until` to `alert`. A worker of the version before would read an app's device as a browser with no address, which it refuses. Deploy the worker with the API, and both before the first build that registers a device.
- Built on 2026-10-19, the server's side, in this order:
  1. the migration, the API's three procedures and the kind in `devices`, with `isPushEndpoint` narrowed;
  2. Apple's and Google's ways out in `packages/push`, with `testApns` and `testFcm`;
  3. the worker sending to every kind;
  4. what a push now says, and the pause of an alert;
  5. `/privacy` and the self-hosting guide.
- Built on 2026-10-20, the app's side: its keys, made and kept by the module `apps/native/modules/push-keys` (Swift and Kotlin), in the keychain's group `group.` and the app's bundle on iOS, under a key of the Keystore on Android; its device, given, said again and forgotten by `apps/native/src/lib/push.ts`, which a token the system tells again does not send again; the iOS extension, `apps/native/targets/notifications`, a target that `@bacons/apple-targets` adds to the build with the app's group; the Android service, `TonnrMessagingService`; the categories and the channels, made as the app starts by `PushListener`; and what a press opens. On iOS, expo-notifications gives the app as a remote push's data only what stands under `body` in it: the extension writes there the address, the ids, `pauseUntil` and the tag it opened. "Not today" and "Log a session" open the app, on a sheet that pauses the alert and says what came of it (`src/app/pause-alert.tsx`) and on the form of a session: running in the background, with the session the keychain keeps, is not built. `packages/push/src/phones.test.ts` compiles the extension's Swift and the service's Kotlin and has them open the RFC's example and what `encryptPush` wrote, where Xcode and `kotlinc` with a JDK are installed, as on Téo's Mac, and skips them in CI. Tried on an iPhone's simulator: the system's question, the token, `registerApp`, the categories, a press that opens the place with the app open, in the background or closed, and the sheet of "Not today". A simulator runs no extension for a push of `simctl`, and no push of Apple's reached it: the extension's decryption on a phone, the Android service, which compiles and runs on Android's emulator but was given no push, since the app has no Firebase project yet, and both actions in the background are to be tried on phones. On Android, Expo 58 links expo-notifications as the artifact of its own repository, `host.exp.exponent:expo.modules.notifications`, which the module depends on, and not as a project.
- Not built yet: the row "On this device" of the account's settings, and the device forgotten as the app signs out, which come with the account's screens; Firebase's file for the Android app, which Téo's project gives.
