import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The client SQLite schema is owned by the desktop Drizzle migrations, which are
// generated from the shared `@utral/db-schema` schema. Rather than duplicate the
// DDL, we replay those migration SQL files into a fresh in-memory database so the
// test client's tables (domain + sync infra: sync_queue / sync_state / split HLC
// columns) match exactly what `createSqliteSyncStorage` expects.
const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '../../../desktop/drizzle',
);

/** Apply the desktop Drizzle migrations to a better-sqlite3 database. */
export function migrate(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Drizzle separates statements with a `--> statement-breakpoint` comment.
    // Split on it and run each statement; empty chunks are skipped.
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      db.exec(statement);
    }
  }
}
