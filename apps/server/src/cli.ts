import { eq, ne, and, or, isNotNull, lt, gte, desc, asc, sql } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

// ─── Global State ───────────────────────────────────────────────────────────

let outputFormat: 'json' | 'table' | 'csv' = 'table';
let fieldsFilter: string[] | null = null;
let quietMode = false;
let limitResults: number | null = null;

// ─── Output Formatters ──────────────────────────────────────────────────────

function setOutputFormat(format: string) {
  if (format === 'json' || format === 'table' || format === 'csv') {
    outputFormat = format;
  }
}

function setFieldsFilter(fields: string) {
  fieldsFilter = fields.split(',').map((f) => f.trim()).filter(Boolean);
}

function applyFieldsFilter(row: Record<string, unknown>): Record<string, unknown> {
  if (!fieldsFilter) return row;
  const out: Record<string, unknown> = {};
  for (const f of fieldsFilter) {
    out[f] = row[f];
  }
  return out;
}

function applyLimit<T>(rows: T[]): T[] {
  if (limitResults && limitResults > 0) return rows.slice(0, limitResults);
  return rows;
}

function printOutput(data: unknown) {
  if (quietMode && outputFormat !== 'json') return;

  if (outputFormat === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (outputFormat === 'csv') {
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      printCsv(data as Record<string, unknown>[]);
    } else {
      console.log(String(data));
    }
    return;
  }

  // table format
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('(no results)');
      return;
    }
    if (typeof data[0] === 'object') {
      printTable((data as Record<string, unknown>[]).map(applyFieldsFilter));
    } else {
      for (const item of data) console.log(String(item));
    }
  } else if (typeof data === 'object' && data !== null) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(String(data));
  }
}

function printTable(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    console.log('(no results)');
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)),
  );
  const pad = (s: string, w: number) => s.padEnd(w, ' ');
  const line = widths.map((w) => '-'.repeat(w + 2)).join('+');
  console.log('+' + line + '+');
  console.log(
    '| ' + keys.map((k, i) => pad(k, widths[i])).join(' | ') + ' |',
  );
  console.log('+' + line + '+');
  for (const row of rows) {
    console.log(
      '| ' +
        keys.map((k, i) => pad(String(row[k] ?? ''), widths[i])).join(' | ') +
        ' |',
    );
  }
  console.log('+' + line + '+');
}

function printCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  console.log(keys.join(','));
  for (const row of rows) {
    console.log(
      keys
        .map((k) => {
          const val = String(row[k] ?? '');
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        })
        .join(','),
    );
  }
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

// ─── Argument Parsing ───────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 2) {
        const k = arg.slice(2, eq);
        let v = arg.slice(eq + 1);
        // unquote if wrapped in quotes
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        out[k] = v;
      } else {
        out[arg.slice(2)] = true;
      }
    }
  }
  return out;
}

function extractGlobalFlags(args: Record<string, string | boolean>) {
  if (args.format) setOutputFormat(String(args.format));
  if (args.fields) setFieldsFilter(String(args.fields));
  if (args.quiet) quietMode = true;
  if (args.limit) limitResults = Number(args.limit);
}

function removeGlobalFlags(args: Record<string, string | boolean>) {
  const { format, fields, quiet, limit, ...rest } = args;
  return rest;
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  const da = new Date(a);
  const dbDate = new Date(b);
  return (
    da.getDate() === dbDate.getDate() &&
    da.getMonth() === dbDate.getMonth() &&
    da.getFullYear() === dbDate.getFullYear()
  );
}

// ─── Todos ──────────────────────────────────────────────────────────────────

async function listTodos(args: Record<string, string | boolean>) {
  const conditions = [];
  if (args.status) conditions.push(eq(schema.todo.status, String(args.status)));
  if (args.priority) conditions.push(eq(schema.todo.priority, String(args.priority)));
  if (args.parentId) conditions.push(eq(schema.todo.parentId, String(args.parentId)));

  const baseQuery = conditions.length > 0
    ? db.select().from(schema.todo).where(and(...conditions)).orderBy(schema.todo.order)
    : db.select().from(schema.todo).orderBy(schema.todo.order);

  if (args.tag) {
    const all = await baseQuery;
    const filtered = all.filter((t) => {
      const tags = t.tags as string[];
      return tags.includes(String(args.tag));
    });
    printOutput(
      applyLimit(filtered).map((r) =>
        pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate']),
      ),
    );
    return;
  }

  const rows = await baseQuery;
  printOutput(
    applyLimit(rows).map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate']),
    ),
  );
}

async function getTodo(id: string) {
  const row = (await db.select().from(schema.todo).where(eq(schema.todo.id, id)).limit(1))[0];
  if (!row) return fail('Todo not found');
  const logs = await db.select().from(schema.todoLog).where(eq(schema.todoLog.todoId, id));
  printOutput({ ...row, logs });
}

async function createTodo(args: Record<string, string | boolean>) {
  const maxResult = (await db.select({ max: sql<number>`max(${schema.todo.order})` }).from(schema.todo))[0]?.max ?? 0;
  const finalOrder = (maxResult ?? 0) + 1;

  const data = {
    title: String(args.title ?? 'Untitled'),
    description: String(args.description ?? ''),
    status: 'pending',
    priority: String(args.priority ?? 'medium'),
    estimatedMinutes: args.estimatedMinutes ? Number(args.estimatedMinutes) : 60,
    tags: args.tags ? (Array.isArray(args.tags) ? (args.tags as string[]) : String(args.tags).split(',').map((t) => t.trim())) : [],
    parentId: args.parentId ? String(args.parentId) : null,
    dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
    scheduledDate: args.scheduledDate ? new Date(String(args.scheduledDate)) : null,
    repeatRule: args.repeatRule ? JSON.parse(String(args.repeatRule)) : null,
    order: args.order ? Number(args.order) : finalOrder,
    nodeType: args.nodeType === 'goal' || args.nodeType === 'goal' ? 'goal' : 'todo',
  };

  const todo = (await db.insert(schema.todo).values(data as typeof schema.todo.$inferInsert).returning())[0];

  if (!quietMode) console.log('Created todo:', todo.id);
  printOutput(todo);
}

