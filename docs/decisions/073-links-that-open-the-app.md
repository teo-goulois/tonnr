# 073. Links that open the app

Status: accepted on 2026-10-19, with the rest of the report on the app for phones. Téo gave its aim that day: "une app qui marche de A à Z. Connexion, notification poussée, etc. avec les flow natifs". He answered the report only where he disagreed, and said nothing of links: the addresses below are the ones it proposed. It follows [decision 069](069-an-app-for-phones.md), which gave the app its identifiers and its scheme, `app.tonnr`. It amends [decision 021](021-web-stages.md), whose Worker answers two more files before its router, from values of the stage. It also amends the addresses that [decisions 026](026-checked-addresses.md), [035](035-shared-lists.md), [041](041-community-guides.md), [056](056-sending-a-place.md) and [057](057-public-pages-of-breaks.md) made: where the app is installed, they open it. `/connect` stays in the browser, as [decision 047](047-agents-sign-in.md) needs. What is marked "chosen here" is mine, and his to overturn.

## Context

Everything the instance sends to someone is an address of the web app:

- A break or a station is sent by `/b/<id>` or `/s/<id>` (decision 056), a shared list by `/l/<token>` (decision 035), and an account's link by `/i/<token>`, which `FriendsPanel` also draws as a code for a camera (decision 041). Each is written in the language of the page that sent it, such as `/fr/b/<id>`. The server renders it for the sites a link is sent through. A browser then goes on to `/app` with `?break=`, `?station=`, `?shared=` and the saved panel, or `?invite=` (`apps/web/src/routes/b.$id.tsx` and its three neighbours).
- The mail of an alert leads to `/app?break=` or `?spot=`, to `/app?panel=alerts&alerts=settings` and to `/mail-off` (`apps/worker/src/deliveries.ts`). The mail of a forgotten password leads to `/reset-password?token=` (decision 026, `packages/auth/src/verification.ts`). The mail that checks an address leads to the API, `/api/auth/verify-email`, which sends the browser on to `/verified`.
- A push carries an address of `/app` too: the place of an alert, or a break's reports with its notice (`packages/push/src/alerts.ts` and `reports.ts`).
- A search engine leads to the page of a break, `/spots/<country>/<region>/<slug>` (decision 057).

On a phone with the app, every one of them opens the browser. The app's scheme opens the app, but only where it is installed: a phone without the app does nothing with it, and neither does a computer. iOS opens an app for an address of the web, a universal link, only when two things hold: the site serves a file that names the app, `/.well-known/apple-app-site-association`, and the app names the site among its associated domains. Android opens one for an App Link when the site serves `/.well-known/assetlinks.json`, which names the app's package and the fingerprint of the key that signs it, and the app's intent filters ask Android to verify it. Neither reads a file behind a redirect. The web app serves neither today. The API's `/.well-known/oauth-*` belong to the MCP server (decision 047), on another host.

The Worker of the web app, `apps/web/src/server.ts`, answers some addresses before its router. First it sends a host of `WEB_REDIRECTS` on to `WEB_DOMAIN` (`movedHost`). Then it serves a page kept in Cloudflare's cache, and answers `robots.txt` and the sitemaps from whether its stage is listed (`searchEngineFile`). Only then does it hand the request to `paraglideMiddleware`, which may send a browser on to another language's address, and to the router. A stage's values come from `packages/infra/.env.<stage>`, which `alchemy.run.ts` gives the Worker. Nothing of one instance is committed (decision 021).

## Decision

### Which addresses open the app

- The app takes these addresses on the web app's domain, each also under `/fr`, `/es` and `/pt`:
  - `/app`, whatever follows the `?`;
  - the short addresses `/b/*`, `/s/*`, `/l/*` and `/i/*`;
  - the page of a surf break, `/spots/<country>/<region>/<slug>`;
  - `/reset-password`.
- Every other address stays in the browser. Among them:
  - `/connect`, where an account signs an assistant in. The API reaches it by a redirect, and its answer goes back with the browser the assistant opened (decision 047).
  - `/login` and `/forgot-password`. The app has its own.
  - `/verified`, which the API sends the browser to once the address is checked. The app reads `account.get` again when it comes back to the foreground ([decision 070](070-signing-in-from-the-app.md)).
  - `/mail-off`, which stops the mails of the alerts with one press and no account.
  - `/og/*`, which a production build answers with 404, and `/ingest/*`, the analytics proxy.
  - The landing, `/learn`, `/sources`, `/agents`, `/contact`, `/llms.txt` and the legal pages. The app opens them in a browser inside it (decision 069).
