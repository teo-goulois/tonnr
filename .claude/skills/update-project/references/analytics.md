<!--
Generated from apps/web/content/handbook/web/analytics.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# Analytics

Add analytics to answer product questions, not to collect every possible click.
Start with one acquisition question, one intent event, and one successful
outcome. Expand only when a decision requires more data.

## Choose the provider

| Need                                                                      | Default                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Public landing, traffic sources, campaigns, pages, and CTA clicks         | Umami                                                         |
| Signup funnel, onboarding, activation, retention, user journey, or replay | PostHog                                                       |
| Journey from marketing site into the product                              | PostHog across both surfaces                                  |
| Both providers                                                            | Only with a written boundary and no duplicated responsibility |

If both are justified, prefer Umami for anonymous, aggregate marketing traffic
and PostHog for product behavior. Do not send the same custom conversion to both
unless a named business requirement depends on it.

Analytics is not the source of truth for money, email delivery, or durable
business state. Use the billing provider, database, or transactional system for
those facts.

## Define the minimal plan

Before implementation, write the question each event answers and its exact
success trigger.

| Stage       | Suggested event     | Trigger                                      |
| ----------- | ------------------- | -------------------------------------------- |
| Acquisition | automatic pageview  | Public page is viewed                        |
| Intent      | `cta_clicked`       | User activates the primary CTA               |
| Lead        | `contact_submitted` | Contact request is accepted                  |
| Conversion  | `signup_completed`  | Account is successfully created              |
| Activation  | product-specific    | User first receives the product's core value |

Keep only applicable stages. A landing linking to an app store may use
`store_badge_clicked` as its final measurable intent; it cannot claim an install
or subscription from that click alone.

## Event contract

- Preserve an existing naming convention. For a new project, use one stable
  `[object]_[past-tense verb]` convention and never name events after UI copy.
- Track meaningful actions, not component renders or every click. Pageviews are
  normally automatic.
- Use one event plus properties instead of separate names for each placement.
  Useful properties include `surface`, `placement`, `destination`, `locale`,
  `plan`, `variant`, `app_version`, `build`, and `release_channel`.
- Never include names, email addresses, message contents, tokens, full query
  strings, or other free text in event properties.
- Separate intent from success: `signup_started` can be client-side;
  `signup_completed` should be emitted after server confirmation when possible.
- Prevent duplicate events caused by retries or client/server capture. Use a
  stable operation identifier for deduplication when the provider supports it.
- Tracking is best-effort. Catch failures and never delay or break the product's
  primary action.

## Umami default

Use Umami for a small public site when aggregate traffic and a few custom events
are sufficient.

- Load the tracker only in production and restrict it with `data-domains` so
  local and preview traffic does not pollute production.
- Do not collect arbitrary URL search parameters. Use
  `data-exclude-search="true"` when campaign attribution is unnecessary;
  otherwise retain only the explicitly approved campaign parameters.
- Respect Do Not Track with `data-do-not-track="true"` when it matches the
  project's policy.
- Let Umami capture pageviews. For plain links and buttons, prefer
  `data-umami-event` and `data-umami-event-*`; use a small typed wrapper around
  `umami.track()` for programmatic or dynamic events.
- Keep the script URL and website ID environment-specific. The website ID is a
  public tracker identifier, not an administrative credential.
- Verify SPA route changes if the site uses client-side navigation.

The Playground pattern is the preferred TypeScript shape: production-only script
injection, declarative attributes for ordinary controls, and a guarded
`trackEvent()` wrapper for dynamic cases.

## PostHog default

Use PostHog when the product needs connected user journeys or analysis beyond a
small marketing site.

- Follow the current framework-specific SDK instructions. Configure the project
  token and the correct EU or US ingestion host through environment variables;
  do not guess the region.
- Missing analytics configuration must not break production. In development,
  report missing or invalid configuration clearly instead of silently losing
  events.
- Rely on automatic pageviews where appropriate, then add explicit custom events
  for business actions. Autocapture is useful for exploration but is not the
  durable conversion contract.
- Capture successful server-side actions on the server and connect them to the
  same distinct ID as the client when a backend exists.
- Identify only authenticated users, with a stable internal auth ID rather than
  an email address. Call `reset()` on logout. Anonymous landings do not need
  identity.
- Keep development/internal traffic out of production analysis or label it with
  explicit environment, version, build, and release-channel properties.
- Session replay is optional. Before enabling it, mask all inputs and sensitive
  text, exclude private elements, redact query parameters, and test the actual
  recording. Do not assume default masking covers custom components.
- If consent is required, initialize capture as opted out and enable it only
  after the relevant choice.

## Project memory

When analytics is enabled, create or update `docs/analytics.md` with only:

- provider, project/environment names, region, and public dashboard links;
- business questions and the event/property contract;
- production, test, internal-user, version, and build filters;
- identity, consent, retention, and replay decisions;
- verification date and known gaps.

Public ingestion identifiers may be documented when repository conventions allow
it. Never store personal API keys, administrative credentials, personal data, or
other secrets in this document.

## Verify before calling it complete

On the deployed production URL:

1. Open a clean session and perform one pageview and one primary action.
2. Confirm the network request succeeds without console or CSP errors.
3. Confirm each event appears once in the intended provider and project with the
   expected name and properties.
4. Confirm development, preview, bot, internal, and test data can be excluded.
5. Test both consent choices when consent applies.
6. For PostHog, verify anonymous-to-authenticated continuity, logout reset, the
   first funnel, and replay masking when enabled.
7. Save one useful view: traffic and primary CTA for Umami, or acquisition to
   activation for PostHog.

Low traffic is not evidence of conversion or retention. Report the observation
window, denominator, exclusions, and uncertainty whenever interpreting results.

## Current official references

- [Umami tracker configuration](https://docs.umami.is/docs/tracker-configuration)
- [Umami custom event data](https://docs.umami.is/docs/event-data)
- [PostHog JavaScript SDK](https://posthog.com/docs/libraries/js)
- [PostHog event capture](https://posthog.com/docs/product-analytics/capture-events)
- [PostHog user identification](https://posthog.com/docs/product-analytics/identify)
- [PostHog session replay privacy](https://posthog.com/docs/session-replay/privacy)

Recheck provider and privacy documentation before implementation because SDK
defaults, pricing, consent requirements, and account regions can change.
