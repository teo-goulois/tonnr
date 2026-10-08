# 012. Open source

Status: decided by Téo on 2026-10-08, with the licence. The repository goes public without an announcement, and he may make it private again later.

## Context

Tonnr was built in a private repository, for one deployment on Téo's server. Téo now wants it thought of as an open-source project: easy to deploy, with migrations that apply themselves at deployment, and a good CI.

A public repository changes three things. Its history is published with it. People run it on servers that Téo does not operate. And pull requests come from people whose code CI runs before anyone has read it.

## Decision

- Nothing secret, personal, or tied to one machine goes into a commit: code, tests, docs, and messages alike. `AGENTS.md` carries the rule.
- An instance is the three services of decision 009, and takes every value from its environment. `docker-compose.yml` runs one from a clone, and `docs/self-hosting.md` gives the steps.
- Any container brings the schema up to date when it starts, the worker's as well as the API's. They lock the database while they do, so the services may start in any order and together.
- CI runs on every push to `main` and on every pull request: lint, the format check, the type check, and the tests, with Postgres 18 for those that need it. It fails when the schema has no migration, when a database built by the migrations differs from the schema, and when a pull request edits a migration already merged.
- It also builds the two images, on amd64, and starts them on an empty database: the worker first, then the API.
- CI reads no secret, so a pull request from a fork gets the same checks, and nothing can leak through them.
- Tests and CI never call a data provider. The images start in CI in a network with no way out.
- Whoever runs an instance answers to the providers for it: its traffic, the attribution it shows, and the stations it may not use commercially.
- The code is under the GNU Affero General Public License, version 3 and no later one. Whoever lets people use a changed version over a network owes them its source, so a hosted fork cannot close what it took. Téo may want paid parts one day, and this keeps them from being built on Tonnr by someone else without giving back.
- The licence covers the code. The measurements, and the samples of them in the tests, stay under their providers' terms.

## Consequences

- What was public stays with whoever cloned it, under the licence it had then. Making the repository private again withdraws neither.
- Téo wrote all of the code, so he may also offer it under other terms. Once it holds other people's contributions, that takes their agreement.
- The history carries on each commit the address that Téo's other public repositories already show, and a scan of it found no secret. It holds the Cefas provider that was taken out the same day, whose test carries one reading of a buoy that may not be redistributed. Whether the repository goes public with that reading is not settled.
- A private repository has a monthly allowance of CI minutes, which a public one has not. A push uses about four of them.
- The workflows pin each action to a commit, and Dependabot proposes the next one once a month.
- Not done yet: the web app as a container, a way for an instance to name its operator to the providers, images published for each release, and updates of the npm dependencies.
