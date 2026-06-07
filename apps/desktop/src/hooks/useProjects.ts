import { useState, useEffect, useCallback } from 'react';
import {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
  getProject,
  getProjectTodos,
  getProjectStats,
} from '../db/projects';
import { updateTodo } from '../db/todos';
import type { Project, Todo, TodoStatus } from '../types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const all = await getAllProjects();
    setProjects(all);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [refresh]);

  const add = useCallback(
    async (
      title: string,
      options?: {
        description?: string;
        color?: string;
        deadline?: Date;
      }
    ) => {
      const project = await createProject(title, options);
      setProjects((prev) => [project, ...prev]);
      return project;
    },
    []
  );

  const update = useCallback(async (id: string, updates: Partial<Project>) => {
    await updateProject(id, updates);
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, isLoading, refresh, add, update, remove };
}

export function useProject(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState({ total: 0, done: 0, inProgress: 0, pending: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [p, tds, s] = await Promise.all([
      getProject(projectId),
      getProjectTodos(projectId),
      getProjectStats(projectId),
    ]);
    setProject(p ?? null);
    setTodos(tds);
    setStats(s);
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    refresh();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [refresh]);

  const updateProjectData = useCallback(async (updates: Partial<Project>) => {
    if (!projectId) return;
    await updateProject(projectId, updates);
    setProject((prev) => (prev ? { ...prev, ...updates } : prev));
  }, [projectId]);

  const updateTodoStatusLocal = useCallback(async (todoId: string, status: TodoStatus) => {
    const updates: Partial<Todo> = {
      status,
      completedAt: status === 'done' ? new Date() : undefined,
    };
    if (status === 'in_progress') {
      updates.startedAt = new Date();
    }
    if (status === 'pending') {
      updates.startedAt = undefined;
    }
    await updateTodo(todoId, updates);
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todoId
          ? { ...t, ...updates }
          : t
      )
    );
    // Update stats
    setStats((prev) => {
      const todo = todos.find((t) => t.id === todoId);
      if (!todo) return prev;
      const next = { ...prev };
      // Decrement old status
      if (todo.status === 'done') next.done--;
      else if (todo.status === 'in_progress') next.inProgress--;
      else if (todo.status === 'pending') next.pending--;
      // Increment new status
      if (status === 'done') next.done++;
      else if (status === 'in_progress') next.inProgress++;
      else if (status === 'pending') next.pending++;
      return next;
    });
  }, [todos]);

  const updateTodoLocal = useCallback(async (todoId: string, updates: Partial<Todo>) => {
    await updateTodo(todoId, updates);
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, ...updates } : t))
    );
  }, []);

  return {
    project,
    todos,
    stats,
    isLoading,
    refresh,
    updateProjectData,
    updateTodoStatusLocal,
    updateTodoLocal,
  };
}
