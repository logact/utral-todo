# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace manifests first for dependency caching
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/
COPY packages/types/package.json ./packages/types/
COPY packages/db-schema/package.json ./packages/db-schema/
COPY packages/sync-share/package.json ./packages/sync-share/
COPY packages/sync-client/package.json ./packages/sync-client/
COPY packages/sync-server/package.json ./packages/sync-server/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/types ./packages/types
COPY packages/db-schema ./packages/db-schema
COPY packages/sync-share ./packages/sync-share
COPY packages/sync-client ./packages/sync-client
COPY packages/sync-server ./packages/sync-server
COPY apps/server ./apps/server
COPY apps/desktop ./apps/desktop

# Re-link workspace dependencies now that source is present
RUN pnpm install

# Clean stale tsbuildinfo that may have been copied from host
RUN find . -name "*.tsbuildinfo" -delete

RUN pnpm --filter @utral/types build
RUN pnpm --filter @utral/db-schema build
RUN pnpm --filter @utral/sync-share build
RUN pnpm --filter @utral/sync-client build
RUN pnpm --filter @utral/sync-server build
RUN pnpm --filter server build
RUN pnpm --filter desktop build


# Production stage
FROM node:20-alpine AS production

# Install wget for healthcheck and nginx
RUN apk add --no-cache wget nginx

WORKDIR /app/apps/server

# Copy workspace root node_modules (pnpm store)
COPY --from=builder /app/node_modules /app/node_modules

# Copy server app preserving directory structure for symlink integrity
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/drizzle ./drizzle
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY --from=builder /app/apps/server/docker-entrypoint.sh ./
COPY --from=builder /app/apps/server/nginx.conf /etc/nginx/http.d/default.conf

# Copy workspace packages so symlinks in node_modules resolve
COPY --from=builder /app/packages/types /app/packages/types
COPY --from=builder /app/packages/db-schema /app/packages/db-schema
COPY --from=builder /app/packages/sync-share /app/packages/sync-share
COPY --from=builder /app/packages/sync-client /app/packages/sync-client
COPY --from=builder /app/packages/sync-server /app/packages/sync-server

# Copy built frontend apps
COPY --from=builder /app/apps/desktop/dist /app/static/desktop

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 80

ENTRYPOINT ["sh", "-c", "nginx && sh docker-entrypoint.sh"]
