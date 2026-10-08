FROM node:26-slim AS base
RUN npm install -g pnpm@12.6.0
WORKDIR /app
COPY . .

FROM base AS builder
# The app and the workspace packages it uses, with the tools that build them. The whole
# repository would add the web app's and the infrastructure's dependencies, two gigabytes of them.
RUN pnpm install --frozen-lockfile --filter "server..."
RUN pnpm --filter server run build

FROM base AS production
# Only what the built app imports when it runs: its workspace packages are bundled into it.
# No script runs, since the one of the repository's root needs a development tool.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter server

# The image that runs starts from a clean base: no pnpm, and nothing the build stage installed.
FROM node:26-slim AS runner
ENV NODE_ENV=production
COPY --from=production --chown=node:node /app /app
COPY --from=builder --chown=node:node /app/apps/server/dist /app/apps/server/dist
USER node

EXPOSE 3000

WORKDIR /app/apps/server
# `start.mjs` applies the migrations, then starts the API.
CMD ["node", "dist/start.mjs"]
