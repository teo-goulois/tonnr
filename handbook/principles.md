<!--
Handbook e5f830e9c232, from https://teogoulois.com/code/principles.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Principles

The few principles behind every other page, kept short and extended only when a real problem calls for it.

## Product

Keep apps simple for everyone and deep for power users. The rarer an action,
the more steps it may take.

```scale
Primary action, done often → visible, one click or shortcut away
Secondary action, done sometimes → one click deeper, in a menu or sheet
Rare or advanced action → deeper still, in settings or an advanced panel
```

Every action stays accessible. Keyboard shortcuts and the command palette give
power users a direct path to all of them.

## Code

Code should preserve product intent and stay easy to understand, change, and
debug.

- **Smallest complete solution.** Add complexity only after a concrete need
  appears.
- **Simple, explicit flows.** Prefer them over clever abstractions.
- **Reuse before inventing.** A proven local pattern beats a new abstraction or
  dependency.
- **Agent-ready by default.** Anything a user can do in the UI, an agent can do
  through MCP. See [API and agents](stack/api.md).
- **Document what prevents rediscovery.** Nothing more.
- **Judge real behavior.** A green build is not proof. Match verification to
  the risk of the change.

```scale
Small, low-risk change → focused static checks
User-facing behavior → run it and use it
Launch, auth, payments, data → verify on the deployed URL
```
