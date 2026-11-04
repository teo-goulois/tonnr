# 081. Variables from a secrets manager

Status: decided on 2026-11-04, as Téo moved his checkout's variables into his Infisical. It amends [decision 021](021-web-stages.md) by where a stage's values may come from.

## Decision

- Every program of the repository reads its variables from its environment first: Varlock takes a variable of the environment over the one of a `.env` file, and the commands that deploy the API and the worker read the shell already. A checkout may then hold no `.env` file at all, and get each app's variables from a secrets manager as the app starts, such as `localify dev server` or `infisical run --path /server -- <command>`.
- The commands that deploy or release a stage of the web app read `packages/infra/.env.<stage>`, `packages/infra/.env` and the root `.env` as before. Where the stage has no file, they read the same variables from the shell, and only when the shell names that stage in `DEPLOY_STAGE`: a shell filled with another stage's values deploys nothing. `stageVariables` in `scripts/lib/checkout.mjs` does it, for `scripts/cloudflare-deploy.mjs` and `scripts/release.mjs`.
- They still give the install, Alchemy and Expo's tools only what each needs, by name: a secret of the shell goes no further than before.

## Consequences

- Whoever hosts their own instance keeps the files of decision 021, or uses a secrets manager, and nothing else changes for them.
- Téo's checkout gets its variables from the project `tonnr` of his Infisical: a folder per app, `/server`, `/worker`, `/web` and `/db`, the root's commands in `/`, and the stages' values in `/infra`, the environment `dev` for the stage `dev` and `prod` for `prod`. `.infisical.yaml` names the project and holds no value.
