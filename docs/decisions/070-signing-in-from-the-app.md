# 070. Signing in from the app

Status: accepted on 2026-10-19. Téo asked that day for an app that works "de A à Z. Connexion, notification poussée, etc. avec les flow natifs" ([decision 069](069-an-app-for-phones.md)). He has an Apple developer account, which Sign in with Apple needs, and accepted with the rest of the report the session kept in the phone's keychain, sessions of ninety days, and Sign in with Apple on iOS and on the web. This record settles what [decision 019](019-api-access.md) left open, how a phone app signs in. It amends [decision 025](025-account-sessions-and-suspension.md), whose sessions lasted the sign-in library's week, [decision 026](026-checked-addresses.md), whose mails all led to the web, [decision 041](041-community-guides.md), whose invitation was read on two routes of the sign-in alone, and [decision 046](046-google-sign-in.md), whose Google was the only provider and signed in on the web alone. What is marked "chosen here" is mine, and his to overturn.

## Context

The web app signs in through the routes of the sign-in library, Better Auth 1.7.7, under `/api/auth`. Its session is a cookie of the API's, `__Secure-better-auth.session_token`, which the browser keeps and sends with each call, and which no script of a page reads. An app on a phone keeps no cookie by itself. Since decision 069 the library runs its Expo plugin, `expo()` in `createAuth` (`packages/auth/src/index.ts`): it takes the origin an app names in `expo-origin` as the request's, and the library trusts the origins of `APP_ORIGINS`.

`Authorization: Bearer` names an API key here. `readAuthorization`, in `packages/api/src/keys.ts`, judges a request on that header alone, and refuses a bearer that is not a key.

`createAuth` sets no length for a session, so a session lasts the library's default, a week, renewed about once a day while it is used. A surfer who opens nothing through a week of flat sea is signed out, on the web as on a phone.

Google signs in through a browser, and on the web alone (decision 046). App Review's guideline 4.8 asks an app whose accounts sign in with another company's service, such as Google's, to offer as well an equivalent that asks for a name and an address at most, lets the person keep the address private, and collects nothing for advertising without consent. Whether an address and a password of the instance's own count as that equivalent is not settled. Sign in with Apple does.

The library signs in with a provider's ID token at `/sign-in/social`, as an app does with what Apple's sheet gives it. That route does not read `additionalData`, where the web app puts an invitation. The hook that keeps an invitation for a new account runs on two routes alone: `/sign-up/email` (`invitations`) and `/callback/:id` (`oauthInvitation`), both in `packages/auth/src/invitation.ts`. An account made by an ID token would have no sponsor.

The mails of an account's address take their language from `Accept-Language` until the account's own is known (`packages/auth/src/verification.ts`). A browser sends that header. A request of Android's carries none unless the app writes it. The link that checks an address opens the API, `/api/auth/verify-email`, which sends the browser on to the web app's `/verified`. The link that lets an account choose a new password opens the web app's `/reset-password?token=…`, under the prefix of the mail's language (decision 026).

## Decision

### The session, kept in the phone's keychain

- The app signs in through the library's own routes, as the web app does, with its Expo client, `expoClient` from `@better-auth/expo` 1.7.7, pinned with the rest of the library. The client keeps the session's cookie through expo-secure-store: in the keychain on iOS, and on Android in a store that the Keystore encrypts. Accepted with the rest of the report.
- The cookie goes as a `Cookie` header, with `credentials: "omit"`, so that the platform's own jar of cookies keeps nothing. The library's client sends it on its calls, and the app's client of the API reads it there for every call to `/rpc`, with `expo-origin` beside it (decision 069).
- The keychain gives the cookie once the phone has been unlocked after it started (`AFTER_FIRST_UNLOCK`), and not only while it is unlocked. What the app does in the background calls the API with it while the phone is locked, and writes what the widgets show ([decision 074](074-widgets-and-live-activities.md)). Chosen here.
- The library's `bearer()` plugin is not used. It gives a session as a token in `Authorization: Bearer`, a header that names a key here, so every call would be refused. It also writes the token in a header of every answer that sets the session's cookie, the web's answers included, and lets the pages' scripts read that header: the web's cookie, which no script reads, would be given to them.

### How long a session lasts

- A session lasts ninety days. It is renewed for ninety more when it is used a day or more after it was last renewed: `session` in `createAuth`, with `expiresIn` and `updateAge`. This holds on the web and in the app alike, since the library has one length for every session. Signing out, a new password, an operator who closes an account's sessions and a suspension still end a session at once (decisions 025 and 026). Accepted with the rest of the report.
- The app reads its session from the library, `/api/auth/get-session`, each time it comes to the foreground. Once a day has passed, the answer renews the cookie the app keeps, as a browser's is renewed. The API renews a session in the database as `/rpc` reads it, and sends no cookie back. So the cookie of an app that only called `/rpc` would run out ninety days after it was given, while its session lived on. Chosen here.

### Sign in with Apple

