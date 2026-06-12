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
  Map,
  Plus,
  ChevronDown,
  Trash2,
  GitBranch,
  ListTodo,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { updateTodo, deleteTodo, createGoal, createTask } from '../db/todos';
import { db } from '../db/database';
import { getAllProjects } from '../db/projects';
import {
  createRelation,
  updateRelation,
  deleteRelation,
  getChildGoals,
  getPreAchieveGoals,
  getTasksForGoal,
} from '../db/relations';
import {
  getPlansForGoal,
  createPlan,
  updatePlan,
  deletePlan,
  addTodoToPlan,
  removeTodoFromPlan,
} from '../db/plans';
import { formatDateShort } from '../utils/date';
import { RoadToGoalGraph } from '../components/RoadToGoalGraph';
import type { Todo, Project, GoalStatus, TodoRelationType, Plan } from '../types';

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [isPlanMenuOpen, setIsPlanMenuOpen] = useState(false);
  const [graphTick, setGraphTick] = useState(0);

  // Goal hierarchy sections
  const [childGoals, setChildGoals] = useState<Todo[]>([]);
  const [preAchieveGoals, setPreAchieveGoals] = useState<Todo[]>([]);
  const [achievingTasks, setAchievingTasks] = useState<Todo[]>([]);
  const [allGoals, setAllGoals] = useState<Todo[]>([]);

  // Edit mode — default open for two-column layout
  const [isEditing, setIsEditing] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [editTitle, setEditTitle] = useState(goal.title);
  const [editDescription, setEditDescription] = useState(goal.description);
  const [editMotivation, setEditMotivation] = useState(goal.motivation ?? '');
  const [editSuccessCriteria, setEditSuccessCriteria] = useState(goal.successCriteria ?? '');
  const [editTargetDate, setEditTargetDate] = useState(goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '');
  const [editGoalStatus, setEditGoalStatus] = useState<GoalStatus>(goal.goalStatus ?? 'active');
  const [editProjectId, setEditProjectId] = useState(goal.projectId ?? '');
  const [editTags, setEditTags] = useState<string[]>([...goal.tags]);
  const [editTagInput, setEditTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Track whether edit form has been initialized
  const editFormInitRef = useRef(false);

  useEffect(() => {
    getAllProjects().then(setProjects);
    db.todos
      .filter((t) => t.nodeType === 'goal' && t.id !== goal.id)
      .toArray()
      .then(setAllGoals);
  }, [goal.id]);

  useEffect(() => {
    loadPlans();
  }, [goal.id, goal.activePlanId]);

  async function loadPlans() {
    const goalPlans = await getPlansForGoal(goal.id);
    setPlans(goalPlans);
    const active =
      goalPlans.find((p) => p.id === goal.activePlanId) ?? goalPlans[0] ?? null;
    setActivePlan(active);
  }

  async function loadHierarchy() {
    const [children, preGoals, tasks] = await Promise.all([
      getChildGoals(goal.id),
      getPreAchieveGoals(goal.id),
      getTasksForGoal(goal.id),
    ]);
    setChildGoals(children);
    setPreAchieveGoals(preGoals);
    setAchievingTasks(tasks);
  }

  useEffect(() => {
    loadHierarchy();
  }, [goal.id, graphTick]);

  async function handleSetActivePlan(planId: string) {
    await updateTodo(goal.id, { activePlanId: planId });
    onUpdate({ activePlanId: planId });
    await loadPlans();
  }

  async function handleCreatePlan() {
    const title = prompt('Plan name:');
    if (!title) return;
    const plan = await createPlan(goal.id, title.trim());
    await handleSetActivePlan(plan.id);
  }

  async function handleRenamePlan() {
    if (!activePlan) return;
    const title = prompt('Rename plan:', activePlan.title);
    if (!title) return;
    await updatePlan(activePlan.id, { title: title.trim() });
    await loadPlans();
  }

  async function handleDeletePlan() {
    if (!activePlan) return;
    if (!confirm(`Delete plan "${activePlan.title}"?`)) return;
    await deletePlan(activePlan.id);
    await loadPlans();
    const remaining = await getPlansForGoal(goal.id);
    const nextActive = remaining[0] ?? null;
    onUpdate({ activePlanId: nextActive?.id });
    setGraphTick((t) => t + 1);
  }

  async function handleAddToPlan(todoId: string) {
    if (!activePlan) return;
    await addTodoToPlan(activePlan.id, todoId);
    setGraphTick((t) => t + 1);
  }

  async function handleRemoveFromPlan(todoId: string) {
    if (!activePlan) return;
    await removeTodoFromPlan(activePlan.id, todoId);
    setGraphTick((t) => t + 1);
  }

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
    setEditProjectId(g.projectId ?? '');
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
      projectId: editProjectId || undefined,
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

  async function handleCreateChildGoal() {
    const title = prompt('Child goal title:');
    if (!title) return;
    const child = await createGoal(title.trim(), {
      projectId: goal.projectId,
      tags: [...goal.tags],
    });
    await createRelation(goal.id, child.id, 'parent_of');
    setGraphTick((t) => t + 1);
    navigate(`/goal/${child.id}`);
  }

  async function handleCreateAchievingTask() {
    const title = prompt('Task title:');
    if (!title) return;
    const task = await createTask(title.trim(), {
      projectId: goal.projectId,
      tags: [...goal.tags],
    });
    await createRelation(task.id, goal.id, 'achieves');
    setGraphTick((t) => t + 1);
    navigate(`/todo/${task.id}`);
  }

  async function handleLinkPreAchieveGoal() {
    const candidates = allGoals.filter(
      (g) =>
        g.id !== goal.id &&
        !preAchieveGoals.some((p) => p.id === g.id) &&
        !childGoals.some((c) => c.id === g.id)
    );
    if (candidates.length === 0) {
      alert('No available goals to link.');
      return;
    }
    const choice = prompt(
      'Link a goal that should be achieved before this one:\n' +
        candidates.map((g, i) => `${i + 1}. ${g.title}`).join('\n')
    );
    if (!choice) return;
    const index = parseInt(choice.trim(), 10) - 1;
    if (index < 0 || index >= candidates.length || isNaN(index)) return;
    await createRelation(candidates[index].id, goal.id, 'ordered_before');
    setGraphTick((t) => t + 1);
  }

  const statusStyle = goalStatusConfig[goal.goalStatus ?? 'active'] ?? goalStatusConfig.active;
  const project = projects.find((p) => p.id === goal.projectId);

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
            {project && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: project.color + '20', color: project.color }}
              >
                {project.title}
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
      {/* Plan selector */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Map className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
              {activePlan ? activePlan.title : 'No plan'}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              ({plans.length} plan{plans.length !== 1 ? 's' : ''})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                onClick={() => setIsPlanMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Switch
                <ChevronDown className="w-3 h-3" />
              </button>
              {isPlanMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg p-1 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        await handleSetActivePlan(p.id);
                        setIsPlanMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        p.id === activePlan?.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      handleCreatePlan();
                      setIsPlanMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-md transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    New plan
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleRenamePlan}
              disabled={!activePlan}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
              title="Rename plan"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDeletePlan}
              disabled={!activePlan || plans.length <= 1}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 hover:text-rose-600 disabled:opacity-40 transition-colors"
              title="Delete plan"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Road to Goal */}
      <RoadToGoalGraph
        key={goal.id}
        scope="neighborhood"
        focusTodoId={goal.id}
        layersAround={3}
        mode="card"
        title="Road to Goal"
        editing
        planId={activePlan?.id}
        reloadTick={graphTick}
        onAddToPlan={handleAddToPlan}
        onRemoveFromPlan={handleRemoveFromPlan}
        onNodeClick={(todoId) => navigate(`/todo/${todoId}`)}
        onCreateRelation={handleCreateRelation}
        onDeleteRelation={handleDeleteRelation}
        onUpdateRelation={handleUpdateRelation}
        onUpdateTodo={handleUpdateTodo}
        onDeleteTodo={handleDeleteTodo}
      />

      {/* Goal hierarchy: children, pre-achieve goals, and achieving tasks */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Child goals */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Child Goals</h3>
            </div>
            <button
              onClick={handleCreateChildGoal}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
          {childGoals.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No child goals yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {childGoals.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => navigate(`/goal/${g.id}`)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <Target className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{g.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pre-achieve goals */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Pre-achieve Goals</h3>
            </div>
            <button
              onClick={handleLinkPreAchieveGoal}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Link
            </button>
          </div>
          {preAchieveGoals.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No pre-achieve goals yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {preAchieveGoals.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => navigate(`/goal/${g.id}`)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{g.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tasks that achieve the goal */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tasks to Achieve</h3>
            </div>
            <button
              onClick={handleCreateAchievingTask}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
          {achievingTasks.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No tasks yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {achievingTasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => navigate(`/todo/${t.id}`)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {t.status === 'done' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : t.status === 'in_progress' ? (
                      <Circle className="w-3.5 h-3.5 text-indigo-500 shrink-0 fill-indigo-500" />
                    ) : (
                      <ListTodo className="w-3.5 h-3.5 text-slate-300 dark:text-slate-500 shrink-0" />
                    )}
                    <span className={`text-sm truncate ${t.status === 'done' ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
                      {t.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Project</label>
        <select
          value={editProjectId}
          onChange={(e) => setEditProjectId(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
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
    </div>
  );
}
