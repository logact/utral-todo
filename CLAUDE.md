# Utral Todo — pnpm Monorepo

This repo contains two apps and a shared types package:

```
├── apps/
│   ├── desktop/    # Tauri + Vite + React + Dexie
│   └── server/     # Express + Prisma + SQLite
└── packages/
    └── types/      # Shared TypeScript interfaces
```

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared types
pnpm --filter @utral/types build

# 3. Generate Prisma client
pnpm db:generate

# 4. Run both server and desktop UI together
pnpm dev:all
```

- Vite dev server runs at `http://localhost:1420`
- Express API server runs at `http://localhost:3001`

## Key scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev:desktop` | Desktop UI only (Vite) |
| `pnpm dev:server` | API server only with auto-reload |
| `pnpm dev:all` | Server + UI concurrently |
| `pnpm tauri:dev` | Desktop UI inside Tauri window |
| `pnpm tauri:build` | Build Tauri desktop installer |
| `pnpm build:desktop` | Build desktop UI to `apps/desktop/dist/` |
| `pnpm build:server` | Compile server to `apps/server/dist/` |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:studio` | Open Prisma Studio |

## Sync architecture

- Desktop keeps its source of truth in IndexedDB via Dexie.
- `/api/sync` supports bulk push/pull for full sync.
- Optional real-time remote ops (`remoteOpsEnabled`) send individual creates/updates/deletes to `/api/todos`, `/api/projects`, etc.
- Configure sync endpoint in the desktop UI at **Settings > Sync**.

## Data model

Server and desktop share the same conceptual entities: `Todo`, `Project`, `TodoRelation`, `TodoLog`, `Roadmap`, `ActionEdge`, `Pluse`, `TimerSession`.

- Prisma schema: `apps/server/prisma/schema.prisma`
- Dexie schema: `apps/desktop/src/db/database.ts`
- Shared types: `packages/types/src/index.ts`

## Auth

Set `API_TOKEN` in `apps/server/.env` to require `Authorization: Bearer <token>` on all `/api/*` routes. If unset, the API is open (useful for local dev).

## Docker deployment

Server Docker files live in `apps/server/`:

```bash
cd apps/server

# Standalone server on http://localhost:8080
docker compose up --build -d

# Server behind nginx reverse proxy on port 80
docker compose -f docker-compose.nginx.yml up --build -d
```

Build context is the workspace root (`../..`) so the Dockerfile can access `packages/types` and pnpm workspace files.

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build for the API server |
| `docker-compose.yml` | Standalone server with SQLite volume |
| `docker-compose.nginx.yml` | Server + nginx reverse proxy |
| `nginx.conf` | Nginx config for `/api/*` proxy |
| `docker-entrypoint.sh` | Runs migrations then starts the server |
| `.dockerignore` | Excludes dev/build artifacts from image |
