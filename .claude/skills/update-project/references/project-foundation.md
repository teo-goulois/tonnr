<!--
Generated from apps/web/content/handbook/agents/project-context.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# Project context for agents

Create only context that will prevent rediscovery. Preserve and extend existing
files instead of replacing them.

## Always: `AGENTS.md`

Keep it short and repository-specific:

- product purpose, constraints, application and package boundaries;
- exact dev, format, lint, type-check, test, build, database, and deploy commands;
- selected conventions, safety rules, and links to deeper decisions;
- an instruction to read relevant decisions before structural work and record
  new durable decisions afterward.

Do not copy generic engineering advice.

## Always for a product

- `docs/product-vision.md` records the confirmed audience, problem, first scope,
  non-goals, facts, assumptions, and open questions.
- `docs/decisions/001-stack.md` records the initial stack, constraints, rejected
  alternatives, consequences, and user overrides.

## Decision memory

Record a new ADR only when a decision will matter to a future agent:

- product scope or an explicit non-goal;
- an application, package, API, or data boundary;
- a structural dependency or provider with meaningful lock-in;
- security, privacy, authorization, migration, or deployment strategy.

Do not record chat transcripts, temporary experiments, routine implementation
details, or choices obvious from the code.

Use numbered files in `docs/decisions/` with: status, context, decision,
consequences, and any superseded ADR. Maintain a short
`docs/decisions/README.md` index. Never silently rewrite history: mark an old
decision as superseded and link its replacement.

## Only when the project needs it

Create `docs/architecture.md` when several surfaces, runtimes, packages, or
external services make the data and request flow non-obvious.

The generator configuration is the source of truth for what was scaffolded.
Decision records explain why.