async function updateTodo(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.title !== undefined) data.title = String(args.title);
  if (args.description !== undefined) data.description = String(args.description);
  if (args.priority !== undefined) data.priority = String(args.priority);
  if (args.parentId !== undefined) data.parentId = String(args.parentId) || null;
  if (args.dueDate !== undefined) data.dueDate = args.dueDate ? new Date(String(args.dueDate)) : null;
  if (args.estimatedMinutes !== undefined) data.estimatedMinutes = Number(args.estimatedMinutes);
  if (args.tags !== undefined) {
    data.tags = String(args.tags).split(',').map((t) => t.trim());
  }
  if (args.repeatRule !== undefined) data.repeatRule = args.repeatRule ? JSON.parse(String(args.repeatRule)) : null;
  if (args.nodeType !== undefined) data.nodeType = String(args.nodeType);
  if (args.order !== undefined) data.order = Number(args.order);

  const todo = (await db.update(schema.todo).set(data).where(eq(schema.todo.id, id)).returning())[0];

  if (!quietMode) console.log('Updated todo:', todo.id);
  printOutput(todo);
}

async function deleteTodo(id: string) {
  // Delete assigned instances first
  const assignedRelations = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, id), eq(schema.todoRelation.type, 'assign_from')));
  for (const rel of assignedRelations) {
    await db.delete(schema.todo).where(eq(schema.todo.id, rel.toTodoId));
  }
  await db.delete(schema.todo).where(eq(schema.todo.id, id));
  if (!quietMode) console.log('Deleted todo:', id);
}

async function setTodoStatus(id: string, args: Record<string, string | boolean>) {
  const status = String(args.status ?? args._positional ?? '');
  if (!['pending', 'in_progress', 'done'].includes(status)) {
    return fail('Status must be one of: pending, in_progress, done');
  }
  const data: Record<string, unknown> = { status };
  if (status === 'in_progress') data.startedAt = new Date();
  if (status === 'pending') data.startedAt = null;
  if (status === 'done') data.completedAt = new Date();
  const todo = (await db.update(schema.todo).set(data).where(eq(schema.todo.id, id)).returning())[0];
  if (!quietMode) console.log(`Status updated to ${status}:`, todo.id);
  printOutput(todo);
}

async function scheduleTodo(id: string, args: Record<string, string | boolean>) {
  const date = args.date ? new Date(String(args.date)) : null;
  const todo = (await db.update(schema.todo).set({ scheduledDate: date }).where(eq(schema.todo.id, id)).returning())[0];
  if (!quietMode) console.log(date ? `Scheduled for ${date.toISOString().split('T')[0]}:` : 'Unscheduled:', todo.id);
  printOutput(todo);
}

async function todosToday() {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const rows = await db.select().from(schema.todo)
    .where(and(gte(schema.todo.scheduledDate, today), lt(schema.todo.scheduledDate, tomorrow)))
    .orderBy(schema.todo.order);
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate']),
    ),
  );
}

async function todosUnscheduled() {
  const rows = await db.select().from(schema.todo)
    .where(and(eq(schema.todo.scheduledDate, null as unknown as Date), ne(schema.todo.status, 'done')))
    .orderBy(schema.todo.order);
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate']),
    ),
  );
}

async function todosOverdue() {
  const today = startOfDay(new Date());
  const rows = await db.select().from(schema.todo)
    .where(and(ne(schema.todo.status, 'done'), lt(schema.todo.dueDate, today)))
    .orderBy(schema.todo.order);
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate']),
    ),
  );
}

async function todosInbox() {
  const rows = await db.select().from(schema.todo)
    .where(and(eq(schema.todo.parentId, null as unknown as string), ne(schema.todo.status, 'done')))
    .orderBy(schema.todo.order);
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate']),
    ),
  );
}

async function searchTodos(query: string) {
  const all = await db.select().from(schema.todo).orderBy(schema.todo.order);
  const q = query.toLowerCase();
  const rows = all.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)),
  );
  printOutput(
    applyLimit(rows).map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate']),
    ),
  );
}

async function reorderTodo(id: string, args: Record<string, string | boolean>) {
  const order = Number(args.order ?? args._positional ?? 0);
  const todo = (await db.update(schema.todo).set({ order }).where(eq(schema.todo.id, id)).returning())[0];
  if (!quietMode) console.log('Reordered todo:', todo.id, 'to order', order);
  printOutput(todo);
}

async function bulkReorderTodos(args: Record<string, string | boolean>) {
  const ids = String(args.ids ?? args._positional ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return fail('No ids provided. Use --ids=id1,id2,id3');
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(schema.todo).set({ order: i }).where(eq(schema.todo.id, ids[i]));
    }
  });
  if (!quietMode) console.log('Reordered', ids.length, 'todos');
}

async function getSpawnedTodos(id: string) {
  const relations = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, id), eq(schema.todoRelation.type, 'source_from')));
  const todos = [];
  for (const rel of relations) {
    const todo = (await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1))[0];
    if (todo) todos.push(todo);
  }
  printOutput(todos.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority'])));
}

async function getTodoInstances(id: string) {
  const relations = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, id), eq(schema.todoRelation.type, 'assign_from')));
  const todos = [];
  for (const rel of relations) {
    const todo = (await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1))[0];
    if (todo) todos.push(todo);
  }
  printOutput(todos.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'scheduledDate'])));
}

