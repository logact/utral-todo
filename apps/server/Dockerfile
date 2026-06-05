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

RUN pnpm --filter @utral/types build
RUN pnpm --filter server db:generate
RUN pnpm --filter server build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy built artifacts
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./
COPY docker-entrypoint.sh ./

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL="file:./data/utraltodo.sqlite"

EXPOSE 3001

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
