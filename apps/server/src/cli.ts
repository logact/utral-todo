import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

const prisma = new PrismaClient();

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
  const db = new Date(b);
  return (
    da.getDate() === db.getDate() &&
    da.getMonth() === db.getMonth() &&
    da.getFullYear() === db.getFullYear()
  );
}

// ─── Projects ───────────────────────────────────────────────────────────────

async function listProjects(args: Record<string, string | boolean>) {
  const rows = await prisma.project.findMany({
    where: args.status ? { status: String(args.status) } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  printOutput(
    applyLimit(rows).map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'color', 'deadline', 'createdAt']),
    ),
  );
}

async function getProject(id: string, args: Record<string, string | boolean>) {
  const include = args['with-todos'] ? { todos: true } : undefined;
  const row = await prisma.project.findUnique({ where: { id }, include });
  if (!row) return fail('Project not found');
  printOutput(row);
}

async function createProject(args: Record<string, string | boolean>) {
  const row = await prisma.project.create({
    data: {
      title: String(args.title ?? 'Untitled'),
      description: String(args.description ?? ''),
      status: String(args.status ?? 'active'),
      color: String(args.color ?? '#3b82f6'),
      deadline: args.deadline ? new Date(String(args.deadline)) : null,
    },
  });
  if (!quietMode) console.log('Created project:', row.id);
  printOutput(row);
}

async function updateProject(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.title !== undefined) data.title = String(args.title);
  if (args.description !== undefined) data.description = String(args.description);
  if (args.status !== undefined) data.status = String(args.status);
  if (args.color !== undefined) data.color = String(args.color);
  if (args.deadline !== undefined) data.deadline = args.deadline ? new Date(String(args.deadline)) : null;
  const row = await prisma.project.update({ where: { id }, data });
  if (!quietMode) console.log('Updated project:', row.id);
  printOutput(row);
}

async function deleteProject(id: string) {
  await prisma.project.delete({ where: { id } });
  if (!quietMode) console.log('Deleted project:', id);
}

// ─── Todos ──────────────────────────────────────────────────────────────────

async function listTodos(args: Record<string, string | boolean>) {
  const where: Record<string, unknown> = {};
  if (args.status) where.status = args.status;
  if (args.projectId) where.projectId = args.projectId;
  if (args.priority) where.priority = args.priority;
  if (args.parentId) where.parentId = args.parentId;
  if (args.tag) {
    const all = await prisma.todo.findMany({ where, orderBy: { order: 'asc' } });
    const filtered = all.filter((t) => {
      const tags = t.tags as string[];
      return tags.includes(String(args.tag));
    });
    printOutput(
      applyLimit(filtered).map((r) =>
        pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate', 'scheduledDate']),
      ),
    );
    return;
  }

  const rows = await prisma.todo.findMany({ where, orderBy: { order: 'asc' } });
  printOutput(
    applyLimit(rows).map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate', 'scheduledDate']),
    ),
  );
}

async function getTodo(id: string) {
  const row = await prisma.todo.findUnique({
    where: { id },
    include: { project: true, logs: true },
  });
  if (!row) return fail('Todo not found');
  printOutput(row);
}

async function createTodo(args: Record<string, string | boolean>) {
  let finalProjectId = args.projectId ? String(args.projectId) : null;
  if (args.parentId && !args.projectId) {
    const parent = await prisma.todo.findUnique({ where: { id: String(args.parentId) } });
    if (parent) finalProjectId = parent.projectId;
  }

  const maxOrder = await prisma.todo.aggregate({ _max: { order: true } });
  const finalOrder = (maxOrder._max.order ?? 0) + 1;

  const data = {
    title: String(args.title ?? 'Untitled'),
    description: String(args.description ?? ''),
    status: 'pending',
    priority: String(args.priority ?? 'medium'),
    estimatedMinutes: args.estimatedMinutes ? Number(args.estimatedMinutes) : 60,
    tags: args.tags ? (Array.isArray(args.tags) ? (args.tags as string[]) : String(args.tags).split(',').map((t) => t.trim())) : [],
    projectId: finalProjectId,
    parentId: args.parentId ? String(args.parentId) : null,
    dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
    scheduledDate: args.scheduledDate ? new Date(String(args.scheduledDate)) : null,
    repeatRule: args.repeatRule ? JSON.parse(String(args.repeatRule)) : null,
    order: args.order ? Number(args.order) : finalOrder,
    nodeType: args.nodeType === 'goal' || args.nodeType === 'goal' ? 'goal' : 'todo',
  };

  const todo = await prisma.todo.create({ data: data as never });

  if (!quietMode) console.log('Created todo:', todo.id);
  printOutput(todo);
}