async function setRepeatRule(id: string, args: Record<string, string | boolean>) {
  const rule = args.rule ? JSON.parse(String(args.rule)) : null;
  const template = (await db.select().from(schema.todo).where(eq(schema.todo.id, id)).limit(1))[0];
  if (!template) return fail('Todo not found');

  await db.update(schema.todo).set({ repeatRule: rule }).where(eq(schema.todo.id, id));

  if (!rule) {
    if (!quietMode) console.log('Repeat rule removed for:', id);
    return;
  }

  // Clean up invalid instances
  const existingInstances = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, id), eq(schema.todoRelation.type, 'assign_from')));
  const typedRule = rule as { type: string; weekDays?: number[]; interval?: number; endDate?: string };
  const ruleEnd = typedRule.endDate ? startOfDay(new Date(typedRule.endDate)) : undefined;

  for (const rel of existingInstances) {
    const instance = (await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1))[0];
    if (!instance || !instance.scheduledDate) continue;

    const date = startOfDay(new Date(instance.scheduledDate));
    let matches = false;

    if (typedRule.type === 'daily') matches = true;
    else if (typedRule.type === 'weekly' && typedRule.weekDays) matches = typedRule.weekDays.includes(date.getDay());
    else if (typedRule.type === 'every_n_days' && typedRule.interval) {
      const anchor = startOfDay(new Date(template.createdAt));
      const daysSinceAnchor = Math.floor((date.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
      matches = daysSinceAnchor >= 0 && daysSinceAnchor % typedRule.interval === 0;
    }

    if (ruleEnd && date > ruleEnd) matches = false;

    if (!matches) {
      await db.delete(schema.todoRelation).where(or(
        eq(schema.todoRelation.fromTodoId, instance.id),
        eq(schema.todoRelation.toTodoId, instance.id),
      ));
      await db.delete(schema.todoLog).where(eq(schema.todoLog.todoId, instance.id));
      await db.delete(schema.todo).where(eq(schema.todo.id, instance.id));
    }
  }

  if (!quietMode) console.log('Repeat rule updated for:', id);
}

async function syncRepeatTodos(args: Record<string, string | boolean>) {
  const startDate = new Date(String(args.startDate ?? args._positional ?? new Date()));
  const endDate = new Date(String(args.endDate ?? args._positional2 ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));

  const templates = await db.select().from(schema.todo).where(isNotNull(schema.todo.repeatRule));

  let createdCount = 0;
  const start = startOfDay(startDate);
  const rangeEnd = startOfDay(endDate);

  for (const template of templates) {
    if (!template.repeatRule) continue;
    const rule = template.repeatRule as { type: string; weekDays?: number[]; interval?: number; endDate?: string };
    const ruleEnd = rule.endDate ? startOfDay(new Date(rule.endDate)) : undefined;

    const targetDates: Date[] = [];
    const current = new Date(start);
    while (current <= rangeEnd) {
      let shouldInclude = false;
      if (rule.type === 'daily') shouldInclude = true;
      else if (rule.type === 'weekly' && rule.weekDays) shouldInclude = rule.weekDays.includes(current.getDay());
      else if (rule.type === 'every_n_days' && rule.interval) {
        const anchor = startOfDay(new Date(template.createdAt));
        const daysSinceAnchor = Math.floor((current.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
        shouldInclude = daysSinceAnchor >= 0 && daysSinceAnchor % rule.interval === 0;
      }
      if (shouldInclude && (!ruleEnd || current <= ruleEnd)) targetDates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    const existingInstances = await db.select().from(schema.todoRelation)
      .where(and(eq(schema.todoRelation.fromTodoId, template.id), eq(schema.todoRelation.type, 'assign_from')));
    const instanceTodos = [];
    for (const rel of existingInstances) {
      const todo = (await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1))[0];
      if (todo) instanceTodos.push(todo);
    }

    for (const date of targetDates) {
      const hasInstance = instanceTodos.some((inst) => inst.scheduledDate && isSameDay(new Date(inst.scheduledDate), date));
      if (!hasInstance) {
        const instance = (await db.insert(schema.todo).values({
          title: template.title,
          description: template.description,
          priority: template.priority,
          estimatedMinutes: template.estimatedMinutes,
          tags: template.tags as string[],
          scheduledDate: date,
          status: 'pending',
          order: 0,
        }).returning())[0];
        await db.insert(schema.todoRelation).values({
          fromTodoId: template.id,
          toTodoId: instance.id,
          type: 'assign_from',
        });
        createdCount++;
      }
    }
  }

  if (!quietMode) console.log('Created', createdCount, 'repeat instances');
  printOutput({ createdCount });
}

// ─── Relations ──────────────────────────────────────────────────────────────

async function listRelations(args: Record<string, string | boolean>) {
  const conditions = [];
  if (args.fromTodoId) conditions.push(eq(schema.todoRelation.fromTodoId, String(args.fromTodoId)));
  if (args.toTodoId) conditions.push(eq(schema.todoRelation.toTodoId, String(args.toTodoId)));
  if (args.type) conditions.push(eq(schema.todoRelation.type, String(args.type)));

  const baseQuery = conditions.length > 0
    ? db.select().from(schema.todoRelation).where(and(...conditions)).orderBy(desc(schema.todoRelation.createdAt))
    : db.select().from(schema.todoRelation).orderBy(desc(schema.todoRelation.createdAt));

  const rows = await baseQuery;
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function createRelation(args: Record<string, string | boolean>) {
  const fromTodoId = String(args.fromTodoId ?? '');
  const toTodoId = String(args.toTodoId ?? '');
  const type = String(args.type ?? 'depends_on');
  if (!fromTodoId || !toTodoId) return fail('fromTodoId and toTodoId are required');
  if (fromTodoId === toTodoId) return fail('Cannot create a relation from a todo to itself');

  const existing = (await db.select().from(schema.todoRelation).where(
    and(eq(schema.todoRelation.fromTodoId, fromTodoId), eq(schema.todoRelation.toTodoId, toTodoId), eq(schema.todoRelation.type, type))
  ).limit(1))[0];
  if (existing) return fail('This relation already exists');

  const relation = (await db.insert(schema.todoRelation).values({ fromTodoId, toTodoId, type }).returning())[0];
  if (!quietMode) console.log('Created relation:', relation.id);
  printOutput(relation);
}

async function deleteRelation(id: string) {
  await db.delete(schema.todoRelation).where(eq(schema.todoRelation.id, id));
  if (!quietMode) console.log('Deleted relation:', id);
}

async function sourceChain(id: string) {
  const chain: Array<Record<string, unknown>> = [];
  const visited = new Set<string>();
  let currentId = id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todo = (await db.select().from(schema.todo).where(eq(schema.todo.id, currentId)).limit(1))[0];
    if (!todo) break;
    const incomingSource = (await db.select().from(schema.todoRelation).where(
      and(eq(schema.todoRelation.toTodoId, currentId), eq(schema.todoRelation.type, 'source_from'))
    ).limit(1))[0];
    chain.unshift(todo as unknown as Record<string, unknown>);
    currentId = incomingSource?.fromTodoId ?? '';
  }

  printOutput(chain.map((r) => pick(r, ['id', 'title', 'status', 'priority'])));
}

// ─── Todo Logs ──────────────────────────────────────────────────────────────

async function listTodoLogs(args: Record<string, string | boolean>) {
  const conditions = [];
  if (args.todoId) conditions.push(eq(schema.todoLog.todoId, String(args.todoId)));
  if (args.type) conditions.push(eq(schema.todoLog.type, String(args.type)));

  const baseQuery = conditions.length > 0
    ? db.select().from(schema.todoLog).where(and(...conditions)).orderBy(schema.todoLog.createdAt)
    : db.select().from(schema.todoLog).orderBy(schema.todoLog.createdAt);

  const rows = await baseQuery;
  printOutput(
    applyLimit(rows).map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'todoId', 'type', 'content', 'minutesSpent', 'createdAt'])),
  );
}

