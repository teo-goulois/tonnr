<!--
Handbook 0aa73bf22aec, from https://teogoulois.com/code/stack/typescript.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# TypeScript

Language rules for every TypeScript project: no any, inference over casts, TypeScript 7 when compatible.

Let [TypeScript](https://www.typescriptlang.org/docs/) preserve information instead of asserting it.

- **No `any`.** An exception is isolated, justified, and comes only after
  `unknown` plus validation was considered.
- **Infer, then narrow.** Infer from implementations and schemas. Prefer
  narrowing, validation, and `satisfies` over `as`; cast only at a boundary
  TypeScript can't express, and say why.
- **TypeScript 7 by default.** Keep TypeScript 6 only when a required tool still
  needs the older API, and document that exception. See the
  [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
