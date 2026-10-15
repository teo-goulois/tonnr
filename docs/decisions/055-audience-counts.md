# 055. Audience counts

Status: decided on 2026-10-15, at Téo's request to add Umami beside PostHog for simple counts. It amends [decision 044](044-product-analytics.md), which left the landing without analytics and named Umami as what a later decision might add.

## Decision

- Umami counts the pages read on every page of the web app, the landing's and the product's alike: which page, from which site, with what browser, system, screen and language, and from which country. That is all it is for. Product events stay PostHog's, under decision 044.
- The script is the one Umami serves, loaded with `defer` in the root route's head. It is told to read no query string and no fragment (`data-exclude-search`, `data-exclude-hash`): a shared list's key, an invitation and an assistant's sign-in travel there. `/l/<token>` and `/i/<token>` redirect on the server before a page is drawn, so their path is never counted.
- Umami sets no cookie and keeps no IP address, so no consent is asked: the instance relies on its legitimate interest, and the privacy policy says what is counted. The window of decision 044 still asks only about PostHog.
- An instance chooses its Umami with `VITE_UMAMI_SCRIPT_URL` and `VITE_UMAMI_WEBSITE_ID`, set together or not at all. Without them the web app loads nothing. Téo's instance sets them for `prod` alone, which keeps local use out of the counts. The admin app counts nothing.

## Consequences

- An ad blocker can drop these counts: they are a trend, not a measure. A figure that matters, such as an account created, comes from PostHog's server-side events.
- `/privacy` names Umami among those who receive data. A self-hosted instance with another Umami, or none, says so in its own texts.
