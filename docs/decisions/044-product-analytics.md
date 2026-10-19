# 044. Product analytics

Status: decided on 2026-10-13, at Téo's request to install PostHog and follow his analytics handbook. The landing page is due to be rebuilt. [Decision 054](054-error-reports.md) amended it on 2026-10-15: the same consent covers error reports, and the API reports its faults. [Decision 055](055-audience-counts.md) amended it the same day: Umami counts the pages read, the landing's too. [Decision 069](069-an-app-for-phones.md) amended it on 2026-10-19: an event of the app for phones says `ios` or `android` as its surface, and the version of the binary.

## Decision

- The product web app uses PostHog. Analytics is optional for an instance and starts only after a visitor explicitly agrees, with refusal as easy as agreement. The account tab lets them withdraw that choice. A choice lasts 180 days in that browser.
- The consent window explains simply that usage analytics helps improve the new app, without naming the provider in that short text. A link leads to the privacy details, which name the provider and data sent. At Téo's request, initial focus goes to acceptance; both choices retain the same appearance, and focus alone grants nothing. Since decision 054, the same text and the same choice cover error reports.
- The landing loads no PostHog SDK and declares no section/click events. Since decision 055, Umami counts its pages, and the product's.
- Each product action names its `object_verb` event, in the past tense, in its oRPC metadata. One middleware captures on success, after authorization and the procedure's work. It reads no input or output. Operational counts of decision 020 remain independent.
- `app_active` is recorded on first visible use of a UTC day, including a tab left open overnight. The API gives an account/day or device/day a stable event UUID and midnight timestamp, providing a stable deduplication key across retries, devices and process restarts. The browser also remembers the day and environment after success, across reloads. Authentication supplies the account identifier; an anonymous browser supplies a device UUID.
- `alert_created` is activation: the user set the conditions that make a spot work. Use it as the start event for retention to `app_active`, and `session_logged` as a second measure of value.
- Successful authentication is captured at the server's Better Auth boundary. The browser identifies by auth ID alone, resets on sign-out or account replacement, and sends consent, distinct ID and session ID through dedicated headers. Only requests from the instance's web origin are captured.
- Every event carries `surface`, `environment` and `app_version`. Local use, pre-production and production use `development`, `dev` and `production`. Tests and CI construct no transport and send nothing.
- The browser loads the SDK lazily after consent and sends only feature categories and identity through `/ingest`, a reverse proxy on its own domain. It forwards only POST ingestion paths to the configured PostHog Cloud host, strips incoming cookies, authorization, query strings and IP headers, and bounds payload size and timeout. It uses manual redirect mode, the mode Workers supports, and rejects any redirect before it can forward an event elsewhere.
- No event sends content, names, emails, searches, coordinates, place identifiers, link tokens, URLs or free text. The browser uses a property allowlist, removes person properties, and disables autocapture, pageviews, replay, surveys, performance and the SDK's own exception collection. The server sends no request or response contents. Decision 054 says what an error report keeps. Geo-IP is disabled.
- No analytics schema or data is kept in Postgres. Analytics failures cannot refuse an action. The server flushes its queue at shutdown, within the existing five-second deadline.

## Consequences

- Ad blockers do not drop product actions captured by the API. An event measures successful calls, not a guarantee that the user did a distinct action: preview/search/read events can occur repeatedly. Use unique people when measuring adoption.
- The web app, API and deployment stage configure their own project token, Cloud region and environment. The API must be configured and deployed before its new daily-activity procedure is used by the web app. No personal API key belongs to a release, CI or the repository.
- Browser events are limited to `feature_viewed`, `$identify` and, since decision 054, `$exception`; product mutations are never captured twice on the client.
- A refused/expired choice sends no identifiers and no analytics events. An instance without tokens works as before.
- `docs/analytics.md` owns the event inventory, project, activation and verification status.
