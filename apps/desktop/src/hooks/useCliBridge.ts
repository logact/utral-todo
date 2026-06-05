import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../db/database';
import * as todosDb from '../db/todos';
import * as projectsDb from '../db/projects';
import * as relationsDb from '../db/relations';
import * as todoLogsDb from '../db/todoLogs';
import * as roadmapsDb from '../db/roadmaps';
import * as actionEdgesDb from '../db/actionEdges';
import * as plusesDb from '../db/pluse';
import * as timerSessionsDb from '../db/timerSessions';
import type { TodoLog } from '../types';

interface CliRequestEvent {
  req_id: string;
  entity: string;
  action: string;
  args: Record<string, unknown>;
}

function serializeForJson<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj));
}

async function handleTodos(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      let todos = await todosDb.getAllTodos();
      if (args.status) todos = todos.filter((t) => t.status === args.status);
      if (args.projectId) todos = todos.filter((t) => t.projectId === args.projectId);
      if (args.priority) todos = todos.filter((t) => t.priority === args.priority);
      return { success: true, data: todos.map(serializeForJson) };
    }
    case 'get': {
      const todo = await todosDb.getTodo(String(args.id));
      return { success: true, data: todo ? serializeForJson(todo) : null };
    }
    case 'create': {
      const todo = await todosDb.createTodo(String(args.title ?? 'Untitled'), {
        description: String(args.description ?? ''),
        instructions: String(args.instructions ?? ''),
        priority: (args.priority as 'low' | 'medium' | 'high') ?? 'medium',
        projectId: args.projectId ? String(args.projectId) : undefined,
        parentId: args.parentId ? String(args.parentId) : undefined,
        dueDate: args.dueDate ? new Date(String(args.dueDate)) : undefined,
        estimatedMinutes: args.estimatedMinutes ? Number(args.estimatedMinutes) : 60,
        tags: args.tags
          ? Array.isArray(args.tags)
            ? (args.tags as string[])
            : JSON.parse(String(args.tags))
          : undefined,
        isGoal: args.isGoal ? true : undefined,
      });
      return { success: true, data: serializeForJson(todo) };
    }
    case 'update': {
      const updates: Partial<{
        title: string;
        description: string;
        instructions: string;
        status: string;
        priority: string;
        projectId: string;
        dueDate: Date;
        estimatedMinutes: number;
      }> = {};
      if (args.title !== undefined) updates.title = String(args.title);
      if (args.description !== undefined) updates.description = String(args.description);
      if (args.instructions !== undefined) updates.instructions = String(args.instructions);
      if (args.status !== undefined) updates.status = String(args.status);
      if (args.priority !== undefined) updates.priority = String(args.priority);
      if (args.projectId !== undefined) updates.projectId = String(args.projectId);
      if (args.dueDate !== undefined) updates.dueDate = new Date(String(args.dueDate));
      if (args.estimatedMinutes !== undefined) updates.estimatedMinutes = Number(args.estimatedMinutes);
      await todosDb.updateTodo(String(args.id), updates);
      return { success: true };
    }
    case 'delete': {
      await todosDb.deleteTodo(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

async function handleProjects(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      let projects = await projectsDb.getAllProjects();
      if (args.status) projects = projects.filter((p) => p.status === args.status);
      return { success: true, data: projects.map(serializeForJson) };
    }
    case 'get': {
      const project = await projectsDb.getProject(String(args.id));
      return { success: true, data: project ? serializeForJson(project) : null };
    }
    case 'create': {
      const project = await projectsDb.createProject(String(args.title ?? 'Untitled'), {
        description: String(args.description ?? ''),
        color: String(args.color ?? '#6366f1'),
        deadline: args.deadline ? new Date(String(args.deadline)) : undefined,
      });
      return { success: true, data: serializeForJson(project) };
    }
    case 'update': {
      const updates: Partial<Record<string, unknown>> = {};
      if (args.title !== undefined) updates.title = String(args.title);
      if (args.description !== undefined) updates.description = String(args.description);
      if (args.status !== undefined) updates.status = String(args.status);
      if (args.color !== undefined) updates.color = String(args.color);
      await projectsDb.updateProject(String(args.id), updates);
      return { success: true };
    }
    case 'delete': {
      await projectsDb.deleteProject(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

async function handleRelations(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      const relations = await relationsDb.getAllRelations();
      return { success: true, data: relations.map(serializeForJson) };
    }
    case 'create': {
      const relation = await relationsDb.createRelation(
        String(args.fromTodoId),
        String(args.toTodoId),
        (args.type as 'blocks' | 'source_from' | 'assign_from' | 'relates_to') ?? 'relates_to'
      );
      return { success: true, data: serializeForJson(relation) };
    }
    case 'delete': {
      await relationsDb.deleteRelation(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

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

async function handleRoadmaps(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      const roadmaps = await roadmapsDb.getAllRoadmaps();
      return { success: true, data: roadmaps.map(serializeForJson) };
    }
    case 'get': {
      const roadmap = await db.roadmaps.get(String(args.id));
      return { success: true, data: roadmap ? serializeForJson(roadmap) : null };
    }
    case 'delete': {
      await roadmapsDb.deleteRoadmap(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

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
        (args.type as 'insight' | 'try' | 'pre_do') ?? 'insight'
      );
      return { success: true, data: serializeForJson(edge) };
    }
    case 'delete': {
      await actionEdgesDb.deleteActionEdge(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

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
        args.intervals ? (Array.isArray(args.intervals) ? (args.intervals as number[]) : JSON.parse(String(args.intervals))) : [25, 5],
        args.repeatCount ? Number(args.repeatCount) : 1,
        String(args.description ?? '')
      );
      return { success: true, data: serializeForJson(pluse) };
    }
    case 'update': {
      const updates: Partial<Record<string, unknown>> = {};
      if (args.name !== undefined) updates.name = String(args.name);
      if (args.description !== undefined) updates.description = String(args.description);
      if (args.intervals !== undefined) updates.intervals = Array.isArray(args.intervals) ? args.intervals : JSON.parse(String(args.intervals));
      if (args.repeatCount !== undefined) updates.repeatCount = Number(args.repeatCount);
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

async function handleTimerSessions(action: string, args: Record<string, unknown>) {
  switch (action) {
    case 'list': {
      const sessions = await timerSessionsDb.getTimerSessions();
      return { success: true, data: sessions.map(serializeForJson) };
    }
    case 'get': {
      const session = await timerSessionsDb.getTimerSession(String(args.id));
      return { success: true, data: session ? serializeForJson(session) : null };
    }
    case 'delete': {
      await timerSessionsDb.deleteTimerSession(String(args.id));
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

async function handleAllData(action: string) {
  if (action === 'wipe') {
    await db.todos.clear();
    await db.relations.clear();
    await db.todoLogs.clear();
    await db.roadmaps.clear();
    await db.actionEdges.clear();
    await db.pluses.clear();
    await db.projects.clear();
    await db.timerSessions.clear();
    return { success: true };
  }
  return { error: `Unknown action: ${action}` };
}

export function useCliBridge() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<CliRequestEvent>('cli-request', async (event) => {
        const { req_id, entity, action, args } = event.payload;
        let result: unknown;

        try {
          switch (entity) {
            case 'todos':
              result = await handleTodos(action, args);
              break;
            case 'projects':
              result = await handleProjects(action, args);
              break;
            case 'relations':
              result = await handleRelations(action, args);
              break;
            case 'todo-logs':
              result = await handleTodoLogs(action, args);
              break;
            case 'roadmaps':
              result = await handleRoadmaps(action, args);
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
            default:
              result = { error: `Unknown entity: ${entity}` };
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        await invoke('cli_respond', { req_id, result });
      });
    };

    setup();

    return () => {
      unlisten?.();
    };
  }, []);
}
