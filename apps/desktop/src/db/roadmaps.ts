import { db } from './database';
import { onLocalChange } from './syncEngine';
import type { Roadmap, RoadmapPhase } from '../types';

export async function getRoadmapForTodo(goalTodoId: string): Promise<Roadmap | undefined> {
  return db.roadmaps.where('goalTodoId').equals(goalTodoId).first();
}

export async function createRoadmap(goalTodoId: string): Promise<Roadmap> {
  const now = new Date();
  const roadmap: Roadmap = {
    id: crypto.randomUUID(),
    goalTodoId,
    phases: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.roadmaps.add(roadmap);
  return roadmap;
}

export async function getOrCreateRoadmap(goalTodoId: string): Promise<Roadmap> {
  const existing = await getRoadmapForTodo(goalTodoId);
  if (existing) return existing;
  return createRoadmap(goalTodoId);
}

export async function updateRoadmap(
  id: string,
  updates: Partial<Omit<Roadmap, 'id' | 'createdAt'>>
): Promise<void> {
  await db.roadmaps.update(id, { ...updates, updatedAt: new Date() });
  onLocalChange('roadmaps', 'update', id).catch(() => {});
}

export async function updateRoadmapPhases(id: string, phases: RoadmapPhase[]): Promise<void> {
  await db.roadmaps.update(id, { phases, updatedAt: new Date() });
  onLocalChange('roadmaps', 'update', id).catch(() => {});
}

export async function deleteRoadmap(id: string): Promise<void> {
  await db.roadmaps.delete(id);
  onLocalChange('roadmaps', 'delete', id).catch(() => {});
}

export async function getAllRoadmaps(): Promise<Roadmap[]> {
  return db.roadmaps.toArray();
}

export async function findRoadmapsContainingTodo(todoId: string): Promise<Roadmap[]> {
  const roadmaps = await db.roadmaps.toArray();
  return roadmaps.filter((rm) =>
    rm.phases.some((phase) => phase.todoIds.includes(todoId))
  );
}
