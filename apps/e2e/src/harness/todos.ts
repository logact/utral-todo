import { eq } from 'drizzle-orm';
import { todos } from '@utral/db-schema';
import { newHLC, type HLCTimestamp } from '@utral/sync-share';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export type Db = BetterSQLite3Database<Record<string, unknown>>;

export interface InsertTodoArgs {
  id: string;
  title: string;
  /** HLC node id — usually the writing client's deviceId. */
  node: string;
  /** Optional explicit HLC; defaults to a fresh `newHLC(node)`. */
  hlc?: HLCTimestamp;
}

/**
 * Insert a todo row directly into the client's local `todos` table with its HLC
 * version columns populated — the same split-column layout that
 * `createSqliteSyncStorage` reads/writes. This models a local UI write; the test
 * then calls `handler.syncLocalChange('todo', 'create', id)` to enqueue + push it.
 */
export function insertTodo(db: Db, args: InsertTodoArgs): HLCTimestamp {
  const hlc = args.hlc ?? newHLC(args.node);
  db.insert(todos)
    .values({
      id: args.id,
      title: args.title,
      nodeType: 'task',
      createdAtWall: hlc.wall,
      createdAtCounter: hlc.counter,
      createdAtNode: hlc.node,
      updatedAtWall: hlc.wall,
      updatedAtCounter: hlc.counter,
      updatedAtNode: hlc.node,
      isDeleted: false,
    })
    .run();
  return hlc;
}

/** Overwrite a todo's title and bump its `updatedAt` HLC (models a local edit). */
export function updateTodoTitle(db: Db, id: string, title: string, node: string): HLCTimestamp {
  const hlc = newHLC(node);
  db.update(todos)
    .set({
      title,
      updatedAtWall: hlc.wall,
      updatedAtCounter: hlc.counter,
      updatedAtNode: hlc.node,
    })
    .where(eq(todos.id, id))
    .run();
  return hlc;
}

/**
 * Soft-delete a todo locally: set the tombstone and bump its `updatedAt` HLC —
 * the same shape a real local delete produces before `syncLocalChange('todo',
 * 'delete', id)` pushes it. LWW needs the newer HLC so the tombstone wins on the
 * receiving side.
 */
export function softDeleteTodo(db: Db, id: string, node: string): HLCTimestamp {
  const hlc = newHLC(node);
  db.update(todos)
    .set({
      isDeleted: true,
      updatedAtWall: hlc.wall,
      updatedAtCounter: hlc.counter,
      updatedAtNode: hlc.node,
    })
    .where(eq(todos.id, id))
    .run();
  return hlc;
}

export interface TodoRow {
  id: string;
  title: string;
  isDeleted: boolean;
}

export function getTodo(db: Db, id: string): TodoRow | undefined {
  const rows = db
    .select({ id: todos.id, title: todos.title, isDeleted: todos.isDeleted })
    .from(todos)
    .where(eq(todos.id, id))
    .all();
  return rows[0];
}