async function updateTodo(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.title !== undefined) data.title = String(args.title);
  if (args.description !== undefined) data.description = String(args.description);
  if (args.priority !== undefined) data.priority = String(args.priority);
  if (args.projectId !== undefined) data.projectId = String(args.projectId) || null;
  if (args.parentId !== undefined) data.parentId = String(args.parentId) || null;
  if (args.dueDate !== undefined) data.dueDate = args.dueDate ? new Date(String(args.dueDate)) : null;
  if (args.estimatedMinutes !== undefined) data.estimatedMinutes = Number(args.estimatedMinutes);
  if (args.tags !== undefined) {
    data.tags = String(args.tags).split(',').map((t) => t.trim());
  }
  if (args.repeatRule !== undefined) data.repeatRule = args.repeatRule ? JSON.parse(String(args.repeatRule)) : null;
  if (args.nodeType !== undefined) data.nodeType = String(args.nodeType);
  if (args.order !== undefined) data.order = Number(args.order);

  const todo = await prisma.todo.update({ where: { id }, data });

  if (!quietMode) console.log('Updated todo:', todo.id);
  printOutput(todo);
}

async function deleteTodo(id: string) {
  // Delete assigned instances first
  const assignedRelations = await prisma.todoRelation.findMany({
    where: { fromTodoId: id, type: 'assign_from' },
  });
  for (const rel of assignedRelations) {
    await prisma.todo.delete({ where: { id: rel.toTodoId } }).catch(() => {});
  }
  await prisma.todo.delete({ where: { id } }).catch(() => {});
  if (!quietMode) console.log('Deleted todo:', id);
}

async function setTodoStatus(id: string, args: Record<string, string | boolean>) {
  const status = String(args.status ?? args._positional ?? '');
  if (!['pending', 'in_progress', 'done'].includes(status)) {
    return fail('Status must be one of: pending, in_progress, done');
  }
  const data: Prisma.TodoUpdateInput = { status };
  if (status === 'in_progress') data.startedAt = new Date();
  if (status === 'pending') data.startedAt = null;
  if (status === 'done') data.completedAt = new Date();
  const todo = await prisma.todo.update({ where: { id }, data });
  if (!quietMode) console.log(`Status updated to ${status}:`, todo.id);
  printOutput(todo);
}

async function scheduleTodo(id: string, args: Record<string, string | boolean>) {
  const date = args.date ? new Date(String(args.date)) : null;
  const todo = await prisma.todo.update({
    where: { id },
    data: { scheduledDate: date },
  });
  if (!quietMode) console.log(date ? `Scheduled for ${date.toISOString().split('T')[0]}:` : 'Unscheduled:', todo.id);
  printOutput(todo);
}

async function todosToday() {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const rows = await prisma.todo.findMany({
    where: { scheduledDate: { gte: today, lt: tomorrow } },
    orderBy: { order: 'asc' },
  });
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate']),
    ),
  );
}

async function todosUnscheduled() {
  const rows = await prisma.todo.findMany({
    where: { scheduledDate: null, status: { not: 'done' } },
    orderBy: { order: 'asc' },
  });
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate']),
    ),
  );
}

async function todosOverdue() {
  const today = startOfDay(new Date());
  const rows = await prisma.todo.findMany({
    where: { status: { not: 'done' }, dueDate: { lt: today } },
    orderBy: { order: 'asc' },
  });
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate']),
    ),
  );
}

async function todosInbox() {
  const rows = await prisma.todo.findMany({
    where: { projectId: null, status: { not: 'done' } },
    orderBy: { order: 'asc' },
  });
  printOutput(
    rows.map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate']),
    ),
  );
}

