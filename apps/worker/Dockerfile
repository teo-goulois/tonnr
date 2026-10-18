FROM node:26-slim AS base
RUN npm install -g pnpm@12.6.0
WORKDIR /app
COPY . .
# The commit the image is built from, which the program says when it is asked how it runs. It is
# read from what the build was given of the repository's history, which does not stay in the
# image. A build that was given none may be told the commit in `GIT_SHA`.
ARG GIT_SHA=""
RUN GIT_SHA="$GIT_SHA" node scripts/revision.mjs > revision && rm -rf .git

FROM base AS builder
# The app and the workspace packages it uses, with the tools that build them. The whole
# repository would add the web app's and the infrastructure's dependencies, two gigabytes of them.
RUN pnpm install --frozen-lockfile --filter "worker..."
RUN pnpm --filter worker run build

FROM base AS production
# Only what the built app imports when it runs: its workspace packages are bundled into it.
# No script runs, since the one of the repository's root needs a development tool.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter worker

# The image that runs starts from a clean base: no pnpm, and nothing the build stage installed.
FROM node:26-slim AS runner
ENV NODE_ENV=production
# ffmpeg makes the videos accounts send: decision 066. Debian's has the filter that turns a
# phone's HDR into the colors every screen shows.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY --from=production --chown=node:node /app /app
COPY --from=builder --chown=node:node /app/apps/worker/dist /app/apps/worker/dist
USER node

WORKDIR /app/apps/worker
# `start.mjs` applies the migrations, then starts the worker. `node dist/cli.mjs <job>` runs one
# job once instead.
CMD ["node", "dist/start.mjs"]
