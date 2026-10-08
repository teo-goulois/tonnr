# 003. API versioning

Status: accepted on 2026-10-08.

## Context

The API is public, and a mobile app will follow the web app. Released mobile builds keep calling the API for months, and outside developers build on it, so a response cannot change shape under them. Cloudflare caches the public responses.

## Decision

The version is in the path. The public API lives at `/v1`.

- A version is one router, `v1Router` in `packages/api/src/routers/index.ts`. The server mounts it at `/v1` with its own OpenAPI spec at `/v1/openapi.json` and reference at `/v1/docs`.
- The same router is nested under `v1` in `appRouter`, so the typed clients call `/rpc/v1/...` and follow the same rule.
- Once a version is released it only grows: new routes, new optional inputs, new output fields. Removing or renaming a field, changing a type or a unit, or tightening validation goes in a new version, built as a new router that reuses the unchanged procedures.
- Until the first public release, `v1` may change freely.
- Procedures outside a version, such as `healthCheck`, are not part of the public API.

## Rejected

- A version header or dated versions. Clients must send the header on every call, and the cache key then depends on it.
- No versioning with a promise to stay compatible. One mistake breaks every installed mobile build.

## Consequences

- A retired version needs a notice period. Announce it with `Deprecation` and `Sunset` response headers before removing its router.
- Each version has its own spec, so a client SDK is generated per version.
