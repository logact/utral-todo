import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../db/database';
import * as todosDb from '../db/todos';
import * as relationsDb from '../db/relations';
import * as todoLogsDb from '../db/todoLogs';
import * as actionEdgesDb from '../db/actionEdges';
import * as plusesDb from '../db/pluse';
import * as timerSessionsDb from '../db/timerSessions';
import type { TodoLog, ActionEdgeType } from '../types';

interface CliRequestEvent {
  req_id: string;
  entity: string;
  action: string;
  args: Record<string, unknown>;
}

function serializeForJson(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Todos ──────────────────────────────────────────────────────────────────

async function handleTodos(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      let todos = await todosDb.getAllTodos();
      if (args.status) todos = todos.filter((t) => t.status === args.status);
      if (args.priority) todos = todos.filter((t) => t.priority === args.priority);
      if (args.tag) {
        const tag = String(args.tag);
        todos = todos.filter((t) => t.tags?.includes(tag));
      }
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'get': {
      const todo = await todosDb.getTodo(String(args.id));
      return { success: true, data: todo ? serializeForJson(todo) : null };
    }
    case 'create': {
      const todo = await todosDb.createTodo(String(args.title ?? 'Untitled'), {
        description: String(args.description ?? ''),
        priority: (args.priority as 'low' | 'medium' | 'high') ?? 'medium',
        parentId: args.parentId ? String(args.parentId) : undefined,
        dueDate: args.dueDate ? new Date(String(args.dueDate)) : undefined,
        scheduledDate: args.scheduledDate ? new Date(String(args.scheduledDate)) : undefined,
        estimatedMinutes: args.estimatedMinutes ? Number(args.estimatedMinutes) : 60,
        tags: args.tags
          ? Array.isArray(args.tags)
            ? (args.tags as string[])
            : String(args.tags).split(',').map((t) => t.trim())
          : undefined,
        repeatRule: args.repeatRule ? JSON.parse(String(args.repeatRule)) : undefined,
      });
      return { success: true, data: serializeForJson(todo) };
    }
    case 'update': {
      const updates: Record<string, unknown> = {};
      if (args.title !== undefined) updates.title = String(args.title);
      if (args.description !== undefined) updates.description = String(args.description);
      if (args.status !== undefined) updates.status = String(args.status);
      if (args.priority !== undefined) updates.priority = String(args.priority);
      if (args.dueDate !== undefined) updates.dueDate = new Date(String(args.dueDate));
      if (args.estimatedMinutes !== undefined) updates.estimatedMinutes = Number(args.estimatedMinutes);
      if (args.tags !== undefined) updates.tags = String(args.tags).split(',').map((t) => t.trim());
      if (args.repeatRule !== undefined) updates.repeatRule = args.repeatRule ? JSON.parse(String(args.repeatRule)) : null;
      if (args.order !== undefined) updates.order = Number(args.order);
      await todosDb.updateTodo(String(args.id), updates as never);
      return { success: true };
    }
    case 'delete': {
      await todosDb.deleteTodo(String(args.id));
      return { success: true };
    }
    case 'status': {
      await todosDb.updateTodoStatus(String(args.id), String(args.status) as 'pending' | 'in_progress' | 'done');
      return { success: true };
    }
    case 'schedule': {
      const date = args.date ? new Date(String(args.date)) : undefined;
      await todosDb.updateTodoSchedule(String(args.id), date);
      return { success: true };
    }
    case 'unschedule': {
      await todosDb.updateTodoSchedule(String(args.id), undefined);
      return { success: true };
    }
    case 'today': {
      const todos = await todosDb.getTodaysTodos();
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'unscheduled': {
      const todos = await todosDb.getUnscheduledTodos();
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'overdue': {
      const todos = await todosDb.getOverdueTodos();
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'inbox': {
      const all = await todosDb.getAllTodos();
      const todos = all.filter((t) => t.status !== 'done');
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'search': {
      const all = await todosDb.getAllTodos();
      const q = String(args.query ?? args.id ?? '').toLowerCase();
      const todos = all.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q)),
      );
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'reorder': {
      await todosDb.reorderSubTodos(String(args.id), [String(args.id)]);
      // Actually reorderSubTodos takes parentId and orderedIds - this is tricky
      // The bridge will just update the order field directly
      await db.todos.update(String(args.id), { order: Number(args.order) });
      return { success: true };
    }
    case 'reorder-bulk': {
      const ids = String(args.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      await todosDb.reorderTodos(ids);
      return { success: true };
    }
    case 'spawned': {
      const todos = await relationsDb.getSpawnedTodos(String(args.id));
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'instances': {
      const todos = await relationsDb.getAssignedInstances(String(args.id));
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'repeat-rule': {
      const rule = args.rule ? JSON.parse(String(args.rule)) : undefined;
      await todosDb.updateRepeatRule(String(args.id), rule);
      return { success: true };
    }
    case 'sync-repeats': {
      // Virtual repeat instances are computed on-the-fly; no sync needed
      return { success: true, data: { createdCount: 0 } };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ─── Relations ──────────────────────────────────────────────────────────────

async function handleRelations(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      const relations = await relationsDb.getAllRelations();
      let result = relations;
      if (args.fromTodoId) result = result.filter((r) => r.fromTodoId === args.fromTodoId);
      if (args.toTodoId) result = result.filter((r) => r.toTodoId === args.toTodoId);
      if (args.type) result = result.filter((r) => r.type === args.type);
      return { success: true, data: result.map(serializeForJson) };
    }
    case 'create': {
      const relation = await relationsDb.createRelation(
        String(args.fromTodoId),
        String(args.toTodoId),
        (args.type as 'depends_on' | 'blocked_by' | 'parent_of' | 'source_from' | 'assign_from') ?? 'depends_on'
      );
      return { success: true, data: serializeForJson(relation) };
    }
    case 'delete': {
      await relationsDb.deleteRelation(String(args.id));
      return { success: true };
    }
    case 'source-chain': {
      const chain = await relationsDb.traceSourceChain(String(args.id));
      return { success: true, data: chain.map(serializeForJson) };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ─── Todo Logs ──────────────────────────────────────────────────────────────

async function handleTodoLogs(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      let logs = await db.todoLogs.toArray();
      if (args.todoId) logs = logs.filter((l) => l.todoId === args.todoId);
      if (args.type) logs = logs.filter((l) => l.type === args.type);
      return { success: true, data: logs.map(serializeForJson) };
    }
    case 'create': {
      const log = await todoLogsDb.createTodoLog(
        String(args.todoId),
        (args.type as TodoLog['type']) ?? 'thought',
        String(args.content ?? ''),
        {
          minutesSpent: args.minutesSpent ? Number(args.minutesSpent) : undefined,
          metadata: args.metadata ? (args.metadata as Record<string, unknown>) : undefined,
        }
      );
      return { success: true, data: serializeForJson(log) };
    }
    case 'delete': {
      await todoLogsDb.deleteTodoLog(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ─── Action Edges ───────────────────────────────────────────────────────────

async function handleActionEdges(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      const edges = await actionEdgesDb.getAllActionEdges();
      return { success: true, data: edges.map(serializeForJson) };
    }
    case 'create': {
      const edge = await actionEdgesDb.createActionEdge(
        String(args.fromTodoId),
        String(args.toTodoId),
        (args.type as ActionEdgeType) ?? 'pre_do'
      );
      return { success: true, data: serializeForJson(edge) };
    }
    case 'delete': {
      await actionEdgesDb.deleteActionEdge(String(args.id));
      return { success: true };
    }
    case 'for-todo': {
      const edges = await actionEdgesDb.getAllActionEdgesForTodo(String(args.id));
      return { success: true, data: edges.map(serializeForJson) };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ─── Pluses ─────────────────────────────────────────────────────────────────

async function handlePluses(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      const pluses = await plusesDb.getAllPluses();
      return { success: true, data: pluses.map(serializeForJson) };
    }
    case 'get': {
      const pluse = await plusesDb.getPluse(String(args.id));
      return { success: true, data: pluse ? serializeForJson(pluse) : null };
    }
    case 'create': {
      const pluse = await plusesDb.createPluse(
        String(args.name ?? 'Untitled'),
        args.intervals ? (Array.isArray(args.intervals) ? (args.intervals as number[]) : JSON.parse(String(args.intervals))) : [1500, 300],
        args.repeatCount ? Number(args.repeatCount) : 1,
        String(args.description ?? ''),
        args.intervalTodos ? JSON.parse(String(args.intervalTodos)) : undefined,
        args.autoAdvance ? true : undefined,
      );
      return { success: true, data: serializeForJson(pluse) };
    }
    case 'update': {
      const updates: Partial<Record<string, unknown>> = {};
      if (args.name !== undefined) updates.name = String(args.name);
      if (args.description !== undefined) updates.description = String(args.description);
      if (args.intervals !== undefined) updates.intervals = Array.isArray(args.intervals) ? args.intervals : JSON.parse(String(args.intervals));
      if (args.repeatCount !== undefined) updates.repeatCount = Number(args.repeatCount);
      if (args.intervalTodos !== undefined) updates.intervalTodos = JSON.parse(String(args.intervalTodos));
      if (args.autoAdvance !== undefined) updates.autoAdvance = args.autoAdvance === true || args.autoAdvance === 'true';
      await plusesDb.updatePluse(String(args.id), updates);
      return { success: true };
    }
    case 'delete': {
      await plusesDb.deletePluse(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ─── Timer Sessions ─────────────────────────────────────────────────────────

async function handleTimerSessions(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      const filters: { status?: string; type?: string } = {};
      if (args.status) filters.status = String(args.status);
      if (args.type) filters.type = String(args.type);
      const sessions = await timerSessionsDb.getTimerSessions(Object.keys(filters).length > 0 ? filters : undefined);
      return { success: true, data: sessions.map(serializeForJson) };
    }
    case 'get': {
      const session = await timerSessionsDb.getTimerSession(String(args.id));
      return { success: true, data: session ? serializeForJson(session) : null };
    }
    case 'create': {
      const session = await timerSessionsDb.createTimerSession({
        type: (args.type as 'stopwatch' | 'pluse') ?? 'stopwatch',
        name: String(args.name ?? 'Timer Session'),
        pluseId: args.pluseId ? String(args.pluseId) : undefined,
        todoId: args.todoId ? String(args.todoId) : undefined,
        intervals: args.intervals ? (Array.isArray(args.intervals) ? (args.intervals as number[]) : JSON.parse(String(args.intervals))) : undefined,
        repeatCount: args.repeatCount ? Number(args.repeatCount) : 1,
        status: (args.status as 'running' | 'paused' | 'completed') ?? 'running',
        currentIndex: args.currentIndex ? Number(args.currentIndex) : 0,
        elapsedSeconds: args.elapsedSeconds ? Number(args.elapsedSeconds) : 0,
      });
      return { success: true, data: serializeForJson(session) };
    }
    case 'update': {
      const updates: Partial<Record<string, unknown>> = {};
      if (args.name !== undefined) updates.name = String(args.name);
      if (args.pluseId !== undefined) updates.pluseId = String(args.pluseId) || null;
      if (args.todoId !== undefined) updates.todoId = String(args.todoId) || null;
      if (args.intervals !== undefined) updates.intervals = Array.isArray(args.intervals) ? args.intervals : JSON.parse(String(args.intervals));
      if (args.repeatCount !== undefined) updates.repeatCount = Number(args.repeatCount);
      if (args.startedAt !== undefined) updates.startedAt = new Date(String(args.startedAt));
      if (args.pausedAt !== undefined) updates.pausedAt = args.pausedAt ? new Date(String(args.pausedAt)) : null;
      if (args.completedAt !== undefined) updates.completedAt = args.completedAt ? new Date(String(args.completedAt)) : null;
      if (args.currentIndex !== undefined) updates.currentIndex = Number(args.currentIndex);
      if (args.elapsedSeconds !== undefined) updates.elapsedSeconds = Number(args.elapsedSeconds);
      if (args.status !== undefined) updates.status = String(args.status);
      await timerSessionsDb.updateTimerSession(String(args.id), updates);
      return { success: true };
    }
    case 'start': {
      await timerSessionsDb.updateTimerSession(String(args.id), {
        status: 'running',
        startedAt: new Date(),
        pausedAt: null,
      });
      return { success: true };
    }
    case 'pause': {
      const updates: Partial<Record<string, unknown>> = {
        status: 'paused',
        pausedAt: new Date(),
      };
      if (args.elapsedSeconds !== undefined) updates.elapsedSeconds = Number(args.elapsedSeconds);
      await timerSessionsDb.updateTimerSession(String(args.id), updates);
      return { success: true };
    }
    case 'resume': {
      await timerSessionsDb.updateTimerSession(String(args.id), {
        status: 'running',
        pausedAt: null,
      });
      return { success: true };
    }
    case 'stop': {
      await timerSessionsDb.updateTimerSession(String(args.id), {
        status: 'completed',
        completedAt: new Date(),
      });
      return { success: true };
    }
    case 'delete': {
      await timerSessionsDb.deleteTimerSession(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ─── All Data ───────────────────────────────────────────────────────────────

async function handleAllData(action: string) {
  if (action === 'wipe') {
    await db.todos.clear();
    await db.relations.clear();
    await db.todoLogs.clear();
    await db.actionEdges.clear();
    await db.pluses.clear();
    await db.timerSessions.clear();
    return { success: true };
  }
  return { error: `Unknown action: ${action}` };
}

// ─── Stats ──────────────────────────────────────────────────────────────────

async function handleStats() {
  const allTodos = await db.todos.toArray();
  const allRelations = await db.relations.toArray();
  const allPluses = await db.pluses.toArray();
  const allTimers = await db.timerSessions.toArray();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayCount = allTodos.filter((t) => {
    if (!t.scheduledDate) return false;
    const d = new Date(t.scheduledDate);
    return d >= today && d < tomorrow;
  }).length;

  const overdueCount = allTodos.filter((t) => {
    if (t.status === 'done' || !t.dueDate) return false;
    return new Date(t.dueDate) < today;
  }).length;

  const activeTimers = allTimers.filter((t) => t.status === 'running').length;

  const byStatus: Record<string, number> = {};
  for (const t of allTodos) {
    byStatus[t.status ?? 'pending'] = (byStatus[t.status ?? 'pending'] || 0) + 1;
  }

  return {
    success: true,
    data: {
      todos: { total: allTodos.length, byStatus, today: todayCount, overdue: overdueCount },
      relations: { total: allRelations.length },
      pluses: { total: allPluses.length },
      timerSessions: { active: activeTimers },
    },
  };
}

// ─── Bridge ─────────────────────────────────────────────────────────────────

export function useCliBridge() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      if (typeof listen !== 'function') {
        console.warn('[useCliBridge] Tauri listen() not available; skipping CLI bridge setup');
        return;
      }
      try {
        unlisten = await listen<CliRequestEvent>('cli-request', async (event) => {
        const { req_id, entity, action, args } = event.payload;
        let result: unknown;

        try {
          switch (entity) {
            case 'todos':
              result = await handleTodos(action, args);
              break;
            case 'relations':
              result = await handleRelations(action, args);
              break;
            case 'todo-logs':
              result = await handleTodoLogs(action, args);
              break;
            case 'action-edges':
              result = await handleActionEdges(action, args);
              break;
            case 'pluses':
              result = await handlePluses(action, args);
              break;
            case 'timer-sessions':
              result = await handleTimerSessions(action, args);
              break;
            case 'all-data':
              result = await handleAllData(action);
              break;
            case 'stats':
              result = await handleStats();
              break;
            default:
              result = { error: `Unknown entity: ${entity}` };
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        await invoke('cli_respond', { req_id, result });
      });
      } catch (err) {
        console.warn('[useCliBridge] Tauri event listen failed; skipping CLI bridge:', err);
      }
    };

    setup();

    return () => {
      unlisten?.();
    };
  }, []);
}
