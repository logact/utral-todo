import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Home, Plus } from 'lucide-react';
import { RoadToGoalGraph } from '../components/RoadToGoalGraph';
import { getRootGoal, getTodo } from '../db/todos';
import { createRelation, deleteRelation, updateRelation } from '../db/relations';
import { db } from '../db/drizzle-adapter';
import { todoRelations } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { Todo, TodoRelationType } from '../types';

export function BigMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [rootGoalId, setRootGoalId] = useState<string | undefined>();
  const [isLoadingRoot, setIsLoadingRoot] = useState(true);
  const [graphTick, setGraphTick] = useState(0);
  const goalId = searchParams.get('goal') ?? rootGoalId;

  useEffect(() => {
    getRootGoal().then((g) => {
      setRootGoalId(g?.id);
      setIsLoadingRoot(false);
    });
  }, []);

  const handleReload = useCallback(() => {
    setGraphTick((t) => t + 1);
  }, []);

  const handleCreateRelation = useCallback(
    async (fromTodoId: string, toTodoId: string, type: TodoRelationType) => {
      await createRelation(fromTodoId, toTodoId, type);
      handleReload();
    },
    [handleReload]
  );

  const handleDeleteRelation = useCallback(
    async (relationId: string) => {
      await deleteRelation(relationId);
      handleReload();
    },
    [handleReload]
  );

  const handleUpdateRelation = useCallback(
    async (relationId: string, type: TodoRelationType) => {
      await updateRelation(relationId, { type });
      handleReload();
    },
    [handleReload]
  );

  const handleReconnectRelation = useCallback(
    async (relationId: string, fromTodoId: string, toTodoId: string) => {
      if (fromTodoId === toTodoId) return;
      const relationRows = await db.select().from(todoRelations).where(eq(todoRelations.id, relationId));
      const relation = relationRows[0];
      if (!relation) return;
      if (relation.fromTodoId === fromTodoId && relation.toTodoId === toTodoId) return;

      const fromTodo = await getTodo(fromTodoId);
      const toTodo = await getTodo(toTodoId);
      if (!fromTodo || !toTodo) return;

      const allowedTypes = allowedLinkTypesForReconnect(fromTodo, toTodo);
      if (!allowedTypes.includes(relation.type as TodoRelationType)) return;

      await deleteRelation(relationId);
      await createRelation(fromTodoId, toTodoId, relation.type as TodoRelationType);
      handleReload();
    },
    [handleReload]
  );

  function allowedLinkTypesForReconnect(fromTodo: Todo, toTodo: Todo): TodoRelationType[] {
    if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'goal') return ['achieves'];
    if (fromTodo.nodeType === 'goal' && toTodo.nodeType === 'goal') return ['parent_of', 'ordered_before'];
    if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'task') {
      return ['ordered_before', 'depends_on', 'blocked_by', 'assign_from'];
    }
    return [];
  }

  if (!goalId) {
    if (isLoadingRoot) {
      return (
        <div className="flex items-center justify-center h-screen text-slate-500 dark:text-slate-400">
          Loading root goal...
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-screen p-8">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center shadow-sm">
          <Home className="w-10 h-10 mx-auto text-indigo-500 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Root goal missing
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            The root goal anchors your goal hierarchy. Create it now to start using the map.
          </p>
          <button
            onClick={async () => {

              const g = await getRootGoal();
              setRootGoalId(g?.id);
            }}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Create root goal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between gap-4 px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          {goalId !== rootGoalId && (
            <>
              <Link
                to="/map"
                className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                Root Goal
              </Link>
              <ArrowLeft className="w-3 h-3 text-slate-300 dark:text-slate-600" />
            </>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Road to Goal
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <RoadToGoalGraph
          key={goalId}
          goalId={goalId}
          mode="page"
          title={goalId === rootGoalId ? 'Road to Root Goal' : 'Road to Goal'}
          editing
          reloadTick={graphTick}
          onNodeClick={async (id) => {
            const todo = await getTodo(id);
            if (todo?.nodeType === 'goal') {
              setSearchParams({ goal: id });
            } else {
              navigate(`/todo/${id}`);
            }
          }}
          onCreateRelation={handleCreateRelation}
          onDeleteRelation={handleDeleteRelation}
          onUpdateRelation={handleUpdateRelation}
          onReconnectRelation={handleReconnectRelation}
        />
      </div>
    </div>
  );
}
