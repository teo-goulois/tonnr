# 075. Building and updating the apps, with no service of Expo's

Status: accepted on 2026-10-19. Téo answered the report's questions that bear on this record. The builds should spend no credits of Expo's: "il faudrait éviter de consommer des crédits", though he did not know what they consume. The updates of the app's code come from the instance's own storage and not from Expo's. And the Android tools may be installed on his Mac. He has an Apple developer account. He has no Google Play account, for which he asked "donne moi les steps", and no Android phone. The rest of the report's recommendations were accepted with it. It follows [decision 069](069-an-app-for-phones.md), which left to this record how the app is built and updated. It amends [decision 021](021-web-stages.md): its stack gains a Worker and a bucket for the updates, and its token gains rights over R2. It keeps [decision 012](012-open-source.md) as it is: CI still reads one secret. What is marked "chosen here" is mine, and his to overturn.

## Context

Easypanel builds the API and the worker from what `main` holds, when `pnpm run deploy:api` and `pnpm run deploy:worker` call its deploy addresses ([decision 009](009-deployment.md)). The commands then wait until the new process says it started ([decision 022](022-instance-state.md)). The web app and the admin are built on a developer's machine, from `main`, in a checkout of their own, and Alchemy sends them to Cloudflare (decision 021). Each command reads what it needs from files Git ignores. CI reads one secret, the licence key of the icons.

An app for phones ships another way. A binary is built on a Mac with Apple's tools, or with Android's, signed with keys its developer keeps, sent to a store, and reviewed there. Once installed, it stays as it is for months. Its JavaScript and its pictures can be replaced without a store, by an update the app fetches itself: that is how a fix reaches phones within a day.

Expo sells all of it. EAS Build builds in Expo's cloud, EAS Submit sends the builds to the stores, and EAS Update serves the updates. On 2026-10-19 the free plan, which cannot be billed, gave 15 builds of each platform a month, in a queue that waits ninety minutes and more at the busiest hours, and updates to 1,000 installations a month. An update signed by its developer needed the plan at $199 a month. None of it is needed to build: `expo prebuild` writes the Xcode and Gradle projects from the app's config, and each platform's own tools do the rest. Expo publishes the protocol its updates speak, Expo Updates v1, and an example of a server for it.

## Decision

### No service of Expo's

- No account at Expo. The apps are built, signed, uploaded and updated from Téo's Mac, with Apple's tools, Google's, and Expo's open-source command line, whose `expo prebuild` and `expo export` ask for no account. No `eas` command runs in the repository or in its scripts: one of them, `eas update:configure`, would point the app's updates at Expo's servers.
- `ios/` and `android/` are never committed. `expo prebuild --clean` writes them again at each build from the app's config and its config plugins, in `apps/native`. A setting written by hand in either would be lost at the next build.

### A store build

