<!--
Handbook 0aa73bf22aec, from https://teogoulois.com/code/stack/analytics.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Analytics

Every app measures how many people use it each day and which features, accurately enough to make decisions from.

Every app I ship measures real usage from day one: how many people use it each
day, which features they use, and whether they come back. I make product
decisions from that data, so it has to be accurate.

```choose
Product app: web, desktop, or mobile → PostHog
Simple public site or landing page → Umami
```

Docs: [PostHog](https://posthog.com/docs/libraries/js),
[Umami](https://docs.umami.is/docs/tracker-configuration).

## What every app tracks

- **Daily use.** Send `app_active` once per user or device per day, on the
  first use of the day. A desktop app can stay open for weeks, so a launch
  event alone undercounts.
- **Every feature.** Each user action is an
  [oRPC procedure](api.md): declare its event name in the procedure
  metadata, next to the MCP metadata, and let one
  [middleware](https://orpc.dev/docs/middleware) capture it on success. Name
  events `object_verb` in the past tense: `invoice_sent`.
- **Where it came from.** Every event carries `surface` (`web`, `desktop`,
  `mobile`, `mcp`), `environment`, and `app_version`.
- **Activation.** Define the one event that means a user got the core value,
  and track [retention](https://posthog.com/docs/product-analytics/retention)
  from it.

## Accuracy

- **Capture on the server.** Ad blockers drop browser events. Product actions
  are captured server-side with
  [posthog-node](https://posthog.com/docs/libraries/node). Browser events go
  through a [reverse proxy](https://posthog.com/docs/advanced/proxy) on the
  app's domain.
- **One person, one ID.** [Identify](https://posthog.com/docs/product-analytics/identify)
  signed-in users with their auth ID, never an email, and call `reset()` on
  logout. Apps without accounts use a stable anonymous device ID.
- **Clean data.** Development and production are separated, by project or by
  `environment`. Tests and CI send nothing.
- **Release builds have the token.** CI exports the PostHog token before the
  production build. A missing token means silent zero data.
- **Proof.** After shipping, one controlled action shows up once, in the right
  project, with the expected properties.

## Privacy

- Never send content, names, emails, tokens, or free text.
- Desktop and mobile apps have an opt-out setting. Web apps ask for consent
  where the law requires it.
- On desktop, only the main process talks to PostHog. The renderer sends events
  over a typed IPC channel, and the main process validates them against the
  event registry.

Reference implementation: Tippo's telemetry (main-process capture, typed event
registry, redaction, dev/prod split, opt-out).

## Simple sites with Umami

Load the script in production only. Use `data-umami-event` on links and
buttons, and a small typed `trackEvent()` wrapper for dynamic cases, as on this
site.

Always set `data-domains` to the production hosts, with and without `www.`:

```html
<script
  defer
  src="https://analytics.teogoulois.com/script.js"
  data-website-id="…"
  data-domains="example.com,www.example.com"
></script>
```

Without it, the script counts every page that loads it: preview deployments
(`*.workers.dev`, `*.vercel.app`), localhost, and copies of the page on other
sites. A self-hostable app reads the list from its config, next to the website
ID, instead of writing it in the code.

Umami already drops known bots. A bot that passes for a browser still counts.

## Project memory

Keep `docs/analytics.md` up to date: provider and project, the activation
event, the event list, filters for internal traffic, and the last verification
date.
