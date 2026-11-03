<!--
Handbook e5f830e9c232, from https://teogoulois.com/code/stack/api.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# API and agents

Every user action is one oRPC procedure, exposed to the app, to OpenAPI, and to agents through MCP.

I believe people will increasingly use apps through an assistant instead of
their interface. So every app is agent-ready: anything a user can do in the UI,
an agent can do through MCP, under the same rules.

```flow
A user action
One oRPC procedure: schema, auth, errors, logic
Served to the app, to OpenAPI, and as an MCP tool
```

## Rules

- **One [oRPC](https://orpc.dev/docs/getting-started) procedure per user action.** Validation, authorization, and business
  logic live in the procedure, never in a transport.
- **One router, three transports:** RPC for the app, `OpenAPIHandler` with a
  generated spec, and MCP tools.
- **The app always goes through [TanStack Query](https://tanstack.com/query/latest).**
  Reuse [oRPC's](https://orpc.dev/docs/integrations/tanstack-query) `queryOptions`
  and `mutationOptions` in loaders and components; never call the client
  directly from a component.
- **Declare [MCP](https://modelcontextprotocol.io) exposure on the procedure.** Put the tool name, a description
  written for a model, and annotations (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`) in its metadata, with its
  [analytics](analytics.md) event name.
- **MCP tools call the procedure**, through a server-side oRPC client with the
  caller's session. No parallel logic, no skipped permission check.
- **Agents act as the user.** Authenticate MCP clients with OAuth through
  [Better Auth's MCP plugin](https://better-auth.com/docs/plugins/mcp), so an agent never gets more access than its user.
- **Confirm what the UI confirms.** Destructive or costly actions keep their
  confirmation step.
- Framework server functions and actions are not a second product API. Keep raw
  handlers for auth callbacks, webhooks, files, and transport.

## Current state

oRPC has no official MCP adapter yet. The bridge is a small module that
registers every exposed procedure with the official MCP TypeScript SDK. Recheck
both projects before building it.

- [oRPC OpenAPI handler](https://orpc.dev/docs/openapi/handler)
- [oRPC AI SDK integration](https://orpc.dev/docs/integrations/ai-sdk), the same
  idea for AI SDK tools
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Better Auth MCP plugin](https://better-auth.com/docs/plugins/mcp)
