<!--
Generated from apps/web/content/handbook/web/typescript.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# TypeScript

Let TypeScript preserve information instead of manually asserting what a value should be.

- Never use `any` by default. An exception must be isolated, explicitly justified, and safer alternatives such as `unknown` plus validation must have been considered first.
- Prefer inference from implementations and schemas. Prefer narrowing, validation, and `satisfies` over `as` casts; cast only at a boundary TypeScript cannot express correctly, and explain why.
- Use TypeScript 7 by default. Keep TypeScript 6 only when a required tool still depends on the older programmatic API or embedded-language support, and document that compatibility exception. See the [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