async function searchTodos(query: string) {
  const all = await prisma.todo.findMany({ orderBy: { order: 'asc' } });
  const q = query.toLowerCase();
  const rows = all.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)),
  );
  printOutput(
    applyLimit(rows).map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate', 'scheduledDate']),
    ),
  );
}

async function reorderTodo(id: string, args: Record<string, string | boolean>) {
  const order = Number(args.order ?? args._positional ?? 0);
  const todo = await prisma.todo.update({ where: { id }, data: { order } });
  if (!quietMode) console.log('Reordered todo:', todo.id, 'to order', order);
  printOutput(todo);
}

async function bulkReorderTodos(args: Record<string, string | boolean>) {
  const ids = String(args.ids ?? args._positional ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return fail('No ids provided. Use --ids=id1,id2,id3');
  await prisma.$transaction(
    ids.map((id, index) => prisma.todo.update({ where: { id }, data: { order: index } })),
  );
  if (!quietMode) console.log('Reordered', ids.length, 'todos');
}

async function assignTodos(args: Record<string, string | boolean>) {
  const ids = String(args.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const projectId = args.projectId ? String(args.projectId) : null;
  if (ids.length === 0) return fail('No ids provided. Use --ids=id1,id2,id3');
  await prisma.$transaction(
    ids.map((id) => prisma.todo.update({ where: { id }, data: { projectId } })),
  );
  if (!quietMode) console.log('Assigned', ids.length, 'todos to project:', projectId ?? '(none)');
}

async function getSpawnedTodos(id: string) {
  const relations = await prisma.todoRelation.findMany({
    where: { fromTodoId: id, type: 'source_from' },
  });
  const todos = [];
  for (const rel of relations) {
    const todo = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
    if (todo) todos.push(todo);
  }
  printOutput(todos.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'priority'])));
}

async function getTodoInstances(id: string) {
  const relations = await prisma.todoRelation.findMany({
    where: { fromTodoId: id, type: 'assign_from' },
  });
  const todos = [];
  for (const rel of relations) {
    const todo = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
    if (todo) todos.push(todo);
  }
  printOutput(todos.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'title', 'status', 'scheduledDate'])));
}

async function setRepeatRule(id: string, args: Record<string, string | boolean>) {
  const rule = args.rule ? JSON.parse(String(args.rule)) : null;
  const template = await prisma.todo.findUnique({ where: { id } });
  if (!template) return fail('Todo not found');

  await prisma.todo.update({ where: { id }, data: { repeatRule: rule } });

  if (!rule) {
    if (!quietMode) console.log('Repeat rule removed for:', id);
    return;
  }

  // Clean up invalid instances
  const existingInstances = await prisma.todoRelation.findMany({
    where: { fromTodoId: id, type: 'assign_from' },
  });
  const typedRule = rule as { type: string; weekDays?: number[]; interval?: number; endDate?: string };
  const ruleEnd = typedRule.endDate ? startOfDay(new Date(typedRule.endDate)) : undefined;

  for (const rel of existingInstances) {
    const instance = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
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
      await prisma.todoRelation.deleteMany({ where: { OR: [{ fromTodoId: instance.id }, { toTodoId: instance.id }] } });
      await prisma.todoLog.deleteMany({ where: { todoId: instance.id } });
      await prisma.todo.delete({ where: { id: instance.id } }).catch(() => {});
    }
  }

  if (!quietMode) console.log('Repeat rule updated for:', id);
}