- On iOS the app offers it through the system's sheet and button, with expo-apple-authentication. The app makes a nonce for each sign-in, and Apple answers an ID token that carries it. The app sends both to `/api/auth/sign-in/social`, which checks the token against Apple's keys and the app's bundle, and opens a session.
- The web offers it through OAuth, as it offers Google. Apple's page posts its answer to `/api/auth/callback/apple` from `https://appleid.apple.com`, which the library then trusts. `/sign-in-providers` answers `{ google, apple }` (`signInProviders`, in `packages/auth/src/google.ts`), and the web app and the app show a button for each provider the instance offers. So an account made with Apple on an iPhone signs in on the web, and one made on the web signs in on an iPhone.
- Android does not offer it at first. An account made with Apple signs in there with a password. It sets one through the mail of a forgotten password, as a Google account with no password does (decision 026).
- An account made with Apple has no username. It chooses one when something needs it, as a Google account does (decisions 041 and 046). Apple gives the person's name the first time alone. The library keeps it as it keeps Google's, and nothing shows it. An account that exists is linked to Apple only when both addresses are checked, by the rule of decision 046.
- A person may hide their address from the app. Apple then gives an address of its relay, which passes on what it receives from the senders it was told of. The domain of `EMAIL_FROM` is registered with Apple's relay. Without that, every mail to such an address is refused: the check's, a new password's, the alerts'.
- An instance offers Sign in with Apple when three settings are set together, beside the team: the Services ID that names the web's sign-in at Apple, and the id and the content of a key of Apple's. Their names are chosen here: `APPLE_SERVICES_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`. The team is `APPLE_TEAM_ID`, which the pushes of [decision 072](072-push-to-the-apps.md) read too, since one team signs the app and holds both keys. Some of the three and not all, or any of them without the team, stops the API as it starts, as a partial pair of Google's does.
- Apple takes as a client's secret a token signed with that key, which lasts six months at most. The API signs one as it starts, and again before it runs out, so that nobody makes one by hand. Chosen here.
- The ID token the app sends is for its bundle, which decision 069 makes the scheme of its origin: `app.tonnr`, from `app.tonnr://` in `APP_ORIGINS`. Chosen here.
- After a sign-in through a browser, the library keeps the tokens Apple gives. With them the API revokes the account's link to Apple when the account is deleted ([decision 071](071-deleting-and-blocking-an-account.md)). A sign-in by an ID token keeps none. So the app also sends the code that Apple gives with the token, and the API exchanges it for them. Chosen here.

### Google, in a browser inside the app

- The app signs in with Google as the web app does, through OAuth, in a browser that the system opens over the app and closes after: ASWebAuthenticationSession on iOS, a Custom Tab on Android. The library's Expo client opens it through expo-web-browser. Chosen here.
- That browser opens `/api/auth/expo-authorization-proxy`, which puts the request's state in the browser's cookies and sends the browser on to Google. Google sends it back to the web's callback, `/api/auth/callback/google`. The callback sends it on to the app's own address, `app.tonnr://`, and the plugin adds the session's cookie to that address. The client keeps the cookie.
- It needs no new client at Google, no key in the app and nothing paid. The invitation goes in the request's state, as on the web.
- Google's own sheet, through its SDK, comes later. It gives an ID token, on the route Apple's takes. It needs a client at Google for iOS and one for Android, with the fingerprints of the keys that sign the app, and the API then takes a token made for any of the three clients.

### An invitation

- The app reads an account's link, `/i/<token>`, as the web app does. It opens the link with `friends.open`. Once signed in, it becomes a friend with `friends.accept`. Signed out, it carries the link to a sign-up. [Decision 073](073-links-that-open-the-app.md) says how the link opens the app.
- A sign-up with an address carries the link in `invitation`, and a sign-in through Google carries it in the request's state, both of which the library reads already. A sign-in by an ID token carries it in `additionalData.invitation`, which the library leaves unread on that route. `oauthInvitation` reads it there too, on `/sign-in/social`, in the hook that runs once a new account is made. An account that exists gains no sponsor, whatever it carries (decision 041).

### The mails

- Every call of the app to the sign-in library says the app's language in `Accept-Language`: the language set in the app, else the phone's (decision 069). Android sends none, and the mails take their language from that header until the account's own is known. With it go `X-App`, and `expo-origin`, which the library's Expo client leaves off a sign-in by an ID token. `account.sendVerification` names the language in its body, as the web app does. Chosen here.
- The link that checks an address stays on the web. It opens the API, which sends the browser on to `/verified`, and it signs nobody in. The app reads `account.get` again each time it comes to the foreground while its address is not checked, as the web app does when its tab is shown again (`useOwnAccount`, in `apps/web/src/components/auth/`).
- The link that lets an account choose a new password opens the app at its own screen when the app is installed, and the web's page otherwise. The app claims `/reset-password` under each language's prefix (decision 073). Its screen sends the token and the new password to the library, `/api/auth/reset-password`, as the page does.
- A new password closes every session of the account, the phone's too, and the push devices that go with them (decisions 026 and 031). The screen then asks to sign in with the new password. Once signed in, the app subscribes the phone to push again ([decision 072](072-push-to-the-apps.md)).

