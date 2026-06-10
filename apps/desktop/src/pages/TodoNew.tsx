import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X, GitBranch, Repeat, Target } from 'lucide-react';
import { createTodo, getTodo, getAllTodos } from '../db/todos';
import { createRelation } from '../db/relations';
import { getAllProjects } from '../db/projects';
import type { Todo, RepeatRule, Project } from '../types';

export function TodoNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceTodoId = searchParams.get('sourceTodoId');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [parentId, setParentId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledEndDate, setScheduledEndDate] = useState('');
  const [isGoal, setIsGoal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allTodos, setAllTodos] = useState<Todo[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sourceTodo, setSourceTodo] = useState<Todo | null>(null);

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Repeat
  const [hasRepeat, setHasRepeat] = useState(false);
  const [repeatType, setRepeatType] = useState<'daily' | 'weekly' | 'every_n_days'>('weekly');
  const [repeatWeekDays, setRepeatWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [repeatInterval, setRepeatInterval] = useState(2);
  const [repeatEndDate, setRepeatEndDate] = useState('');

  useEffect(() => {
    getAllTodos().then(setAllTodos);
    getAllProjects().then(setAllProjects);
  }, []);

  useEffect(() => {
    if (sourceTodoId) {
      getTodo(sourceTodoId).then((t) => {
        if (t) {
          setSourceTodo(t);
        }
      });
    }
  }, [sourceTodoId]);

  async function handleSubmit() {
    if (!title.trim()) return;
    setIsSubmitting(true);

    let repeatRule: RepeatRule | undefined;
    if (hasRepeat) {
      repeatRule = { type: repeatType };
      if (repeatType === 'weekly') {
        repeatRule.weekDays = repeatWeekDays;
      } else if (repeatType === 'every_n_days') {
        repeatRule.interval = repeatInterval;
      }
      if (repeatEndDate) {
        repeatRule.endDate = new Date(repeatEndDate);
      }
    }

    const todo = await createTodo(title.trim(), {
      description: description.trim(),
      priority,
      estimatedMinutes,
      parentId: parentId || undefined,
      projectId: projectId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate) : undefined,
      tags,
      repeatRule,
      isGoal,
    });

    if (sourceTodoId) {
      await createRelation(sourceTodoId, todo.id, 'source_from');
    }

    navigate('/');
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function addTag() {
    const raw = tagInput.trim();
    if (!raw) return;
    const newTags = raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    const combined = [...tags];
    for (const t of newTags) {
      if (!combined.includes(t)) combined.push(t);
    }
    setTags(combined);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  const canSubmit = title.trim();

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Todos
      </button>

      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        New Todo
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">
        What do you need to get done?
      </p>

      {sourceTodo && (
        <div className="mt-4 flex items-center gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
          <GitBranch className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">Spawning from:</span>{' '}
            <button
              onClick={() => navigate(`/todo/${sourceTodo.id}`)}
              className="text-amber-700 dark:text-amber-400 hover:underline font-medium"
            >
              {sourceTodo.title}
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Review quarterly report"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details..."
            rows={3}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as 'low' | 'medium' | 'high')
              }
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Estimated Time (minutes)
            </label>
            <input
              type="number"
              value={estimatedMinutes}
              onChange={(e) =>
                setEstimatedMinutes(parseInt(e.target.value) || 0)
              }
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Parent Todo (optional)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No parent</option>
              {allTodos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Project (optional)
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No project</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Tags
          </label>
          <div className="w-full min-h-[2.75rem] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-indigo-900 dark:hover:text-indigo-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              placeholder={tags.length === 0 ? 'Type and press Enter...' : ''}
              className="flex-1 min-w-[100px] text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Press Enter or comma to add a tag
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Due Date (optional)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Scheduled Start (optional)
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Scheduled End (optional)
            </label>
            <input
              type="date"
              value={scheduledEndDate}
              onChange={(e) => setScheduledEndDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Repeat section */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasRepeat}
              onChange={(e) => setHasRepeat(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Repeat className="w-4 h-4" />
              Make this a recurring todo
            </span>
          </label>

          {hasRepeat && (
            <div className="mt-4 space-y-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Repeat pattern
                </label>
                <select
                  value={repeatType}
                  onChange={(e) => setRepeatType(e.target.value as 'daily' | 'weekly' | 'every_n_days')}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week on selected days</option>
                  <option value="every_n_days">Every N days</option>
                </select>
              </div>

              {repeatType === 'weekly' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                    Days of the week
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { label: 'Sun', value: 0 },
                      { label: 'Mon', value: 1 },
                      { label: 'Tue', value: 2 },
                      { label: 'Wed', value: 3 },
                      { label: 'Thu', value: 4 },
                      { label: 'Fri', value: 5 },
                      { label: 'Sat', value: 6 },
                    ].map((day) => {
                      const isSelected = repeatWeekDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setRepeatWeekDays((prev) => prev.filter((d) => d !== day.value));
                            } else {
                              setRepeatWeekDays((prev) => [...prev, day.value].sort());
                            }
                          }}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {repeatType === 'every_n_days' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Repeat every
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">days</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  End date (optional)
                </label>
                <input
                  type="date"
                  value={repeatEndDate}
                  onChange={(e) => setRepeatEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Goal toggle */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isGoal}
              onChange={(e) => setIsGoal(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Target className="w-4 h-4" />
              Mark as goal
            </span>
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 ml-6">
            Goals are highlighted on the Big Map and can have roadmaps.
          </p>
        </div>

        <div className="pt-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Creating...' : 'Create Todo'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