async function syncRepeatTodos(args: Record<string, string | boolean>) {
  const startDate = new Date(String(args.startDate ?? args._positional ?? new Date()));
  const endDate = new Date(String(args.endDate ?? args._positional2 ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));

  const templates = await prisma.todo.findMany({
    where: { repeatRule: { not: Prisma.JsonNull } },
  });

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

    const existingInstances = await prisma.todoRelation.findMany({
      where: { fromTodoId: template.id, type: 'assign_from' },
    });
    const instanceTodos = [];
    for (const rel of existingInstances) {
      const todo = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
      if (todo) instanceTodos.push(todo);
    }

    for (const date of targetDates) {
      const hasInstance = instanceTodos.some((inst) => inst.scheduledDate && isSameDay(new Date(inst.scheduledDate), date));
      if (!hasInstance) {
        const instance = await prisma.todo.create({
          data: {
            title: template.title,
            description: template.description,
            priority: template.priority,
            estimatedMinutes: template.estimatedMinutes,
            tags: template.tags as string[],
            projectId: template.projectId,
            scheduledDate: date,
            status: 'pending',
            order: 0,
          },
        });
        await prisma.todoRelation.create({
          data: { fromTodoId: template.id, toTodoId: instance.id, type: 'assign_from' },
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
  const where: Record<string, unknown> = {};
  if (args.fromTodoId) where.fromTodoId = String(args.fromTodoId);
  if (args.toTodoId) where.toTodoId = String(args.toTodoId);
  if (args.type) where.type = String(args.type);
  const rows = await prisma.todoRelation.findMany({ where, orderBy: { createdAt: 'desc' } });
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function createRelation(args: Record<string, string | boolean>) {
  const fromTodoId = String(args.fromTodoId ?? '');
  const toTodoId = String(args.toTodoId ?? '');
  const type = String(args.type ?? 'depends_on');
  if (!fromTodoId || !toTodoId) return fail('fromTodoId and toTodoId are required');
  if (fromTodoId === toTodoId) return fail('Cannot create a relation from a todo to itself');

  const existing = await prisma.todoRelation.findFirst({ where: { fromTodoId, toTodoId, type } });
  if (existing) return fail('This relation already exists');

  const relation = await prisma.todoRelation.create({ data: { fromTodoId, toTodoId, type } });
  if (!quietMode) console.log('Created relation:', relation.id);
  printOutput(relation);
}

async function deleteRelation(id: string) {
  await prisma.todoRelation.delete({ where: { id } });
  if (!quietMode) console.log('Deleted relation:', id);
}

async function sourceChain(id: string) {
  const chain: Array<Record<string, unknown>> = [];
  const visited = new Set<string>();
  let currentId = id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todo = await prisma.todo.findUnique({ where: { id: currentId } });
    if (!todo) break;
    const incomingSource = await prisma.todoRelation.findFirst({
      where: { toTodoId: currentId, type: 'source_from' },
    });
    chain.unshift(todo as unknown as Record<string, unknown>);
    currentId = incomingSource?.fromTodoId ?? '';
  }

  printOutput(chain.map((r) => pick(r, ['id', 'title', 'status', 'priority'])));
}

// ─── Todo Logs ──────────────────────────────────────────────────────────────

async function listTodoLogs(args: Record<string, string | boolean>) {
  const where: Record<string, unknown> = {};
  if (args.todoId) where.todoId = String(args.todoId);
  if (args.type) where.type = String(args.type);
  const rows = await prisma.todoLog.findMany({ where, orderBy: { createdAt: 'asc' } });
  printOutput(
    applyLimit(rows).map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'todoId', 'type', 'content', 'minutesSpent', 'createdAt'])),
  );
}

async function createTodoLog(args: Record<string, string | boolean>) {
  const log = await prisma.todoLog.create({
    data: {
      todoId: String(args.todoId ?? ''),
      type: String(args.type ?? 'thought'),
      content: String(args.content ?? ''),
      minutesSpent: args.minutesSpent ? Number(args.minutesSpent) : null,
      metadata: args.metadata ? JSON.parse(String(args.metadata)) : null,
    },
  });
  if (!quietMode) console.log('Created todo log:', log.id);
  printOutput(log);
}

async function deleteTodoLog(id: string) {
  await prisma.todoLog.delete({ where: { id } });
  if (!quietMode) console.log('Deleted todo log:', id);
}

// ─── Action Edges ───────────────────────────────────────────────────────────

async function listActionEdges() {
  const rows = await prisma.actionEdge.findMany({ orderBy: { createdAt: 'desc' } });
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function createActionEdge(args: Record<string, string | boolean>) {
  const fromTodoId = String(args.fromTodoId ?? '');
  const toTodoId = String(args.toTodoId ?? '');
  const type = String(args.type ?? 'pre_do');
  if (!fromTodoId || !toTodoId) return fail('fromTodoId and toTodoId are required');
  if (fromTodoId === toTodoId) return fail('Cannot create an edge from a todo to itself');

  const existing = await prisma.actionEdge.findFirst({ where: { fromTodoId, toTodoId, type } });
  if (existing) return fail('This edge already exists');

  const edge = await prisma.actionEdge.create({ data: { fromTodoId, toTodoId, type } });
  if (!quietMode) console.log('Created action edge:', edge.id);
  printOutput(edge);
}

async function deleteActionEdge(id: string) {
  await prisma.actionEdge.delete({ where: { id } });
  if (!quietMode) console.log('Deleted action edge:', id);
}

async function actionEdgesForTodo(todoId: string) {
  const rows = await prisma.actionEdge.findMany({
    where: { OR: [{ fromTodoId: todoId }, { toTodoId: todoId }] },
  });
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'fromTodoId', 'toTodoId', 'type'])));
}

