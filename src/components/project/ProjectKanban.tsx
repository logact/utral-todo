import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, Clock, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import type { Todo, TodoStatus } from '../../types';

const COLUMNS: { id: TodoStatus; label: string; color: string }[] = [
  { id: 'pending', label: 'Backlog', color: '#94a3b8' },
  { id: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { id: 'done', label: 'Done', color: '#10b981' },
];

const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = {
  high: { bg: 'bg-red-100 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
  low: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
};

interface ProjectKanbanProps {
  projectId: string;
  todos: Todo[];
  projectColor: string;
  onUpdateStatus: (todoId: string, status: TodoStatus) => Promise<void>;
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>;
}

export function ProjectKanban({ todos, projectColor, onUpdateStatus }: ProjectKanbanProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TodoStatus | null>(null);

  const getTodosByStatus = useCallback(
    (status: TodoStatus) => todos.filter((t) => t.status === status && !t.parentId),
    [todos]
  );

  const handleDragStart = (e: React.DragEvent, todoId: string) => {
    setDraggedId(todoId);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer.setData('text/plain', todoId);
  };

  const handleDragOver = (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    const todoId = e.dataTransfer.getData('text/plain') || draggedId;
    if (todoId) {
      await onUpdateStatus(todoId, status);
    }
    setDraggedId(null);
    setDragOverColumn(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map((col) => {
        const colTodos = getTodosByStatus(col.id);
        const isDragOver = dragOverColumn === col.id;

        return (
          <div
            key={col.id}
            className={clsx(
              'bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 transition-colors min-h-[300px]',
              isDragOver
                ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-700'
            )}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="font-medium text-sm text-slate-700 dark:text-slate-300">{col.label}</span>
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {colTodos.length}
              </span>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2">
              {colTodos.map((todo) => (
                <KanbanCard
                  key={todo.id}
                  todo={todo}
                  projectColor={projectColor}
                  isDragging={draggedId === todo.id}
                  onDragStart={handleDragStart}
                />
              ))}
              {colTodos.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">
                  Drop items here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  todo,
  projectColor,
  isDragging,
  onDragStart,
}: {
  todo: Todo;
  projectColor: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, todoId: string) => void;
}) {
  const priorityStyle = PRIORITY_BADGE[todo.priority] || PRIORITY_BADGE.medium;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, todo.id)}
      className={clsx(
        'group bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all',
        isDragging && 'opacity-50 rotate-1'
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <Link
            to={`/todo/${todo.id}`}
            className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-2"
          >
            {todo.title}
          </Link>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', priorityStyle.bg, priorityStyle.text)}>
              {todo.priority}
            </span>

            {todo.estimatedMinutes > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                <Clock className="w-3 h-3" />
                {todo.estimatedMinutes}m
              </span>
            )}

            {todo.dueDate && (
              <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                <AlertCircle className="w-3 h-3" />
                {new Date(todo.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}

            {todo.tags.length > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: projectColor }}
              >
                {todo.tags[0]}
                {todo.tags.length > 1 && ` +${todo.tags.length - 1}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
