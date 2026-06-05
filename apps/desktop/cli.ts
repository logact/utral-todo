const CLI_PORT = 9876;
const CLI_URL = `http://127.0.0.1:${CLI_PORT}/cli`;

interface CliResponse {
  success?: boolean;
  data?: unknown;
  error?: string;
}

async function callCli(entity: string, action: string, args: Record<string, unknown>): Promise<CliResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(CLI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, action, args }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return (await res.json()) as CliResponse;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: 'Request timed out. Is the Desktop app running?' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return { error: 'Desktop app is not running. Start it first, then try again.' };
    }
    return { error: msg };
  }
}

function printTable(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    console.log('(no results)');
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)));
  const pad = (s: string, w: number) => s.padEnd(w, ' ');
  const line = widths.map((w) => '-'.repeat(w + 2)).join('+');
  console.log('+' + line + '+');
  console.log('| ' + keys.map((k, i) => pad(k, widths[i])).join(' | ') + ' |');
  console.log('+' + line + '+');
  for (const row of rows) {
    console.log('| ' + keys.map((k, i) => pad(String(row[k] ?? ''), widths[i])).join(' | ') + ' |');
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
  const res = await callCli('projects', 'list', args);
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printTable(rows.map((r) => pick(r, ['id', 'title', 'status', 'color', 'createdAt'])));
}

async function getProject(id: string) {
  const res = await callCli('projects', 'get', { id });
  if (res.error) { console.error(res.error); return; }
  console.log(JSON.stringify(res.data, null, 2));
}

async function createProject(args: Record<string, string | boolean>) {
  const res = await callCli('projects', 'create', args);
  if (res.error) { console.error(res.error); return; }
  console.log('Created:', (res.data as Record<string, unknown>)?.id);
}

async function updateProject(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('projects', 'update', { ...args, id });
  if (res.error) { console.error(res.error); return; }
  console.log('Updated:', id);
}

async function deleteProject(id: string) {
  const res = await callCli('projects', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  console.log('Deleted:', id);
}

async function listTodos(args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'list', args);
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printTable(rows.map((r) => pick(r, ['id', 'title', 'status', 'priority', 'projectId', 'dueDate'])));
}

async function getTodo(id: string) {
  const res = await callCli('todos', 'get', { id });
  if (res.error) { console.error(res.error); return; }
  console.log(JSON.stringify(res.data, null, 2));
}

async function createTodo(args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'create', args);
  if (res.error) { console.error(res.error); return; }
  console.log('Created:', (res.data as Record<string, unknown>)?.id);
}

async function updateTodo(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'update', { ...args, id });
  if (res.error) { console.error(res.error); return; }
  console.log('Updated:', id);
}

async function deleteTodo(id: string) {
  const res = await callCli('todos', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  console.log('Deleted:', id);
}

async function listPluses() {
  const res = await callCli('pluses', 'list', {});
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printTable(rows.map((r) => pick(r, ['id', 'name', 'description', 'intervals', 'repeatCount', 'createdAt'])));
}

async function getPluse(id: string) {
  const res = await callCli('pluses', 'get', { id });
  if (res.error) { console.error(res.error); return; }
  console.log(JSON.stringify(res.data, null, 2));
}

async function createPluse(args: Record<string, string | boolean>) {
  const res = await callCli('pluses', 'create', args);
  if (res.error) { console.error(res.error); return; }
  console.log('Created:', (res.data as Record<string, unknown>)?.id);
}

async function updatePluse(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('pluses', 'update', { ...args, id });
  if (res.error) { console.error(res.error); return; }
  console.log('Updated:', id);
}

async function deletePluse(id: string) {
  const res = await callCli('pluses', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  console.log('Deleted:', id);
}

async function listTimerSessions() {
  const res = await callCli('timer-sessions', 'list', {});
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printTable(rows.map((r) => pick(r, ['id', 'name', 'type', 'status', 'elapsedSeconds', 'createdAt'])));
}

async function getTimerSession(id: string) {
  const res = await callCli('timer-sessions', 'get', { id });
  if (res.error) { console.error(res.error); return; }
  console.log(JSON.stringify(res.data, null, 2));
}

async function deleteTimerSession(id: string) {
  const res = await callCli('timer-sessions', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  console.log('Deleted:', id);
}

async function listRoadmaps() {
  const res = await callCli('roadmaps', 'list', {});
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printTable(rows.map((r) => pick(r, ['id', 'goalTodoId', 'createdAt', 'updatedAt'])));
}

async function getRoadmap(id: string) {
  const res = await callCli('roadmaps', 'get', { id });
  if (res.error) { console.error(res.error); return; }
  console.log(JSON.stringify(res.data, null, 2));
}

async function deleteRoadmap(id: string) {
  const res = await callCli('roadmaps', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  console.log('Deleted:', id);
}

async function listActionEdges() {
  const res = await callCli('action-edges', 'list', {});
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printTable(rows.map((r) => pick(r, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function deleteActionEdge(id: string) {
  const res = await callCli('action-edges', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  console.log('Deleted:', id);
}

async function listTodoLogs(args: Record<string, string | boolean>) {
  const res = await callCli('todo-logs', 'list', args);
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printTable(rows.map((r) => pick(r, ['id', 'todoId', 'type', 'content', 'minutesSpent', 'createdAt'])));
}

async function deleteTodoLog(id: string) {
  const res = await callCli('todo-logs', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  console.log('Deleted:', id);
}

async function wipeAll() {
  const res = await callCli('all-data', 'wipe', {});
  if (res.error) { console.error(res.error); return; }
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
  }
}

main();
