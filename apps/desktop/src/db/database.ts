import { db, initDatabase } from './drizzle-adapter';
import { todos, todoRelations, todoLogs, actionEdges, plans, pluses, repeatOccurrences, hlcState, syncConfig } from './schema';
import { eq } from 'drizzle-orm';

export { db, initDatabase };

export async function clearAllData(): Promise<void> {
  await db.delete(todos);
  await db.delete(todoRelations);
  await db.delete(todoLogs);
  await db.delete(actionEdges);
  await db.delete(plans);
  await db.delete(pluses);
  await db.delete(repeatOccurrences);
  await db.delete(hlcState);
  await db.delete(syncConfig);
}

export async function garbageCollectTombstones(): Promise<void> {
  const tables = [todos, todoRelations, todoLogs, actionEdges, plans, pluses, repeatOccurrences] as const;

  for (const table of tables) {
    await db.delete(table).where(
      eq(table.isDeleted, true)
    );
  }
}

export { todos as todoTable } from './schema';
export type { Todo, TodoRelation, TodoLog, ActionEdge, Plan, Pluse, RepeatOccurrence } from './schema';