- `pnpm run release:ios <stage>` and `pnpm run release:android <stage>` make a store build. They are root scripts, as `deploy:web` is: each builds the commit that `main` has on the remote, in a checkout of its own, and never the working tree. The install gets the licence key of the icons and no other secret. The build gets the stage's values from `packages/infra/.env.<stage>`, as the web app does: the API's address, the web app's domain, which the app's links name ([decision 073](073-links-that-open-the-app.md)), and the address of the updates. Names chosen here.
- iOS: `expo prebuild --platform ios --clean`, then `xcodebuild archive` and `xcodebuild -exportArchive`, with `-allowProvisioningUpdates` and an App Store Connect API key (`-authenticationKeyPath`, `-authenticationKeyID`, `-authenticationKeyIssuerID`). With them xcodebuild makes or fetches the certificates and profiles of the app and of its extensions in Téo's team, and the repository keeps none. `xcrun altool --upload-app` uploads the `.ipa` with the same key, and the build appears in TestFlight. Since 2026-04-28 Apple takes only builds made with Xcode 26 or later, and SDK 58 asks for 26.4.
- Android: `expo prebuild --platform android --clean`, then `./gradlew app:bundleRelease`, which writes an `.aab` signed with the upload key. Since prebuild rewrites `android/`, a config plugin of `apps/native` gives Gradle its signing. The script passes the keystore's path and passwords in Gradle's environment, and nothing writes them into the checkout. Google holds the key that signs what phones install (Play App Signing): the upload key only proves that a build is Téo's.
- The Play Developer API sends the build, with a service account: an edit, the bundle, its track, then the commit of the edit, through `fetch` and a token signed with `node:crypto`. Chosen here. The first build is uploaded by hand in the Play Console. Google's API works only for an app that already has one. Expo's documentation says otherwise, and Google's is followed.
- The Mac needs Xcode, JDK 17 and the Android SDK at the versions SDK 58's template names: `platforms;android-37.0`, build tools 37.0.0 and NDK 27.1.12297006. The JDK that Homebrew installs by default, 27, cannot run the Gradle the SDK ships, 9.4.1. All of it takes 15 to 20 GB of disk.
- The version is `version` in the app's config. A person raises it for each release in a store. The build number is the same on both platforms: the count of commits of `main` up to the one built. It grows with `main`, it tells which commit a binary was built from, and a store takes each build number once. Chosen here. `X-App` sends it (decision 069), and `v1.clients.get` compares builds by it.
- A store build goes to testers first: TestFlight, and a test track of Google Play. A person promotes it to the store, in App Store Connect and in the Play Console. No script releases to the public. Chosen here.

### Updates of the JavaScript

- The app takes its updates through `expo-updates`, by the Expo Updates protocol v1, from the instance's own server. A binary's runtime version is its fingerprint (the `fingerprint` policy): a hash of its native code and of what writes it. An update goes only to the binaries whose native code it was built with. A change to native code, to a library that has some, or to a config plugin, changes the fingerprint: no update reaches the new runtime until a store build ships it.
- The address the app asks, `updates.url`, is written into each binary and stays there. Moving it takes a new store build of each platform, as changing the bundle id would. It is a value of the build, as the API's address is: `https://updates.tonnr.app` for the apps in the stores. Chosen here.
- The app asks at each start, starts on what it has without waiting, and runs what it downloaded at the next start (`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`). It never reloads itself under the person, as the web app's toast never does (decision 021). Chosen here.
- Only JavaScript and the files it draws go by update. Both stores allow code that an interpreter runs to be downloaded, as long as it does not change what the app is for. Google's rule was read. Apple's, section 3.3.1(B) of its licence agreement, was not read word for word.

### The Worker of updates

- A Cloudflare Worker serves the updates, over an R2 bucket of its own. It is declared in `packages/infra/alchemy.run.ts`, beside the web app and the admin. A stage has them when its file names `UPDATES_DOMAIN`, the Worker's host, and `UPDATES_FILES_DOMAIN`, the bucket's, as a stage that names `ADMIN_DOMAIN` has an admin. `pnpm run deploy:updates <stage>` deploys them, through `scripts/cloudflare-deploy.mjs`. `prod` names `updates.tonnr.app` and `bundles.tonnr.app`. Chosen here, with the names.
- The Worker reads `expo-platform`, `expo-runtime-version`, `expo-protocol-version`, `expo-current-update-id` and `expo-embedded-update-id` from the request. It reads from its bucket the latest publication for that platform and runtime. It answers with `expo-protocol-version: 1`, `expo-sfv-version: 0` and `cache-control: private, max-age=0`:
  - the manifest of the latest publication, with its signature, in `multipart/mixed`;
  - `rollBackToEmbedded`, signed too, when the latest publication sends the apps back to the JavaScript of their binary;
  - a `204` when the app already runs the latest publication, or when nothing was published for its runtime. Protocol 1 allows it for nothing new, and the client reads it as the directive `noUpdateAvailable`. It has nothing to sign: a directive signed once and served to every runtime would carry one key's signature to binaries that may check another's.

  A platform other than `ios` or `android` is refused with 400, and a protocol other than 1 with 406.