- The hubs of `/spots`, by country and by region, stay in the browser: the app has no screen for them. A break pressed on a hub opens in the browser too, since a link to the same site opens no app. Chosen here.
- The app takes the domain alone: `tonnr.app` for Téo's instance. It does not take `www.`, which `movedHost` sends on with a `301`, and nothing of the API's host, whose links are the sign-in library's and end in a browser.
- The app takes what it lists, and nothing else. A new page of the web stays in the browser until someone adds it to the list. Chosen here.

### The two files

- The Worker answers `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` itself, beside `robots.txt`: after `movedHost`, and before `paraglideMiddleware` and the router. It answers GET and HEAD with `200`, as `application/json`, with no redirect.
- It writes them from values of the stage, kept in `packages/infra/.env.<stage>` as `WEB_INDEXED` is:
  - `APPLE_APP_ID`, the app's id at Apple, its team then its bundle: `<team>.app.tonnr`.
  - `ANDROID_PACKAGE`: `app.tonnr`.
  - `ANDROID_CERT_SHA256`, the fingerprints of the keys that sign the Android app, separated by commas. One is the key of Play App Signing, with which Google signs the app the store gives out. The other is Téo's upload key, which signs a build installed from his Mac.

  The names are chosen here. None of them is a secret: every copy of the app carries them.

- A stage that names no app answers `404` at both addresses. An instance with no app of its own claims nothing. A self-hoster who builds `apps/native` names their own app (decision 069).
- Apple's file lists, under `applinks`, the addresses of the section above, and names the same app under `webcredentials`. Android's file gives the package and the fingerprints two relations: `handle_all_urls` for the links and `get_login_creds` for the passwords. Android's file has no paths: the app's intent filters hold them.
- The list of addresses is written once, in `packages/config`, beside the parser below. The Worker writes Apple's file from it, and the app's `app.config.ts` writes from it the intent filters of Android. Chosen here.
- The app names its domain when it is built: the `WEB_DOMAIN` of the stage it is built for, which the build reads from `packages/infra/.env.<stage>` ([decision 075](075-building-and-updating-the-apps.md)), just as the address of the API is fixed then (decision 069). On iOS it names it as `applinks:` and `webcredentials:`. On Android it gets an intent filter with `autoVerify` for each path. A development build names the domain with `?mode=developer`, so that a phone in developer mode reads the file from the site and not from Apple's cache.

### One reader of an address

- The app reads an address as the web app reads it, through one parser.
  - It reads the parameters of `/app`: `station`, `break`, `spot`, `buoy`, `panel`, `alerts`, `settings`, `tab`, `notice`, `create`, `list`, `shared` and `invite`.
  - A short address leads where the web's leads: `/b/<id>` to `?break=`, `/s/<id>` to `?station=`, `/l/<token>` to `?shared=` with the saved panel, and `/i/<token>` to `?invite=`.
  - The page of a break is read through `pages.break`. It answers the break with its id, or the address of the break it was merged into, which the parser reads in turn. It asks the forecast provider nothing.
  - `/reset-password?token=` opens the app's own screen for a new password (decision 070).
- Everything that opens the app goes through that parser: a universal link, a link of the app's own scheme with the same path, the address a push carries ([decision 072](072-push-to-the-apps.md)), and a code that the app's camera reads. A widget opens the app by its scheme ([decision 074](074-widgets-and-live-activities.md)). A link from a mail, a push, a code or a message then opens the same screen. A push needs no universal link: the app reads its address from the push itself. Expo Router hands the parser every address the system opens the app with, through its `+native-intent`, before any screen is drawn.
- The parser is a module of `packages/config` that reads no clock and no network, which the app may import (decision 069): `src/links.ts`, or a name chosen when it is built. One test reads with it every address that these write: the worker's mails, the pushes, the reset's mail and the web's short routes. Another test fails when the web's route `/app` reads a parameter that the parser does not know. Chosen here.
- The language prefix of a link does not change the app's language. A French link opens the app in the language it was set to. Chosen here.
- The app answers what a link opens as the web app does:
  - A visitor is asked for an account where one is needed, and goes on to where the link led once signed in.
  - A link's invitation goes with the sign-up (decisions 041 and 070).
  - A shared list opens while the instance is closed to visitors. The app asks the list's password itself, and the keychain keeps its pass, as the browser's storage does on the web (decision 035).
  - An address the parser does not know opens in the browser inside the app. Chosen here.

### Passwords, and the banner

