# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/sync/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/sync/package.json apps/sync/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN npm ci --workspace @syncscribe/sync --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/sync apps/sync
RUN npm run build --workspace @syncscribe/sync

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /app/apps/sync/dist ./dist
COPY packages/db/migrations ./migrations
USER node
EXPOSE 5201
CMD ["node", "--enable-source-maps", "dist/main.js"]

# One-shot migration runner used by docker compose and pre-deploy hooks.
FROM runtime AS migrate
CMD ["node", "dist/migrate.js"]

# Keep the server as the default target.
FROM runtime
