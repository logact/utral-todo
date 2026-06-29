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

function convertParams(params: unknown[]): unknown[] {
  return params.map(p => {
    if (p instanceof Date) {
      return p.getTime();
    }
    if (p === null || p === undefined) {
      return null;
    }
    return p;
  });
}

async function proxyCallback(
  sql: string,
  params: unknown[],
  method: 'run' | 'all' | 'get' | 'values'
): Promise<{ rows: unknown[][] }> {
  const database = await getTauriDb();
  const convertedParams = convertParams(params);

  if (method === 'run') {
    const result = await database.execute(sql, convertedParams as string[]);
    return { rows: [[result.rowsAffected]] };
  }

  const rows = await database.select(sql, convertedParams as string[]);

  if (method === 'get') {
    const rowArr = rows as Record<string, unknown>[];
    return { rows: rowArr.length > 0 ? [Object.values(rowArr[0])] : [] };
  }

  const allRows = rows as Record<string, unknown>[];
  return { rows: allRows.map((r) => Object.values(r)) };
}

export const db = drizzle(proxyCallback, { schema });

const migrationModules = import.meta.glob('../../drizzle/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const journal: { entries: { idx: number; tag: string }[] } = await import(
  '../../drizzle/meta/_journal.json',
  { with: { type: 'json' } }
).then((m) => m.default);

export async function initDatabase() {
  const database = await getTauriDb();

  await database.execute(`
    CREATE TABLE IF NOT EXISTS _drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = (await database.select(
    'SELECT tag FROM _drizzle_migrations ORDER BY id',
  )) as { tag: string }[];
  const appliedSet = new Set(applied.map((r) => r.tag));

  for (const entry of journal.entries) {
    if (appliedSet.has(entry.tag)) continue;
    const path = `../../drizzle/${entry.tag}.sql`;
    const sql = migrationModules[path];
    if (!sql) continue;
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await database.execute(stmt);
    }
    await database.execute(
      `INSERT INTO _drizzle_migrations (tag) VALUES (?)`,
      [entry.tag],
    );
  }
}
