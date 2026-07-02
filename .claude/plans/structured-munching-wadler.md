# Plan: Add "Reset All Data" Button to Desktop and Expo

## Context
Both the desktop and expo apps already have partial "clear data" buttons, but they are incomplete and separate:
- Desktop has **"Clear All Data"** (local only, misses `sync_queue`/`sync_state`) and **"Clear Server Data"** (server only, and the endpoint only wipes `SyncEvent`).
- Expo has **"Clear All Data"** (local only, misses several domain tables and all sync infra).
- The server's `DELETE /api/all-data` only deletes the `SyncEvent` table; app tables (`Todo`, `Plan`, etc.) are not scoped by user/channel, so a per-user wipe is not currently possible.

The user wants a single reset button in both apps that clears **all** local data (including sync infrastructure), resets sync config/device identity, and notifies the server to wipe **all** data globally.

## Decisions Made with User
- **Server scope:** Wipe the entire server globally (all app tables + sync events + device registry).
- **UI:** Replace existing clear buttons with a single **"Reset All Data"** button.
- **Config:** Reset also wipes server URL, API token, and device ID / HLC state (factory reset behavior).

## Implementation Plan

### 1. Server — `apps/server/src/index.ts`
Update the existing `DELETE /api/all-data` endpoint to truncate every data table.

**Tables to delete, in dependency-safe order:**
1. `syncEvent`
2. `todoRelation`
3. `todoLog`
4. `actionEdge`
5. `plan`
6. `pluse`
7. `repeatOccurrence`
8. `timeSlot`
9. `todo`
10. `device`

Keep returning `204 No Content` and preserve the `/api/health` endpoint.

### 2. Desktop — `apps/desktop/src/db/database.ts`
- Expand `clearAllData()` to also delete `syncQueue` and `syncState`.
- Add a new `resetAllData()` function that:
  1. Stops the sync engine (`stop()` from `../lib/sync/syncEngine`).
  2. Calls `clearAllData()`.
  3. Clears `localStorage` keys: `syncDeviceId`, `syncServerUrl`, `syncApiToken`, `syncRemoteOpsEnabled`, `lastSyncAt`.
  4. Re-initializes the database (`initDatabase()` / `runMigrations()` + `ensureRootGoal()`) so the app is usable immediately.

### 3. Desktop — `apps/desktop/src/pages/Settings.tsx`
- Replace the two existing destructive buttons with one **"Reset All Data"** button.
- Replace state variables with a single `resetState: 'idle' | 'confirm' | 'resetting' | 'done' | 'error'` and `resetError`.
- Handler flow:
  1. First tap → show confirmation banner.
  2. Second tap (confirm) → set `resetting`.
  3. If a server URL is configured, call `DELETE /api/all-data` with `Authorization: Bearer <token>`.
  4. On success, call `resetAllData()`.
  5. Reset UI fields (`serverUrl`, `apiToken`, `lastSync`, `pendingCount`, `syncStatus`).
  6. Show "Reset Complete" for 3 seconds, then return to idle.
- If the server call fails, show the error and **do not** clear local data (fail-safe).
- Add `CheckCircle` to the lucide-react imports.

### 4. Expo — `apps/expo-app/src/lib/database.ts`
- Expand `clearAllData()` to delete from **all** tables:
  - Domain: `todos`, `todo_relations`, `todo_logs`, `action_edges`, `plans`, `pluses`, `repeat_occurrences`, `time_slots`
  - Infra: `sync_config`, `hlc_state`, `sync_queue`, `sync_state`
- Add a new `resetAllData()` function that:
  1. Stops sync (`stopSync()` from `./sync`).
  2. Calls `clearAllData()`.
  3. Clears the React Query cache (`queryClient.clear()`).
  4. Re-initializes the database so the app is usable immediately.

### 5. Expo — `apps/expo-app/app/(tabs)/settings.tsx`
- Replace the Danger Zone "Clear All Data" button with **"Reset All Data"**.
- Add `resetState` and `resetError` state.
- Handler mirrors desktop: two-tap confirm → server call → local reset → UI reset → success.
- Inline confirmation banner and error banner above the button.

## Failure Handling
| Scenario | Behavior |
|----------|----------|
| Server unreachable / non-2xx | Show error, **local data untouched**, user can retry. |
| No server configured | Skip server step and reset local data only. |
| Local clear fails | Error shown; if server was already wiped, manual reconfiguration is needed. |
| Cancel confirmation | Return to idle state. |
| Button tapped during reset | Disabled while `resetting`. |

## Verification
1. **Type check:** `pnpm typecheck`
2. **Lint:** `pnpm lint`
3. **Server endpoint:**
   - `curl -X DELETE http://localhost:3001/api/all-data -H "Authorization: Bearer <token>"` → 204
   - Verify all Postgres tables are empty.
4. **Desktop:**
   - Create data + configure sync, then tap Reset → confirm.
   - Verify UI is empty, `localStorage` sync keys gone, SQLite tables empty, server tables empty, app recreates root goal.
5. **Expo:**
   - Create data + configure sync, then tap Reset → confirm.
   - Verify UI is empty, SQLite tables empty, React Query cache cleared, server tables empty.
6. **Edge cases:** reset with no server, reset with invalid token, cancel confirmation.

## Critical Files
- `apps/server/src/index.ts`
- `apps/desktop/src/db/database.ts`
- `apps/desktop/src/pages/Settings.tsx`
- `apps/expo-app/src/lib/database.ts`
- `apps/expo-app/app/(tabs)/settings.tsx`