async function createTodoLog(args: Record<string, string | boolean>) {
  const log = (await db.insert(schema.todoLog).values({
    todoId: String(args.todoId ?? ''),
    type: String(args.type ?? 'thought'),
    content: String(args.content ?? ''),
    minutesSpent: args.minutesSpent ? Number(args.minutesSpent) : null,
    metadata: args.metadata ? JSON.parse(String(args.metadata)) : null,
  }).returning())[0];
  if (!quietMode) console.log('Created todo log:', log.id);
  printOutput(log);
}

async function deleteTodoLog(id: string) {
  await db.delete(schema.todoLog).where(eq(schema.todoLog.id, id));
  if (!quietMode) console.log('Deleted todo log:', id);
}

// ─── Action Edges ───────────────────────────────────────────────────────────

async function listActionEdges() {
  const rows = await db.select().from(schema.actionEdge).orderBy(desc(schema.actionEdge.createdAt));
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function createActionEdge(args: Record<string, string | boolean>) {
  const fromTodoId = String(args.fromTodoId ?? '');
  const toTodoId = String(args.toTodoId ?? '');
  const type = String(args.type ?? 'pre_do');
  if (!fromTodoId || !toTodoId) return fail('fromTodoId and toTodoId are required');
  if (fromTodoId === toTodoId) return fail('Cannot create an edge from a todo to itself');

  const existing = (await db.select().from(schema.actionEdge).where(
    and(eq(schema.actionEdge.fromTodoId, fromTodoId), eq(schema.actionEdge.toTodoId, toTodoId), eq(schema.actionEdge.type, type))
  ).limit(1))[0];
  if (existing) return fail('This edge already exists');

  const edge = (await db.insert(schema.actionEdge).values({ fromTodoId, toTodoId, type }).returning())[0];
  if (!quietMode) console.log('Created action edge:', edge.id);
  printOutput(edge);
}

async function deleteActionEdge(id: string) {
  await db.delete(schema.actionEdge).where(eq(schema.actionEdge.id, id));
  if (!quietMode) console.log('Deleted action edge:', id);
}

async function actionEdgesForTodo(todoId: string) {
  const rows = await db.select().from(schema.actionEdge).where(
    or(eq(schema.actionEdge.fromTodoId, todoId), eq(schema.actionEdge.toTodoId, todoId))
  );
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'fromTodoId', 'toTodoId', 'type'])));
}

// ─── Pluses ─────────────────────────────────────────────────────────────────

async function listPluses() {
  const rows = await db.select().from(schema.pluse).orderBy(desc(schema.pluse.createdAt));
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'name', 'description', 'intervals', 'repeatCount', 'createdAt'])));
}

async function getPluse(id: string) {
  const row = (await db.select().from(schema.pluse).where(eq(schema.pluse.id, id)).limit(1))[0];
  if (!row) return fail('Pluse not found');
  printOutput(row);
}

async function createPluse(args: Record<string, string | boolean>) {
  const row = (await db.insert(schema.pluse).values({
    name: String(args.name ?? 'Untitled'),
    description: String(args.description ?? ''),
    intervals: args.intervals ? JSON.parse(String(args.intervals)) : [1500, 300],
    repeatCount: args.repeatCount ? Number(args.repeatCount) : 1,
    intervalTodos: args.intervalTodos ? JSON.parse(String(args.intervalTodos)) : null,
    autoAdvance: args.autoAdvance === true || args.autoAdvance === 'true',
  }).returning())[0];
  if (!quietMode) console.log('Created pluse:', row.id);
  printOutput(row);
}