// ─── Pluses ─────────────────────────────────────────────────────────────────

async function listPluses() {
  const rows = await prisma.pluse.findMany({ orderBy: { createdAt: 'desc' } });
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'name', 'description', 'intervals', 'repeatCount', 'createdAt'])));
}

async function getPluse(id: string) {
  const row = await prisma.pluse.findUnique({ where: { id } });
  if (!row) return fail('Pluse not found');
  printOutput(row);
}

async function createPluse(args: Record<string, string | boolean>) {
  const row = await prisma.pluse.create({
    data: {
      name: String(args.name ?? 'Untitled'),
      description: String(args.description ?? ''),
      intervals: args.intervals ? JSON.parse(String(args.intervals)) : [1500, 300],
      repeatCount: args.repeatCount ? Number(args.repeatCount) : 1,
      intervalTodos: args.intervalTodos ? JSON.parse(String(args.intervalTodos)) : null,
      autoAdvance: args.autoAdvance === true || args.autoAdvance === 'true',
    },
  });
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
  const row = await prisma.pluse.update({ where: { id }, data });
  if (!quietMode) console.log('Updated pluse:', row.id);
  printOutput(row);
}

async function deletePluse(id: string) {
  await prisma.pluse.delete({ where: { id } });
  if (!quietMode) console.log('Deleted pluse:', id);
}

// ─── Timer Sessions ─────────────────────────────────────────────────────────

async function listTimerSessions(args: Record<string, string | boolean>) {
  const where: Record<string, unknown> = {};
  if (args.status) where.status = String(args.status);
  if (args.type) where.type = String(args.type);
  const rows = await prisma.timerSession.findMany({ where, orderBy: { createdAt: 'desc' } });
  printOutput(
    applyLimit(rows).map((r) =>
      pick(r as unknown as Record<string, unknown>, ['id', 'name', 'type', 'status', 'elapsedSeconds', 'todoId', 'createdAt']),
    ),
  );
}

async function getTimerSession(id: string) {
  const row = await prisma.timerSession.findUnique({ where: { id } });
  if (!row) return fail('Timer session not found');
  printOutput(row);
}

async function createTimerSession(args: Record<string, string | boolean>) {
  const row = await prisma.timerSession.create({
    data: {
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
    },
  });
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
  const row = await prisma.timerSession.update({ where: { id }, data });
  if (!quietMode) console.log('Updated timer session:', row.id);
  printOutput(row);
}

async function startTimerSession(id: string) {
  const row = await prisma.timerSession.update({
    where: { id },
    data: { status: 'running', startedAt: new Date(), pausedAt: null },
  });
  if (!quietMode) console.log('Started timer session:', row.id);
  printOutput(row);
}

async function pauseTimerSession(id: string, args: Record<string, string | boolean>) {
  const elapsed = args.elapsedSeconds ? Number(args.elapsedSeconds) : undefined;
  const data: Record<string, unknown> = { status: 'paused', pausedAt: new Date() };
  if (elapsed !== undefined) data.elapsedSeconds = elapsed;
  const row = await prisma.timerSession.update({ where: { id }, data });
  if (!quietMode) console.log('Paused timer session:', row.id);
  printOutput(row);
}

async function resumeTimerSession(id: string) {
  const row = await prisma.timerSession.update({
    where: { id },
    data: { status: 'running', pausedAt: null },
  });
  if (!quietMode) console.log('Resumed timer session:', row.id);
  printOutput(row);
}

