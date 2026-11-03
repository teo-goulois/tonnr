<!--
Handbook e5f830e9c232, from https://teogoulois.com/code/stack.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Stack

The defaults every project starts from, on any platform: monorepo, API, backend logic, data, auth, and hosting.

Decide from the product outward. Scaffold TypeScript projects with
[Better-T-Stack](https://better-t-stack.dev) and check every option against its
current schema.

```layers
Surfaces: Web, mobile, desktop, and agents through MCP
API: oRPC, with OpenAPI and MCP from the same procedures
Logic: Effect v4
Data: Drizzle on Turso, Neon, or MySQL; Convex when realtime is central
Auth: Better Auth
Tooling: Turborepo monorepo, pnpm, Oxlint, Oxfmt
Hosting: Cloudflare when the runtime fits
```

## Platforms

- **Web:** [TanStack Start](https://tanstack.com/start/latest). See [Web](https://teogoulois.com/code/web).
- **Mobile:** [React Native](https://reactnative.dev). See [Mobile](https://teogoulois.com/code/mobile).
- **Desktop:** [Electron](https://www.electronjs.org/docs/latest). See [Desktop](https://teogoulois.com/code/desktop).

## API and logic

- Every user action is one [oRPC](https://orpc.dev/docs/getting-started) procedure, served to the app, OpenAPI, and MCP.
  See [API and agents](api.md).
- On the app side, always call procedures through
  [TanStack Query](https://tanstack.com/query/latest), with
  [oRPC's query utilities](https://orpc.dev/docs/integrations/tanstack-query).
- Backend logic runs on [Effect](https://effect.website/docs) v4. See [Effect v4](effect.md).
- Host oRPC in the framework's server runtime. Use [Hono](https://hono.dev) for light standalone
  services, such as a separate API or a Worker.
- Keep heavier services possible. Add one, such as [Temporal](https://docs.temporal.io) for durable
  workflows, when a real need appears.

## Data

Use [Drizzle](https://orm.drizzle.team/docs/overview) for every SQL database. Pick the database from the project:

```choose
Small web app, light data needs → SQLite on Turso
Larger product → Postgres on Neon
Professional project → MySQL
Realtime at the core → Convex
```

Docs: [Turso](https://docs.turso.tech), [Neon](https://neon.com/docs),
[MySQL](https://dev.mysql.com/doc/), [Convex](https://docs.convex.dev).

Convex owns its API and data model. Don't add oRPC, Drizzle, or SQL next to it
just to keep the defaults.

## Every app ships with

- Translations from day one. The library depends on the platform: see
  [Web](https://teogoulois.com/code/web).
- Light and dark themes, and keyboard shortcuts the user can rebind. See
  [Web conventions](https://teogoulois.com/code/web/conventions).
- A dev-only design system page. See
  [Design system](https://teogoulois.com/code/web/ui/design-system).
- Usage analytics: daily users and every feature. See
  [Analytics](analytics.md).
- A user changelog, fed by a note per change. See
  [Changelog](changelog.md).
- Agent access through MCP. See [API and agents](api.md).

## Everything else

- Every project is a [Turborepo](https://turborepo.com/docs) monorepo, even
  with a single app, managed with [pnpm](https://pnpm.io).
- [Oxlint](https://oxc.rs/docs/guide/usage/linter) and
  [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) for TypeScript.
- [Better Auth](https://better-auth.com/docs) for authentication. Decide at the
  start whether [organizations](https://better-auth.com/docs/plugins/organization)
  and roles will be used; if they will, set them up from day one instead of
  retrofitting them.
- [Cloudflare](https://developers.cloudflare.com/workers/) for hosting when runtime compatibility allows it.
