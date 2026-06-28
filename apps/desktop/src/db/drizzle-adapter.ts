import Database from '@tauri-apps/plugin-sql';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

let tauriDb: Database | null = null;

async function getTauriDb(): Promise<Database> {
  if (!tauriDb) {
    tauriDb = await Database.load('sqlite:utral-todo.db');
  }
  return tauriDb;
}

async function proxyCallback(
  sql: string,
  params: unknown[],
  method: 'run' | 'all' | 'get' | 'values'
): Promise<{ rows: unknown[][] }> {
  const database = await getTauriDb();

  if (method === 'run') {
    const result = await database.execute(sql, params as string[]);
    return { rows: [[result.rowsAffected]] };
  }

  const rows = await database.select(sql, params as string[]);

  if (method === 'get') {
    const rowArr = rows as Record<string, unknown>[];
    return { rows: rowArr.length > 0 ? [Object.values(rowArr[0])] : [] };
  }

  const allRows = rows as Record<string, unknown>[];
  return { rows: allRows.map((r) => Object.values(r)) };
}

export const db = drizzle(proxyCallback, { schema });

export async function initDatabase() {
  const database = await getTauriDb();

  await database.execute(`
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

    CREATE TABLE IF NOT EXISTS hlc_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS todos_node_type_idx ON todos(node_type);
    CREATE INDEX IF NOT EXISTS todos_pattern_idx ON todos(pattern);
    CREATE INDEX IF NOT EXISTS todos_parent_id_idx ON todos(parent_id);
    CREATE INDEX IF NOT EXISTS todos_status_idx ON todos(status);
    CREATE INDEX IF NOT EXISTS todos_scheduled_date_idx ON todos(scheduled_date);
    CREATE INDEX IF NOT EXISTS todos_due_date_idx ON todos(due_date);
    CREATE INDEX IF NOT EXISTS todos_created_at_idx ON todos(created_at_wall);
    CREATE INDEX IF NOT EXISTS todos_updated_at_idx ON todos(updated_at_wall);
    CREATE INDEX IF NOT EXISTS todos_order_idx ON todos("order");
    CREATE INDEX IF NOT EXISTS todos_started_at_idx ON todos(started_at);
    CREATE INDEX IF NOT EXISTS todos_status_scheduled_idx ON todos(status, scheduled_date);

    CREATE INDEX IF NOT EXISTS todo_relations_from_idx ON todo_relations(from_todo_id);
    CREATE INDEX IF NOT EXISTS todo_relations_to_idx ON todo_relations(to_todo_id);
    CREATE INDEX IF NOT EXISTS todo_relations_type_idx ON todo_relations(type);
    CREATE INDEX IF NOT EXISTS todo_relations_created_at_idx ON todo_relations(created_at_wall);
    CREATE INDEX IF NOT EXISTS todo_relations_updated_at_idx ON todo_relations(updated_at_wall);

    CREATE INDEX IF NOT EXISTS todo_logs_todo_id_idx ON todo_logs(todo_id);
    CREATE INDEX IF NOT EXISTS todo_logs_type_idx ON todo_logs(type);
    CREATE INDEX IF NOT EXISTS todo_logs_created_at_idx ON todo_logs(created_at_wall);
    CREATE INDEX IF NOT EXISTS todo_logs_updated_at_idx ON todo_logs(updated_at_wall);

    CREATE INDEX IF NOT EXISTS action_edges_from_idx ON action_edges(from_todo_id);
    CREATE INDEX IF NOT EXISTS action_edges_to_idx ON action_edges(to_todo_id);
    CREATE INDEX IF NOT EXISTS action_edges_type_idx ON action_edges(type);
    CREATE INDEX IF NOT EXISTS action_edges_created_at_idx ON action_edges(created_at_wall);
    CREATE INDEX IF NOT EXISTS action_edges_updated_at_idx ON action_edges(updated_at_wall);

    CREATE INDEX IF NOT EXISTS plans_goal_todo_id_idx ON plans(goal_todo_id);
    CREATE INDEX IF NOT EXISTS plans_updated_at_idx ON plans(updated_at_wall);

    CREATE INDEX IF NOT EXISTS pluses_created_at_idx ON pluses(created_at_wall);
    CREATE INDEX IF NOT EXISTS pluses_updated_at_idx ON pluses(updated_at_wall);
    CREATE INDEX IF NOT EXISTS pluses_timer_status_idx ON pluses(timer_status);

    CREATE INDEX IF NOT EXISTS repeat_occurrences_template_id_idx ON repeat_occurrences(template_id);
    CREATE INDEX IF NOT EXISTS repeat_occurrences_date_idx ON repeat_occurrences(date);
  `);
}
