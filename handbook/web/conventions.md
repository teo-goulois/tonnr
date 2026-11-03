<!--
Handbook e5f830e9c232, from https://teogoulois.com/code/web/conventions.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Web conventions

How I structure web apps: folders, UI, icons, shortcuts, translations, data, and state, with examples from my projects.

Apply only what is relevant. Existing project conventions and explicit user
choices win.

## Structure

```text
apps/web/src/
  routes/                thin: compose components and loaders
  components/
    <feature>/           product UI: accessories/accessory-list.tsx
    shared/              app-wide: shared-navbar.tsx, shared-user-menu.tsx
  utils/orpc.ts          oRPC client and TanStack Query utilities
packages/
  api/                   oRPC routers and procedures
  auth/                  Better Auth setup
  db/                    Drizzle schema and client
  ui/src/
    components/ui/       primitives: button.tsx, input.tsx, dialog.tsx
    components/form/     form adapters
    icon/                the only place that imports an icon provider
```

- Kebab-case file names.
- Create a package or layer (`api`, `db`, `auth`, a service) only when it marks
  a real boundary.

## Tooling

- Strict TypeScript, [pnpm](https://pnpm.io),
  [Oxlint](https://oxc.rs/docs/guide/usage/linter), and
  [Oxfmt](https://oxc.rs/docs/guide/usage/formatter).
- `check` never modifies files: lint, `oxfmt --check`, type-check, then the
  relevant tests.

## UI

- [Tailwind](https://tailwindcss.com/docs) with semantic CSS-variable tokens,
  mobile-first utilities, and `cn` for conditional classes.
- Install components from the teogoulois registry first, then own the copy.
  Fall back to [shadcn/ui](https://ui.shadcn.com) or another source only when
  the item is missing or incompatible. Show every component on the app's
  [design system](ui/design-system.md) page.
- A scaffold's components are not the project's: replace the ones a generator
  such as Better-T-Stack wrote with the registry's, in
  `packages/ui/src/components/ui/`, before styling anything.

  ```bash
  pnpm dlx shadcn@latest add https://teogoulois.com/r/<name>.json
  ```

- Icons are [Nucleo](https://nucleoapp.com), through one entry point. Only it
  imports an icon provider; routes, features, and registry components use its
  semantic exports. Custom and brand icons live behind it too. Take the
  registry's `icons` item instead of the icon library a scaffold installed.

  ```tsx
  // packages/ui/src/icon/index.ts
  export { ArrowRightOutlineIcon as ArrowRightIcon } from "./arrow-right-icon";

  // anywhere else
  import { ArrowRightIcon } from "@teogoulois/ui/icon";
  <ArrowRightIcon data-slot="icon" />;
  ```

## Interface skills

For interface work, use the matching `better-*` skill, and `animate` for
motion. They're installed once for every tool, never per project. See
[Skills](https://teogoulois.com/code/agents/skills). Don't load them for backend-only tasks.

## Theme, shortcuts, and commands

- Light and dark themes, a visible toggle, a persisted choice, and `D` as the
  default theme shortcut.
- Shortcuts use [TanStack Hotkeys](https://tanstack.com/hotkeys/latest), never
  raw global `keydown` listeners.
- A product app with several pages or primary actions gets a `Mod+K` command
  palette listing every page, primary destination, and primary action. A simple
  landing page doesn't need one.
- Every shortcut can be rebound by the user. One typed registry holds action
  IDs, labels, keywords, scopes, handlers, default shortcuts, persisted
  overrides, conflict detection, and displayed bindings, shared by the palette
  and direct hotkeys.
- Commands respect permissions, disabled states, required input, and
  confirmation steps. They never bypass the normal product flow.

```tsx
// This site's command palette
useHotkey("Mod+K", () => handleOpenChange(!open), { preventDefault: true });
useHotkey("D", toggleTheme, { preventDefault: true });
```

## Translations

Every app is translated from day one.

```tsx
// TanStack Start with Paraglide JS (coworio)
import { m } from "@/paraglide/messages";
toast.success(m.auth_forgot_password_success());

// Next.js with next-intl (localify)
const t = await getTranslations("Home");
```

Docs: [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs),
[next-intl](https://next-intl.dev).

## Forms

Follow [Forms](ui/forms.md): TanStack Form through one project-level
`useAppForm`, with business validation and server errors in the feature form.

## Data and state

- With [Convex](https://docs.convex.dev), Convex owns remote and reactive state.
- Otherwise, call oRPC procedures through
  [TanStack Query](https://tanstack.com/query/latest). See
  [API and agents](../stack/api.md).

  ```tsx
  // postflow
  const accessories = useQuery(orpc.accessory.list.queryOptions({ input: { workspaceSlug } }));
  ```

- After a mutation, invalidate the smallest relevant query scope.
- Put shareable state in typed
  [URL search params](https://tanstack.com/router/latest/docs/framework/react/guide/search-params),
  transient interaction state in the component, and use a global client store
  only as a last resort.