- The Worker reads its bucket and writes nothing. It holds no key, and keeps and logs nothing of a request. An app asks once a start, well within the 100,000 requests a day of Cloudflare's free plan.
- The bucket's own domain serves the files of an update, not the Worker: the bundle in Hermes bytecode, the pictures and the fonts. Each lies under the key of its hash and never changes at its address. It is written with its type and `cache-control: public, max-age=31536000, immutable`, which R2 serves as written. The app checks each file against the SHA-256 that the manifest gives.

### Signing and publishing

- Every manifest and every directive is signed when it is published, with an RSA key (`rsa-v1_5-sha256`) that stays on Téo's Mac and in his password manager. The Worker serves the signature written beside each. The binary carries the certificate, which is public and committed in `apps/native` (`codeSigningCertificate` and `codeSigningMetadata` in the app's config), and refuses an update whose signature does not match. The check is a part of Expo's open-source client: off EAS, it costs nothing.
- `npx expo-updates codesigning:generate` makes the pair once, with a certificate valid for ten years. Chosen here. A certificate that expires stops every update. A new one comes with a store build, and its runtime changes with it.
- `pnpm run release:js <stage>` publishes `main` as an update, in a checkout of its own: `expo export` for both platforms, then, for each, the runtime its fingerprint names. Name chosen here. The bundle is compiled by the React Native of the lockfile, so its bytecode is the one the binary's Hermes reads: the export never skips it.
- A publication goes only to a runtime that a store build shipped. Once its upload succeeded, each store build writes its runtime in the bucket, with its build number and its commit. The command refuses a runtime that no store build shipped, and says that native code changed and a store build is needed.
- It uploads the files first, then the manifest and its signature, and points the runtime's latest publication at it last. An app never reads a manifest whose files are missing. `--rollback` publishes the signed directive that sends a runtime's apps back to the JavaScript of their binary. To go back to an earlier commit, it is published again.
- Before it uploads, a store build checks that the runtime its binary carries is the one a publication of the same commit would name, and stops otherwise. The fingerprint reads what is installed and what the config plugins write. A runtime that drifted between the two would take no update, unseen.
- A publication reaches every installed app of its runtime at its second start after it. Testers do not get it first: there is no pre-production ([decision 052](052-production.md)).

### Keys, kept out of the repository

- These stay on Téo's Mac, outside the repository, with a copy of each in his password manager:
  - the Android upload keystore and its passwords;
  - the App Store Connect API key;
  - the APNs key and Firebase's service account, which the worker's environment also holds ([decision 072](072-push-to-the-apps.md));
  - the key of Sign in with Apple, which the API's environment also holds ([decision 070](070-signing-in-from-the-app.md));
  - Google Play's service account, which sends the builds;
  - the key that signs the updates;
  - the R2 token of the updates' bucket.

  The root `.env` holds the ids and the passwords and says where each file lies, as it holds Easypanel's addresses, and `.env.example` names them. No step of CI reads any of them.

- Google replaces a lost upload key on request. A lost update key leaves the binaries that carry its certificate without updates until their next store build. A leaked one does nothing alone: reaching a phone also takes the right to write the bucket, and the Worker holds neither.

### What Téo does once

