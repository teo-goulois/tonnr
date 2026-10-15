# 054. Error reports

Status: decided on 2026-10-15, at Téo's request, before the first public release at `tonnr.app` (decision 052). Nothing reported the app's or the API's errors until then. It amends [decision 044](044-product-analytics.md), which kept PostHog's exception capture off and sent nothing of an error from the API. Not built: the worker's reports, which would add PostHog's three variables to its environment, and source maps for the web app's stack traces.

## Decision

- The errors go to PostHog, in the project and through the transports that the product's analytics already uses. An instance without PostHog reports none, as it sends no analytics.
- The web app asks one question for both: the consent window of decision 044 says in one text that the app sends which features are used and a report when something breaks, and one choice answers it. Refusing stays as easy as accepting, and the account tab changes the one choice. No second window. Below that choice, while it is yes, the account tab has a switch that turns off the error reports alone, which Téo asked for the same day: it is kept in the browser, and accepting again, in the window or the tab, turns them on, since the question names them.
- The browser reports an error only while the product's pages are open (`/app` and `/login`) with consent: an error the window saw and no code caught, a promise rejected with no handler, and what a route's error boundary caught. The landing reports nothing. A refusal the API answered (a status under 500) and an aborted request are the app working, and are not reported. A page sends twenty reports at most, and each error once.
- PostHog's own exception capture stays off in the browser: it reads `console.error`, and it loads a script from PostHog's servers, which `disable_external_dependency_loading` refuses. The app listens itself and calls `captureException`, through `/ingest`.
- A report says what failed and where in the code: the kind of each error and of its causes, its message, and its stack frames. `privateExceptionList`, in `packages/config/src/errors.ts`, keeps those fields and drops the rest, for the browser and the API alike. The message loses the parameters Drizzle writes after a failed query, every address beyond its host, emails, UUIDs, tokens and numbers precise enough to be a place. A frame's file loses its query.
- A browser report carries what `feature_viewed` carries: the opaque IDs, `environment`, `app_version`, and the screen's categories (`feature`, `tab`, `place_kind`). It has no URL, no referrer, no page title, no breadcrumbs (`$exception_steps`) and no console.
- The API reports a fault: what a procedure, the MCP server or a route failed with, the same faults it prints in its log. A refusal is not one. A fault is reported with no consent asked, because it names no one: its distinct ID is `api`, it makes no person profile, it carries `service=api`, `environment` and `app_version`, and no request, header, input, output, account or session. `privateFault`, in `apps/server/src/analytics.ts`, rebuilds every `$exception` the SDK makes, so a property added by a later version of it does not leave.
- Tests and CI send nothing, as decision 044 has it.

## Consequences

- The privacy policy says that error reports go to PostHog with the analytics, on consent in the browser, and that the API's faults go there with no consent and nothing of a person, on the instance's legitimate interest in running.
- A stack trace from the web app is minified until source maps are uploaded at the release's build, which needs a personal API key in the deploy's environment. Decision 044 keeps any personal key out of a release; uploading them is Téo's to decide.
- An error that happens before the SDK loads, or in a browser that refused, is not reported. An error in a message can lose what explained it: the message is scrubbed before it leaves, and the frames still say where it happened.
