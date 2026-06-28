const CLI_PORT = 9876;
const CLI_URL = `http://127.0.0.1:${CLI_PORT}/cli`;

interface CliResponse {
  success?: boolean;
  data?: unknown;
  error?: string;
}

let outputFormat: 'json' | 'table' = 'table';
let quietMode = false;

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

function setOutputFormat(format: string) {
  if (format === 'json' || format === 'table') {
    outputFormat = format;
  }
}

function printOutput(data: unknown) {
  if (outputFormat === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('(no results)');
      return;
    }
    if (typeof data[0] === 'object') {
      printTable(data as Record<string, unknown>[]);
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
      const eq = arg.indexOf('=');
      if (eq > 2) {
        const k = arg.slice(2, eq);
        let v = arg.slice(eq + 1);
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
  if (args.quiet) quietMode = true;
}

function removeGlobalFlags(args: Record<string, string | boolean>) {
  const { format: _format, quiet: _quiet, ...rest } = args;
  return rest;
}

function fail(message: string): never {
  console.error('Error:', message);
  process.exit(1);
}

// ─── Todos ──────────────────────────────────────────────────────────────────

async function listTodos(args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'list', args);
  if (res.error) { console.error(res.error); return; }
  const rows = (res.data as Record<string, unknown>[]) || [];
  printOutput(rows.map((r) => pick(r, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate'])));
}

async function getTodo(id: string) {
  const res = await callCli('todos', 'get', { id });
  if (res.error) { console.error(res.error); return; }
  printOutput(res.data);
}

async function createTodo(args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'create', args);
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Created todo:', (res.data as Record<string, unknown>)?.id);
  printOutput(res.data);
}

async function updateTodo(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'update', { ...args, id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Updated todo:', id);
  printOutput(res.data);
}

async function deleteTodo(id: string) {
  const res = await callCli('todos', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Deleted todo:', id);
}

async function setTodoStatus(id: string, args: Record<string, string | boolean>) {
  const status = String(args.status ?? args._positional ?? '');
  const res = await callCli('todos', 'status', { id, status });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log(`Status updated to ${status}:`, id);
  printOutput(res.data);
}

async function scheduleTodo(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'schedule', { id, date: args.date });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log(args.date ? 'Scheduled:' : 'Unscheduled:', id);
  printOutput(res.data);
}

async function unscheduleTodo(id: string) {
  const res = await callCli('todos', 'unschedule', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Unscheduled:', id);
  printOutput(res.data);
}

async function todosToday() {
  const res = await callCli('todos', 'today', {});
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'priority', 'dueDate'])));
}

async function todosUnscheduled() {
  const res = await callCli('todos', 'unscheduled', {});
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'priority', 'dueDate'])));
}

async function todosOverdue() {
  const res = await callCli('todos', 'overdue', {});
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'priority', 'dueDate'])));
}

async function todosInbox() {
  const res = await callCli('todos', 'inbox', {});
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate'])));
}

async function searchTodos(query: string) {
  const res = await callCli('todos', 'search', { query });
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'priority', 'dueDate', 'scheduledDate'])));
}

async function reorderTodo(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'reorder', { id, order: args.order ?? args._positional });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Reordered todo:', id);
}

async function bulkReorderTodos(args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'reorder-bulk', { ids: args.ids });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Reordered todos');
}

async function getSpawnedTodos(id: string) {
  const res = await callCli('todos', 'spawned', { id });
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'priority'])));
}

async function getTodoInstances(id: string) {
  const res = await callCli('todos', 'instances', { id });
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'scheduledDate'])));
}

async function setRepeatRule(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'repeat-rule', { id, rule: args.rule });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Repeat rule updated:', id);
}

async function syncRepeatTodos(args: Record<string, string | boolean>) {
  const res = await callCli('todos', 'sync-repeats', { startDate: args.startDate, endDate: args.endDate });
  if (res.error) { console.error(res.error); return; }
  printOutput(res.data);
}

// ─── Relations ──────────────────────────────────────────────────────────────

async function listRelations(args: Record<string, string | boolean>) {
  const res = await callCli('relations', 'list', args);
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function createRelation(args: Record<string, string | boolean>) {
  const res = await callCli('relations', 'create', args);
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Created relation:', (res.data as Record<string, unknown>)?.id);
  printOutput(res.data);
}

async function deleteRelation(id: string) {
  const res = await callCli('relations', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Deleted relation:', id);
}

async function sourceChain(id: string) {
  const res = await callCli('relations', 'source-chain', { id });
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'title', 'status', 'priority'])));
}

// ─── Todo Logs ──────────────────────────────────────────────────────────────

async function listTodoLogs(args: Record<string, string | boolean>) {
  const res = await callCli('todo-logs', 'list', args);
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'todoId', 'type', 'content', 'minutesSpent', 'createdAt'])));
}

async function createTodoLog(args: Record<string, string | boolean>) {
  const res = await callCli('todo-logs', 'create', args);
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Created todo log:', (res.data as Record<string, unknown>)?.id);
  printOutput(res.data);
}

async function deleteTodoLog(id: string) {
  const res = await callCli('todo-logs', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Deleted todo log:', id);
}

// ─── Action Edges ───────────────────────────────────────────────────────────

async function listActionEdges() {
  const res = await callCli('action-edges', 'list', {});
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'fromTodoId', 'toTodoId', 'type', 'createdAt'])));
}

async function createActionEdge(args: Record<string, string | boolean>) {
  const res = await callCli('action-edges', 'create', args);
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Created action edge:', (res.data as Record<string, unknown>)?.id);
  printOutput(res.data);
}

