---
name: update-project
description: Audits and incrementally realigns an existing codebase with its product decisions, repository rules, and applicable project conventions. Use to verify drift, update an older scaffold, or improve structure without regenerating the project.
---

# Update Project

Verify an existing project first, then update only the proven drift the user has
authorized.

## Modes

- **Verify** is the default. Inspect, run read-only checks, and report; do not
  edit files, install packages, migrate data, or change external state.
- **Update** applies the smallest coherent set of fixes. Enter it only when the
  user explicitly asks to update, align, migrate, refactor, or fix the project.
- If the request is ambiguous, remain in Verify and offer the ordered update
  plan.

## Convention sources

Use sources in this order:

1. explicit instructions in the current request;
2. the nearest `AGENTS.md` and repository documentation;
3. accepted architecture and decision records;
4. established code and test conventions;
5. this skill's bundled handbook snapshots under `references/`.

The snapshots are generated from the canonical handbook published under
`https://teogoulois.com/code/`, but are intentionally bundled so Verify and
Update work without network access. For a TypeScript project, load
`references/stack-policy.md` and `references/typescript.md`; for a web surface,
also load `references/typescript-web.md`. Load `references/forms.md` when forms
are in scope. Load `references/check.md`, `references/analytics.md`,
`references/support-email.md`, or `references/project-foundation.md` only when
those surfaces are in scope. Never edit a generated snapshot directly.

Do not treat every difference as a defect. Product constraints and deliberate,
documented decisions override general preferences.

## Rules

- Never rerun a scaffold generator over an existing repository.
- Preserve user changes and inspect Git state before editing.
- Do not combine an architectural migration with unrelated cleanup or broad
  formatting.
- Prefer an existing shared abstraction over a new parallel one, but do not turn
  `shared` into a dumping ground.
- Do not replace a working dependency or stack merely because another option is
  preferred today. Require a concrete benefit and migration path.
- Prove behavior at the relevant boundary. A file existing is not proof that its
  runtime path works.
- Keep temporary audit observations in the report. Update `AGENTS.md` or an ADR
  only for durable commands, boundaries, or decisions future agents need.

## Workflow

1. **Scope** — identify the project root, requested surface, mode, and desired
   outcome. Do not broaden a focused request into a repository-wide rewrite.
2. **Discover** — read instructions, manifests, workspace configuration,
   architecture/decision docs, generated-stack config, commands, and relevant
   source. Inspect Git status before proposing moves or rewrites.
3. **Baseline** — state the actual product, stack, package boundaries, data flow,
   and applicable conventions. Separate facts, documented decisions, inferred
   intent, and preferences.
4. **Trace** — follow representative runtime paths instead of judging names
   alone: route to component, component to data client, transport to server
   procedure, procedure to persistence or external service.
5. **Compare** — inspect only applicable areas:
   - component placement and shared boundaries;
   - routes, forms, server state, API transport, and cache ownership;
   - auth, validation, authorization, errors, jobs, and integrations;
   - tooling, commands, tests, environment, and deployment;
   - project context, launch readiness, support, and analytics when in scope.
6. **Verify** — run the repository's non-mutating format, lint, type, test, and
   build checks in proportion to the scope. Distinguish pre-existing failures
   from findings caused by the inspected area.
7. **Report or plan** — classify each finding as blocking, important, optional,
   or justified deviation. Include evidence, impact, smallest fix, affected
   files, and verification for each actionable item.
8. **Update** — in Update mode, apply fixes in dependency order and coherent
   batches. Preserve behavior while moving structure, update imports atomically,
   and keep old and new data transports from coexisting longer than necessary.
9. **Re-verify** — run focused checks first, then the smallest meaningful wider
   check. Inspect the final diff for unrelated churn.
10. **Hand off** — report what changed, intentional deviations, validation,
    unresolved risks, and the next highest-value step.

## TypeScript web alignment

When the applicable `create-project` references select oRPC and TanStack Query:

- migrate product reads and writes from framework server functions/actions into
  typed oRPC procedures;
- reuse oRPC `queryOptions` and `mutationOptions` in route loaders and components;
- keep TanStack Query responsible for server state, cache, and invalidation;
- retain framework handlers only for transport and protocol boundaries;
- migrate one complete vertical slice at a time, then remove the replaced path.

For component structure:

- keep route files as thin composition;
- place product UI under `components/<feature>/`;
- place app-wide compositions under `components/shared/`, such as
  `components/shared/shared-navbar.tsx`;
- keep cross-application primitives in the UI package.

For UI dependencies:

- treat `https://teogoulois.com/r/<name>.json` as the primary component registry
  when the applicable web conventions select it; flag equivalent components
  copied directly from shadcn or another registry when the Playground item was
  available;
- route all product icon imports through the project's shared icon wrapper;
  replace direct provider imports one coherent surface at a time and preserve
  custom or brand icons behind that boundary.

## Output contract

In Verify mode, return:

1. the baseline and checks run;
2. findings ordered by impact, each with file evidence;
3. justified deviations and unknowns;
4. a minimal update plan, without making changes.

In Update mode, return:

1. the aligned areas and preserved behavior;
2. files and durable decisions changed;
3. validation results and pre-existing failures;
4. remaining drift and the next recommended batch.
