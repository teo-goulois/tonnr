# Product analytics

Provider: PostHog EU. The operated instance uses the Tonnr project; configure a project of your own when self-hosting. [Analytics handbook](https://teogoulois.com/code/stack/analytics). Decision 044 defines privacy and capture behavior.

Activation: `alert_created`. The onboarding funnel is `account_created` → `spot_created` → `alert_created`. Measure visitor conversion separately with `app_active` → `account_created`: direct sign-up can happen before first map use. For retention, start at `alert_created` and return on `app_active`. `session_logged` measures the logbook's value too.

## Events

Every event has `surface=web`, `environment` (`development`, `dev`, `production`) and `app_version` (API commit, browser release or `local`). Server events also carry `authenticated` and the browser's technical `$session_id`. No event carries inputs or resource IDs.

Browser: `feature_viewed` with the fixed feature, place-kind and tab categories; `$identify` with opaque IDs alone. Landing: none, until its new version has a measurement plan.

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
- `friend_added`
- `friend_removed`
- `guide_question_answered`
- `invitation_renewed`
- `list_created`
- `list_deleted`
- `list_left`
- `list_share_renewed`
- `list_shared`
- `list_unshared`
- `list_updated`
- `list_viewed`
- `logbook_recap_viewed`
- `notification_read`
- `place_searched`
- `push_device_removed`
- `push_disabled`
- `push_subscribed`
- `recent_places_cleared`
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
- `units_updated`
- `verification_requested`

## Filters and accuracy

- Production reports filter `environment=production`; pre-production reports filter `environment=dev`. Local proof events use `development`. The environment comes from release settings, never a caller-supplied property.
- Exclude internal test accounts by their opaque auth IDs in the project's internal-traffic filter once known. Do not send emails to classify them. No real account IDs or project tokens belong in this file.
- `app_active` is one account or anonymous device per UTC day, with a stable UUID and midnight timestamp for deduplication. The browser remembers the successful day across reloads. Analyze unique distinct IDs for daily use; identity merges can join an anonymous device to its new account.
- Search, preview and read actions measure successful calls. They may repeat as queries refresh; they are not literal button-click counts.
- Both transports require browser consent. Browser capture uses an allowlist, server capture reads no inputs/outputs. Replay, automatic errors and DOM capture are disabled.

## Verification

2026-10-13: `pnpm run check` passed with the Postgres suites enabled (2,469 tests). A controlled development browser sent repeated successful requests to the activity procedure through the real Hono API, against an isolated temporary database. The Tonnr EU project showed one `app_active` record with `surface=web`, `environment=development`, `app_version=local`, a technical session ID and `authenticated=false`. A browser `feature_viewed` record arrived through the app-domain reverse proxy with only allowlisted technical/category properties. Refusal initialized no SDK and sent no identity headers. Unit tests used in-memory SDK/HTTP substitutes; the live proof called no forecast, place, mail or push provider. Consent presentation was checked in the desktop browser at a phone viewport, not on physical Safari.

Hosted verification on the same date passed on the `dev` web stage and hosted API, deployed from `f612f3f`. The Tonnr EU project received one `app_active` after repeated controlled activity requests, with `surface=web`, `environment=dev` and the full deployed API commit in `app_version`. The browser's `feature_viewed` arrived with `environment=dev`, `surface=web` and web release `mv6sab12`. Its same-origin ingestion request returned 200. Disabling analytics cleared the remembered activity days; reloading with consent denied sent no ingestion request. The landing page sent none. The proxy was also exercised in the actual Workers runtime with a local fake upstream; redirect handling has a regression test. Local `.env` and stage build values do not update Easypanel's service environment: its API variables were configured separately before deployment.

## Configuration

See [Self-hosting](self-hosting.md#product-analytics). API: `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`, `POSTHOG_ENVIRONMENT`. Web: the same names prefixed with `VITE_`. Optional as a group; without them the instance sends nothing. Deployment files use `packages/infra/.env.<stage>` for browser values. `envsync push` remains the operator's command.
