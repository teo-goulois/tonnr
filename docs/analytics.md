# Product analytics

Provider: PostHog EU. The operated instance uses the Tonnr project; configure a project of your own when self-hosting. [Analytics handbook](https://teogoulois.com/code/stack/analytics). Decision 044 defines privacy and capture behavior, and decision 054 the error reports.

Audience counts: Umami, on every page of the web app, with no query string and no fragment, and no consent asked. Decision 055. Its pageviews are the only figures for the landing; PostHog's events below stay the product's.

Activation: `alert_created`. The onboarding funnel is `account_created` → `spot_created` → `alert_created`. Measure visitor conversion separately with `app_active` → `account_created`: direct sign-up can happen before first map use. For retention, start at `alert_created` and return on `app_active`. `session_logged` measures the logbook's value too. `surfer_profile_saved` and `surfer_profile_put_off` say how many answer the questions a new account is asked, decision 063. Whether the reports of the waves are used is `report_sent`, `reports_seen` (a browser's batch of views), `report_media_opened`, and `report_notice_read`, which says a notice of reports, from the list or its push, brought someone to a break: decision 068. The admin's overview counts the rest from the database: the notices made and pushed, and the accounts that switched them off. The project's dashboard "Reports des vagues" draws these events, in production and without the test accounts.

## Events

Every event has `surface` (`web`, or `ios` and `android` for the app for phones, which says so in `X-App`: decision 069), `environment` (`development`, `dev`, `production`) and `app_version` (API commit, browser release, the app's version and build such as `1.2.0+34`, or `local`). Server events also carry `authenticated` and the browser's technical `$session_id`. No event carries inputs or resource IDs.

Browser: `feature_viewed` with the fixed feature, place-kind and tab categories; `$identify` with opaque IDs alone; `$exception`, below. Landing: none in PostHog; Umami counts its pages.

Authentication: `account_created`, `account_signed_in`, `account_signed_out`, `account_updated`.

Successful oRPC actions:

- `alert_created`
- `alert_deleted`
- `alert_previewed`
- `alert_settings_updated`
- `alert_updated`
- `app_active`
- `break_saved`
- `break_searched`
- `break_unsaved`
- `contribution_confirmed`
- `contribution_contested`
- `contribution_proposed`
- `contribution_withdrawn`
- `density_updated`
- `friend_added`
- `friend_removed`
- `guide_question_answered`
- `invitation_renewed`
- `list_created`
- `list_deleted`
- `list_left`
- `list_reports_switched`
- `list_share_renewed`
- `list_shared`
- `list_unshared`
- `list_updated`
- `list_viewed`
- `logbook_recap_viewed`
- `media_upload_started`
- `notification_read`
- `place_searched`
- `push_device_removed`
- `push_disabled`
- `push_subscribed`
- `recent_places_cleared`
- `report_deleted`
- `report_flagged`
- `report_media_opened`
- `report_notice_read`
- `report_sent`
- `reports_seen`
- `session_deleted`
- `session_logged`
- `session_updated`
- `shared_list_joined`
- `shared_list_opened`
- `shortcuts_updated`
- `spot_added_to_list`
- `spot_created`
- `spot_deleted`
- `spot_publication_cancelled`
- `spot_publication_requested`
- `spot_removed_from_list`
- `spot_updated`
- `station_saved`
- `station_unsaved`
- `surfer_profile_put_off`
- `surfer_profile_saved`
- `units_updated`
- `verification_requested`

## Error reports

`$exception`, in PostHog's Error tracking, from two places:

- The web app, with the same consent as the events above, on `/app` and `/login`, unless the account tab's switch turned the reports off alone or an operator turned them off for every browser on the admin's page of the instance: unhandled errors, unhandled rejections and what a route's error boundary caught. It carries the opaque IDs, `environment`, `app_version` and the screen's `feature`, `tab` and `place_kind`. Refusals under 500 and aborted requests are left out; a page sends 20 at most, each error once.
- The API, with no consent and no person: distinct ID `api`, `service=api`, `environment`, `app_version`, and no person profile. It reports what it logs as a fault: a procedure's, the MCP server's or a route's error with a status of 500 or more.

Each keeps the kind, the scrubbed message and the stack frames of an error and its causes (`packages/config/src/errors.ts`), and nothing else. Web stack traces are minified: no source maps are uploaded. The worker reports nothing yet.

## Filters and accuracy

- Production reports filter `environment=production`; pre-production reports filter `environment=dev`. Local proof events use `development`. The environment comes from release settings, never a caller-supplied property.
- Exclude internal test accounts by their opaque auth IDs in the project's internal-traffic filter once known. Do not send emails to classify them. No real account IDs or project tokens belong in this file.
- `app_active` is one account or anonymous device per UTC day, with a stable UUID and midnight timestamp for deduplication. The browser remembers the successful day across reloads. Analyze unique distinct IDs for daily use; identity merges can join an anonymous device to its new account.
- Search, preview and read actions measure successful calls. They may repeat as queries refresh; they are not literal button-click counts.
- Both transports require browser consent. Browser capture uses an allowlist, server capture reads no inputs/outputs. Replay, DOM capture and the SDK's own exception capture are disabled; error reports follow decision 054.

## Verification

2026-10-13: `pnpm run check` passed with the Postgres suites enabled (2,469 tests). A controlled development browser sent repeated successful requests to the activity procedure through the real Hono API, against an isolated temporary database. The Tonnr EU project showed one `app_active` record with `surface=web`, `environment=development`, `app_version=local`, a technical session ID and `authenticated=false`. A browser `feature_viewed` record arrived through the app-domain reverse proxy with only allowlisted technical/category properties. Refusal initialized no SDK and sent no identity headers. Unit tests used in-memory SDK/HTTP substitutes; the live proof called no forecast, place, mail or push provider. Consent presentation was checked in the desktop browser at a phone viewport, not on physical Safari.

Hosted verification on the same date passed on the `dev` web stage and hosted API, deployed from `f612f3f`. The Tonnr EU project received one `app_active` after repeated controlled activity requests, with `surface=web`, `environment=dev` and the full deployed API commit in `app_version`. The browser's `feature_viewed` arrived with `environment=dev`, `surface=web` and web release `mv6sab12`. Its same-origin ingestion request returned 200. Disabling analytics cleared the remembered activity days; reloading with consent denied sent no ingestion request. The landing page sent none. The proxy was also exercised in the actual Workers runtime with a local fake upstream; redirect handling has a regression test. Local `.env` and stage build values do not update Easypanel's service environment: its API variables were configured separately before deployment.

## Configuration

See [Self-hosting](self-hosting.md#product-analytics). API: `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`, `POSTHOG_ENVIRONMENT`. Web: the same names prefixed with `VITE_`. Optional as a group; without them the instance sends nothing. Deployment files use `packages/infra/.env.<stage>` for browser values. `envsync push` remains the operator's command.
