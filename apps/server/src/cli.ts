import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

function pick(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=', 2);
      out[k] = v ?? true;
    }
  }
  return out;
}

async function listProjects(args: Record<string, string | boolean>) {
  const rows = await prisma.project.findMany({
    where: args.status ? { status: String(args.status) } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  printTable(rows.map((r) => pick(r, ['id', 'title', 'status', 'color', 'createdAt'])));
}

async function getProject(id: string) {
  const row = await prisma.project.findUnique({ where: { id }, include: { todos: true } });
  if (!row) return console.log('Not found');
  console.log(JSON.stringify(row, null, 2));
}

async function createProject(args: Record<string, string | boolean>) {
  const row = await prisma.project.create({
    data: {
      title: String(args.title ?? 'Untitled'),
      description: String(args.description ?? ''),
      status: String(args.status ?? 'active'),
      color: String(args.color ?? '#3b82f6'),
    },
  });
  console.log('Created:', row.id);
}

async function updateProject(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, string> = {};
  if (args.title) data.title = String(args.title);
  if (args.description) data.description = String(args.description);
  if (args.status) data.status = String(args.status);
  if (args.color) data.color = String(args.color);
  const row = await prisma.project.update({ where: { id }, data });
  console.log('Updated:', row.id);
}

async function deleteProject(id: string) {
  await prisma.project.delete({ where: { id } });
  console.log('Deleted:', id);
}

async function listTodos(args: Record<string, string | boolean>) {
  const where: Record<string, unknown> = {};
  if (args.status) where.status = args.status;
  if (args.projectId) where.projectId = args.projectId;
  if (args.priority) where.priority = args.priority;
  const rows = await prisma.todo.findMany({ where, orderBy: { createdAt: 'desc' } });
  printTable(
    rows.map((r) =>
      pick(r, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate']),
    ),
  );
}

async function getTodo(id: string) {
  const row = await prisma.todo.findUnique({
    where: { id },
    include: { project: true, logs: true, children: true },
  });
  if (!row) return console.log('Not found');
  console.log(JSON.stringify(row, null, 2));
}

async function createTodo(args: Record<string, string | boolean>) {
  const row = await prisma.todo.create({
    data: {
      title: String(args.title ?? 'Untitled'),
      description: String(args.description ?? ''),
      instructions: String(args.instructions ?? ''),
      status: String(args.status ?? 'pending'),
      priority: String(args.priority ?? 'medium'),
      projectId: args.projectId ? String(args.projectId) : undefined,
      parentId: args.parentId ? String(args.parentId) : undefined,
      dueDate: args.dueDate ? new Date(String(args.dueDate)) : undefined,
      estimatedMinutes: args.estimatedMinutes ? Number(args.estimatedMinutes) : 60,
    },
  });
  console.log('Created:', row.id);
}

async function updateTodo(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.title) data.title = String(args.title);
  if (args.description) data.description = String(args.description);
  if (args.instructions) data.instructions = String(args.instructions);
  if (args.status) data.status = String(args.status);
  if (args.priority) data.priority = String(args.priority);
  if (args.projectId) data.projectId = String(args.projectId);
  if (args.dueDate) data.dueDate = new Date(String(args.dueDate));
  if (args.estimatedMinutes) data.estimatedMinutes = Number(args.estimatedMinutes);
  const row = await prisma.todo.update({ where: { id }, data });
  console.log('Updated:', row.id);
}

async function deleteTodo(id: string) {
  await prisma.todo.delete({ where: { id } });
  console.log('Deleted:', id);
}

async function listPluses() {
  const rows = await prisma.pluse.findMany({ orderBy: { createdAt: 'desc' } });
  printTable(rows.map((r) => pick(r, ['id', 'name', 'description', 'intervals', 'repeatCount', 'createdAt'])));
}

async function getPluse(id: string) {
  const row = await prisma.pluse.findUnique({ where: { id } });
  if (!row) return console.log('Not found');
  console.log(JSON.stringify(row, null, 2));
}

async function createPluse(args: Record<string, string | boolean>) {
  const row = await prisma.pluse.create({
    data: {
      name: String(args.name ?? 'Untitled'),
      description: String(args.description ?? ''),
      intervals: args.intervals ? JSON.parse(String(args.intervals)) : [25, 5],
      repeatCount: args.repeatCount ? Number(args.repeatCount) : 1,
    },
  });
  console.log('Created:', row.id);
}

async function updatePluse(id: string, args: Record<string, string | boolean>) {
  const data: Record<string, unknown> = {};
  if (args.name) data.name = String(args.name);
  if (args.description) data.description = String(args.description);
  if (args.intervals) data.intervals = JSON.parse(String(args.intervals));
  if (args.repeatCount) data.repeatCount = Number(args.repeatCount);
  const row = await prisma.pluse.update({ where: { id }, data });
  console.log('Updated:', row.id);
}

async function deletePluse(id: string) {
  await prisma.pluse.delete({ where: { id } });
  console.log('Deleted:', id);
}

async function listTimerSessions() {
  const rows = await prisma.timerSession.findMany({ orderBy: { createdAt: 'desc' } });
  printTable(
    rows.map((r) =>
      pick(r, ['id', 'name', 'type', 'status', 'elapsedSeconds', 'createdAt']),
    ),
  );
}

async function getTimerSession(id: string) {
  const row = await prisma.timerSession.findUnique({ where: { id } });
  if (!row) return console.log('Not found');
  console.log(JSON.stringify(row, null, 2));
}

async function deleteTimerSession(id: string) {
  await prisma.timerSession.delete({ where: { id } });
  console.log('Deleted:', id);
}

async function listRoadmaps() {
  const rows = await prisma.roadmap.findMany({ orderBy: { createdAt: 'desc' } });
  printTable(rows.map((r) => pick(r, ['id', 'goalTodoId', 'createdAt', 'updatedAt'])));
}

async function getRoadmap(id: string) {
  const row = await prisma.roadmap.findUnique({ where: { id } });
  if (!row) return console.log('Not found');
  console.log(JSON.stringify(row, null, 2));
}

async function deleteRoadmap(id: string) {
  await prisma.roadmap.delete({ where: { id } });
  console.log('Deleted:', id);
}

async function listActionEdges() {
  const rows = await prisma.actionEdge.findMany({ orderBy: { createdAt: 'desc' } });
  printTable(rows.map((r) => pick(r, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function deleteActionEdge(id: string) {
  await prisma.actionEdge.delete({ where: { id } });
  console.log('Deleted:', id);
}

async function listTodoLogs(args: Record<string, string | boolean>) {
  const where: Record<string, unknown> = {};
  if (args.todoId) where.todoId = args.todoId;
  if (args.type) where.type = args.type;
  const rows = await prisma.todoLog.findMany({ where, orderBy: { createdAt: 'desc' } });
  printTable(rows.map((r) => pick(r, ['id', 'todoId', 'type', 'content', 'minutesSpent', 'createdAt'])));
}

async function deleteTodoLog(id: string) {
  await prisma.todoLog.delete({ where: { id } });
  console.log('Deleted:', id);
}

async function wipeAll() {
  await prisma.timerSession.deleteMany();
  await prisma.todoLog.deleteMany();
  await prisma.todoRelation.deleteMany();
  await prisma.actionEdge.deleteMany();
  await prisma.roadmap.deleteMany();
  await prisma.pluse.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.project.deleteMany();
  console.log('All data wiped.');
}

const usage = `Usage:
  pnpm cli <entity> <action> [options]

Entities:
  projects, todos, pluses, timer-sessions, roadmaps, action-edges, todo-logs, all-data

Actions:
  list, get, create, update, delete

Examples:
  pnpm cli projects list
  pnpm cli projects list --status=active
  pnpm cli projects get <id>
  pnpm cli projects create --title="My Project" --color="#ff0000"
  pnpm cli projects update <id> --status=archived
  pnpm cli projects delete <id>

  pnpm cli todos list --status=pending --priority=high
  pnpm cli todos create --title="Fix bug" --projectId=<id> --dueDate=2026-06-10
  pnpm cli todos update <id> --status=done

  pnpm cli all-data wipe`;

async function main() {
  const [, , entity, action, ...rest] = process.argv;
  const args = parseArgs(rest);
  const id = rest.find((a) => !a.startsWith('--'));

  try {
    switch (entity) {
      case 'projects':
        switch (action) {
          case 'list': await listProjects(args); break;
          case 'get': if (!id) throw new Error('ID required'); await getProject(id); break;
          case 'create': await createProject(args); break;
          case 'update': if (!id) throw new Error('ID required'); await updateProject(id, args); break;
          case 'delete': if (!id) throw new Error('ID required'); await deleteProject(id); break;
          default: console.log(usage);
        }
        break;
      case 'todos':
        switch (action) {
          case 'list': await listTodos(args); break;
          case 'get': if (!id) throw new Error('ID required'); await getTodo(id); break;
          case 'create': await createTodo(args); break;
          case 'update': if (!id) throw new Error('ID required'); await updateTodo(id, args); break;
          case 'delete': if (!id) throw new Error('ID required'); await deleteTodo(id); break;
          default: console.log(usage);
        }
        break;
      case 'pluses':
        switch (action) {
          case 'list': await listPluses(); break;
          case 'get': if (!id) throw new Error('ID required'); await getPluse(id); break;
          case 'create': await createPluse(args); break;
          case 'update': if (!id) throw new Error('ID required'); await updatePluse(id, args); break;
          case 'delete': if (!id) throw new Error('ID required'); await deletePluse(id); break;
          default: console.log(usage);
        }
        break;
      case 'timer-sessions':
        switch (action) {
          case 'list': await listTimerSessions(); break;
          case 'get': if (!id) throw new Error('ID required'); await getTimerSession(id); break;
          case 'delete': if (!id) throw new Error('ID required'); await deleteTimerSession(id); break;
          default: console.log(usage);
        }
        break;
      case 'roadmaps':
        switch (action) {
          case 'list': await listRoadmaps(); break;
          case 'get': if (!id) throw new Error('ID required'); await getRoadmap(id); break;
          case 'delete': if (!id) throw new Error('ID required'); await deleteRoadmap(id); break;
          default: console.log(usage);
        }
        break;
      case 'action-edges':
        switch (action) {
          case 'list': await listActionEdges(); break;
          case 'delete': if (!id) throw new Error('ID required'); await deleteActionEdge(id); break;
          default: console.log(usage);
        }
        break;
      case 'todo-logs':
        switch (action) {
          case 'list': await listTodoLogs(args); break;
          case 'delete': if (!id) throw new Error('ID required'); await deleteTodoLog(id); break;
          default: console.log(usage);
        }
        break;
      case 'all-data':
        if (action === 'wipe') await wipeAll();
        else console.log(usage);
        break;
      default:
        console.log(usage);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
