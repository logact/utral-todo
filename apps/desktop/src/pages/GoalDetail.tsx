import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Target,
  Calendar,
  Pencil,
  X,
  Save,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { updateTodo, deleteTodo, createTask, createGoal, getTodo } from '../db/todos';
import { db } from '../db/database';
import {
  createRelation,
  updateRelation,
  deleteRelation,
  getChildGoals,
  getOrderedPredecessors,
  getOrderedSuccessors,
} from '../db/relations';
import { formatDateShort } from '../utils/date';
import { RoadToGoalGraph } from '../components/RoadToGoalGraph';
import { NeighborPromptDialog } from '../components/NeighborPromptDialog';
import { PromptDialog } from '../components/PromptDialog';
import type { Todo, GoalStatus, TodoRelationType } from '../types';

const goalStatusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  paused: { label: 'Paused', color: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  achieved: { label: 'Achieved', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  abandoned: { label: 'Abandoned', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
};

interface GoalDetailProps {
  goal: Todo;
  onUpdate: (updates: Partial<Todo>) => void;
}

export function GoalDetail({ goal, onUpdate }: GoalDetailProps) {
  const navigate = useNavigate();
  const [graphTick, setGraphTick] = useState(0);
  const [taskCreateGoalId, setTaskCreateGoalId] = useState<string | null>(null);
  const [neighborDialog, setNeighborDialog] = useState<{
    isOpen: boolean;
    targetTodoId: string;
    direction: 'before' | 'after';
    nodeType: 'goal' | 'task';
    candidates: Todo[];
  }>({
    isOpen: false,
    targetTodoId: '',
    direction: 'before',
    nodeType: 'task',
    candidates: [],
  });

  // Edit mode — default open for two-column layout
  const [isEditing, setIsEditing] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [editTitle, setEditTitle] = useState(goal.title);
  const [editDescription, setEditDescription] = useState(goal.description);
  const [editMotivation, setEditMotivation] = useState(goal.motivation ?? '');
  const [editSuccessCriteria, setEditSuccessCriteria] = useState(goal.successCriteria ?? '');
  const [editTargetDate, setEditTargetDate] = useState(goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '');
  const [editGoalStatus, setEditGoalStatus] = useState<GoalStatus>(goal.goalStatus ?? 'active');
  const [editTags, setEditTags] = useState<string[]>([...goal.tags]);
  const [editTagInput, setEditTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Track whether edit form has been initialized
  const editFormInitRef = useRef(false);

  // Initialize edit form once when goal loads (panel is open by default)
  useEffect(() => {
    if (goal && !editFormInitRef.current) {
      initEditForm(goal);
      editFormInitRef.current = true;
    }
  }, [goal]);

  function initEditForm(g: Todo) {
    setEditTitle(g.title);
    setEditDescription(g.description);
    setEditMotivation(g.motivation ?? '');
    setEditSuccessCriteria(g.successCriteria ?? '');
    setEditTargetDate(g.targetDate ? new Date(g.targetDate).toISOString().split('T')[0] : '');
    setEditGoalStatus(g.goalStatus ?? 'active');
    setEditTags([...g.tags]);
    setEditTagInput('');
  }

  function startEditing() {
    editFormInitRef.current = false;
    initEditForm(goal);
    setIsEditing(true);
    setIsPropertiesOpen(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setIsPropertiesOpen(false);
  }

  async function handleSave() {
    setIsSaving(true);
    const updates: Partial<Todo> = {
      title: editTitle.trim(),
      description: editDescription.trim(),
      motivation: editMotivation.trim() || undefined,
      successCriteria: editSuccessCriteria.trim() || undefined,
      targetDate: editTargetDate ? new Date(editTargetDate) : undefined,
      goalStatus: editGoalStatus,
      tags: editTags,
    };
    await updateTodo(goal.id, updates);
    onUpdate(updates);
    setIsEditing(false);
    setIsPropertiesOpen(false);
    setIsSaving(false);
  }

  function handleEditTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEditTag();
    }
    if (e.key === 'Backspace' && !editTagInput && editTags.length > 0) {
      setEditTags((prev) => prev.slice(0, -1));
    }
  }

  function addEditTag() {
    const raw = editTagInput.trim();
    if (!raw) return;
    const newTags = raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    const combined = [...editTags];
    for (const t of newTags) {
      if (!combined.includes(t)) combined.push(t);
    }
    setEditTags(combined);
    setEditTagInput('');
  }

  function removeEditTag(tag: string) {
    setEditTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleCreateRelation(fromTodoId: string, toTodoId: string, type: TodoRelationType) {
    await createRelation(fromTodoId, toTodoId, type);
  }

  async function handleDeleteRelation(relationId: string) {
    await deleteRelation(relationId);
  }

  async function handleUpdateRelation(relationId: string, type: TodoRelationType) {
    await updateRelation(relationId, { type });
  }

  async function handleReconnectRelation(relationId: string, fromTodoId: string, toTodoId: string) {
    if (fromTodoId === toTodoId) return;
    const relation = await db.relations.get(relationId);
    if (!relation) return;
    if (relation.fromTodoId === fromTodoId && relation.toTodoId === toTodoId) return;

    const fromTodo = await getTodo(fromTodoId);
    const toTodo = await getTodo(toTodoId);
    if (!fromTodo || !toTodo) return;

    const allowedTypes = allowedLinkTypesForReconnect(fromTodo, toTodo);
    if (!allowedTypes.includes(relation.type)) return;

    await deleteRelation(relationId);
    await createRelation(fromTodoId, toTodoId, relation.type);
    setGraphTick((t) => t + 1);
  }

  function allowedLinkTypesForReconnect(fromTodo: Todo, toTodo: Todo): TodoRelationType[] {
    if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'goal') return ['achieves'];
    if (fromTodo.nodeType === 'goal' && toTodo.nodeType === 'goal') return ['parent_of', 'ordered_before'];
    if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'task') {
      return ['ordered_before', 'depends_on', 'blocked_by', 'assign_from'];
    }
    return [];
  }

  async function handleUpdateTodo(todoId: string, updates: Partial<Todo>) {
    await updateTodo(todoId, updates);
    if (todoId === goal.id) {
      onUpdate(updates);
    }
  }

  async function handleDeleteTodo(todoId: string) {
    await deleteTodo(todoId);
    if (todoId === goal.id) {
      navigate(-1);
    }
  }

  async function handleCreateAchievingTask(goalId: string) {
    const parent = await getTodo(goalId);
    if (!parent || parent.nodeType !== 'goal') return;
    setTaskCreateGoalId(goalId);
  }

  async function handleConfirmCreateTask(title: string) {
    if (!taskCreateGoalId) return;
    try {
      const parent = await getTodo(taskCreateGoalId);
      if (!parent) return;
      const task = await createTask(title.trim(), {
        tags: [...parent.tags],
      });
      await createRelation(task.id, taskCreateGoalId, 'achieves');
      setGraphTick((t) => t + 1);
      setTaskCreateGoalId(null);
      navigate(`/todo/${task.id}`);
    } catch (err) {
      console.error('handleConfirmCreateTask failed:', err);
    }
  }

  async function addOrderedNeighbor(
    targetTodoId: string,
    direction: 'before' | 'after',
    nodeType: 'goal' | 'task'
  ) {
    try {
      const targetTodo = await getTodo(targetTodoId);
      if (!targetTodo || targetTodo.nodeType !== nodeType) return;

      const [allCandidates, existingPredecessors, existingSuccessors, existingChildren] = await Promise.all([
        db.todos.filter((t) => t.nodeType === nodeType && t.id !== targetTodoId).toArray(),
        getOrderedPredecessors(targetTodoId),
        getOrderedSuccessors(targetTodoId),
        nodeType === 'goal' ? getChildGoals(targetTodoId) : Promise.resolve([] as Todo[]),
      ]);

      const excludedIds = new Set([
        targetTodoId,
        ...existingPredecessors.filter((t) => t.nodeType === nodeType).map((t) => t.id),
        ...existingSuccessors.filter((t) => t.nodeType === nodeType).map((t) => t.id),
        ...existingChildren.map((t) => t.id),
      ]);

      const candidates = allCandidates.filter((t) => !excludedIds.has(t.id));

      setNeighborDialog({
        isOpen: true,
        targetTodoId,
        direction,
        nodeType,
        candidates,
      });
    } catch (err) {
      console.error(`addOrderedNeighbor(${targetTodoId}, ${direction}, ${nodeType}) failed:`, err);
    }
  }

  async function handleCreateNeighbor(title: string) {
    const { targetTodoId, direction, nodeType } = neighborDialog;
    if (!targetTodoId || !title.trim()) return;

    try {
      const targetTodo = await getTodo(targetTodoId);
      if (!targetTodo) return;

      const newTodo =
        nodeType === 'goal'
          ? await createGoal(title.trim(), { tags: [...targetTodo.tags] })
          : await createTask(title.trim(), { tags: [...targetTodo.tags] });
      const [fromId, toId] = direction === 'before' ? [newTodo.id, targetTodoId] : [targetTodoId, newTodo.id];
      await createRelation(fromId, toId, 'ordered_before');
      setGraphTick((t) => t + 1);
      setNeighborDialog((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error('handleCreateNeighbor failed:', err);
    }
  }

  async function handleLinkNeighbor(todoId: string) {
    const { targetTodoId, direction } = neighborDialog;
    if (!targetTodoId || !todoId) return;

    try {
      const [fromId, toId] = direction === 'before' ? [todoId, targetTodoId] : [targetTodoId, todoId];
      await createRelation(fromId, toId, 'ordered_before');
      setGraphTick((t) => t + 1);
      setNeighborDialog((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error('handleLinkNeighbor failed:', err);
    }
  }

  async function handleAddPreGoal(goalId: string) {
    await addOrderedNeighbor(goalId, 'before', 'goal');
  }

  async function handleAddNextGoal(goalId: string) {
    await addOrderedNeighbor(goalId, 'after', 'goal');
  }

  async function handleAddPreTask(taskId: string) {
    await addOrderedNeighbor(taskId, 'before', 'task');
  }

  async function handleAddNextTask(taskId: string) {
    await addOrderedNeighbor(taskId, 'after', 'task');
  }

  const statusStyle = goalStatusConfig[goal.goalStatus ?? 'active'] ?? goalStatusConfig.active;

  // ---------- Left column: display content ----------

  const headerCard = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
          <Target className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {goal.title}
            </h1>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusStyle.color}`}>
              {statusStyle.label}
            </span>
          </div>
          {goal.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              {goal.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {goal.targetDate && (
              <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                Target: {formatDateShort(goal.targetDate)}
              </span>
            )}
            {goal.tags.map((tag) => (
              <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Motivation & Success Criteria */}
      {(goal.motivation || goal.successCriteria) && (
        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          {goal.motivation && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Motivation</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 italic">"{goal.motivation}"</p>
            </div>
          )}
          {goal.successCriteria && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Success Criteria</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{goal.successCriteria}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const sharedSections = (
    <>
      {/* Road to Goal */}
      <RoadToGoalGraph
        key={goal.id}
        goalId={goal.id}
        mode="card"
        title="Road to Goal"
        layersAround={3}
        editing
        reloadTick={graphTick}
        onNodeClick={async (todoId) => {
          const todo = await getTodo(todoId);
          if (todo?.nodeType === 'goal') {
            navigate(`/goals/${todoId}`);
          } else {
            navigate(`/todo/${todoId}`);
          }
        }}
        onCreateRelation={handleCreateRelation}
        onDeleteRelation={handleDeleteRelation}
        onUpdateRelation={handleUpdateRelation}
        onReconnectRelation={handleReconnectRelation}
        onUpdateTodo={handleUpdateTodo}
        onDeleteTodo={handleDeleteTodo}
        onAddTask={handleCreateAchievingTask}
        onAddPreGoal={handleAddPreGoal}
        onAddNextGoal={handleAddNextGoal}
        onAddPreTask={handleAddPreTask}
        onAddNextTask={handleAddNextTask}
      />
    </>
  );

  // ---------- Right column: edit panel ----------

  const editPanel = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6 space-y-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Title</label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={3}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Motivation</label>
        <textarea
          value={editMotivation}
          onChange={(e) => setEditMotivation(e.target.value)}
          rows={2}
          placeholder="Why does this matter to you?"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Success Criteria</label>
        <input
          type="text"
          value={editSuccessCriteria}
          onChange={(e) => setEditSuccessCriteria(e.target.value)}
          placeholder="How will you know you've achieved it?"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Target Date</label>
          <input
            type="date"
            value={editTargetDate}
            onChange={(e) => setEditTargetDate(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Status</label>
          <select
            value={editGoalStatus}
            onChange={(e) => setEditGoalStatus(e.target.value as GoalStatus)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="achieved">Achieved</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tags</label>
        <div className="w-full min-h-[2.75rem] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 flex flex-wrap items-center gap-1.5">
          {editTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
            >
              {tag}
              <button type="button" onClick={() => removeEditTag(tag)} className="hover:text-indigo-900 dark:hover:text-indigo-200">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={editTagInput}
            onChange={(e) => setEditTagInput(e.target.value)}
            onKeyDown={handleEditTagKeyDown}
            onBlur={addEditTag}
            placeholder={editTags.length === 0 ? 'Type and press Enter...' : ''}
            className="flex-1 min-w-[100px] text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Press Enter or comma to add a tag
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={cancelEditing}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!editTitle.trim() || isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPropertiesOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isPropertiesOpen ? 'Hide properties panel' : 'Show properties panel'}
          >
            {isPropertiesOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
            {isPropertiesOpen ? 'Hide Properties' : 'Show Properties'}
          </button>
          {!isEditing && (
            <button
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Edit goal"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      {isPropertiesOpen ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          {/* Left column — main content */}
          <div className="space-y-6 min-w-0">
            {headerCard}
            {sharedSections}
          </div>
          {/* Right column — sticky properties/edit panel */}
          <div className="lg:sticky lg:top-4">
            {editPanel}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {headerCard}
          {sharedSections}
        </div>
      )}
      <NeighborPromptDialog
        isOpen={neighborDialog.isOpen}
        onClose={() => setNeighborDialog((prev) => ({ ...prev, isOpen: false }))}
        direction={neighborDialog.direction}
        nodeType={neighborDialog.nodeType}
        candidates={neighborDialog.candidates}
        onCreate={handleCreateNeighbor}
        onLink={handleLinkNeighbor}
      />

      <PromptDialog
        isOpen={taskCreateGoalId !== null}
        onClose={() => setTaskCreateGoalId(null)}
        title="Add task to goal"
        placeholder="Task title"
        confirmLabel="Create task"
        onConfirm={handleConfirmCreateTask}
      />
    </div>
  );
}
