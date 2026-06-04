import { db } from './database';
import type { Project, Todo } from '../types';

export async function createProject(
  title: string,
  options?: {
    description?: string;
    color?: string;
    deadline?: Date;
  }
): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    title,
    description: options?.description ?? '',
    color: options?.color ?? '#6366f1',
    status: 'active',
    createdAt: new Date(),
    deadline: options?.deadline,
  };
  await db.projects.add(project);
  return project;
}

export async function getAllProjects(): Promise<Project[]> {
  return db.projects.toArray();
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function updateProject(
  id: string,
  updates: Partial<Project>
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.color !== undefined) body.color = updates.color;
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.deadline !== undefined) body.deadline = updates.deadline;
  await db.projects.update(id, body);
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}

export async function getProjectTodos(projectId: string): Promise<Todo[]> {
  return db.todos.where('projectId').equals(projectId).toArray();
}

export async function getProjectStats(projectId: string) {
  const todos = await getProjectTodos(projectId);
  const total = todos.length;
  const done = todos.filter((t) => t.status === 'done').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const pending = todos.filter((t) => t.status === 'pending').length;
  return { total, done, inProgress, pending };
}
