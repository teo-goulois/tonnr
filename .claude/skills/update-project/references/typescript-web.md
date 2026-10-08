<!--
Generated from apps/web/content/handbook/web/conventions.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# Web conventions

Apply only what is relevant. Existing project conventions and explicit user choices win.

## Tooling and structure

- Use strict TypeScript, pnpm, Oxlint, and Oxfmt. Keep `check` non-mutating: lint, `oxfmt --check`, type-check, then relevant tests.
- Use kebab-case files and keep routes as thin composition.
- Put product UI in `components/<feature>/`, app-wide compositions in `components/shared/`, and reusable primitives in the shared UI package.
- Create `api`, `db`, `auth`, repository, or service layers only when they establish a real boundary.

```text
apps/web/src/components/
  auth/sign-in-form.tsx
  onboarding/onboarding-form.tsx
  shared/shared-navbar.tsx
  shared/shared-user-menu.tsx
  workspace/workspace-switcher.tsx

packages/ui/src/components/
  button.tsx
  input.tsx
```

## UI

- Use Tailwind with semantic CSS-variable tokens, mobile-first utilities, and `cn` for conditional classes.
- Check the Playground registry before shadcn or another source:

  ```bash
  pnpm dlx shadcn@latest add https://teogoulois.com/r/<name>.json
  ```

- Own copied components locally. Fall back only when the registry item is absent or incompatible.
- Route every icon through one shared icon entry point. Use `packages/ui/src/icon/index.ts` when the repository has a shared UI package; for a single application, keep the same boundary locally. Only that wrapper may import an icon provider. Routes, features, shared components, and copied registry components use its semantic exports. Keep custom and brand icons behind the same boundary and use `data-slot="icon"`.

## Interface skills

Install the complete [Jakub Krehel interface skill collection](https://github.com/jakubkrehel/skills) project-locally for web projects:

```bash
npx skills add jakubkrehel/skills --skill '*'
```

Use the matching skill automatically when the task concerns an interface:

- `better-ui` for visual polish and micro-interactions;
- `better-typography` for fonts, hierarchy, spacing, and wrapping;
- `better-colors` for palettes, contrast, gamut, and themes;
- `better-accessibility` for keyboard, focus, ARIA, forms, screen readers, hit areas, and motion;
- `better-layout` for grouping, alignment, reading order, disclosure, and responsive layout;
- `better-writing` for labels, errors, settings, empty states, and other interface copy.

Use `better-interface` only for an explicit holistic review. Do not load interface skills for backend-only tasks.

## Theme, shortcuts, and commands

- Use TanStack Hotkeys, not raw global `keydown` listeners.
- Every web project supports light and dark themes, exposes a visible toggle, persists the choice, and uses `D` as the default theme shortcut.
- For a product application with several pages or primary actions, `Mod+K` opens a command palette containing every user-facing page, primary navigation destination, and primary action. A simple landing page does not need a command palette.
- Keep action IDs, labels, keywords, scopes, handlers, default shortcuts, persisted overrides, conflict detection, and displayed bindings in one typed registry shared by the palette and direct hotkeys.
- Command actions remain contextual: they respect permissions, disabled states, required input, and confirmation steps instead of bypassing the normal product flow.

## Forms

- Follow the [Forms architecture](forms.md).
- Use TanStack Form through one project-level `useAppForm`; keep business validation and server errors in the feature form.

## Data and state

- With Convex, let Convex own remote and reactive state.
- Otherwise use oRPC for the application contract and TanStack Query for server state. Do not create a parallel product API with server functions or actions.
- Keep validation, authorization, and business logic in typed procedures; reserve raw handlers for auth callbacks, webhooks, files, and transport.
- Reuse oRPC query and mutation options, then invalidate the smallest relevant query scope.
- Put shareable state in typed URL search params, transient interaction state locally, and use a global client store only as a last resort.
