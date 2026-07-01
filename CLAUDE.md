# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Utral Todo is a cross-platform todo/planning app managed as a pnpm workspace monorepo. It uses:

- **Desktop**: Tauri (Rust) + Vite + React + Tailwind CSS, using SQLite via `@tauri-apps/plugin-sql` and Drizzle ORM.
- **Server**: Express + WebSocket + Drizzle ORM + PostgreSQL, acting as a sync hub and push notification gateway.
- **Mobile**: Expo + React Native + Expo SQLite + Drizzle ORM.
- **CLI**: small Node/TypeScript utility.
- **Shared packages**: `@utral/types`, `@utral/sync-share`, `@utral/sync-client`, `@utral/sync-server`.

Package manager is **pnpm 9.15.0**.

## Common Commands

Run everything from the repository root unless noted.

### Development

- Start server + desktop together: `pnpm dev:all`
- Start server only: `pnpm server:dev`
- Start desktop only: `pnpm desktop:dev` (runs `tauri dev`)
- Start mobile: `pnpm expo:dev` (or `pnpm expo:dev:ios`)
- Start CLI in dev/watch mode: `pnpm --filter cli dev`

### Build

- Build server: `pnpm server:build`
- Build CLI: `pnpm cli:build`
- Build desktop release: `pnpm desktop:build` (also runs `scripts/notarize.sh`)
- Build mobile (typecheck): `pnpm expo:build`

### Type Check / Lint

- Type check entire monorepo: `pnpm typecheck`
- Lint entire monorepo: `pnpm lint`

### Tests

- Desktop tests: `pnpm --filter desktop test` (Vitest)
- Desktop tests watch: `pnpm --filter desktop test:watch`
- Sync-server tests: `pnpm --filter @utral/sync-server test`
- Single test file: `pnpm --filter desktop test src/db/todos.test.ts`

### Database

These commands operate on the **server** Postgres database unless noted:

- Generate migration: `pnpm db:generate`
- Apply migrations: `pnpm db:migrate`
- Push schema changes: `pnpm db:push`
- Open Drizzle Studio: `pnpm db:studio`

For the **desktop** SQLite database, migrations are generated with its own Drizzle config:

- `pnpm --filter desktop db:generate`

## High-Level Architecture

### Monorepo Layout

```
apps/
  desktop/        Tauri + React + SQLite
  server/         Express + WebSocket + PostgreSQL
  expo-app/       Expo + React Native + SQLite
  cli/            Node CLI
packages/
  types/          Shared TypeScript entity types and business helpers
  sync-share/     CRDT/HLC primitives shared by clients and server
  sync-client/    Client-side sync engine
  sync-server/    Server-side sync engine
```

### Data Model

Core entities: `Todo`, `TodoRelation`, `TodoLog`, `ActionEdge`, `Plan`, `Pluse`, `RepeatOccurrence`, and (desktop-only) `TimerSession`.

Todos have a `nodeType` (`goal` | `task`) and a `pattern` (`task` | `cognitive` | `timeSlot`). Goals can have plans (ordered node/edge lists). Relations link todos. Logs are timestamped notes/progress entries.

### Synchronization: HLC CRDT

Sync is conflict-free using **Hybrid Logical Clocks (HLC)**. Every mutable entity carries:

- `createdAt: { wall, counter, node }`
- `updatedAt: { wall, counter, node }`
- `isDeleted: boolean`

The shared logic lives in `@utral/sync-share` (`packages/sync-share/src/hlc.ts`, `crdt.ts`). Merge rules prefer the remote record when its HLC is later; if clocks are equal, a deterministic tie-breaker is used. Soft deletes are synced like any other update and are garbage-collected later.

### Storage Backends

- **Desktop**: SQLite via Tauri SQL plugin. Schema and row/entity conversion are in `apps/desktop/src/db/schema.ts`.
- **Server**: PostgreSQL. Schema is in `apps/server/src/db/schema.ts`.
- **Mobile**: SQLite via Expo. Schema is in `apps/expo-app/src/db/schema.ts`.

The schemas are intentionally similar but not identical. In particular, the desktop schema uses snake_case column names and explicit helper functions (`rowToTodo`, `todoToRow`, etc.) to convert between SQLite rows and the shared entity types in `@utral/types`.

### Sync Packages

- `@utral/sync-share`: pure TypeScript CRDT utilities and types. No runtime dependencies.
- `@utral/sync-client`: client-side `SyncHandler` + reorder buffer + types.
- `@utral/sync-server`: server-side `SyncHandler` + `SqliteSyncStorage` + WebSocket transport abstractions.

The desktop app wraps the sync packages with its own SQLite storage and WebSocket transport in `apps/desktop/src/lib/sync/`.

### Server Sync Setup

The server bootstraps a single `SyncHandler` in `apps/server/src/sync/setup.ts`. WebSocket connections subscribe to a `(userId, channel)` and push/pull `SyncMessage`s over `/ws/sync`. HTTP endpoints live under `/api` and require `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is set in the environment.

## Important Workflows

### Modifying the Desktop Database Schema

When changing tables in the desktop app:

1. Edit `apps/desktop/src/db/schema.ts`.
2. Update related models/entities in `apps/desktop/src/db/*.ts` and `@utral/types` if needed.
3. Generate the migration with `pnpm --filter desktop db:generate`.

### Adding or Changing Shared Types

Most shared types and business logic helpers (today filters, repeat rules, time slots, HLC) live in `packages/types/src/`. After changing them:

- Run `pnpm typecheck` to catch downstream errors in all apps.
- The server has a `predev` step that rebuilds `@utral/types`, `@utral/sync-share`, and `@utral/sync-server`; for other apps you may need to restart the dev server to pick up changes.

### Environment Variables

The server reads `.env` and `.env.local` from `apps/server/`. Relevant variables:

- `API_TOKEN`: required bearer token for `/api` and WebSocket sync when set.
- `PORT`: defaults to `3001`.
- Database connection: check `apps/server/src/db/index.ts`.

## Notes and Pitfalls

- The desktop SQLite schema stores HLC timestamps as separate columns (`createdAtWall`, `createdAtCounter`, `createdAtNode`) and uses helper functions to map to/from the shared `HLC` type. Server Postgres uses a single `versionWall`/`versionCounter`/`versionNode` set plus `isDeleted`. Keep these conventions in mind when adding fields.
- `TimerSession` exists only in the desktop schema; server and mobile do not have it yet.
- Desktop uses seconds-based epoch storage for some timestamps; server uses native `timestamp` columns.
- Tests are sparse: desktop has a few in `apps/desktop/src/db/`, and `@utral/sync-server` has its own Vitest config. There is no top-level test script; run tests per package.
- The desktop `tauri:build` script runs `./scripts/notarize.sh` — this is macOS-specific and will fail on other platforms or without signing credentials.
