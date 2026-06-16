import { useState, useCallback } from 'react';
import {
  getAllRelations,
  createRelation,
  deleteRelation,
  getRelationsForTodo,
} from '../db/relations';
import { useDbChangeRefresh } from './useDbChangeRefresh';
import type { TodoRelation, TodoRelationType } from '../types';

export function useRelations() {
  const [relations, setRelations] = useState<TodoRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const all = await getAllRelations();
    setRelations(all);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh);

  const add = useCallback(
    async (fromTodoId: string, toTodoId: string, type: TodoRelationType) => {
      const relation = await createRelation(fromTodoId, toTodoId, type);
      setRelations((prev) => [...prev, relation]);
      return relation;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    await deleteRelation(id);
    setRelations((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const getForTodo = useCallback(async (todoId: string) => {
    return getRelationsForTodo(todoId);
  }, []);

  return { relations, isLoading, refresh, add, remove, getForTodo };
}

export function useTodoRelations(todoId: string) {
  const [outgoing, setOutgoing] = useState<TodoRelation[]>([]);
  const [incoming, setIncoming] = useState<TodoRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const result = await getRelationsForTodo(todoId);
    setOutgoing(result.outgoing);
    setIncoming(result.incoming);
    setIsLoading(false);
  }, [todoId]);

  useDbChangeRefresh(refresh);

  return { outgoing, incoming, isLoading, refresh };
}