async function stopTimerSession(id: string) {
  const row = await prisma.timerSession.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date() },
  });
  if (!quietMode) console.log('Stopped timer session:', row.id);
  printOutput(row);
}

async function deleteTimerSession(id: string) {
  await prisma.timerSession.delete({ where: { id } });
  if (!quietMode) console.log('Deleted timer session:', id);
}

// ─── Devices ────────────────────────────────────────────────────────────────

async function listDevices() {
  const rows = await prisma.device.findMany({ orderBy: { lastSeenAt: 'desc' } });
  printOutput(rows.map((r) => pick(r as unknown as Record<string, unknown>, ['id', 'deviceId', 'platform', 'name', 'lastSeenAt'])));
}

async function registerDevice(args: Record<string, string | boolean>) {
  const deviceId = String(args.deviceId ?? '');
  const platform = String(args.platform ?? '');
  if (!deviceId || !platform) return fail('deviceId and platform are required');

  const device = await prisma.device.upsert({
    where: { deviceId },
    update: {
      platform,
      name: args.name ? String(args.name) : null,
      pushToken: args.pushToken ? String(args.pushToken) : null,
      appVersion: args.appVersion ? String(args.appVersion) : null,
    },
    create: {
      deviceId,
      platform,
      name: args.name ? String(args.name) : null,
      pushToken: args.pushToken ? String(args.pushToken) : null,
      appVersion: args.appVersion ? String(args.appVersion) : null,
    },
  });
  if (!quietMode) console.log('Registered device:', device.deviceId);
  printOutput(device);
}

async function updateDevice(deviceId: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.name !== undefined) data.name = String(args.name) || null;
  if (args.pushToken !== undefined) data.pushToken = String(args.pushToken) || null;
  if (args.appVersion !== undefined) data.appVersion = String(args.appVersion) || null;
  const device = await prisma.device.update({ where: { deviceId }, data });
  if (!quietMode) console.log('Updated device:', device.deviceId);
  printOutput(device);
}

async function deleteDevice(deviceId: string) {
  await prisma.device.delete({ where: { deviceId } });
  if (!quietMode) console.log('Deleted device:', deviceId);
}

// ─── Sync ───────────────────────────────────────────────────────────────────

