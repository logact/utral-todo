# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace manifests first for dependency caching
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/types ./packages/types
COPY apps/server ./apps/server
COPY apps/desktop ./apps/desktop
COPY apps/mobile ./apps/mobile

# Re-link workspace dependencies now that source is present
RUN pnpm install

# Clean stale tsbuildinfo that may have been copied from host
RUN find . -name "*.tsbuildinfo" -delete

RUN pnpm --filter @utral/types build
RUN pnpm --filter server db:generate
RUN pnpm --filter server build
RUN pnpm --filter desktop build
RUN pnpm --filter mobile build

# Production stage
FROM node:20-alpine AS production

# Install wget for healthcheck and nginx
RUN apk add --no-cache wget nginx

WORKDIR /app/apps/server

# Copy workspace root node_modules (pnpm store)
COPY --from=builder /app/node_modules /app/node_modules

# Copy server app preserving directory structure for symlink integrity
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY apps/server/docker-entrypoint.sh ./

# Copy workspace packages so symlinks in node_modules resolve
COPY --from=builder /app/packages/types /app/packages/types

# Copy built frontend apps
COPY --from=builder /app/apps/desktop/dist /app/static/desktop
COPY --from=builder /app/apps/mobile/dist /app/static/mobile

# Copy nginx configuration
COPY apps/server/nginx.conf /etc/nginx/http.d/default.conf

# Create data directory for SQLite
RUN mkdir -p /var/lib/utral-todo/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 80

ENTRYPOINT ["sh", "-c", "nginx && sh docker-entrypoint.sh"]