async function updatePluse(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.name !== undefined) data.name = String(args.name);
  if (args.description !== undefined) data.description = String(args.description);
  if (args.intervals !== undefined) data.intervals = JSON.parse(String(args.intervals));
  if (args.repeatCount !== undefined) data.repeatCount = Number(args.repeatCount);
  if (args.intervalTodos !== undefined) data.intervalTodos = JSON.parse(String(args.intervalTodos));
  if (args.autoAdvance !== undefined) data.autoAdvance = args.autoAdvance === true || args.autoAdvance === 'true';
  const row = (await db.update(schema.pluse).set(data).where(eq(schema.pluse.id, id)).returning())[0];
  if (!quietMode) console.log('Updated pluse:', row.id);
  printOutput(row);
}

async function deletePluse(id: string) {
  await db.delete(schema.pluse).where(eq(schema.pluse.id, id));
  if (!quietMode) console.log('Deleted pluse:', id);
}

// ─── Timer Sessions ─────────────────────────────────────────────────────────

async function listTimerSessions(args: Record<string, string | boolean>) {
  const conditions = [];
  if (args.status) conditions.push(eq(schema.timerSession.status, String(args.status)));
  if (args.type) conditions.push(eq(schema.timerSession.type, String(args.type)));

  const baseQuery = conditions.length > 0
    ? db.select().from(schema.timerSession).where(and(...conditions)).orderBy(desc(schema.timerSession.createdAt))
    : db.select().from(schema.timerSession).orderBy(desc(schema.timerSession.createdAt));

  const rows = await baseQuery;
  printOutput(
    applyLimit(rows).map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'name', 'type', 'status', 'elapsedSeconds', 'todoId', 'createdAt']),
    ),
  );
}

async function getTimerSession(id: string) {
  const row = (await db.select().from(schema.timerSession).where(eq(schema.timerSession.id, id)).limit(1))[0];
  if (!row) return fail('Timer session not found');
  printOutput(row);
}

async function createTimerSession(args: Record<string, string | boolean>) {
  const row = (await db.insert(schema.timerSession).values({
    type: String(args.type ?? 'stopwatch'),
    name: String(args.name ?? 'Timer Session'),
    pluseId: args.pluseId ? String(args.pluseId) : null,
    todoId: args.todoId ? String(args.todoId) : null,
    intervals: args.intervals ? JSON.parse(String(args.intervals)) : null,
    repeatCount: args.repeatCount ? Number(args.repeatCount) : 1,
    startedAt: args.startedAt ? new Date(String(args.startedAt)) : new Date(),
    status: String(args.status ?? 'running'),
    currentIndex: args.currentIndex ? Number(args.currentIndex) : 0,
    elapsedSeconds: args.elapsedSeconds ? Number(args.elapsedSeconds) : 0,
  }).returning())[0];
  if (!quietMode) console.log('Created timer session:', row.id);
  printOutput(row);
}

async function updateTimerSession(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.name !== undefined) data.name = String(args.name);
  if (args.pluseId !== undefined) data.pluseId = String(args.pluseId) || null;
  if (args.todoId !== undefined) data.todoId = String(args.todoId) || null;
  if (args.intervals !== undefined) data.intervals = JSON.parse(String(args.intervals));
  if (args.repeatCount !== undefined) data.repeatCount = Number(args.repeatCount);
  if (args.startedAt !== undefined) data.startedAt = new Date(String(args.startedAt));
  if (args.pausedAt !== undefined) data.pausedAt = args.pausedAt ? new Date(String(args.pausedAt)) : null;
  if (args.completedAt !== undefined) data.completedAt = args.completedAt ? new Date(String(args.completedAt)) : null;
  if (args.currentIndex !== undefined) data.currentIndex = Number(args.currentIndex);
  if (args.elapsedSeconds !== undefined) data.elapsedSeconds = Number(args.elapsedSeconds);
  if (args.status !== undefined) data.status = String(args.status);
  const row = (await db.update(schema.timerSession).set(data).where(eq(schema.timerSession.id, id)).returning())[0];
  if (!quietMode) console.log('Updated timer session:', row.id);
  printOutput(row);
}

async function startTimerSession(id: string) {
  const row = (await db.update(schema.timerSession).set({ status: 'running', startedAt: new Date(), pausedAt: null }).where(eq(schema.timerSession.id, id)).returning())[0];
  if (!quietMode) console.log('Started timer session:', row.id);
  printOutput(row);
}

async function pauseTimerSession(id: string, args: Record<string, string | boolean>) {
  const elapsed = args.elapsedSeconds ? Number(args.elapsedSeconds) : undefined;
  const data: Record<string, unknown> = { status: 'paused', pausedAt: new Date() };
  if (elapsed !== undefined) data.elapsedSeconds = elapsed;
  const row = (await db.update(schema.timerSession).set(data).where(eq(schema.timerSession.id, id)).returning())[0];
  if (!quietMode) console.log('Paused timer session:', row.id);
  printOutput(row);
}

async function resumeTimerSession(id: string) {
  const row = (await db.update(schema.timerSession).set({ status: 'running', pausedAt: null }).where(eq(schema.timerSession.id, id)).returning())[0];
  if (!quietMode) console.log('Resumed timer session:', row.id);
  printOutput(row);
}

async function stopTimerSession(id: string) {
  const row = (await db.update(schema.timerSession).set({ status: 'completed', completedAt: new Date() }).where(eq(schema.timerSession.id, id)).returning())[0];
  if (!quietMode) console.log('Stopped timer session:', row.id);
  printOutput(row);
}