- With `webcredentials`, the iPhone's keychain fills in the app's sign-in with the password it keeps for the web app, and keeps for the site a password made in the app. `get_login_creds` does the same on Android.
- Safari on iOS draws a banner over a page whose head names the app in a `meta` called `apple-itunes-app`. The banner offers to get the app, or to open it at the address the page hands it, `app-argument`.
  - The pages a link is sent to carry it, each with its own address: the short addresses and the pages of the breaks. Chosen here.
  - It is drawn once the stage names the app's id in the App Store, `VITE_APP_STORE_ID`, which the app has once it is there.
  - Chrome on Android has no such banner: a link there opens the app or the page.
- The short addresses go on to the map at once in a browser. Whether the banner stays after that is to be seen.

### The web's Google sign-in

- The web's Google sign-in leaves the page for Google and comes back through the API, at `/api/auth/callback/google` on the API's host. The API then sends the browser on to the address the sign-in began from: `/app?…` in its language, or `/app` when it began on `/login` (`googleReturnURL`, in `apps/web/src/lib/google-auth.ts`, and [decision 046](046-google-sign-in.md)).
- On an iPhone with the app, that last step comes from another host after a press on Google's page. iOS may take it as a universal link, and open the app, signed out, while the session was just set in Safari. Chrome on Android may do the same. It is tried on both, with a development build, before the first build given to testers outside.
- If the app opens, the web's Google sign-in comes back to an address that the app does not claim, and that page goes on to `/app` from inside the page. A navigation within one site opens no app. Chosen here.
- The app's own Google sign-in ends on its scheme, in the browser the app opened (decision 070), and meets no universal link.

## Rejected

- **A link that survives the install**, through a third party's deferred deep link. A person who opens a link without the app goes through the store, and the link is lost there. Such a service would see every link that is opened, which `/privacy` would then have to say. The web's sign-up takes the invitation in that case, and the banner offers the app.
- **The files in `apps/web/public/.well-known/`.** They would commit one instance's team and fingerprints, which decision 021 keeps out of the repository, and a self-hoster would have to change a tracked file.
- **The whole domain, with exclusions for what stays in the browser.** Every new page of the web would open the app until someone excluded it: `/connect` too, the day it was made.
- **The app's scheme in the mails and the shared links.** A phone without the app does nothing with it, and neither does a computer. Mail programs often show it as plain text.
- **Claiming `/verified`.** The check is done by the time that page shows, and the page is reached by a redirect from the API's host, which may open the app or may not. Reading `account.get` again tells the app the same.
- **Claiming `/mail-off`.** The page stops the mails with one press, signed in or not, and a mail program's own unsubscribe goes to the API. The app would add a screen for what the page already does.

## Consequences

- A stage that has an app gets four more values. `APPLE_APP_ID`, `ANDROID_PACKAGE` and `ANDROID_CERT_SHA256` are declared `@public` in `packages/infra/.env.schema`, since they go into answers, and `VITE_APP_STORE_ID` in `apps/web/.env.schema`, with the other values the build reads. They are listed in `packages/infra/.env.example`, checked and passed on by `scripts/cloudflare-deploy.mjs` as `WEB_INDEXED` is, and given to the Worker by `alchemy.run.ts`. `docs/self-hosting.md` names them under "The apps for phones".
- iPhones read Apple's file through Apple's cache, so a change to the list reaches them a day or more later. Android reads its file when the app is installed or updated. A phone that read an older file still opens the app at an address the list has since dropped, so the parser keeps reading every address the app ever claimed.
- Apple's cache and Google's verifier are robots. A rule of the Cloudflare zone that challenges robots must leave the two addresses alone.
- On an iPhone, a person may send the site's links back to Safari from the app. iOS then opens them in Safari until the person chooses the app again, which the banner's "Open" does. A link typed in the address bar, or pressed on a page of the same site, stays in the browser. A link pressed in another app's own browser, such as Instagram's, often stays there.
- An Android phone that could not verify the file opens the links in the browser, unless its owner lets the app open them in its settings.
- A new address the app takes, or a new parameter of `/app`, changes the list and the parser in `packages/config` in the same change, and the line of AGENTS.md on the Worker.
- Nothing of it is built on 2026-10-19. It is built in this order:
  1. the list and the parser in `packages/config`, with their tests;
  2. the two files in `apps/web/src/server.ts`, with the stage's values;
  3. the associated domains and the intent filters of `apps/native`, with the parser behind them;
  4. the trial of the web's Google sign-in on both phones;
  5. the banner, once the app has its id in the App Store.
