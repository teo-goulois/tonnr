# 065. Read the private research catalogue from the admin

Status: accepted on 2026-10-18, when Téo asked to see the private database's records,
sources and history in the admin. The research and this implementation stay private
until he decides otherwise.

## Decision

The admin's Catalogue has a **Private sources** tab. It reads a separate PostgreSQL
catalogue through the API, using the optional server setting `CATALOGUE_DATABASE_URL`.
That setting never reaches either app's build or browser. `DATABASE_URL` continues
to name the application database; the application migrations never run on the
research catalogue.

Every private catalogue procedure takes `adminProcedure`: an operator's session
and the admin's origin, as decision 020 requires. The procedures are available to
the admin's typed RPC client, with no OpenAPI route or MCP tool. Responses carry
the API's existing `private, no-store` policy. Database failures become constant
errors without driver diagnostics, queries, source content or connection details.

The separate connection has bounded pooling, read-only transactions and statement
timeouts. The interface reads provider counts, a paginated searchable inventory,
each source identity, its snapshot occurrences, extracted assertions and the
original JSON of a chosen snapshot. It renders source content as text and never
fetches a source page or remote media. A reader-only database role should be used
for the server credential.

An identity belongs to a provider: it is not a deduplicated physical surf break.
A repeated export occurrence is not independent corroboration. Observation time
and import time remain distinct, and resource URLs inventoried without their
details remain distinct from collected source records. Missing countries or
coordinates stay missing.

The view writes no research decision and performs no merge, import into the public
catalogue, publication or rights grant. All originals, revisions and provenance
remain in the private database. In particular, a source's accessible page does not
become a redistribution permission through this view.

## Consequences

An instance without the optional setting can still run the admin and sees that
private sources are not configured. An unavailable private database affects its
own screen, rather than preventing the API from starting or serving the product.
The research catalogue's independent schema and migrations stay outside the
application repository, as do source data, originals and connection secrets.

Deploying this view requires the server runtime setting and new API and admin
builds. Editing or testing it locally is not a deployment. No provider is called
by building, testing or using the view.
