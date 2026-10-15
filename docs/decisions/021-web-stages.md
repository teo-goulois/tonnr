# 021. Stages of the web app, and its pre-production

Status: decided by Téo on 2026-10-09 and deployed the same day. The stage `dev` serves `https://dev.tonnr.app`. Not built: a command that takes a stage down, and a deployment from CI. [Decision 052](052-production.md) made the production stage, `prod` at `tonnr.app`, on the same API, which ends `dev` as a pre-production. Not tried: a stage that asks search engines to list it.

## Context

Decision 001 puts the web app on Cloudflare, deployed with Alchemy. Nothing had used that path. The web app ran on a developer's machine, and a temporary script showed it to other people through a tunnel.

Téo wants a pre-production of the web app at `dev.tonnr.app`, working against the API of his instance, and one command that deploys it again. He is that instance's only user, and calls it the development instance, online.

Three facts bound the choice:

- An API trusts one web origin, its `CORS_ORIGIN`, by decision 019.
- The session cookie belongs to the API's host. A page sends it when it is on the same site as the API. From any other site, Safari keeps it back.
- Several people and agents work in one checkout, which often holds work that is not finished.

## Decision

### Stages

- A stage is one deployment of the web app: a name, a host name, and the API it talks to. `dev` is the first. It serves `dev.tonnr.app` and talks to `api.tonnr.app`.
- `tonnr.app` itself serves nothing until a production stage exists.
- A stage's values are in `packages/infra/.env.<stage>`: `WEB_DOMAIN`, `VITE_SERVER_URL`, and `WEB_INDEXED` when it is wanted. The access to Cloudflare is in `packages/infra/.env`, the same for every stage: an API token and the account's id. Git ignores both files.
- Nothing of one instance is committed. Whoever hosts their own deploys their web app by filling the same two files.
- A stage has a host name on its API's site, and the stack refuses to deploy without one. A Worker without a host name only has its `workers.dev` address, which is another site than the API.
- Each API trusts the web origin of one stage. The API of Téo's instance now names `https://dev.tonnr.app`.

### The command

- `pnpm run deploy:web <stage>` deploys a stage from a developer's machine, as `pnpm run deploy:api` does the API.
- It builds the commit that `main` has on the remote, in a checkout of its own that it makes and removes. It never builds the working tree.
- It deploys the web app and leaves any other app of the stack as it is.
- It shows what it will change and asks. `--yes` skips the question. `--dry-run` stops after showing and changes nothing. Where the state store is missing or out of date, it fails rather than make or change it.
- The install and Alchemy run code that other people wrote. Each gets the one secret it needs, and of the shell only what its tools need to run. The install gets the licence key of the icons, and Alchemy the access to Cloudflare.
- Stopping the command stops the step under way.
- This decision removes the scripts `deploy` and `destroy`. They deployed to a stage named after the user, with the address of the local API.
- CI deploys nothing, and still reads the one secret of decision 012.

### State

- Alchemy records what it deployed in a state store of the Cloudflare account: a Worker named `alchemy-state-store`, with a Secrets Store. It makes one when the account has none.
- An account has one state store, shared by every project that deploys to it with Alchemy. Téo's account had one from other projects, at the version this Alchemy expects, and Tonnr uses it as it is.

### Search engines

- Anyone who has a stage's address can open it. Sign-up is open on the API either way, by decision 019.
- The web app tells search engines not to list a stage, unless the stage sets `WEB_INDEXED=true`. It says so in a header, `X-Robots-Tag: noindex`, on every page it answers. A stage that is listed says it too of every page that is not public, the product, the sign-in and what a link or a mail opens: only the pages of `PUBLIC_PAGES`, in each language, go without it.
- `robots.txt` still allows every page, because a search engine that may not read a page does not read its header.
- A stage that is listed names its sitemap in `robots.txt`, and serves it at `/sitemap.xml`: the public pages in each language, with their address in the other. A stage that is not listed has no sitemap, since every page it would name says `noindex`. The Worker answers both files before the router, because only it knows whether its stage is listed, and takes their host from the request.
- A redirect to the same page written with or without its last slash, such as `/fr` to `/fr/`, is a `308`, so a search engine keeps the final address. The router sends it as a `307`, and the Worker changes it.

### A deployment said to an open app

- A build of the web app gives itself a name, from the time it starts. It tells the name to the app and writes it in `release.json`, a file served beside the app.
- An app that is open reads the file again, past every cache: when it comes back into view, and every ten minutes while it is in view, never twice in a minute. A name that is no longer its own means the stage was deployed since it was loaded.
- It then says so once, in a toast that stays until it is answered and offers to load the page again. It loads nothing by itself: the reader may be writing something.
- An app that learns nothing, with no network or on a development server, says nothing.

## Rejected

- **A list of trusted origins**, so that a local web app could use the online API. Every origin on the list writes with the session of any signed-in account. A name such as `tonnr.localify` is served by whatever runs on a machine, and code that nobody has read would write to the online database.
- **Cloudflare Access in front of the stage.** It hides pages whose source is public, and not the API, where a script can still create an account.
- **Deploying from CI.** It puts a second secret in GitHub, a token that changes the Workers of the account.
- **Building the working tree.** It holds other people's work in progress. Checking that it is clean leaves the time of the build for someone to change it.
- **Alchemy's sign-in through a browser.** It asks for wide rights on every account of the user, and keeps them on one machine.
- **State kept on one machine.** Only that machine could deploy again.
- **`Disallow: /` in `robots.txt`.** It stops a search engine from reading the header, and a page that others link to can still be listed.
- **Committing the stages' values.** Whoever hosts their own would carry a change to a tracked file.
- **A Cloudflare account for Tonnr alone.** It would keep the token away from Téo's other projects and give Tonnr a state store of its own. Téo found it too much for now: a second account, the zone to move, and a new token. Moving the zone once `tonnr.app` serves people would cut its DNS for a while.

## Consequences

- The command deploys what `main` holds, whether or not its checks have passed. Wait for CI first.
- Nothing checks that the API has what the web app calls. When a change needs both, deploy the API first.
- Every deployment installs the dependencies in its checkout, about twenty seconds, so it needs the licence key of the icons.
- A deployment that fails, or that is stopped, leaves its checkout in the temporary directory, and says where.
- A variable of the shell that the build needs and that the command does not pass on has to be added to the list in `scripts/cloudflare-deploy.mjs`.
- The token can change every Worker of the account, not only Tonnr's. Cloudflare does not narrow that right to one Worker.
- The first deployment from a machine reads the state store's own token and keeps it in `~/.alchemy`.
- A newer Alchemy may expect another version of the state store, and brings the store to it. That changes it for every project of the account, and `--yes` does it without asking. Check the other projects before changing Alchemy's version here.
- The pre-production does what the temporary script was written for. Téo had `scripts/demo.mjs` removed on 2026-10-09, and Git's history keeps it.
- An app loaded before the deployment that brought the toast does not look for a newer one: the toast is seen from the deployment after.
- A build of the same commit has another name, so deploying twice asks open apps to load again twice.
- Production has no API or database of its own: [decision 052](052-production.md).
