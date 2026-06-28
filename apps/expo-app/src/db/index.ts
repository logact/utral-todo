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
      node_type TEXT NOT NULL DEFAULT 'task',
      pattern TEXT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      goal_status TEXT,
      estimated_minutes INTEGER NOT NULL DEFAULT 60,
      scheduled_date INTEGER,
      scheduled_end_date INTEGER,
      due_date INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      parent_id TEXT,
      active_plan_id TEXT,
      is_root_goal INTEGER,
      is_system_task INTEGER,
      motivation TEXT,
      success_criteria TEXT,
      target_date INTEGER,
      repeat_rule TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at_wall INTEGER,
      created_at_counter INTEGER NOT NULL DEFAULT 0,
      created_at_node TEXT,
      updated_at_wall INTEGER,
      updated_at_counter INTEGER NOT NULL DEFAULT 0,
      updated_at_node TEXT,
      deleted_at_wall INTEGER,
      deleted_at_counter INTEGER,
      deleted_at_node TEXT
    );

    CREATE TABLE IF NOT EXISTS todo_relations (
      id TEXT PRIMARY KEY,
      from_todo_id TEXT NOT NULL,
      to_todo_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at_wall INTEGER,
      created_at_counter INTEGER NOT NULL DEFAULT 0,
      created_at_node TEXT,
      updated_at_wall INTEGER,
      updated_at_counter INTEGER NOT NULL DEFAULT 0,
      updated_at_node TEXT,
      deleted_at_wall INTEGER,
      deleted_at_counter INTEGER,
      deleted_at_node TEXT
    );

    CREATE TABLE IF NOT EXISTS todo_logs (
      id TEXT PRIMARY KEY,
      todo_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      minutes_spent INTEGER,
      metadata TEXT,
      created_at_wall INTEGER,
      created_at_counter INTEGER NOT NULL DEFAULT 0,
      created_at_node TEXT,
      updated_at_wall INTEGER,
      updated_at_counter INTEGER NOT NULL DEFAULT 0,
      updated_at_node TEXT,
      deleted_at_wall INTEGER,
      deleted_at_counter INTEGER,
      deleted_at_node TEXT
    );

    CREATE TABLE IF NOT EXISTS action_edges (
      id TEXT PRIMARY KEY,
      from_todo_id TEXT NOT NULL,
      to_todo_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at_wall INTEGER,
      created_at_counter INTEGER NOT NULL DEFAULT 0,
      created_at_node TEXT,
      updated_at_wall INTEGER,
      updated_at_counter INTEGER NOT NULL DEFAULT 0,
      updated_at_node TEXT,
      deleted_at_wall INTEGER,
      deleted_at_counter INTEGER,
      deleted_at_node TEXT
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      goal_todo_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Untitled Plan',
      node_ids TEXT NOT NULL DEFAULT '[]',
      edge_ids TEXT NOT NULL DEFAULT '[]',
      is_system_plan INTEGER,
      created_at_wall INTEGER,
      created_at_counter INTEGER NOT NULL DEFAULT 0,
      created_at_node TEXT,
      updated_at_wall INTEGER,
      updated_at_counter INTEGER NOT NULL DEFAULT 0,
      updated_at_node TEXT,
      deleted_at_wall INTEGER,
      deleted_at_counter INTEGER,
      deleted_at_node TEXT
    );

    CREATE TABLE IF NOT EXISTS pluses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Untitled Pluse',
      description TEXT NOT NULL DEFAULT '',
      intervals TEXT NOT NULL DEFAULT '[1500]',
      repeat_count INTEGER NOT NULL DEFAULT 1,
      interval_todos TEXT,
      auto_advance INTEGER NOT NULL DEFAULT 1,
      timer_status TEXT NOT NULL DEFAULT 'idle',
      current_interval_index INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      accumulated_seconds INTEGER NOT NULL DEFAULT 0,
      created_at_wall INTEGER,
      created_at_counter INTEGER NOT NULL DEFAULT 0,
      created_at_node TEXT,
      updated_at_wall INTEGER,
      updated_at_counter INTEGER NOT NULL DEFAULT 0,
      updated_at_node TEXT,
      deleted_at_wall INTEGER,
      deleted_at_counter INTEGER,
      deleted_at_node TEXT
    );

    CREATE TABLE IF NOT EXISTS repeat_occurrences (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      date INTEGER NOT NULL,
      status TEXT,
      completed_at INTEGER,
      materialized_todo_id TEXT,
      created_at_wall INTEGER,
      created_at_counter INTEGER NOT NULL DEFAULT 0,
      created_at_node TEXT,
      updated_at_wall INTEGER,
      updated_at_counter INTEGER NOT NULL DEFAULT 0,
      updated_at_node TEXT,
      deleted_at_wall INTEGER,
      deleted_at_counter INTEGER,
      deleted_at_node TEXT
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