async function deleteTimerSession(id: string) {
  await db.delete(schema.timerSession).where(eq(schema.timerSession.id, id));
  if (!quietMode) console.log('Deleted timer session:', id);
}

// ─── Devices ────────────────────────────────────────────────────────────────

async function listDevices() {
  const rows = await db.select().from(schema.device).orderBy(desc(schema.device.lastSeenAt));
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'deviceId', 'platform', 'name', 'lastSeenAt'])));
}

async function registerDevice(args: Record<string, string | boolean>) {
  const deviceId = String(args.deviceId ?? '');
  const platform = String(args.platform ?? '');
  if (!deviceId || !platform) return fail('deviceId and platform are required');

  const deviceRow = (await db.insert(schema.device).values({
    deviceId,
    platform,
    name: args.name ? String(args.name) : null,
    pushToken: args.pushToken ? String(args.pushToken) : null,
    appVersion: args.appVersion ? String(args.appVersion) : null,
  }).onConflictDoUpdate({
    target: schema.device.deviceId,
    set: {
      platform,
      name: args.name ? String(args.name) : null,
      pushToken: args.pushToken ? String(args.pushToken) : null,
      appVersion: args.appVersion ? String(args.appVersion) : null,
    },
  }).returning())[0];
  if (!quietMode) console.log('Registered device:', deviceRow.deviceId);
  printOutput(deviceRow);
}

async function updateDevice(deviceId: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.name !== undefined) data.name = String(args.name) || null;
  if (args.pushToken !== undefined) data.pushToken = String(args.pushToken) || null;
  if (args.appVersion !== undefined) data.appVersion = String(args.appVersion) || null;
  const deviceRow = (await db.update(schema.device).set(data).where(eq(schema.device.deviceId, deviceId)).returning())[0];
  if (!quietMode) console.log('Updated device:', deviceRow.deviceId);
  printOutput(deviceRow);
}

async function deleteDevice(deviceId: string) {
  await db.delete(schema.device).where(eq(schema.device.deviceId, deviceId));
  if (!quietMode) console.log('Deleted device:', deviceId);
}

// ─── Sync ───────────────────────────────────────────────────────────────────

async function syncPull() {
  const todos = await db.select().from(schema.todo);
  const relations = await db.select().from(schema.todoRelation);
  const todoLogs = await db.select().from(schema.todoLog);
  const actionEdges = await db.select().from(schema.actionEdge);
  const pluses = await db.select().from(schema.pluse);
  const timerSessions = await db.select().from(schema.timerSession);

  printOutput({
    todos: todos.map((t) => ({
      ...t,
      tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags,
      repeatRule: typeof t.repeatRule === 'string' ? JSON.parse(t.repeatRule) : t.repeatRule,
    })),
    relations,
    todoLogs: todoLogs.map((l) => ({
      ...l,
      metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata) : l.metadata,
    })),
    actionEdges,
    pluses: pluses.map((p) => ({
      ...p,
      intervals: typeof p.intervals === 'string' ? JSON.parse(p.intervals) : p.intervals,
    })),
    timerSessions: timerSessions.map((s) => ({
      ...s,
      intervals: typeof s.intervals === 'string' ? JSON.parse(s.intervals) : s.intervals,
    })),
  });
}

// ─── Export / Import ────────────────────────────────────────────────────────

async function exportJson(args: Record<string, string | boolean>) {
  const todos = await db.select().from(schema.todo);
  const relations = await db.select().from(schema.todoRelation);
  const todoLogs = await db.select().from(schema.todoLog);
  const actionEdges = await db.select().from(schema.actionEdge);
  const pluses = await db.select().from(schema.pluse);
  const timerSessions = await db.select().from(schema.timerSession);

  const data = {
    todos,
    relations,
    todoLogs,
    actionEdges,
    pluses,
    timerSessions,
    exportedAt: new Date().toISOString(),
  };

  const file = args.file ? String(args.file) : null;
  if (file) {
    const ws = createWriteStream(file);
    ws.write(JSON.stringify(data, null, 2));
    ws.end();
    if (!quietMode) console.log('Exported to:', file);
  } else {
    printOutput(data);
  }
}

async function importJson(args: Record<string, string | boolean>) {
  const file = String(args.file ?? '');
  if (!file) return fail('file is required');

  const content = await readFile(file, 'utf-8');
  const data = JSON.parse(content);

  await db.transaction(async (tx) => {
    if (data.todos?.length) {
      for (const item of data.todos) {
        const existing = (await tx.select().from(schema.todo).where(eq(schema.todo.id, item.id)).limit(1))[0];
        if (existing) await tx.update(schema.todo).set(item).where(eq(schema.todo.id, item.id));
        else await tx.insert(schema.todo).values(item);
      }
    }
    if (data.relations?.length) {
      for (const item of data.relations) {
        const existing = (await tx.select().from(schema.todoRelation).where(eq(schema.todoRelation.id, item.id)).limit(1))[0];
        if (existing) await tx.update(schema.todoRelation).set(item).where(eq(schema.todoRelation.id, item.id));
        else await tx.insert(schema.todoRelation).values(item);
      }
    }
    if (data.todoLogs?.length) {
      for (const item of data.todoLogs) {
        const existing = (await tx.select().from(schema.todoLog).where(eq(schema.todoLog.id, item.id)).limit(1))[0];
        if (existing) await tx.update(schema.todoLog).set(item).where(eq(schema.todoLog.id, item.id));
        else await tx.insert(schema.todoLog).values(item);
      }
    }
    if (data.actionEdges?.length) {
      for (const item of data.actionEdges) {
        const existing = (await tx.select().from(schema.actionEdge).where(eq(schema.actionEdge.id, item.id)).limit(1))[0];
        if (existing) await tx.update(schema.actionEdge).set(item).where(eq(schema.actionEdge.id, item.id));
        else await tx.insert(schema.actionEdge).values(item);
      }
    }
    if (data.pluses?.length) {
      for (const item of data.pluses) {
        const existing = (await tx.select().from(schema.pluse).where(eq(schema.pluse.id, item.id)).limit(1))[0];
        if (existing) await tx.update(schema.pluse).set(item).where(eq(schema.pluse.id, item.id));
        else await tx.insert(schema.pluse).values(item);
      }
    }
    if (data.timerSessions?.length) {
      for (const item of data.timerSessions) {
        const existing = (await tx.select().from(schema.timerSession).where(eq(schema.timerSession.id, item.id)).limit(1))[0];
        if (existing) await tx.update(schema.timerSession).set(item).where(eq(schema.timerSession.id, item.id));
        else await tx.insert(schema.timerSession).values(item);
      }
    }
  });

  if (!quietMode) console.log('Import complete');
}

