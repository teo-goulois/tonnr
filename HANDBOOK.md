# HANDBOOK — how Téo builds

Revision `e5f830e9c232` of Téo Goulois's handbook (https://teogoulois.com/code). The
pages in `handbook/` are a snapshot of it: they change only when the project
updates the handbook, and every update replaces them.

## Start here

Keep `HANDBOOK.md` and `handbook/` at the project root, committed. Add this
pointer to the project's agent instructions (`AGENTS.md`), keeping what is
there:

> Before choosing a stack, a library, a structure, or a convention, read
> `HANDBOOK.md`.

Leave both out of the project's formatter and linters, as their content must
stay the revision's.

Inspect the project before changing it to match the handbook. Honor a scope
the user already gave; otherwise ask once: **“How would you like to apply the
handbook?”**

- **Align the whole project:** bring every part in line with the pages that
  apply, with `handbook-convert`.
- **Align selected areas:** agree on the apps, packages, or topics first, and
  keep shared changes from reaching the rest.
- **Keep the project as it is:** install the reference and the pointer for
  future work, then stop.

Wait for the answer before changing code. A request about one area does not
authorize the whole project.

## Which source wins

1. What the user explicitly asks.
2. The project's own conventions and decisions: `AGENTS.md`, `docs/decisions/`.
3. These pages.
4. General best practice.

The pages are defaults, not limits: when a better option exists, propose it
with its trade-off.

## Exceptions

A project that departs from a page on purpose records it as a decision in
`docs/decisions/` (see [Project context](handbook/agents/project-context.md)),
with the page and the reason. That record wins over the page: an audit reports
it as intentional, not as drift. Never edit `HANDBOOK.md` or `handbook/` to
record one: the next update replaces them.

## Skills

- `handbook-build`: start a project, or add an app, a package, or a feature,
  with the handbook's defaults.
- `handbook-convert`: bring existing code in line with the handbook, within
  the agreed scope.
- `handbook-audit`: report where the project drifts from this revision, and
  what an update would change.

An agent without them installs them once, for every project:

```sh
npx skills add teo-goulois/skills --skill handbook-build handbook-convert handbook-audit --global
```

## Interface

When `GUI.md` exists, the look comes from it and its `graphical-ui`,
`graphical-convert`, and `graphical-audit` skills. The handbook still decides
the structure: one UI package, its design-system page, and the form
architecture. Without `GUI.md`, follow
[Design system](handbook/web/ui/design-system.md).

## Pages

The pages of a platform are there once its item is installed.

### Every project

- [Principles](handbook/principles.md): The few principles behind every other page, kept short and extended only when a real problem calls for it.
- [Stack](handbook/stack/index.md): The defaults every project starts from, on any platform: monorepo, API, backend logic, data, auth, and hosting.
- [API and agents](handbook/stack/api.md): Every user action is one oRPC procedure, exposed to the app, to OpenAPI, and to agents through MCP.
- [Effect v4](handbook/stack/effect.md): Effect v4 for all backend logic, and how coding agents get the real Effect source to learn from.
- [TypeScript](handbook/stack/typescript.md): Language rules for every TypeScript project: no any, inference over casts, TypeScript 7 when compatible.
- [Changelog](handbook/stack/changelog.md): Every user-visible change ships with a short note, and each release turns the notes into a changelog people enjoy reading.
- [Analytics](handbook/stack/analytics.md): Every app measures how many people use it each day and which features, accurately enough to make decisions from.
- [Secrets and environment files](handbook/workstation/secrets.md): How I keep secrets out of Git and off disk with a self-hosted Infisical, across machines and monorepos.
- [Project context for agents](handbook/agents/project-context.md): How I preserve the small amount of project context and durable decisions future agents actually need.

### Web, with `handbook-web`

- Web, `handbook/web/index.md`: TanStack Start by default, Next.js when the product is server-first, and the conventions I apply to every web surface.
- Web conventions, `handbook/web/conventions.md`: How I structure web apps: folders, UI, icons, shortcuts, translations, data, and state, with examples from my projects.
- Design system, `handbook/web/ui/design-system.md`: Every app has a dev-only page showing all its components, and every screen is built from them.
- Forms, `handbook/web/ui/forms.md`: The product and engineering principles behind my form primitives, adapters, validation, and feedback patterns.
- Support email, `handbook/web/support-email.md`: A simple low-volume support inbox using Cloudflare Email Routing and Gmail, with its limits made explicit.
- Launch checklist, `handbook/web/launch-checklist.md`: The production checks I use before publishing a public landing page.

### Mobile, with `handbook-mobile`

- Mobile, `handbook/mobile.md`: React Native by default, native code when a platform API makes it clearly simpler.

### Desktop, with `handbook-desktop`

- Desktop, `handbook/desktop.md`: Electron by default, reusing the web stack; Swift or Rust when performance or the platform demands it.

## Update

Install the latest revision of the same items, replacing the snapshot:

```sh
npx shadcn@latest add https://teogoulois.com/r/handbook.json https://teogoulois.com/r/handbook-web.json --overwrite
```

Keep only the platform items the project has. Then read the diff of
`handbook/`, and run `handbook-audit` on what changed.