async function deleteActionEdge(id: string) {
  const res = await callCli('action-edges', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Deleted action edge:', id);
}

async function actionEdgesForTodo(todoId: string) {
  const res = await callCli('action-edges', 'for-todo', { id: todoId });
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'fromTodoId', 'toTodoId', 'type'])));
}

// ─── Pluses ─────────────────────────────────────────────────────────────────

async function listPluses() {
  const res = await callCli('pluses', 'list', {});
  if (res.error) { console.error(res.error); return; }
  printOutput((res.data as Record<string, unknown>[])?.map((r) => pick(r, ['id', 'name', 'description', 'intervals', 'repeatCount', 'createdAt'])));
}

async function getPluse(id: string) {
  const res = await callCli('pluses', 'get', { id });
  if (res.error) { console.error(res.error); return; }
  printOutput(res.data);
}

async function createPluse(args: Record<string, string | boolean>) {
  const res = await callCli('pluses', 'create', args);
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Created pluse:', (res.data as Record<string, unknown>)?.id);
  printOutput(res.data);
}

async function updatePluse(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('pluses', 'update', { ...args, id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Updated pluse:', id);
  printOutput(res.data);
}

async function deletePluse(id: string) {
  const res = await callCli('pluses', 'delete', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Deleted pluse:', id);
}

// ─── Pluse Timers ──────────────────────────────────────────────────────────

async function getActivePluseTimer() {
  const res = await callCli('pluse-timers', 'active', {});
  if (res.error) { console.error(res.error); return; }
  printOutput(res.data);
}

async function startPluseTimer(id: string) {
  const res = await callCli('pluse-timers', 'start', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Started pluse timer:', id);
  printOutput(res.data);
}

async function pausePluseTimer(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('pluse-timers', 'pause', { id, accumulatedSeconds: args.accumulatedSeconds, currentIntervalIndex: args.currentIntervalIndex });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Paused pluse timer:', id);
  printOutput(res.data);
}

async function resumePluseTimer(id: string) {
  const res = await callCli('pluse-timers', 'resume', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Resumed pluse timer:', id);
  printOutput(res.data);
}

async function stopPluseTimer(id: string) {
  const res = await callCli('pluse-timers', 'stop', { id });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Stopped pluse timer:', id);
  printOutput(res.data);
}

async function advancePluseTimer(id: string, args: Record<string, string | boolean>) {
  const res = await callCli('pluse-timers', 'advance', { id, currentIntervalIndex: args.currentIntervalIndex });
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('Advanced pluse timer:', id);
  printOutput(res.data);
}

// ─── All Data ───────────────────────────────────────────────────────────────

async function wipeAll() {
  const res = await callCli('all-data', 'wipe', {});
  if (res.error) { console.error(res.error); return; }
  if (!quietMode) console.log('All data wiped.');
}

// ─── Stats ──────────────────────────────────────────────────────────────────

async function showStats() {
  const res = await callCli('stats', '', {});
  if (res.error) { console.error(res.error); return; }
  printOutput(res.data);
}

// ─── Usage ──────────────────────────────────────────────────────────────────

const usage = `Utral Todo Desktop CLI

Usage: pnpm cli <entity> <action> [id] [options]

Global Flags:
  --format=json|table       Output format (default: table)
  --quiet                   Suppress status messages

Entities & Actions:

  todos
    list [--status=...] [--priority=...] [--tag=...]
    get <id>
    create --title="..." [--priority=low|medium|high] [--parentId=...]
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
    create --fromTodoId=... --toTodoId=... --type=...
    delete <id>
    source-chain <id>

  todo-logs
    list [--todoId=...] [--type=...]
    create --todoId=... --type=... --content="..."
    delete <id>

  action-edges
    list
    create --fromTodoId=... --toTodoId=... --type=insight|try|pre_do
    delete <id>
    for-todo <todoId>

  pluses
    list
    get <id>
    create --name="..." [--intervals='[1500,300]'] [--repeatCount=N]
    update <id> [--name=...] [--intervals=...]
    delete <id>

  pluse-timers
    active                    Get active pluse timer
    start <id>                Start pluse timer
    pause <id> [--accumulatedSeconds=N] [--currentIntervalIndex=N]
    resume <id>               Resume pluse timer
    stop <id>                 Stop pluse timer
    advance <id> [--currentIntervalIndex=N]

  stats
    Show overview statistics

  all-data
    wipe

Examples:
  pnpm cli todos today --format=json
  pnpm cli todos search "fix bug" --format=json
  pnpm cli todos create --title="New feature" --priority=high
  pnpm cli timer-sessions start <id>
  pnpm cli stats --format=json
`;

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [, , entity, action, ...rest] = process.argv;
  const allArgs = parseArgs(rest);
  extractGlobalFlags(allArgs);
  const args = removeGlobalFlags(allArgs);

  const id = rest.find((a) => !a.startsWith('--'));
  if (id) args._positional = id;

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
          case 'unschedule': if (!id) fail('ID required'); await unscheduleTodo(id); break;
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

      case 'pluse-timers':
        switch (action) {
          case 'active': await getActivePluseTimer(); break;
          case 'start': if (!id) fail('ID required'); await startPluseTimer(id); break;
          case 'pause': if (!id) fail('ID required'); await pausePluseTimer(id, args); break;
          case 'resume': if (!id) fail('ID required'); await resumePluseTimer(id); break;
          case 'stop': if (!id) fail('ID required'); await stopPluseTimer(id); break;
          case 'advance': if (!id) fail('ID required'); await advancePluseTimer(id, args); break;
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
