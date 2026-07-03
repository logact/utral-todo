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
import { db } from '../db/drizzle-adapter';
import { todoRelations } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatDateShort } from '../utils/date';
import { RoadToGoalGraph } from '../components/RoadToGoalGraph';
import { LabelPicker } from '../components/LabelPicker';
import type { Todo, GoalStatus, TodoRelationType } from '../types';
import { dbStore } from '../db/store';
import { createRelation, deleteRelation, updateRelation } from '@utral/db-schema/relation-ops';
import { getTodo, updateTodo } from '@utral/db-schema/todo-ops';

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
    await updateTodo(dbStore, goal.id, updates);
    onUpdate(updates);
    setIsEditing(false);
    setIsPropertiesOpen(false);
    setIsSaving(false);
  }

  async function handleCreateRelation(fromTodoId: string, toTodoId: string, type: TodoRelationType) {
    await createRelation(dbStore, fromTodoId, toTodoId, type);
  }

  async function handleDeleteRelation(relationId: string) {
    await deleteRelation(dbStore, relationId);
  }

  async function handleUpdateRelation(relationId: string, type: TodoRelationType) {
    await updateRelation(dbStore, relationId, { type });
  }

  async function handleReconnectRelation(relationId: string, fromTodoId: string, toTodoId: string) {
    if (fromTodoId === toTodoId) return;
    const relationRows = await db.select().from(todoRelations).where(eq(todoRelations.id, relationId));
    const relation = relationRows[0];
    if (!relation) return;
    if (relation.fromTodoId === fromTodoId && relation.toTodoId === toTodoId) return;

    const fromTodo = await getTodo(dbStore, fromTodoId);
    const toTodo = await getTodo(dbStore, toTodoId);
    if (!fromTodo || !toTodo) return;

    const allowedTypes = allowedLinkTypesForReconnect(fromTodo, toTodo);
    if (!allowedTypes.includes(relation.type as TodoRelationType)) return;

    await deleteRelation(dbStore, relationId);
    await createRelation(dbStore, fromTodoId, toTodoId, relation.type as TodoRelationType);
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
          const todo = await getTodo(dbStore, todoId);
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
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Labels</label>
        <LabelPicker tags={editTags} onChange={setEditTags} />
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
    </div>
  );
}