async function syncPull() {
  const todos = await prisma.todo.findMany();
  const projects = await prisma.project.findMany();
  const relations = await prisma.todoRelation.findMany();
  const todoLogs = await prisma.todoLog.findMany();
  const actionEdges = await prisma.actionEdge.findMany();
  const pluses = await prisma.pluse.findMany();
  const timerSessions = await prisma.timerSession.findMany();

  printOutput({
    todos: todos.map((t) => ({
      ...t,
      tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags,
      repeatRule: typeof t.repeatRule === 'string' ? JSON.parse(t.repeatRule) : t.repeatRule,
    })),
    projects,
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
  const todos = await prisma.todo.findMany();
  const projects = await prisma.project.findMany();
  const relations = await prisma.todoRelation.findMany();
  const todoLogs = await prisma.todoLog.findMany();
  const actionEdges = await prisma.actionEdge.findMany();
  const pluses = await prisma.pluse.findMany();
  const timerSessions = await prisma.timerSession.findMany();

  const data = {
    todos,
    projects,
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

  await prisma.$transaction(async (tx) => {
    if (data.projects?.length) {
      for (const item of data.projects) {
        const existing = await tx.project.findUnique({ where: { id: item.id } });
        if (existing) await tx.project.update({ where: { id: item.id }, data: item });
        else await tx.project.create({ data: item });
      }
    }
    if (data.todos?.length) {
      for (const item of data.todos) {
        const existing = await tx.todo.findUnique({ where: { id: item.id } });
        if (existing) await tx.todo.update({ where: { id: item.id }, data: item });
        else await tx.todo.create({ data: item });
      }
    }
    if (data.relations?.length) {
      for (const item of data.relations) {
        const existing = await tx.todoRelation.findUnique({ where: { id: item.id } });
        if (existing) await tx.todoRelation.update({ where: { id: item.id }, data: item });
        else await tx.todoRelation.create({ data: item });
      }
    }
    if (data.todoLogs?.length) {
      for (const item of data.todoLogs) {
        const existing = await tx.todoLog.findUnique({ where: { id: item.id } });
        if (existing) await tx.todoLog.update({ where: { id: item.id }, data: item });
        else await tx.todoLog.create({ data: item });
      }
    }
    if (data.actionEdges?.length) {
      for (const item of data.actionEdges) {
        const existing = await tx.actionEdge.findUnique({ where: { id: item.id } });
        if (existing) await tx.actionEdge.update({ where: { id: item.id }, data: item });
        else await tx.actionEdge.create({ data: item });
      }
    }
    if (data.pluses?.length) {
      for (const item of data.pluses) {
        const existing = await tx.pluse.findUnique({ where: { id: item.id } });
        if (existing) await tx.pluse.update({ where: { id: item.id }, data: item });
        else await tx.pluse.create({ data: item });
      }
    }
    if (data.timerSessions?.length) {
      for (const item of data.timerSessions) {
        const existing = await tx.timerSession.findUnique({ where: { id: item.id } });
        if (existing) await tx.timerSession.update({ where: { id: item.id }, data: item });
        else await tx.timerSession.create({ data: item });
      }
    }
  });

  if (!quietMode) console.log('Import complete');
}

// ─── Stats ──────────────────────────────────────────────────────────────────

async function showStats() {
  const todoCounts = await prisma.todo.groupBy({ by: ['status'], _count: { status: true } });
  const totalTodos = await prisma.todo.count();
  const totalProjects = await prisma.project.count();
  const totalRelations = await prisma.todoRelation.count();
  const totalPluses = await prisma.pluse.count();
  const activeTimers = await prisma.timerSession.count({ where: { status: 'running' } });
  const totalDevices = await prisma.device.count();

  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayCount = await prisma.todo.count({
    where: { scheduledDate: { gte: today, lt: tomorrow } },
  });

  const overdueCount = await prisma.todo.count({
    where: { status: { not: 'done' }, dueDate: { lt: today } },
  });

  const stats = {
    todos: {
      total: totalTodos,
      byStatus: Object.fromEntries(todoCounts.map((c) => [c.status, c._count.status])),
      today: todayCount,
      overdue: overdueCount,
    },
    projects: { total: totalProjects },
    relations: { total: totalRelations },
    pluses: { total: totalPluses },
    timerSessions: { active: activeTimers },
    devices: { total: totalDevices },
  };

  printOutput(stats);
}

// ─── All Data ───────────────────────────────────────────────────────────────

async function wipeAll() {
  await prisma.timerSession.deleteMany();
  await prisma.todoLog.deleteMany();
  await prisma.todoRelation.deleteMany();
  await prisma.actionEdge.deleteMany();
  await prisma.pluse.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.project.deleteMany();
  await prisma.device.deleteMany();
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

  projects
    list [--status=active|archived]
    get <id> [--with-todos]
    create --title="..." [--description=...] [--color=#3b82f6] [--deadline=YYYY-MM-DD]
    update <id> [--title=...] [--status=...] [--color=...] [--deadline=...]
    delete <id>

  todos
    list [--status=...] [--priority=...] [--projectId=...] [--tag=...]
    get <id>
    create --title="..." [--description=...] [--priority=low|medium|high]
         [--projectId=...] [--parentId=...] [--dueDate=YYYY-MM-DD] [--scheduledDate=YYYY-MM-DD]
         [--tags=a,b,c] [--estimatedMinutes=N] [--nodeType=goal|todo]
    update <id> [--title=...] [--status=...] [--priority=...] [--projectId=...] [--dueDate=...]
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
    assign --ids=id1,id2 --projectId=...
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
  pnpm cli todos create --title="New feature" --priority=high --projectId=abc123
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
      case 'projects':
        switch (action) {
          case 'list': await listProjects(args); break;
          case 'get': if (!id) fail('ID required'); await getProject(id, args); break;
          case 'create': await createProject(args); break;
          case 'update': if (!id) fail('ID required'); await updateProject(id, args); break;
          case 'delete': if (!id) fail('ID required'); await deleteProject(id); break;
          default: console.log(usage); process.exit(2);
        }
        break;

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
          case 'assign': await assignTodos(args); break;
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
  } finally {
    await prisma.$disconnect();
  }
}

main();
