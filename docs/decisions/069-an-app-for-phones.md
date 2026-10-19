# 069. An app for phones, one client of the API among others

Status: accepted on 2026-10-19. Téo asked for it that day: "Maintenant j'aimerais que tu fasses l'implémentation complète de l'appli mobile", "une app qui marche de A à Z. Connexion, notification poussée, etc. avec les flow natifs", in React Native "pour pouvoir cibler Apple et Android". He accepted the report of what it takes and its seventeen recommendations, answering four of them: he has an Apple developer account and no Google Play account yet, nor an Android phone; the builds should spend no credits of Expo's; he pays the icons' licence the app needs; and the updates of the app's code come from the instance's own storage. He also asked what One (onestack.dev) was worth, and did not take it up. It follows [decision 014](014-web-app-as-mobile-reference.md), which said what the app is made of, amends [decision 019](019-api-access.md), which left open how a phone app signs in, [decision 039](039-visitors.md), whose visitor is the web app's, [decision 044](044-product-analytics.md), whose events all came from the web, and [decision 003](003-api-versioning.md), whose version had not been released. What is marked "chosen here" is mine, and his to overturn. [Decision 070](070-signing-in-from-the-app.md) says how the app signs in, [071](071-deleting-and-blocking-an-account.md) how an account is deleted and another blocked, [072](072-push-to-the-apps.md) how it is pushed to, [073](073-links-that-open-the-app.md) which links open it, [074](074-widgets-and-live-activities.md) its widgets and Live Activities, and [075](075-building-and-updating-the-apps.md) how it is built and updated.

## Context

The API took three kinds of callers: an account by its session's cookie, a program by its key, and the link of a shared list. A fourth, the visitor, was a request that named no one and came from the web app, which it said in `Origin` (decision 039). Every page of the web app writes that header, and every write that carries a cookie had to name a site the instance trusts in it, or the API refused it as a page of another site would send it (`isCrossSiteWrite`).

An app on a phone sends no `Origin` and no `Referer`, and keeps no cookie by itself. Against the API as it stood, every call of a signed-in app that writes was refused with 403, and so was every call to `/rpc`, whose client sends even its reads as POST. Signed out, the app was nobody, and was answered 401. Its analytics were dropped, since the API read them from the web's origin alone.

## Decision

### The app

- `apps/native` is the app, for iOS and Android, built with Expo SDK 58 (React Native 0.88, React 19.3.0) and expo-router, in development builds only: Expo Go cannot hold its map, its push or its widgets. The catalog pins `react` and `react-dom` to the version the SDK names, since React Native refuses any other.
- One instance per build. The address of the API is fixed when the app is built: the apps in the stores call Téo's instance, `api.tonnr.app`, and no other. A self-hoster builds `apps/native` with identifiers, keys and settings of their own, which `docs/self-hosting.md` says. Chosen here.
- The identifiers that stay once an app is in a store are written after the domain and not the name, which may change ([decision 013](013-name.md)): `app.tonnr` for the bundle of iOS, the package of Android and the scheme of the app's links, `group.app.tonnr` for what the app shares with its extensions, and `app.tonnr.<extension>` for each extension. `APP_SCHEME`, in `packages/config/src/app.ts`, holds the first.
- An iPhone and an Android phone, held upright. An iPad runs the iPhone's app as it is. A tablet's own layout, which the web's wide screen would give, comes later.

### One of the instance's own clients

- The app names itself by an origin of its own, `app.tonnr://`, in the header `expo-origin`, which the sign-in library's Expo client sends and the app's own client sends on every call. The API reads that header when a request carries no `Origin`, before `Referer`, and only when it holds an app's origin: a scheme and its two slashes, and no web address (`siteOf`, in `packages/api/src/cross-site.ts`).
- No page can make a browser send it. A browser writes `Origin` on every write a page sends, which the API then believes, and sends a header of its own choosing to another site only after asking leave, which CORS refuses: `expo-origin` is not among the headers it allows.
- `APP_ORIGINS`, in the API's environment, lists the origins of the instance's apps, separated by commas, and is `app.tonnr://` when it is left empty. Each is compared as it is written: `new URL("app.tonnr://").origin` reads as "null", which a sandboxed page sends, and an origin that reads so, or that is a web address, is refused when the API starts (`appOriginsOf`).
- A request that names one of those origins is the instance's own, as the web app's is. A write that carries its cookie is taken. A request that names no one is a visitor's, counted and limited as the web's visitors are, and closed to them at the same moment (`isFromOwnApp`, in `packages/api/src/visitors.ts`). The sign-in library trusts the same origins, which its Expo plugin reads from the same header.
- A program can write that origin, as it can write the web app's: it then reads what a visitor reads, and no more, as decision 039 already accepts. Proving that a call comes from the app itself, by Apple's App Attest or Google's Play Integrity, is not built.

### What the app sends and reads

