import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

const DATABASE_NAME = 'utral-todo.db';

const expoDb = openDatabaseSync(DATABASE_NAME);
export const db = drizzle(expoDb, { schema });
export { expoDb };

export function initDatabase() {
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      description TEXT NOT NULL DEFAULT '',
      node_type TEXT NOT NULL DEFAULT 'task',
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      goal_status TEXT,
      estimated_minutes INTEGER NOT NULL DEFAULT 0,
      scheduled_date TEXT,
      due_date TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pluses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Untitled Pluse',
      description TEXT NOT NULL DEFAULT '',
      intervals TEXT NOT NULL DEFAULT '[1500]',
      repeat_count INTEGER NOT NULL DEFAULT 1,
      auto_advance INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS timer_sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'pluse',
      pluse_id TEXT,
      todo_id TEXT,
      name TEXT NOT NULL DEFAULT '',
      intervals TEXT NOT NULL DEFAULT '[]',
      repeat_count INTEGER NOT NULL DEFAULT 1,
      current_index INTEGER NOT NULL DEFAULT 0,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      paused_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      server_url TEXT NOT NULL DEFAULT '',
      api_token TEXT
    );

    CREATE TABLE IF NOT EXISTS hlc_state (
      id TEXT PRIMARY KEY DEFAULT 'default',
      counter INTEGER NOT NULL DEFAULT 0,
      node TEXT NOT NULL,
      last_seen INTEGER NOT NULL
    );
  `);

  // Add version columns for HLC-based sync (safe to run repeatedly)
  const tables = ['todos', 'pluses', 'timer_sessions'];
  for (const table of tables) {
    try { expoDb.execSync(`ALTER TABLE ${table} ADD COLUMN version_wall INTEGER`); } catch (e: any) { if (!String(e).includes('duplicate column')) console.warn(`[db] ALTER ${table} version_wall:`, e?.message); }
    try { expoDb.execSync(`ALTER TABLE ${table} ADD COLUMN version_counter INTEGER NOT NULL DEFAULT 0`); } catch (e: any) { if (!String(e).includes('duplicate column')) console.warn(`[db] ALTER ${table} version_counter:`, e?.message); }
    try { expoDb.execSync(`ALTER TABLE ${table} ADD COLUMN version_node TEXT`); } catch (e: any) { if (!String(e).includes('duplicate column')) console.warn(`[db] ALTER ${table} version_node:`, e?.message); }
  }

  // Add new timer_sessions columns (safe to run repeatedly)
  const timerColumns: [string, string][] = [
    ['type', "TEXT NOT NULL DEFAULT 'pluse'"],
    ['todo_id', 'TEXT'],
    ['paused_at', 'TEXT'],
    ['completed_at', 'TEXT'],
  ];
  for (const [col, type] of timerColumns) {
    try { expoDb.execSync(`ALTER TABLE timer_sessions ADD COLUMN ${col} ${type}`); } catch (e: any) { if (!String(e).includes('duplicate column')) console.warn(`[db] ALTER timer_sessions ${col}:`, e?.message); }
  }

  // Add new todo columns for desktop parity (safe to run repeatedly)
  const todoColumns: [string, string][] = [
    ['pattern', 'TEXT'],
    ['scheduled_end_date', 'TEXT'],
    ['started_at', 'TEXT'],
    ['completed_at', 'TEXT'],
    ['parent_id', 'TEXT'],
    ['active_plan_id', 'TEXT'],
    ['is_root_goal', 'INTEGER'],
    ['is_system_task', 'INTEGER'],
    ['motivation', 'TEXT'],
    ['success_criteria', 'TEXT'],
    ['target_date', 'TEXT'],
    ['repeat_rule', 'TEXT'],
  ];
  for (const [col, type] of todoColumns) {
    try { expoDb.execSync(`ALTER TABLE todos ADD COLUMN ${col} ${type}`); } catch (e: any) { if (!String(e).includes('duplicate column')) console.warn(`[db] ALTER todos ${col}:`, e?.message); }
  }
}

export { schema };
