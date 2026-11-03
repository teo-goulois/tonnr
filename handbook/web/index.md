<!--
Handbook 0aa73bf22aec, from https://teogoulois.com/code/web.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Web

TanStack Start by default, Next.js when the product is server-first, and the conventions I apply to every web surface.

```choose
Client-heavy app, rich interaction → TanStack Start
Server-first: SEO, content, commerce, Server Components → Next.js
```

Docs: [TanStack Start](https://tanstack.com/start/latest),
[Next.js](https://nextjs.org/docs).

- Translate from day one:
  [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) with
  TanStack Start, [next-intl](https://next-intl.dev) with Next.js.
- Keep routes, server state, form state, UI primitives, and domain logic
  separate.
- Loading, empty, error, disabled, focus, keyboard, reduced motion, and mobile
  behavior are part of the feature.
- Prefer concrete local patterns over framework ceremony.