- The app reads what the web app reads, through the same router's types, imported as types from `@repo/api`, on `/rpc`. Nothing of the API's code goes into the app: at run time it imports `@repo/config` and the modules of `packages/conditions` that read no file and no database, and a rule of the linter keeps it so. The versions of oRPC are pinned together in the catalog, so that an installed app and a newer API speak the same protocol.
- Every call says what the app is in `X-App`: its platform, the version and the build of the binary, as `ios 1.2.0 34`. Analytics then name the platform, `ios` or `android`, where an event of the web says `web`, and the binary's version where the web says the API's revision (`appClientOf`, in `packages/api/src/analytics.ts`). An app's analytics headers are read only with it.
- Analytics stay as decision 044 has them: optional, asked for, and refused as easily as taken. The app sends its events through the web's proxy, which learns the path the React Native client posts to, so that PostHog never sees a phone's address. Its errors are its JavaScript's, through `privateExceptionList`. A crash of the native code is read in App Store Connect and the Play Console, which every app has, with no library of a third party. Umami, which counts the web's pages ([decision 055](055-audience-counts.md)), counts nothing in the app.

### A version that installed apps keep calling

- `v1` is released at the first build given to testers outside: TestFlight's external testing or a closed test of Google Play. From then on it only grows, as decision 003 says, since an app that is installed keeps calling for months.
- Before then, what the app reads of an account's preferences moves into `v1`: its units, its density and what it looked at last, which sit under `preferences` today and outside any version. The keyboard's shortcuts stay where they are: a phone has no keyboard. A test then fails when a procedure of `v1` disappears.
- `v1.clients.get`, which anyone may call, says the oldest build of each platform the instance still answers, and where each store sells the app. An app older than that asks to be updated, and goes no further. It is to the app what the toast of a new deployment is to the web ([decision 021](021-web-stages.md)).

### The interface

- The screens are written again with native components, as decision 014 says. The tabs are the platform's own, the four of [decision 040](040-phone-navigation.md), with the "+" beside them.
- HeroUI Native and Uniwind, as decision 014 tried them, themed from `packages/ui/src/styles/globals.css`: a script writes the app's tokens from that file, so that each value stays in one place. While heroui-native 1.0.10 asks for gesture-handler 2 and the SDK ships 3 (its issue #524), the workspace overrides the request. react-native-reusables stays the fallback.
- The forms of settings and the pickers take the platform's own controls, through Expo UI, which draws SwiftUI on iOS and Jetpack Compose on Android: there the platform's look is the point, which Téo asked for. Chosen here.
- The icons of the screens are Nucleo's, drawn from `@repo/ui/icon` through an adapter to react-native-svg, which commits no drawing of theirs. What the system draws itself, the tabs, the menus, the widgets and the Live Activities, cannot draw a component, and takes SF Symbols on iOS and Material Symbols on Android. This amends the rule that icons come from `@repo/ui/icon` and nowhere else.
- The messages are the web app's, in `apps/web/messages/`, which the app compiles with Paraglide from the same project, with a strategy of its own: the language the app was set to, else the phone's. A string the app alone shows is a message there too, in the four languages.
- What the app leaves out: the keyboard's shortcuts and the command palette, since a phone has no keyboard, and what a pointer does over something. The landing, `/learn`, `/sources` and the legal pages open in a browser inside the app. `/connect`, where an account signs an assistant in ([decision 047](047-agents-sign-in.md)), stays on the web.
- What the app saw last, the places saved, what it looked at last and what its alerts told, it keeps on the phone, with the time it read them, and shows when it cannot reach the API.

## Rejected

- **One** (onestack.dev), which builds the web and the phones from one tree of routes. Decision 014 rewrites the screens and shares no component, so its first gain is gone. The libraries the app needs, the sign-in's Expo client, the widgets and Uniwind, need Expo and its bundler, so One would sit on Expo as a fork of its router. Its second version was a week old, and one person had written its last months.
- **Expo Go**, which runs an app without building it. It cannot hold the map, push or a widget.
- **A choice of instance in the store's app.** Every instance would have to trust the app's origin, and only Téo's could push to it ([decision 072](072-push-to-the-apps.md)). A self-hoster builds their own.
- **Bearer tokens in place of the cookie.** `Authorization: Bearer` names an API key here, and is judged on it alone: [decision 070](070-signing-in-from-the-app.md).
- **`Origin` written by the app itself.** An app may write it, and the API would believe it. But the app would then read as the web, in the analytics and in the counts, and the sign-in library's Expo client sends `expo-origin` all the same.
- **react-i18next**, which Téo's handbook names for an app. It would hold a second set of messages beside the web's, in four languages.
- **NativeWind.** Its version on Tailwind 4 is a release candidate.

## Consequences

- Every rule that names the web app now names the instance's own apps: what a visitor is, which writes with a cookie are taken, and whose analytics are read. `APP_ORIGINS` goes beside `CORS_ORIGIN`.
- The apps in the stores call Téo's instance alone. Another instance has the app it builds.
- `v1` stops changing freely at the first test outside. A field renamed after that is a new version.
- A screen exists twice, as decision 014 said, and what AGENTS.md asks of a change in the same change, the messages in four languages, the landing's cards, the analytics' inventory, `/privacy`, now asks it of two clients.
- The workspace builds the app beside the API: `pnpm run check` checks it, and the API's and the worker's images still install none of it.
- Built on 2026-10-19: the API and the sign-in library take the app's origin, as a write with a cookie, a visitor, and analytics that name the platform (`APP_ORIGINS`, `expo-origin`, `X-App`). Not built yet, in this order: the preferences moved into `v1`, `v1.clients.get`, the proxy's path for the app's analytics, then the app itself.