- In App Store Connect: he creates the app, `app.tonnr`, with its name. He answers the trader declaration of the EU's Digital Services Act: a trader's address, phone number and mail are shown on the App Store in the EU, and in February 2025 Apple removed from the EU the apps of accounts that had not answered. He also answers the question of export compliance, which the decryption of pushes concerns (decision 072).
- He makes an App Store Connect API key for the team. Apple lets its file be downloaded once. Which role xcodebuild needs to make certificates and profiles will be seen at the first build.
- TestFlight: his team tests a build at once. Testers from outside wait for Apple's review, of the first build of each version, and that test releases `v1` (decision 069).
- A personal Google Play developer account. It costs $25 once, and asks for an identity document and a proof of address under 90 days old, both matching the payments profile. Play shows the developer's name, his legal name, his country and the developer's mail. The mail is `hello@tonnr.app`, `CONTACT_EMAIL`, and not his own: chosen here. A personal account can become an organization's later, and an organization's account can never become personal.
- A physical Android phone, version 10 or later and not rooted, verified once through the Play Console's app. An emulator does not count. A phone borrowed for a minute does. Google does not say whether a test can start before that, so it is done before the testers are asked.
- The app in the Play Console, under the package `app.tonnr`, which Google registers to the account for good. Then the upload key, made with `keytool`, and the first `.aab`, uploaded by hand to internal testing.
- A service account of Google Cloud, with the Play Developer API turned on and a JSON key, invited in the Play Console with the right to release.
- A closed test with at least 12 testers, who stay opted in for 14 days in a row. A tester who leaves and comes back starts again, so fifteen to twenty people with Android phones are asked. Then he applies for production, which Google usually answers within a week. From the account to the store takes three to four weeks at best.
- The listing, the address of the privacy policy, the Data safety form and the content rating, in the Play Console. The privacy labels in App Store Connect.
- In Cloudflare: the rights of the token over R2 and over the domains of its buckets, and an R2 token with "Object Read & Write", limited to the updates' bucket, as the media's is ([decision 066](066-photos-and-videos-of-a-session.md)).

## Rejected

- **EAS Build in the cloud.** Its free plan cannot be billed, so it would cost nothing, but it runs out: 15 builds of each platform a month, and then none until the next month. Its queue waits ninety minutes and more at the busiest hours. The licence key of the icons and the signing keys would live at Expo too.
- **`eas build --local`.** It builds on the Mac, but it still asks for an account at Expo and a project registered there, and it ignores the versions of the tools that its own file names. It would add an account to what `prebuild`, Xcode and Gradle already do.
- **Building in CI**, on GitHub's macOS runners. The signing keys and the bucket's token would go into GitHub, and decision 021 already refused a second secret there.
- **EAS Update.** Its free plan serves 1,000 installations a month, and signing an update needs the plan at $199 a month. Expo would see the address of every phone at each start, and `/privacy` would name it.
- **EAS Submit.** It is free, but it sends the binaries through Expo's storage, and asks for an account at Expo besides the same keys.
- **fastlane.** A Ruby toolchain for two uploads, which `altool` and Google's API already do.
- **A static manifest on R2 alone.** The client refuses an answer without `expo-protocol-version`, which an object of R2 cannot carry, and it names its platform and runtime in headers, which no static address reads.
- **The media's bucket.** It must stay private, with no public address (decision 066), and its token is the API's and the worker's.
- **Serving the files through the Worker.** Every file would count as a request of the Worker. The bucket's own domain serves them from Cloudflare's cache. R2's `r2.dev` address is limited, and meant for development.
- **A runtime version written by hand.** A person who forgets to change it sends JavaScript to a binary whose native code it does not fit, and every installed app crashes at once.
- **A community Worker of updates as a dependency**, such as isaiahbjork/cloudflare-expo-updates-server. It had two commits and no signing on 2026-10-19. It was read, with Expo's example, as a reference.

## Consequences

