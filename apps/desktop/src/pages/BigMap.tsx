import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Home, Plus } from 'lucide-react';
import { RoadToGoalGraph } from '../components/RoadToGoalGraph';
import { getRootGoal, getTodo, createGoal, createTask, updateTodo, deleteTodo, ensureRootGoal } from '../db/todos';
import { createRelation, deleteRelation, updateRelation } from '../db/relations';
import { db } from '../db/database';
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

  const handleAddChild = useCallback(
    async (parentGoalId: string) => {
      const parent = await getTodo(parentGoalId);
      if (!parent || parent.nodeType !== 'goal') return;
      const title = prompt('Child goal title:');
      if (!title) return;
      const child = await createGoal(title.trim(), {
        projectId: parent.projectId,
        tags: [...parent.tags],
        parentId: parentGoalId,
      });
      await createRelation(parentGoalId, child.id, 'parent_of');
      handleReload();
    },
    [handleReload]
  );

  const handleAddTask = useCallback(
    async (targetGoalId: string) => {
      const parent = await getTodo(targetGoalId);
      if (!parent || parent.nodeType !== 'goal') return;
      const title = prompt('Task title:');
      if (!title) return;
      const task = await createTask(title.trim(), {
        projectId: parent.projectId,
        tags: [...parent.tags],
      });
      await createRelation(task.id, targetGoalId, 'achieves');
      handleReload();
      navigate(`/todo/${task.id}`);
    },
    [handleReload, navigate]
  );

  const handleAddPreGoal = useCallback(
    async (targetGoalId: string) => {
      const targetGoal = await getTodo(targetGoalId);
      if (!targetGoal || targetGoal.nodeType !== 'goal') return;

      const allGoals = await db.todos
        .filter((t) => t.nodeType === 'goal' && t.id !== targetGoalId)
        .toArray();
      const relations = await db.relations.toArray();
      const existingPreGoals = relations
        .filter((r) => r.toTodoId === targetGoalId && r.type === 'ordered_before')
        .map((r) => r.fromTodoId);
      const existingChildren = relations
        .filter((r) => r.fromTodoId === targetGoalId && r.type === 'parent_of')
        .map((r) => r.toTodoId);

      const candidates = allGoals.filter(
        (g) =>
          !existingPreGoals.includes(g.id) &&
          !existingChildren.includes(g.id) &&
          g.id !== targetGoalId
      );
      if (candidates.length === 0) {
        const title = prompt('No existing goals to link. Enter a title to create a new pre-achieve goal:');
        if (!title?.trim()) return;
        const newGoal = await createGoal(title.trim(), {
          projectId: targetGoal.projectId,
          tags: [...targetGoal.tags],
        });
        await createRelation(newGoal.id, targetGoalId, 'ordered_before');
        handleReload();
        return;
      }
      const choice = prompt(
        'Link a goal that should be achieved before this one:\n' +
          candidates.map((g, i) => `${i + 1}. ${g.title}`).join('\n')
      );
      if (!choice) return;
      const index = parseInt(choice.trim(), 10) - 1;
      if (index < 0 || index >= candidates.length || isNaN(index)) return;
      await createRelation(candidates[index].id, targetGoalId, 'ordered_before');
      handleReload();
    },
    [handleReload]
  );

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

  const handleUpdateTodo = useCallback(
    async (todoId: string, updates: Partial<Todo>) => {
      await updateTodo(todoId, updates);
      handleReload();
    },
    [handleReload]
  );

  const handleDeleteTodo = useCallback(
    async (todoId: string) => {
      await deleteTodo(todoId);
      handleReload();
      if (todoId === goalId) {
        navigate('/map');
      }
    },
    [handleReload, goalId, navigate]
  );

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
              await ensureRootGoal();
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
          onUpdateTodo={handleUpdateTodo}
          onDeleteTodo={handleDeleteTodo}
          onAddChild={handleAddChild}
          onAddTask={handleAddTask}
          onAddPreGoal={handleAddPreGoal}
        />
      </div>
    </div>
  );
}
