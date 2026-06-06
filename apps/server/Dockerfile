# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace manifests first for dependency caching
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/types ./packages/types
COPY apps/server ./apps/server

# Re-link workspace dependencies now that source is present
RUN pnpm install

# Clean stale tsbuildinfo that may have been copied from host
RUN find . -name "*.tsbuildinfo" -delete

RUN pnpm --filter @utral/types build
RUN pnpm --filter server db:generate
RUN pnpm --filter server build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app/apps/server

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy workspace root node_modules (pnpm store)
COPY --from=builder /app/node_modules /app/node_modules

# Copy server app preserving directory structure for symlink integrity
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY apps/server/docker-entrypoint.sh ./

# Create data directory for SQLite
RUN mkdir -p /var/lib/utral-todo/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