- Only a machine that holds the keys builds the apps in the stores: Téo's Mac today. Someone who hosts their own builds their own app, with their own identifiers, keys, Worker and certificate (decision 069). `docs/self-hosting.md` says how once it is built.
- The address of the updates is as permanent as the bundle id. A self-hoster names their own before their first store build.
- A publication reaches every app of its runtime at once. When the JavaScript needs something new from the API, the API is deployed first. The API goes on answering the apps of older runtimes, which keep the JavaScript they have, by the rules of `v1` (decision 069). `v1.clients.get` asks them to update once they are too old.
- The Cloudflare token gains rights over R2 and over the domains of buckets: the table of rights in `docs/self-hosting.md` grows. AGENTS.md's list of what reads `packages/infra/.env.<stage>` gains `deploy:updates`, `release:ios`, `release:android` and `release:js`, in the same change as the commands.
- `/privacy` says, in its line for Cloudflare, that Cloudflare also serves the app's updates, which ask for nothing of who asks. It changes in the four languages, with `LEGAL_UPDATED`. Expo receives nothing.
- The source maps that a build and a publication write stay on the Mac. Sending them to PostHog, so that an error of the app names its line, is not decided.
- `STORES`, in `apps/web/src/components/landing/landing-footer.tsx`, gets each store's address once the app is out.
- Nothing of it was built on 2026-10-19. Built on 2026-10-20, in this order, each with its tests, and tried against no service of Apple's, Google's or Cloudflare's:
  - The app's config. `UPDATES_URL`, from the stage's `UPDATES_DOMAIN`, turns the updates on, with the fingerprint policy, `ON_LOAD` and `fallbackToCacheTimeout: 0`; a development build names none, and the app's config then turns `expo-updates` off. The certificate, made on 2026-10-20 and valid until 2036-10-20, is `apps/native/certs/certificate.pem`, with `keyid` `main`, which `@repo/config/updates` holds for the publication too. The public config that the fingerprint hashes leaves the certificate out, so `apps/native/fingerprint.config.js` adds it: a new certificate makes a runtime of its own. The build number is `APP_BUILD_NUMBER`, which the fingerprint leaves out, as it leaves out `version`.
  - The Worker and its bucket, in `apps/updates`. A signed manifest or directive lies in the bucket with its `expo-signature` in its custom metadata, so that the two are written in one request. The bucket is named `<slug>-<stage>-updates`. The Worker says that nothing is new with a `204`, which needs no signature, so that the binaries of an older certificate never get a directive that a newer key signed and refuse it at each start: the directive signed once of the first build was given up after the review of 2026-10-20. The client sends `EAS-Client-ID`, a number of the installation that Expo's code makes, with each request: the Worker reads none of it, and the stack turns its logs off.
  - `release:js`, with `--platform`, which a release before the Play account needs, and `--dry-run`. It writes the bucket through R2's S3 API, with requests signed by `node:crypto`, and turns off the telemetry of Expo's command line and its calls to Expo's servers (`EXPO_NO_TELEMETRY`, `EXPO_OFFLINE`). An export of iOS of 2026-10-20 was 10 MB of Hermes bytecode and 26 pictures, and its manifest was signed and checked with the certificate, on this Mac, writing nothing anywhere.
  - `release:ios` and `release:android`, with `--by-hand`, which builds the first bundle of Android for the Play Console, writes its runtime in the bucket and asks nothing of Google. The Play Developer API is `apps/updates/src/play.ts`, the signing of Gradle `apps/native/plugins/release-signing.js`, and the build number, the check of the runtime and the record of a store build `apps/updates/src/builds.ts`. Neither ran: the Mac holds none of the keys, and Xcode and Gradle were left to the other work on it. Xcode puts the fingerprint in `EXUpdates.bundle/fingerprint` within the app, and Gradle in `base/assets/fingerprint` within the bundle, which the commands read: their first runs say whether they are there. Whether `altool` finds its key through `API_PRIVATE_KEYS_DIR`, and whether Google answers the upload of a bundle within the five minutes `fetch` waits, are seen at the first upload.
- Left to Téo, before a first store build and a first publication: copy the key of the updates, `~/.config/tonnr/updates/private-key.pem`, into his password manager, and name it in the root `.env` as `UPDATES_SIGNING_KEY`; add `UPDATES_DOMAIN=updates.tonnr.app` and `UPDATES_FILES_DOMAIN=bundles.tonnr.app` to `packages/infra/.env.prod`; give the Cloudflare token "Workers R2 Storage: Edit", then run `pnpm run deploy:updates prod`; make the R2 token of the bucket `tonnr-prod-updates` and put its two credentials in the root `.env`; create the app in App Store Connect, answer the trader declaration and export compliance, make the API key and name it in the root `.env`; for Android, the account, the phone, the app, the upload key and `--by-hand`, then the service account, as "What Téo does once" lists them. Then `pnpm run release:ios prod`, and `pnpm run release:js prod --platform ios` until Android has a store build.
