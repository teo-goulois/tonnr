<!--
Generated from apps/web/content/handbook/web/launch-checklist.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# Launch checklist

Use this checklist immediately before publishing a public landing page. Apply
only relevant items, mark excluded items `N/A` with one reason, and report every
remaining blocker. Never mark an item complete from code alone when it can be
verified on the deployed URL.

## Product and content

- [ ] A first-time visitor can understand the product, target user, and main
      benefit from the first screen.
- [ ] There is one obvious primary action; every CTA has accurate copy and a real
      destination.
- [ ] Claims, prices, availability, screenshots, testimonials, and store badges
      are truthful and current.
- [ ] There is no placeholder content, dead link, empty state, or unfinished
      navigation.
- [ ] Copy, spelling, dates, and locale are correct on mobile and desktop.

## Brand and sharing

- [ ] The production domain, HTTPS, and the chosen `www` or apex redirect work.
- [ ] The site has a recognizable logo and a square favicon linked from the
      document head. Include an Apple touch icon when relevant.
- [ ] A public, absolute, production Open Graph image exists. Prefer `1200x630`
      unless the product requires another social format.
- [ ] `og:title`, `og:description`, `og:type`, `og:url`, `og:image`, and
      `og:image:alt` describe the actual page; add the matching large-image card
      metadata where supported.
- [ ] Paste the production URL into at least one real social or messaging preview
      and verify its image, title, description, and cached result.

## Search and indexation

- [ ] Every public page has a concise, descriptive, unique `<title>` and meta
      description.
- [ ] The page has a clear main heading, logical heading hierarchy, useful
      visible text, and descriptive internal links.
- [ ] Essential content and metadata are present in the rendered HTML available
      to an anonymous crawler, not only after a client-side interaction.
- [ ] The canonical URL is absolute, public, self-consistent, and uses the final
      host and locale.
- [ ] Production pages intended for search return `200`, allow indexing, and are
      not accidentally blocked by `noindex`, authentication, or `robots.txt`.
- [ ] Alternate hosts and obsolete URLs redirect permanently without loops;
      unknown URLs return a real `404`.
- [ ] `robots.txt` is reachable and a sitemap lists only canonical, indexable,
      absolute URLs. Add `hreflang` only when localized equivalents exist.
- [ ] Structured data is added only when it represents visible content and passes
      the relevant validator.

## Trust, support, and legal

- [ ] A visible support or contact route exists and its complete receive/reply
      flow has been tested. For the free Cloudflare and Gmail setup, follow
      [Support email](support-email.md).
- [ ] The footer exposes the applicable support, legal, privacy, and terms links;
      none points to a placeholder.
- [ ] For a professional site in France, accessible legal notices identify the
      publisher, company, contact details, and hosting provider as applicable.
- [ ] If any personal data is collected, the privacy information accurately
      names the purposes, legal basis, recipients/processors, retention, user rights,
      contact route, and transfers. The collection point also gives concise notice.
- [ ] Non-essential cookies or trackers do not run before the required consent.
      In France/UE, refusal must be as straightforward as acceptance. Do not add a
      banner when every tracker is demonstrably exempt.
- [ ] Terms are present when the service needs usage rules; applicable sales
      terms, consumer information, and cancellation flow exist before selling or
      accepting subscriptions. Obtain legal review when the situation is unclear.

## Forms and data

- [ ] Each field has a label, correct type and autocomplete, clear required state,
      accessible error, loading state, and success confirmation.
- [ ] Submission works once and only once on the production environment; the
      message or signup reaches its real destination.
- [ ] Inputs are validated server-side and protected against spam and abusive
      repetition without blocking normal use.
- [ ] Only necessary data is requested. Newsletter or marketing consent is
      separate, explicit, and never preselected.
- [ ] Failure paths preserve the user's input and explain how to recover.

## Accessibility and interaction

- [ ] The page is usable with keyboard only: order is logical, focus is visible,
      overlays can be closed, and no interaction traps focus unexpectedly.
- [ ] Images have useful alternative text or an empty `alt` when decorative;
      icons and controls have accessible names.
- [ ] Text and controls have sufficient contrast and remain usable at 200% zoom,
      narrow mobile widths, light mode, and dark mode when offered.
- [ ] The document language is correct, landmarks and headings are semantic, and
      forms announce validation and success.
- [ ] Motion respects reduced-motion preferences; video has the necessary
      captions, transcript, controls, and non-autoplay fallback.

## Analytics

- [ ] The questions to answer and the provider choice are explicit. Use Umami for
      simple website traffic and CTA measurement; use PostHog for product funnels,
      journeys, activation, retention, or replay. Follow
      [Analytics](analytics.md).
- [ ] Automatic pageviews and the primary intent/conversion events use a stable,
      documented taxonomy and fire exactly once. Successful signups, purchases, or
      other durable outcomes are confirmed server-side when possible.
- [ ] Production, preview, development, internal, and test traffic can be
      distinguished. Analytics failures never block the user's action.
- [ ] Event properties, URLs, identity, consent, and optional session replay have
      been reviewed for personal or sensitive data.
- [ ] A controlled production visit and primary CTA appear in the intended
      provider, project, environment, and funnel with the expected properties.

## Quality, performance, and security

- [ ] The production build, formatting, lint, type checks, and smallest relevant
      tests pass without hiding failures.
- [ ] There are no unexpected console errors, failed requests, mixed content,
      hydration errors, broken assets, or visible layout shifts.
- [ ] Mobile images are responsive and sized; the hero/LCP asset is discoverable
      early and is not lazy-loaded. Non-critical media and scripts are deferred.
- [ ] Core Web Vitals and a representative mobile performance trace show no
      launch-blocking regression. Do not optimize for a cosmetic Lighthouse 100.
- [ ] No secret or private endpoint is shipped to the browser. Production
      environment variables, security headers, form rate limits, and third-party
      origins are intentional.
- [ ] Error tracking runs only where intended, respects consent, and avoids
      personal data.

## Final production proof

- [ ] Test the deployed canonical URL in a clean browser on a real mobile-sized
      viewport and desktop, including navigation, CTA, form, theme, and refresh.
- [ ] Inspect the actual response head, status, redirects, `robots.txt`, sitemap,
      favicon, Open Graph image, and legal/support pages from outside local dev.
- [ ] Verify analytics or server logs receive one controlled test without leaking
      sensitive data.
- [ ] Record unresolved non-blockers with an owner. Do not publish while a failed
      primary CTA, support path, legal requirement, data submission, or accidental
      `noindex` remains.

## After publication

- [ ] Submit the canonical site and sitemap to the relevant webmaster tool and
      inspect the live URL once crawling is available.
- [ ] Recheck uptime, forms, primary CTA, analytics, indexation, and social preview
      after caches and DNS have settled.

## Current official references

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google crawling, canonical, robots, and sitemap guidance](https://developers.google.com/search/docs/fundamentals/get-started)
- [Google favicon requirements](https://developers.google.com/search/docs/appearance/favicon-in-search)
- [Open Graph protocol](https://ogp.me/)
- [W3C accessibility easy checks](https://www.w3.org/WAI/test-evaluate/easy-checks/)
- [Web.dev Core Web Vitals](https://web.dev/articles/vitals)
- [CNIL guidance for personal-data collection](https://www.cnil.fr/fr/passer-laction/rgpd-les-premieres-etapes)
- [French mandatory website notices](https://entreprendre.service-public.gouv.fr/vosdroits/F37351)

Recheck legal and provider-specific requirements for the project's country,
business model, audience, and current date.
