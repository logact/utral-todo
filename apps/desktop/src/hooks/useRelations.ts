import { useState, useCallback } from 'react';
import { useDbChangeRefresh } from './useDbChangeRefresh';
import type { TodoRelation, TodoRelationType } from '../types';
import { dbStore } from '../db/store';
import { createRelation, deleteRelation, getAllRelations, getRelationsForTodo } from '@utral/db-schema/relation-ops';

export function useRelations() {
  const [relations, setRelations] = useState<TodoRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const all = await getAllRelations(dbStore);
    setRelations(all);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['relations', 'todoRelations', 'todos'] });

  const add = useCallback(
    async (fromTodoId: string, toTodoId: string, type: TodoRelationType) => {
      const relation = await createRelation(dbStore, fromTodoId, toTodoId, type);
      setRelations((prev) => [...prev, relation]);
      return relation;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    await deleteRelation(dbStore, id);
    setRelations((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const getForTodo = useCallback(async (todoId: string) => {
    return getRelationsForTodo(dbStore, todoId);
  }, []);

  return { relations, isLoading, refresh, add, remove, getForTodo };
}

export function useTodoRelations(todoId: string) {
  const [outgoing, setOutgoing] = useState<TodoRelation[]>([]);
  const [incoming, setIncoming] = useState<TodoRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const result = await getRelationsForTodo(dbStore, todoId);
    setOutgoing(result.outgoing);
    setIncoming(result.incoming);
    setIsLoading(false);
  }, [todoId]);

  useDbChangeRefresh(refresh, { tables: ['relations', 'todoRelations', 'todos'] });

  return { outgoing, incoming, isLoading, refresh };
}
