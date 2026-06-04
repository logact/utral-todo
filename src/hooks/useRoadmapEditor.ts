import { useState, useEffect, useCallback } from 'react';
import { getOrCreateRoadmap, updateRoadmapPhases, deleteRoadmap } from '../db/roadmaps';
import { getTodo } from '../db/todos';
import type { Roadmap, RoadmapPhase } from '../types';

export function useRoadmapEditor(goalTodoId: string | undefined) {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [goalTitle, setGoalTitle] = useState('');

  const load = useCallback(async () => {
    if (!goalTodoId) {
      setRoadmap(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const rm = await getOrCreateRoadmap(goalTodoId);
    setRoadmap(rm);
    const goal = await getTodo(goalTodoId);
    if (goal) setGoalTitle(goal.title);
    setIsLoading(false);
  }, [goalTodoId]);

  useEffect(() => {
    load();
  }, [load]);

  const savePhases = useCallback(async (phases: RoadmapPhase[]) => {
    if (!roadmap) return;
    const normalized = phases.map((p, i) => ({ ...p, order: i }));
    setRoadmap((prev) => (prev ? { ...prev, phases: normalized } : null));
    await updateRoadmapPhases(roadmap.id, normalized);
  }, [roadmap]);

  const addPhase = useCallback((title?: string) => {
    if (!roadmap) return;
    const newPhase: RoadmapPhase = {
      id: crypto.randomUUID(),
      title: title || `Phase ${roadmap.phases.length + 1}`,
      order: roadmap.phases.length,
      todoIds: [],
    };
    savePhases([...roadmap.phases, newPhase]);
  }, [roadmap, savePhases]);

  const removePhase = useCallback((phaseId: string) => {
    if (!roadmap) return;
    savePhases(roadmap.phases.filter((p) => p.id !== phaseId));
  }, [roadmap, savePhases]);

  const updatePhaseTitle = useCallback((phaseId: string, title: string) => {
    if (!roadmap) return;
    savePhases(
      roadmap.phases.map((p) => (p.id === phaseId ? { ...p, title } : p))
    );
  }, [roadmap, savePhases]);

  const updatePhaseTimes = useCallback((phaseId: string, startAt?: Date, endAt?: Date) => {
    if (!roadmap) return;
    savePhases(
      roadmap.phases.map((p) =>
        p.id === phaseId ? { ...p, startAt, endAt } : p
      )
    );
  }, [roadmap, savePhases]);

  const movePhase = useCallback((phaseId: string, direction: 'up' | 'down') => {
    if (!roadmap) return;
    const idx = roadmap.phases.findIndex((p) => p.id === phaseId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === roadmap.phases.length - 1) return;
    const next = [...roadmap.phases];
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    savePhases(next);
  }, [roadmap, savePhases]);

  const addTodoToPhase = useCallback((phaseId: string, todoId: string) => {
    if (!roadmap) return;
    savePhases(
      roadmap.phases.map((p) =>
        p.id === phaseId ? { ...p, todoIds: [...p.todoIds, todoId] } : p
      )
    );
  }, [roadmap, savePhases]);

  const removeTodoFromPhase = useCallback((phaseId: string, todoId: string) => {
    if (!roadmap) return;
    savePhases(
      roadmap.phases.map((p) =>
        p.id === phaseId ? { ...p, todoIds: p.todoIds.filter((id) => id !== todoId) } : p
      )
    );
  }, [roadmap, savePhases]);

  const moveTodoInPhase = useCallback(
    (phaseId: string, todoId: string, direction: 'up' | 'down') => {
      if (!roadmap) return;
      savePhases(
        roadmap.phases.map((p) => {
          if (p.id !== phaseId) return p;
          const idx = p.todoIds.indexOf(todoId);
          if (idx === -1) return p;
          if (direction === 'up' && idx === 0) return p;
          if (direction === 'down' && idx === p.todoIds.length - 1) return p;
          const nextIds = [...p.todoIds];
          const swap = direction === 'up' ? idx - 1 : idx + 1;
          [nextIds[idx], nextIds[swap]] = [nextIds[swap], nextIds[idx]];
          return { ...p, todoIds: nextIds };
        })
      );
    },
    [roadmap, savePhases]
  );

  const resetRoadmap = useCallback(async () => {
    if (!roadmap) return;
    await deleteRoadmap(roadmap.id);
    await load();
  }, [roadmap, load]);

  return {
    roadmap,
    isLoading,
    goalTitle,
    refresh: load,
    addPhase,
    removePhase,
    updatePhaseTitle,
    updatePhaseTimes,
    movePhase,
    addTodoToPhase,
    removeTodoFromPhase,
    moveTodoInPhase,
    resetRoadmap,
  };
}
