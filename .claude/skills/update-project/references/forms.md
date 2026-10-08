<!--
Generated from apps/web/content/handbook/web/ui/forms.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# Forms

Use TanStack Form through one project-level `useAppForm` and keep three explicit layers.

## Three layers

1. **Primitive** — visual states and accessibility without form-library knowledge.
2. **Adapter** — connects field state and owns labels, descriptions, field errors, and ARIA relationships.
3. **Feature** — owns the schema, business copy, submission, and server or business errors.

## Validation and feedback

- Validate with a Standard Schema at the form boundary.
- Prefer submit validation; add earlier validation only when it improves the task.
- On failure, focus the first invalid control and scroll only when needed.
- Keep feedback restrained and respect reduced motion.

## Reference implementation

- [Forms overview](/components/forms) explains the TanStack Form architecture and installation.
- [Form Input](/components/forms/input) covers the thin input adapter and invalid-state behavior.
- [Date Time Picker](/components/forms/date-time-picker) applies the same pattern to a richer control.