// ─── Stats ──────────────────────────────────────────────────────────────────

async function showStats() {
  const todoCounts = await db.select({
    status: schema.todo.status,
    count: sql<number>`count(*)`,
  }).from(schema.todo).groupBy(schema.todo.status);

  const totalTodos = (await db.select({ count: sql<number>`count(*)` }).from(schema.todo))[0].count;
  const totalRelations = (await db.select({ count: sql<number>`count(*)` }).from(schema.todoRelation))[0].count;
  const totalPluses = (await db.select({ count: sql<number>`count(*)` }).from(schema.pluse))[0].count;
  const activeTimers = (await db.select({ count: sql<number>`count(*)` }).from(schema.timerSession).where(eq(schema.timerSession.status, 'running')))[0].count;
  const totalDevices = (await db.select({ count: sql<number>`count(*)` }).from(schema.device))[0].count;

  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayCount = (await db.select({ count: sql<number>`count(*)` }).from(schema.todo)
    .where(and(gte(schema.todo.scheduledDate, today), lt(schema.todo.scheduledDate, tomorrow))))[0].count;

  const overdueCount = (await db.select({ count: sql<number>`count(*)` }).from(schema.todo)
    .where(and(ne(schema.todo.status, 'done'), lt(schema.todo.dueDate, today))))[0].count;

  const stats = {
    todos: {
      total: totalTodos,
      byStatus: Object.fromEntries(todoCounts.map((c) => [c.status, c.count])),
      today: todayCount,
      overdue: overdueCount,
    },
    relations: { total: totalRelations },
    pluses: { total: totalPluses },
    timerSessions: { active: activeTimers },
    devices: { total: totalDevices },
  };

  printOutput(stats);
}

// ─── All Data ───────────────────────────────────────────────────────────────

async function wipeAll() {
  await db.delete(schema.timerSession);
  await db.delete(schema.todoLog);
  await db.delete(schema.todoRelation);
  await db.delete(schema.actionEdge);
  await db.delete(schema.pluse);
  await db.delete(schema.repeatOccurrence);
  await db.delete(schema.plan);
  await db.delete(schema.syncEvent);
  await db.delete(schema.todo);
  await db.delete(schema.device);
  if (!quietMode) console.log('All data wiped.');
}

// ─── Error Handling ─────────────────────────────────────────────────────────

function fail(message: string): never {
  console.error('Error:', message);
  process.exit(1);
}

// ─── Usage ──────────────────────────────────────────────────────────────────

