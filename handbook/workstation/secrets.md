<!--
Handbook e5f830e9c232, from https://teogoulois.com/code/workstation/secrets.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Secrets and environment files

How I keep secrets out of Git and off disk with a self-hosted Infisical, across machines and monorepos.

Secrets never live in Git, and not on disk either. They live in a self-hosted
[Infisical](https://infisical.com) and reach a process as environment variables
when it starts. A repository commits only the variable names and the address of
its Infisical project.

## Defaults

| Need                                 | Default                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| Any project, personal or team        | Self-hosted Infisical, one project per repository             |
| Running an app or a command locally  | `localify dev`, `localify exec`, or `infisical run`           |
| Debugging locally on production data | `localify dev --profile prod`, a `danger` profile             |
| CI and deployments                   | An Infisical machine identity, or the hosting platform's vars |

Infisical gives each environment its own access rules, machine identities for
CI, and an audit log, so the same setup works alone and in a team.

## Project layout

One Infisical project per repository, named after the Git root folder:

- **Environments:** `dev` for local work, `prod` for production values, and
  `staging` when the project has one.
- **Folders:** one per unit that runs on its own, named after the last segment
  of its path: `apps/web` reads `/web`, `apps/api` reads `/api`. The root `/`
  holds what tools run from the repository root read.
- Each environment of a folder holds the same variable names. Infisical shows
  them side by side, so a missing one stands out.

## Set up a machine

```bash
brew install infisical/get-cli/infisical
infisical login --domain https://tools-infisical-web.d5.lumy.cloud
```

Log in once per machine. Every command then reads the session.

## Set up a repository

```bash
infisical init  # pick the organization and the project
```

It writes `.infisical.yaml` at the root. Commit it: it holds the project's
address, never a value. Then add the `.gitignore` rules and the `.env.example`
files below.

## Daily use

```bash
localify dev                     # dev values, read from the unit's folder
localify dev --profile prod      # production values, behind a red banner
localify exec -- pnpm db:migrate # any command, with the dev values
infisical run --path /web -- pnpm dev  # without Localify
```

- A repository with `.infisical.yaml` gets the `default`, `staging`, and `prod`
  Localify profiles without any configuration. `default` reads the `dev`
  environment, and `prod` is marked dangerous.
- Add a `localify.toml` only to force values over a profile, for example to
  switch off emails, crons, or invoicing when running on production data.
- Add or change a value in the Infisical app, or with
  `infisical secrets set --env dev --path /web NAME=value`. The next start
  reads it: there is nothing to pull or push.
- `infisical secrets` prints values. To list the names only, use
  `infisical secrets -o json | jq -r '.[].secretKey'`.

## Repository rules

Every repository ignores real environment files and commits an example:

```text
.env*
!.env.example
!.env.schema
```

`.env.example` lists every variable of a unit with an empty or fake value and a
short comment when the purpose is not obvious. Add a variable to `.env.example`
and to Infisical in the same change that starts reading it.

`.env.schema` only exists in a project that declares its variables in one, with
[varlock](https://varlock.dev) for example. It holds names, types, and flags,
never values.

## Monorepos

- Put variables in the folder of the unit that reads them, not at the root.
- Keep the root folder `/` for tools run from the root: database CLIs, scripts,
  Docker Compose.
- Share a variable between units with an Infisical secret reference instead of
  copying its value.
- With Turborepo, declare variables in `turbo.json` (`globalEnv` or per-task
  `env`) so the cache is invalidated when they change.

## Rules for agents

- Never print, log, or paste a secret value, and never write one to disk.
  Refer to variables by name. Pass secrets to a command with `localify exec` or
  `infisical run`.
- Never create, change, or delete an Infisical secret unless explicitly asked.
  Listing names only is fine.
- Never start a `danger` profile on your own. It connects to production.
- When code starts reading a new variable, update `.env.example` and tell the
  user which value must be added to which environment and folder.
- Validate environment variables at startup with a schema so a missing value
  fails loudly instead of at first use.
- If a secret has been committed or shared in plain text, treat it as leaked:
  rotate it, do not only delete it from Git.

## Known limits

- Starting anything needs the network and a valid `infisical login` session.
- A project without Localify needs the folder passed explicitly:
  `infisical run --path /web`.

## Legacy: Proton Pass and envsync

Older projects keep their `.env*` files on disk, synced with Proton Pass by the
[`envsync`](https://teogoulois.com/scripts/envsync) script and a global Git `pre-push` hook. That
setup is being retired: move each of those projects to Infisical, then stop
using Proton Pass for environment files. Do not set it up in a new project.

Until a project has moved, do not run `envsync push` or change its Proton Pass
notes unless explicitly asked.
