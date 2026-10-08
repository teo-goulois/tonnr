# 012. Open source

Status: decided by Téo on 2026-10-08. The repository goes public without an announcement, and he may make it private again later. The licence is not chosen yet.

## Context

Tonnr was built in a private repository, for one deployment on Téo's server. Téo now wants it thought of as an open-source project: easy to deploy, with migrations that apply themselves at deployment, and a good CI.

A public repository changes three things. Its history is published with it. People run it on servers that Téo does not operate. And pull requests come from people whose code CI runs before anyone has read it.

## Decision

- Nothing secret, personal, or tied to one machine goes into a commit: code, tests, docs, and messages alike. `AGENTS.md` carries the rule.
- An instance is the three services of decision 009, and takes every value from its environment. `docker-compose.yml` runs one from a clone, and `docs/self-hosting.md` gives the steps.
- Any container brings the schema up to date when it starts, the worker's as well as the API's. They lock the database while they do, so the services may start in any order and together.
- CI runs on every push to `main` and on every pull request: lint, the format check, the type check, and the tests, with Postgres 18 for those that need it. It fails when the schema and the migrations disagree.
- A change that can break an image builds the two images, on amd64, and starts them on an empty database: the worker first, then the API. On a pull request this always runs.
- CI reads no secret, so a pull request from a fork gets the same checks, and nothing can leak through them.
- Tests and CI never call a data provider. The worker's start in CI happens in a network with no way out.
- Whoever runs an instance answers to the providers for it: its traffic, the attribution it shows, and the stations it may not use commercially.
- The code's licence, once chosen, covers the code. The measurements, and the samples of them in the tests, stay under their providers' terms.

## Consequences

- What was public stays with whoever cloned it, under the licence it had then. Making the repository private again withdraws neither.
- The history goes public as it is: 39 commits on 2026-10-08, with the author's email address on each. A scan of it found no secret. It holds the Cefas provider that was taken out the same day, whose test carries one reading of a buoy that may not be redistributed.
- A private repository has a monthly allowance of CI minutes, which a public one has not. This is why the images are built only for the changes that can break them.
- The workflows pin each action to a commit, and Dependabot proposes the next one once a month.
- Not done yet: the web app as a container, a way for an instance to name its operator to the providers, images published for each release, and updates of the npm dependencies.
