import { Router } from 'express';
import { eq, and, inArray, or } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logChange } from '../sync/log.js';

const router = Router();

const ROAD_TO_GOAL_TYPES = new Set(['parent_of', 'achieves', 'ordered_before']);

async function validateRelationType(
  type: string,
  fromTodoId: string,
  toTodoId: string
): Promise<string | undefined> {
  const fromRows = await db.select().from(schema.todo).where(eq(schema.todo.id, fromTodoId)).limit(1);
  const toRows = await db.select().from(schema.todo).where(eq(schema.todo.id, toTodoId)).limit(1);
  const fromTodo = fromRows[0];
  const toTodo = toRows[0];

  if (!fromTodo || !toTodo) return 'One or both todos do not exist';

  switch (type) {
    case 'parent_of':
      if (fromTodo.nodeType !== 'goal' || toTodo.nodeType !== 'goal') {
        return 'parent_of relation must connect goal -> goal';
      }
      break;
    case 'achieves':
      if (fromTodo.nodeType !== 'task' || toTodo.nodeType !== 'goal') {
        return 'achieves relation must connect task -> goal';
      }
      break;
    case 'ordered_before':
      if (fromTodo.nodeType !== toTodo.nodeType) {
        return 'ordered_before relation must connect nodes of the same type (goal->goal or task->task)';
      }
      if (fromTodo.nodeType !== 'goal' && fromTodo.nodeType !== 'task') {
        return 'ordered_before relation must connect goal->goal or task->task';
      }
      break;
    case 'depends_on':
    case 'blocked_by':
      if (fromTodo.nodeType !== 'task' || toTodo.nodeType !== 'task') {
        return `${type} relation must connect task -> task`;
      }
      break;
    case 'source_from':
      if (fromTodo.nodeType !== 'goal' || toTodo.nodeType !== 'goal') {
        return 'source_from relation must connect goal -> goal';
      }
      break;
    case 'assign_from':
      if (toTodo.nodeType !== 'task') {
        return 'assign_from relation must point to a task';
      }
      break;
  }

  return undefined;
}

router.get('/', async (_req, res) => {
  const relations = await db.select().from(schema.todoRelation);
  res.json(relations);
});

router.post('/', async (req, res) => {
  const { fromTodoId, toTodoId, type } = req.body;
  if (fromTodoId === toTodoId) {
    return res.status(400).json({ error: 'Cannot create a relation from a todo to itself' });
  }

  const validationError = await validateRelationType(type, fromTodoId, toTodoId);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const existingRows = await db.select().from(schema.todoRelation).where(
    and(
      eq(schema.todoRelation.fromTodoId, fromTodoId),
      eq(schema.todoRelation.toTodoId, toTodoId),
      eq(schema.todoRelation.type, type)
    )
  ).limit(1);
  if (existingRows[0]) {
    return res.status(409).json({ error: 'This relation already exists' });
  }
  const relation = (await db.insert(schema.todoRelation).values({ fromTodoId, toTodoId, type }).returning())[0];
  await logChange(req, 'todoRelation', 'create', relation.id, relation);
  res.status(201).json(relation);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await db.delete(schema.todoRelation).where(eq(schema.todoRelation.id, id));
  await logChange(req, 'todoRelation', 'delete', id);
  res.status(204).send();
});

// Source chain: walks parent_of / source_from relations backward for goals,
// and achieves relations backward for tasks.
router.get('/source-chain/:id', async (req, res) => {
  const chain: Array<{
    id: string; parentId: string | null; title: string;
    description: string; status: string | null; priority: string | null; estimatedMinutes: number | null;
    tags: unknown; createdAt: Date; dueDate: Date | null; scheduledDate: Date | null;
    completedAt: Date | null; repeatRule: unknown | null;
  }> = [];
  const visited = new Set<string>();
  let currentId = req.params.id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todoRows = await db.select().from(schema.todo).where(eq(schema.todo.id, currentId)).limit(1);
    const todo = todoRows[0];
    if (!todo) break;

    chain.unshift(todo);

    if (todo.nodeType === 'goal') {
      const incomingParentRows = await db.select().from(schema.todoRelation).where(
        and(
          eq(schema.todoRelation.toTodoId, currentId),
          inArray(schema.todoRelation.type, ['parent_of', 'source_from'])
        )
      ).limit(1);
      const incomingParent = incomingParentRows[0];
      currentId = incomingParent?.fromTodoId ?? '';
    } else if (todo.nodeType === 'task') {
      const incomingAchievesRows = await db.select().from(schema.todoRelation).where(
        and(
          eq(schema.todoRelation.toTodoId, currentId),
          eq(schema.todoRelation.type, 'achieves')
        )
      ).limit(1);
      const incomingAchieves = incomingAchievesRows[0];
      currentId = incomingAchieves?.fromTodoId ?? '';
    } else {
      break;
    }
  }

  res.json(chain);
});

// Road to Goal: all relations relevant to the new model for a given todo.
router.get('/road-to-goal/:id', async (req, res) => {
  const todoId = req.params.id;
  const todoRows = await db.select().from(schema.todo).where(eq(schema.todo.id, todoId)).limit(1);
  const todo = todoRows[0];
  if (!todo) return res.status(404).json({ error: 'Todo not found' });

  const relevantTypes = ['parent_of', 'source_from', 'achieves', 'ordered_before'];
  const all = await db.select().from(schema.todoRelation).where(
    and(
      inArray(schema.todoRelation.type, relevantTypes),
      or(
        eq(schema.todoRelation.fromTodoId, todoId),
        eq(schema.todoRelation.toTodoId, todoId)
      )
    )
  );

  const connectedIds = new Set<string>([todoId]);
  for (const rel of all) {
    connectedIds.add(rel.fromTodoId);
    connectedIds.add(rel.toTodoId);
  }

  // For goals, also include parentId hierarchy
  if (todo.nodeType === 'goal' && todo.parentId) {
    connectedIds.add(todo.parentId);
  }

  const todos = await db.select().from(schema.todo).where(
    inArray(schema.todo.id, Array.from(connectedIds))
  );

  res.json({ todo, todos, relations: all });
});

export default router;
