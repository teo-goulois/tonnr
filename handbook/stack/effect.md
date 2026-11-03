<!--
Handbook 0aa73bf22aec, from https://teogoulois.com/code/stack/effect.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Effect v4

Effect v4 for all backend logic, and how coding agents get the real Effect source to learn from.

Use [Effect](https://effect.website/docs) v4 for backend logic: domain services, typed errors, integrations,
configuration, resources, jobs, workflows, concurrency, retries, and
observability.

- Keep React, rendering, and form state idiomatic to their libraries. Don't
  wrap trivial pure functions in Effect.
- Keep handlers thin. Compose the program in the application layer and run it
  once at the boundary: oRPC procedure, worker, CLI.
- Use the latest 4.x release. Version 4 is stable, with long-term support until
  September 2029. See the
  [4.0 announcement](https://effect.website/blog/releases/effect/40).
- Move a v3 project to v4 with the official
  [migration guide](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md).
  It's written so a coding agent can do most of the work.
- Deviate only for a concrete compatibility or complexity reason, and record
  it.

## Give agents the real source

When Effect is structural and agents work with it often, vendor the matching
source with a squashed Git subtree:

```text
repos/effect/   read-only reference: source, tests, LLMS.md
apps/, packages/   import from the installed "effect" package
```

- Agents may read `repos/effect/`, never edit or import from it. Write this
  boundary in `AGENTS.md`.
- Add a note under `agent-patterns/` only when the same Effect pattern had to
  be rediscovered several times.
- Worth it only when better context outweighs the repository size and update
  work. Source:
  [Effect's Git subtree pattern for coding agents](https://www.effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).
