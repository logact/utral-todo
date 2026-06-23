import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

const DATABASE_NAME = 'utral-todo.db';

const expoDb = openDatabaseSync(DATABASE_NAME);
export const db = drizzle(expoDb, { schema });

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
}

export { schema };
