<!--
Handbook e5f830e9c232, from https://teogoulois.com/code/web/ui/design-system.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Design system

Every app has a dev-only page showing all its components, and every screen is built from them.

Each app keeps one set of components, visible in one place. A change made there
shows up everywhere, and nobody rebuilds a component that already exists.

```flow
Components from the teogoulois registry
Owned in the app's UI package
Shown on a dev-only design system page
Used by every screen
```

- **Start from the registry.** Install from the [teogoulois registry](https://teogoulois.com/toolkit)
  before [shadcn/ui](https://ui.shadcn.com) or another source, and own the copy. See
  [Web conventions](../conventions.md).
- **One dev-only page per app.** It renders every component with its variants
  and states: loading, empty, error, disabled, light, and dark. It never ships
  to production.
- **Screens use the design system.** Before writing UI, agents check it and
  reuse or extend a component instead of creating a near-duplicate.
- **New component, same change.** A new reusable component lands in the UI
  package and on the design system page together.
