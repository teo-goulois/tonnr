FROM node:26-slim AS builder
RUN npm install -g pnpm@12.6.0
WORKDIR /app

COPY . .
# Only what this app and the workspace packages it uses need. The whole repository would add
# the web app's and the infrastructure's dependencies, two gigabytes of them.
RUN pnpm install --frozen-lockfile --filter "worker..."
RUN pnpm --filter worker run build

FROM node:26-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app /app
USER node

# The worker changes no schema. Start it once the API has applied the migrations.
WORKDIR /app/apps/worker
CMD ["node", "dist/index.mjs"]
