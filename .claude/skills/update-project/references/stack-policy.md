<!--
Generated from apps/web/content/handbook/stacks/typescript.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# TypeScript stack

These are preferences, not requirements. Decide from the product outward:
surfaces, frontend, backend, data, cross-cutting needs, then deployment.

## Preferred choices

- **Web:** TanStack Start by default. Use Next.js for a concrete ecosystem,
  React Server Components, content, commerce, or organizational requirement.
- **Native:** use the current Better-T-Stack Expo option. Share domain code, not
  every UI component.
- **Backend:** for one web product, host oRPC in the framework-native server
  runtime. Use Hono for an independent API, multiple clients, or a Cloudflare
  Worker.
- **Reactive backend:** use Convex when realtime synchronization is central and
  its platform dependency is acceptable.
- **API:** oRPC with framework-native or Hono backends. Without Convex, do not
  create framework server functions or actions as a parallel application API.
- **SQL:** Drizzle with Neon for conventional SaaS/PostgreSQL needs, Turso for a
  lighter SQLite or edge-oriented product, and PlanetScale only for a specific
  operational or compatibility advantage.
- **Auth:** Better Auth when supported. Add organizations and roles only when the
  product needs them.
- **Tooling:** pnpm, Oxlint, Oxfmt, Turborepo, and Cloudflare when runtime
  compatibility permits.

Convex owns its API and data model. Do not combine it with oRPC, Drizzle, or an
external SQL database merely to preserve the defaults.

## Effect v4 for application logic

- Prefer Effect v4 for meaningful TypeScript logic outside the frontend:
  domain services, typed errors, integrations, configuration, resources, jobs,
  workflows, concurrency, retries, and observability.
- Keep React components, rendering, form state, and other UI concerns idiomatic
  to their frontend libraries. Do not wrap trivial pure transformations in
  Effect merely for consistency.
- Keep framework handlers thin: compose the Effect program in the application
  layer and run it once at the HTTP, worker, CLI, or framework boundary.
- Pin an exact v4 version and verify its current APIs and runtime compatibility.
  While v4 is prerelease, record the upgrade risk in the stack ADR.
- Override this preference only for a concrete compatibility or complexity
  reason, and record that deviation.

### Give coding agents the real source

When Effect is a structural dependency and coding agents will work with it regularly, vendor the matching Effect v4 source under `repos/effect/` with a squashed Git subtree. Keep it as read-only reference material: agents may inspect its implementation, tests, patterns, and `LLMS.md`, but application code must continue importing from the installed package and agents must not edit or import from `repos/effect/`.

Add these boundaries to `AGENTS.md` and create a small file under `agent-patterns/` only when the same Effect pattern has had to be rediscovered repeatedly. This follows Effect’s [Git subtree pattern for coding agents](https://www.effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive). Use it only when the improved local context justifies the additional repository size and update responsibility.

## Default profiles

- **Lean web:** TanStack Start, native backend, oRPC, Drizzle, Turso.
- **SaaS:** TanStack Start, native backend or justified Hono, oRPC, Drizzle,
  Neon.
- **Web and native:** TanStack Start, Expo, Hono, oRPC, Drizzle, Neon or Turso.
- **Realtime collaboration:** TanStack Start or justified Next.js, Convex.

Add Better Auth, pnpm, Oxlint/Oxfmt, Turborepo, and Cloudflare to these profiles
when compatible. Confirm every identifier and combination against the current
Better-T-Stack schema before scaffolding.