const usage = `Utral Todo CLI

Usage: pnpm cli <entity> <action> [id] [options]

Global Flags:
  --format=json|table|csv   Output format (default: table)
  --fields=a,b,c            Limit output to specific fields
  --quiet                   Suppress status messages
  --limit=N                 Limit list results

Entities & Actions:

  todos
    list [--status=...] [--priority=...] [--tag=...]
    get <id>
    create --title="..." [--description=...] [--priority=low|medium|high]
         [--parentId=...] [--dueDate=YYYY-MM-DD] [--scheduledDate=YYYY-MM-DD]
         [--tags=a,b,c] [--estimatedMinutes=N] [--nodeType=goal|todo]
    update <id> [--title=...] [--status=...] [--priority=...] [--dueDate=...]
    delete <id>
    status <id> pending|in_progress|done
    schedule <id> --date=YYYY-MM-DD
    unschedule <id>
    today
    unscheduled
    overdue
    inbox
    search <query>
    reorder <id> --order=N
    reorder-bulk --ids=id1,id2,id3
    spawned <id>
    instances <id>
    repeat-rule <id> --rule='{"type":"daily"}'
    sync-repeats [--startDate=YYYY-MM-DD] [--endDate=YYYY-MM-DD]

  relations
    list [--fromTodoId=...] [--toTodoId=...] [--type=...]
    create --fromTodoId=... --toTodoId=... --type=depends_on|blocked_by|parent_of|source_from|assign_from
    delete <id>
    source-chain <id>

  todo-logs
    list [--todoId=...] [--type=...]
    create --todoId=... --type=... --content="..." [--minutesSpent=N] [--metadata='{"key":"val"}']
    delete <id>

  action-edges
    list
    create --fromTodoId=... --toTodoId=... --type=pre_do|parent_child|to_achieve
    delete <id>
    for-todo <todoId>

  pluses
    list
    get <id>
    create --name="..." [--intervals='[1500,300]'] [--repeatCount=N] [--description=...]
    update <id> [--name=...] [--intervals=...] [--repeatCount=N]
    delete <id>

  timer-sessions
    list [--status=...] [--type=...]
    get <id>
    create --type=stopwatch|pluse [--name=...] [--pluseId=...] [--todoId=...]
    update <id> [--name=...] [--status=...] [--elapsedSeconds=N]
    start <id>
    pause <id> [--elapsedSeconds=N]
    resume <id>
    stop <id>
    delete <id>

  devices
    list
    register --deviceId=... --platform=ios|watchos|desktop [--name=...] [--pushToken=...]
    update <deviceId> [--name=...] [--pushToken=...]
    delete <deviceId>

  sync
    pull                        Output all data as JSON

  export
    json [--file=path.json]     Export all data to stdout or file

  import
    json --file=path.json       Import data from JSON file

  stats                         Show overview statistics

  all-data
    wipe                          Delete all data

Examples:
  pnpm cli todos today --format=json
  pnpm cli todos search "fix bug" --format=json --limit=5
  pnpm cli todos create --title="New feature" --priority=high
  pnpm cli todos status abc123 done
  pnpm cli timer-sessions start abc123
  pnpm cli stats --format=json
  pnpm cli export json --file=backup.json
`;

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [, , entity, action, ...rest] = process.argv;
  const allArgs = parseArgs(rest);
  extractGlobalFlags(allArgs);
  const args = removeGlobalFlags(allArgs);

  // Find positional id (first non-flag arg)
  const id = rest.find((a) => !a.startsWith('--'));
  if (id) args._positional = id;
  const id2 = rest.filter((a) => !a.startsWith('--'))[1];
  if (id2) args._positional2 = id2;

  try {
    switch (entity) {
      case 'todos':
        switch (action) {
          case 'list': await listTodos(args); break;
          case 'get': if (!id) fail('ID required'); await getTodo(id); break;
          case 'create': await createTodo(args); break;
          case 'update': if (!id) fail('ID required'); await updateTodo(id, args); break;
          case 'delete': if (!id) fail('ID required'); await deleteTodo(id); break;
          case 'status': if (!id) fail('ID required'); await setTodoStatus(id, args); break;
          case 'schedule': if (!id) fail('ID required'); await scheduleTodo(id, args); break;
          case 'unschedule': if (!id) fail('ID required'); await scheduleTodo(id, {}); break;
          case 'today': await todosToday(); break;
          case 'unscheduled': await todosUnscheduled(); break;
          case 'overdue': await todosOverdue(); break;
          case 'inbox': await todosInbox(); break;
          case 'search': if (!id) fail('Search query required'); await searchTodos(id); break;
          case 'reorder': if (!id) fail('ID required'); await reorderTodo(id, args); break;
          case 'reorder-bulk': await bulkReorderTodos(args); break;
          case 'spawned': if (!id) fail('ID required'); await getSpawnedTodos(id); break;
          case 'instances': if (!id) fail('ID required'); await getTodoInstances(id); break;
          case 'repeat-rule': if (!id) fail('ID required'); await setRepeatRule(id, args); break;
          case 'sync-repeats': await syncRepeatTodos(args); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'relations':
        switch (action) {
          case 'list': await listRelations(args); break;
          case 'create': await createRelation(args); break;
          case 'delete': if (!id) fail('ID required'); await deleteRelation(id); break;
          case 'source-chain': if (!id) fail('ID required'); await sourceChain(id); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'todo-logs':
        switch (action) {
          case 'list': await listTodoLogs(args); break;
          case 'create': await createTodoLog(args); break;
          case 'delete': if (!id) fail('ID required'); await deleteTodoLog(id); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'action-edges':
        switch (action) {
          case 'list': await listActionEdges(); break;
          case 'create': await createActionEdge(args); break;
          case 'delete': if (!id) fail('ID required'); await deleteActionEdge(id); break;
          case 'for-todo': if (!id) fail('todoId required'); await actionEdgesForTodo(id); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'pluses':
        switch (action) {
          case 'list': await listPluses(); break;
          case 'get': if (!id) fail('ID required'); await getPluse(id); break;
          case 'create': await createPluse(args); break;
          case 'update': if (!id) fail('ID required'); await updatePluse(id, args); break;
          case 'delete': if (!id) fail('ID required'); await deletePluse(id); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'timer-sessions':
        switch (action) {
          case 'list': await listTimerSessions(args); break;
          case 'get': if (!id) fail('ID required'); await getTimerSession(id); break;
          case 'create': await createTimerSession(args); break;
          case 'update': if (!id) fail('ID required'); await updateTimerSession(id, args); break;
          case 'start': if (!id) fail('ID required'); await startTimerSession(id); break;
          case 'pause': if (!id) fail('ID required'); await pauseTimerSession(id, args); break;
          case 'resume': if (!id) fail('ID required'); await resumeTimerSession(id); break;
          case 'stop': if (!id) fail('ID required'); await stopTimerSession(id); break;
          case 'delete': if (!id) fail('ID required'); await deleteTimerSession(id); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'devices':
        switch (action) {
          case 'list': await listDevices(); break;
          case 'register': await registerDevice(args); break;
          case 'update': if (!id) fail('deviceId required'); await updateDevice(id, args); break;
          case 'delete': if (!id) fail('deviceId required'); await deleteDevice(id); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'sync':
        switch (action) {
          case 'pull': await syncPull(); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'export':
        switch (action) {
          case 'json': await exportJson(args); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'import':
        switch (action) {
          case 'json': await importJson(args); break;
          default: console.log(usage); process.exit(2);
        }
        break;

      case 'stats':
        if (!action || String(action).startsWith('--')) { await showStats(); break; }
        console.log(usage); process.exit(2);
        break;

      case 'all-data':
        if (action === 'wipe') await wipeAll();
        else { console.log(usage); process.exit(2); }
        break;

      default:
        console.log(usage);
        process.exit(2);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