### Signing out, and an account that is suspended

- When a sign-in is refused with `ACCOUNT_SUSPENDED` (decision 025), the app says so in its own words, the message the web app shows, `auth_suspended`.
- Signing out ends the session, and the phone's push device with it. The app then forgets, on the phone, the cookie and the push keys in the keychain, what it loaded and kept for when it cannot reach the API, and what it wrote for the widgets. It ends its Live Activities, and resets its analytics. Chosen here.
- It does the same when it learns that it is no longer signed in. Its session then reads as none, after an operator closed it or suspended the account, or after a new password was chosen elsewhere.

### The screens

- One sheet signs in and creates an account, with the buttons of Apple and Google over the address and the password. It opens from what needs an account and says what for, as `useAuthPrompt` does on the web. While the instance is closed to visitors, it stands in place of the map, as `LoginWall` does ([decision 039](039-visitors.md)). Chosen here.
- The fields say what they hold, so that the system's passwords fill them and keep a new one for the instance's domain (`webcredentials`, decision 073). The username is checked as it is typed, by the rules of `packages/config/src/username.ts` and the library's `/is-username-available`. The sheet says that a sign-up accepts the terms and the policy, which open in the browser inside the app.

## Rejected

- **A token in `Authorization: Bearer`**, by the library's `bearer()` plugin. The header names a key, and the plugin would give the web's token to its pages' scripts.
- **A session of a week, the library's own, or a longer one for the app alone.** A week signs out whoever a flat week kept away. The library has one length for every session, and a browser left closed for a month is in the same case as a phone.
- **Google's SDK now.** Its free version for React Native uses Android's Google Sign-In, which Google deprecated. The version on Credential Manager is paid. Either needs two more clients at Google, with the fingerprints of the app's keys. The browser costs nothing and carries the invitation already.
- **Sign in with Apple on Android now.** It would open Apple's page in a browser, for an account that can set a password instead. It comes if the accounts made with Apple ask for it.
- **Sign in with Apple in the app alone.** An account it made would have no way into the web but a password set by mail.
- **A link in the check's mail that opens the app.** The link opens the API, which sends the browser on. A phone opens an app for an address a person pressed, and not reliably for one a server sent the browser to. The app learns of the check by reading its account.
- **The web's sign-in page in a browser inside the app, for every way in.** It would leave one page to keep and no screen to write. Téo asked for the native flows: the keychain fills an app's own fields, and Apple's sheet is the system's.

## Consequences

- An instance whose app offers Google offers Apple too, by guideline 4.8. In Téo's Apple developer account that takes Sign in with Apple on the App ID `app.tonnr`, a Services ID whose return address is the API's callback, `https://api.tonnr.app/api/auth/callback/apple`, a key, and the domain of the mails registered with the relay. `docs/self-hosting.md` says how, in a section beside Google's, in the change that builds it.
- Apple becomes a recipient in `/privacy`. It receives each request to sign in with it, and gives a name and an address, which may be an address of its relay. `RECIPIENTS`, in `apps/web/src/lib/legal.ts`, the four languages and `LEGAL_UPDATED` change with it.
- A person who signed up with their own address, then hid it from Apple, has two accounts, which nothing links.
- A lost phone keeps its session for ninety days, unless the account chooses a new password, which closes every session, or an operator closes them (decision 025). The account's panel has no button that closes its other sessions. Not built.
- An app left closed for ninety days is signed out by the clock, and is still pushed to, as decision 031 has it for a browser: the week it names there becomes ninety days. A push pressed then opens an app that asks to sign in. The library's client sends no cookie past its time, so no request deletes the session as it reads it, and the device stays.
- On Android, the address the browser returns to the app with carries the session's cookie. Another app that claims the scheme `app.tonnr` may be offered that address, and Android then asks the person which app opens it. On iOS, the browser gives it only to the app that opened the browser. Google's SDK, later, ends this for Google.
- `account_created` and `account_signed_in` are counted on the routes of an address and a password alone (`apps/server/src/app.ts`). An account made with Google is not counted, on the web either, and one made with Apple would not be. Not built.
- Built on 2026-10-19, with decision 069: `@better-auth/expo` 1.7.7 in `packages/auth`, its plugin in `createAuth`, and the apps' origins among those the library trusts. Then the same day: the sessions of ninety days (`SESSION_SECONDS`, in `packages/auth/src/index.ts`, which `/privacy` says in its four languages); the invitation on `/sign-in/social` (`oauthInvitation`). Not built yet, in this order: Sign in with Apple in the API and on the web; the app's sign-in, with Google, Apple and the language of its mails; then the app's screen for a new password, once the links of decision 073 open the app.
