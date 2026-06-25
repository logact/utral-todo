# Utral Todo — pnpm Monorepo

This repo contains four apps and two shared packages:

```
├── apps/
│   ├── cli/        # Commander-based REST API CLI
│   ├── desktop/    # Tauri + Vite + React + Dexie
│   ├── expo-app/   # Expo + React Native iOS/Android app
│   ├── iwatch/     # SwiftUI watchOS companion
│   └── server/     # Express + Drizzle + PostgreSQL
└── packages/
    ├── types/      # Shared TypeScript interfaces + HLC utilities
    └── sync/       # Sync engine (client queue/push/SSE + server CRDT handler)
```

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared packages (types + sync)
pnpm --filter @utral/types build && pnpm --filter @utral/sync build

# 3. Generate Drizzle migrations (requires running PostgreSQL)
pnpm --filter server db:generate

# 4. Run both server and desktop UI together
pnpm dev:all
```

- Vite dev server runs at `http://localhost:1420`
- Express API server runs at `http://localhost:3001`

## Key scripts

| Script | Purpose |
|--------|---------|
| `pnpm cli` | Run the CLI against the local server |
| `pnpm dev:cli` | CLI dev mode with TypeScript watch |
| `pnpm dev:desktop` | Desktop UI only (Vite) |
| `pnpm dev:server` | API server only with auto-reload |
| `pnpm dev:expo` | Expo dev server |
| `pnpm dev:expo:ios` | Expo dev server (iOS simulator) |
| `pnpm dev:all` | Server + UI concurrently |
| `pnpm tauri:dev` | Desktop UI inside Tauri window |
| `pnpm tauri:build` | Build Tauri desktop installer |
| `pnpm build:cli` | Build CLI to `apps/cli/dist/` |
| `pnpm build:desktop` | Build desktop UI to `apps/desktop/dist/` |
| `pnpm build:server` | Compile server to `apps/server/dist/` |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:studio` | Open Drizzle Studio |

## Sync architecture

The `@utral/sync` package (`packages/sync/`) provides database-agnostic sync:

- **Client** (`SyncEngine`): queues local changes in a `syncQueue` table when offline, pushes to `POST /api/sync/push` when online, receives real-time updates via SSE (`GET /api/sync/stream`), falls back to HTTP polling.
- **Server** (`SyncHandler`): accepts pushes, resolves conflicts using HLC-based last-writer-wins, broadcasts to other connected clients via SSE.
- **Conflict resolution**: Hybrid Logical Clocks (`{ wall, counter, node }`) — higher `updatedAt` wins. Soft deletes via tombstones, garbage-collected after 30 days.
- **Storage adapters**: `DexieSyncStorage` (desktop), `DrizzleSyncStorage` (expo), `DrizzlePgSyncStorage` (server).
- Configure sync endpoint in the desktop UI at **Settings > Sync**.

## Data model

Server and desktop share the same conceptual entities: `Todo`, `Project`, `TodoRelation`, `TodoLog`, `Roadmap`, `ActionEdge`, `Pluse`, `TimerSession`.

- Drizzle schema: `apps/server/src/db/schema.ts`
- Dexie schema: `apps/desktop/src/db/database.ts`
- Shared types: `packages/types/src/index.ts`
- Sync engine: `packages/sync/src/`

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
| `docker-compose.yml` | Server + PostgreSQL database |
| `docker-compose.nginx.yml` | Server + nginx reverse proxy |
| `nginx.conf` | Nginx config for `/api/*` proxy |
| `docker-entrypoint.sh` | Runs migrations then starts the server |
| `.dockerignore` | Excludes dev/build artifacts from image |

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
