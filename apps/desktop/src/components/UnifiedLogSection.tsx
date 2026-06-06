import { useState, useEffect, useRef } from 'react';
import {
  Trash2, Zap, Brain, X, CheckCircle2, History,
  Play, Pause, NotebookPen, Target, Flag, ChevronDown, Plus
} from 'lucide-react';
import { formatDuration, formatTime } from '../utils/date';
import { groupLogsByDayAndSession, logTypeColor, logTypeIcon } from './TraceView';
import type { Todo, TodoLog, TodoStatus } from '../types';

/* ------------------------------------------------------------------ */
/*  Log entry                                                           */
/* ------------------------------------------------------------------ */

function LogEntry({ log, onDelete }: { log: TodoLog; onDelete: (id: string) => void }) {
  const Icon = logTypeIcon(log.type);
  const isSystem = log.type === 'system';

  return (
    <div className={`group flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2 ${isSystem ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'} transition-colors`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${logTypeColor(log.type)}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed ${isSystem ? 'text-slate-400 dark:text-slate-500 italic' : 'text-slate-700 dark:text-slate-300'}`}>
          {log.content}
        </p>
        {log.minutesSpent !== undefined && log.minutesSpent > 0 && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            +{formatDuration(log.minutesSpent)}
          </span>
        )}
      </div>
      <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 mt-0.5 font-mono">
        {formatTime(log.createdAt)}
      </span>
      {log.type !== 'system' && (
        <button
          onClick={() => onDelete(log.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-all shrink-0 p-0.5"
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

const LOG_TYPE_OPTIONS: { type: 'progress' | 'thought' | 'blocker' | 'decision'; label: string; icon: typeof Zap; color: string }[] = [
  { type: 'progress', label: 'Progress', icon: Zap, color: 'text-indigo-500' },
  { type: 'thought', label: 'Thought', icon: Brain, color: 'text-amber-500' },
  { type: 'blocker', label: 'Blocker', icon: X, color: 'text-rose-500' },
  { type: 'decision', label: 'Decision', icon: CheckCircle2, color: 'text-emerald-500' },
];

/* ------------------------------------------------------------------ */
/*  Status badge helper                                                 */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: TodoStatus }) {
  const config: Record<TodoStatus, { label: string; bg: string; text: string; dot: string }> = {
    pending: { label: 'Pending', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-300 dark:bg-slate-500' },
    in_progress: { label: 'In Progress', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-400 animate-pulse' },
    done: { label: 'Done', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-400' },
  };
  const cfg = config[status];
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  MagicInputBar                                                       */
/* ------------------------------------------------------------------ */

function MagicInputBar({
  activeType,
  setActiveType,
  input,
  setInput,
  minutesSpent,
  setMinutesSpent,
  onSubmitLog,
  floating = false,
  todayTodos,
  onSwitchTodo,
  currentTodoStatus,
  onToggleStatus,
  goalTodo,
  graphNodes,
  onCreateNode,
  onDeleteNode,
}: {
  activeType: 'progress' | 'thought' | 'blocker' | 'decision';
  setActiveType: (type: 'progress' | 'thought' | 'blocker' | 'decision') => void;
  input: string;
  setInput: (v: string) => void;
  minutesSpent: number | '';
  setMinutesSpent: (v: number | '') => void;
  onSubmitLog: () => void;
  floating?: boolean;
  todayTodos: Todo[];
  onSwitchTodo: (todoId: string) => void;
  currentTodoStatus: TodoStatus;
  onToggleStatus: () => void;
  goalTodo: Todo | null;
  graphNodes: Todo[];
  onCreateNode: (title: string) => void;
  onDeleteNode: (todoId: string) => void;
}) {
  const [mainMode, setMainMode] = useState<'log' | 'task' | 'node'>('log');
  const [switchTodoId, setSwitchTodoId] = useState('');
  const [nodeTitle, setNodeTitle] = useState('');
  const [showSwitchDropdown, setShowSwitchDropdown] = useState(false);

  const containerClass = floating
    ? 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg px-5 py-3 space-y-2'
    : 'px-5 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2';

  const MAIN_MODE_OPTIONS: { mode: 'log' | 'task' | 'node'; label: string; icon: typeof Zap }[] = [
    { mode: 'log', label: 'Log', icon: NotebookPen },
    { mode: 'task', label: 'Task', icon: Zap },
    { mode: 'node', label: 'Node', icon: Flag },
  ];

  // Log mode content
  const logContent = (
    <>
      {/* Log type selector */}
      <div className="flex items-center gap-1">
        {LOG_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = activeType === opt.type;
          return (
            <button
              key={opt.type}
              onClick={() => setActiveType(opt.type)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon className={`w-3 h-3 ${isActive ? opt.color : ''}`} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmitLog();
            if (e.key === 'Escape') {
              setInput('');
              setMinutesSpent('');
            }
          }}
          placeholder={
            activeType === 'progress'
              ? 'What did you just do?'
              : activeType === 'thought'
              ? 'What is on your mind?'
              : activeType === 'blocker'
              ? 'What is blocking you?'
              : 'What decision did you make?'
          }
          className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
        />
        {activeType === 'progress' && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={480}
              value={minutesSpent}
              onChange={(e) => {
                const val = e.target.value;
                setMinutesSpent(val === '' ? '' : Math.max(1, parseInt(val) || 1));
              }}
              placeholder="Min"
              className="w-14 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
            />
          </div>
        )}
        <button
          onClick={onSubmitLog}
          disabled={!input.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/50"
        >
          Add
        </button>
      </div>
    </>
  );

  // Task mode content
  const otherTodos = todayTodos.filter((t) => t.status !== 'done');

  const taskContent = (
    <div className="space-y-2">
      {/* Status + controls */}
      <div className="flex items-center gap-2">
        <StatusBadge status={currentTodoStatus} />
        {currentTodoStatus !== 'done' && (
          <button
            onClick={onToggleStatus}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              currentTodoStatus === 'in_progress'
                ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {currentTodoStatus === 'in_progress' ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Start
              </>
            )}
          </button>
        )}
      </div>

      {/* Task switcher */}
      {otherTodos.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <button
              onClick={() => setShowSwitchDropdown((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <span className={switchTodoId ? '' : 'text-slate-400 dark:text-slate-500'}>
                {switchTodoId
                  ? otherTodos.find((t) => t.id === switchTodoId)?.title ?? 'Select a todo...'
                  : 'Switch to another task...'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${showSwitchDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showSwitchDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto z-50">
                {otherTodos.map((todo) => (
                  <button
                    key={todo.id}
                    onClick={() => {
                      setSwitchTodoId(todo.id);
                      setShowSwitchDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      switchTodoId === todo.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {todo.status === 'in_progress' ? (
                        <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                      ) : (
                        <Target className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{todo.title}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-auto">
                        {formatDuration(todo.estimatedMinutes)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              if (switchTodoId) {
                onSwitchTodo(switchTodoId);
                setSwitchTodoId('');
              }
            }}
            disabled={!switchTodoId}
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 shrink-0"
          >
            Switch
          </button>
        </div>
      )}
    </div>
  );

  // Node mode content
  const sortedNodes = [...graphNodes].sort((a, b) => {
    const statusOrder: Record<TodoStatus, number> = { pending: 0, in_progress: 1, done: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    return a.title.localeCompare(b.title);
  });

  const nodeContent = (
    <div className="space-y-2">
      {!goalTodo ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
          No goal context for this task.
        </p>
      ) : (
        <>
          {/* Create node */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nodeTitle}
              onChange={(e) => setNodeTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nodeTitle.trim()) {
                  onCreateNode(nodeTitle.trim());
                  setNodeTitle('');
                }
                if (e.key === 'Escape') setNodeTitle('');
              }}
              placeholder="New node title..."
              className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />
            <button
              onClick={() => {
                if (nodeTitle.trim()) {
                  onCreateNode(nodeTitle.trim());
                  setNodeTitle('');
                }
              }}
              disabled={!nodeTitle.trim()}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 shrink-0"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>

          {/* Node list */}
          {sortedNodes.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {sortedNodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 group"
                >
                  {node.status === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : node.status === 'in_progress' ? (
                    <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <Target className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className={`text-xs truncate flex-1 ${
                    node.status === 'done'
                      ? 'text-slate-400 dark:text-slate-500 line-through'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {node.title}
                  </span>
                  <button
                    onClick={() => onDeleteNode(node.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-all shrink-0 p-0.5"
                    title="Delete node"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {sortedNodes.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-1">
              No nodes yet. Add one above.
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={containerClass}>
      {/* Main mode selector */}
      <div className="flex items-center gap-1">
        {MAIN_MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = mainMode === opt.mode;
          return (
            <button
              key={opt.mode}
              onClick={() => setMainMode(opt.mode)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="w-3 h-3" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Mode-specific content */}
      {mainMode === 'log' && logContent}
      {mainMode === 'task' && taskContent}
      {mainMode === 'node' && nodeContent}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UnifiedLogSection                                                   */
/* ------------------------------------------------------------------ */

export function UnifiedLogSection({
  logs,
  isLoading,
  onAdd,
  onDelete,
  floatingInput = false,
  todayTodos,
  onSwitchTodo,
  currentTodoStatus,
  onToggleStatus,
  goalTodo,
  graphNodes,
  onCreateNode,
  onDeleteNode,
}: {
  logs: TodoLog[];
  isLoading: boolean;
  onAdd: (type: 'progress' | 'thought' | 'blocker' | 'decision', content: string, minutesSpent?: number) => void;
  onDelete: (id: string) => void;
  floatingInput?: boolean;
  todayTodos: Todo[];
  onSwitchTodo: (todoId: string) => void;
  currentTodoStatus: TodoStatus;
  onToggleStatus: () => void;
  goalTodo: Todo | null;
  graphNodes: Todo[];
  onCreateNode: (title: string) => void;
  onDeleteNode: (todoId: string) => void;
}) {
  const [input, setInput] = useState('');
  const [activeType, setActiveType] = useState<'progress' | 'thought' | 'blocker' | 'decision'>('progress');
  const [minutesSpent, setMinutesSpent] = useState<number | ''>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  function handleSubmitLog() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAdd(activeType, trimmed, activeType === 'progress' && minutesSpent !== '' ? Number(minutesSpent) : undefined);
    setInput('');
    setMinutesSpent('');
  }

  const grouped = groupLogsByDayAndSession(logs);

  const logList = (
    <div ref={scrollRef} className={`flex-1 overflow-y-auto px-5 py-3 space-y-4 ${floatingInput ? 'max-h-[calc(100vh-300px)]' : 'max-h-96'}`}>
      {isLoading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
          Loading...
        </p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
          No entries yet. Add one below.
        </p>
      ) : (
        grouped.map((day, dayIdx) => (
          <div key={day.dateLabel + dayIdx}>
            {/* Day header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {day.dateLabel}
              </span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
            </div>

            {/* Sessions within day */}
            <div className="space-y-3">
              {day.sessions.map((session, sessIdx) => (
                <div key={sessIdx}>
                  {sessIdx > 0 && (
                    <div className="flex items-center gap-2 my-2">
                      <span className="text-[10px] text-slate-300 dark:text-slate-600">
                        Session break
                      </span>
                      <div className="flex-1 h-px bg-slate-50 dark:bg-slate-800/50" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {session.logs.map((log) => (
                      <LogEntry key={log.id} log={log} onDelete={onDelete} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      {/* Spacer for WebKit scroll padding bug */}
      {floatingInput && <div className="h-16" />}
    </div>
  );

  const inputBar = (
    <MagicInputBar
      activeType={activeType}
      setActiveType={setActiveType}
      input={input}
      setInput={setInput}
      minutesSpent={minutesSpent}
      setMinutesSpent={setMinutesSpent}
      onSubmitLog={handleSubmitLog}
      floating={floatingInput}
      todayTodos={todayTodos}
      onSwitchTodo={onSwitchTodo}
      currentTodoStatus={currentTodoStatus}
      onToggleStatus={onToggleStatus}
      goalTodo={goalTodo}
      graphNodes={graphNodes}
      onCreateNode={onCreateNode}
      onDeleteNode={onDeleteNode}
    />
  );

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Execution Log
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
              {logs.length} entries
            </span>
          </div>
        </div>

        {logList}

        {!floatingInput && inputBar}
      </div>

      {floatingInput && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-72 md:right-8">
          {inputBar}
        </div>
      )}
    </>
  );
}
