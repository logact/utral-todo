import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Network,
  Filter,
  Loader2,
  Eye,
  EyeOff,
  Flag,
  Maximize2,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
} from 'lucide-react';
import { BigMapCanvas } from './BigMapCanvas';
import { useBigMapViewport } from '../hooks/useBigMapViewport';
import { computeUnifiedGraphLayout, computeGoalRoadLayout, type LayoutResult } from './BigMapLayout';
import { getAllTodos, getTodo, createGoal, createTask } from '../db/todos';
import { getAllRelations, createRelation } from '../db/relations';
import { db } from '../db/database';
import type { Todo, TodoRelation, TodoRelationType, TodoLog, NodeType } from '../types';
import { inferRelationBetween } from '../utils/relations';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RoadToGoalGraphProps {
  goalId: string;
  highlightTodoId?: string;
  mode?: 'page' | 'card';
  title?: string;
  editing?: boolean;
  layersAround?: number;
  reloadTick?: number;
  onNodeClick?: (todoId: string) => void;
  onCreateRelation?: (fromTodoId: string, toTodoId: string, type: TodoRelationType) => Promise<void>;
  onDeleteRelation?: (relationId: string) => Promise<void>;
  onUpdateRelation?: (relationId: string, type: TodoRelationType) => Promise<void>;
  onReconnectRelation?: (relationId: string, fromTodoId: string, toTodoId: string) => Promise<void>;
  onRelationsChange?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Status Filter Chip                                                 */
/* ------------------------------------------------------------------ */

function FilterChip({
  label,
  count,
  active,
  onToggle,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? `bg-white dark:bg-slate-800 border shadow-sm ${color}`
          : 'bg-slate-100 dark:bg-slate-800/50 border border-transparent text-slate-400 dark:text-slate-500 opacity-60'
      }`}
    >
      {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {label}
      <span className="text-[10px] opacity-70">{count}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Viewport Toolbar                                                   */
/* ------------------------------------------------------------------ */

function ViewportToolbar({
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onZoomOut}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
        title="Zoom out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 w-10 text-center tabular-nums">
        {Math.round(scale * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onReset}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
        title="Reset view"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onFit}
        className="px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] text-slate-500 dark:text-slate-400 transition-colors"
        title="Fit to view"
      >
        <Maximize className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const EMPTY_LAYOUT: LayoutResult = {
  nodes: [],
  execLogNodes: [],
  actionEdges: [],
  parentChildEdges: [],
  roadEdges: [],
  width: 0,
  height: 0,
};

export function RoadToGoalGraph({
  goalId,
  highlightTodoId,
  mode = 'card',
  title = 'Road to Goal',
  editing = false,
  layersAround,
  reloadTick = 0,
  onNodeClick,
  onCreateRelation,
  onDeleteRelation,
  onUpdateRelation,
  onReconnectRelation,
  onRelationsChange,
}: RoadToGoalGraphProps) {
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(null);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [relations, setRelations] = useState<TodoRelation[]>([]);
  const [execLogs, setExecLogs] = useState<TodoLog[]>([]);
  const [goalTodo, setGoalTodo] = useState<Todo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFitted, setHasFitted] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  // Status filters
  const [showPending, setShowPending] = useState(true);
  const [showInProgress, setShowInProgress] = useState(true);
  const [showDone, setShowDone] = useState(true);

  const viewport = useBigMapViewport();

  // Reset fit when goal changes
  useEffect(() => {
    setHasFitted(false);
  }, [goalId]);

  // Measure the canvas container width
  useEffect(() => {
    if (!canvasContainer) return;

    const el = canvasContainer;
    function update() {
      const width = el.clientWidth;
      if (width > 0) setContainerWidth(width);
    }

    update();
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setContainerWidth(width);
    });
    ro.observe(canvasContainer);
    return () => ro.disconnect();
  }, [canvasContainer]);

  // Load data
  const loadData = useCallback(async (signal?: { cancelled: boolean }) => {
    setIsLoading(true);
    const [allTodos, allRelations, goal] = await Promise.all([
      getAllTodos(),
      getAllRelations(),
      getTodo(goalId),
    ]);

    if (signal?.cancelled) return;

    setTodos(allTodos);
    setRelations(allRelations);
    setGoalTodo(goal ?? null);

    // Load exec logs for every task that will appear in the graph.
    const taskIds = allTodos.filter((t) => t.nodeType === 'task').map((t) => t.id);
    const logsPerTask = await Promise.all(
      taskIds.map((id) =>
        db.todoLogs.where('todoId').equals(id).and((l) => l.type === 'exec').toArray()
      )
    );
    setExecLogs(logsPerTask.flat());

    if (!signal?.cancelled) setIsLoading(false);
  }, [goalId, reloadTick]);

  useEffect(() => {
    const signal = { cancelled: false };
    loadData(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadData]);

  // Reload function exposed to editing children
  const reload = useCallback(async () => {
    setHasFitted(false);
    await loadData();
  }, [loadData]);

  // Create a new goal/task from an empty-space drop and link it to the source node.
  const handleCreateNodeFromDrag = useCallback(
    async (sourceId: string, title: string, nodeType: NodeType) => {
      const sourceTodo = await getTodo(sourceId);
      if (!sourceTodo) return;

      const newTodo =
        nodeType === 'goal'
          ? await createGoal(title, { tags: [...sourceTodo.tags] })
          : await createTask(title, { tags: [...sourceTodo.tags] });

      const relation = inferRelationBetween(sourceTodo, newTodo);
      if (!relation) return;

      await createRelation(relation.fromId, relation.toId, relation.type);
      await reload();
      onRelationsChange?.();
    },
    [reload, onRelationsChange]
  );

  // Refresh graph data when local/remote changes sync.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => reload(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    window.addEventListener('db:changed', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
      window.removeEventListener('db:changed', handler);
    };
  }, [reload]);

  // Filtered todos based on status (always keep the focus goal visible)
  const filteredTodos = useMemo(() => {
    const list = todos.filter((t) => {
      if (t.id === goalId) return true;
      if (t.status === 'done' && !showDone) return false;
      if (t.status === 'in_progress' && !showInProgress) return false;
      if (t.status === 'pending' && !showPending) return false;
      return true;
    });
    if (goalTodo && !list.some((t) => t.id === goalId)) {
      list.push(goalTodo);
    }
    return list;
  }, [todos, showPending, showInProgress, showDone, goalId, goalTodo]);

  // Compute layout: full graph by default, or BFS-limited neighborhood when layersAround is set.
  const layoutResult = useMemo<LayoutResult>(() => {
    if (isLoading) return EMPTY_LAYOUT;
    if (containerWidth === 0) return EMPTY_LAYOUT;
    if (layersAround !== undefined && layersAround >= 0) {
      return computeGoalRoadLayout(goalId, filteredTodos, relations, layersAround, containerWidth, execLogs);
    }
    return computeUnifiedGraphLayout(filteredTodos, relations, containerWidth, execLogs);
  }, [isLoading, filteredTodos, relations, containerWidth, layersAround, goalId, execLogs]);

  // Auto-fit on first load; center on the focus goal.
  const handleFit = useCallback(() => {
    if (!canvasContainer || layoutResult.width === 0) return;
    viewport.zoomToFit(
      layoutResult.width,
      layoutResult.height,
      canvasContainer.clientWidth,
      canvasContainer.clientHeight
    );
  }, [layoutResult, viewport, canvasContainer]);

  const handleInitialView = useCallback(() => {
    if (!canvasContainer || layoutResult.width === 0) return;

    const node = layoutResult.nodes.find((n) => n.todo.id === goalId);
    if (node) {
      const padding = 40;
      const scaleX = (canvasContainer.clientWidth - padding * 2) / layoutResult.width;
      const scaleY = (canvasContainer.clientHeight - padding * 2) / layoutResult.height;
      const scale = Math.min(scaleX, scaleY, 1);
      viewport.centerOn(node.x, node.y, canvasContainer.clientWidth, canvasContainer.clientHeight, scale);
      return;
    }

    handleFit();
  }, [layoutResult, goalId, viewport, handleFit, canvasContainer]);

  useEffect(() => {
    if (!isLoading && !hasFitted && layoutResult.width > 0 && canvasContainer) {
      const timer = setTimeout(() => {
        handleInitialView();
        setHasFitted(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, hasFitted, layoutResult, handleInitialView, canvasContainer]);

  // Status counts
  const pendingCount = useMemo(() => todos.filter((t) => t.status === 'pending').length, [todos]);
  const inProgressCount = useMemo(() => todos.filter((t) => t.status === 'in_progress').length, [todos]);
  const doneCount = useMemo(() => todos.filter((t) => t.status === 'done').length, [todos]);
  const goalCount = useMemo(
    () => layoutResult.nodes.filter((n) => n.todo.nodeType === 'goal').length,
    [layoutResult.nodes]
  );

  const header = (
    <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        {mode === 'page' && (
          <Link
            to="/map"
            className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Root
          </Link>
        )}
        <Network className="w-5 h-5 text-indigo-500 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {layoutResult.nodes.length} nodes
            {goalCount > 0 && ` · ${goalCount} goals`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto flex-wrap">
        {mode === 'card' && (
          <Link
            to={`/map?goal=${goalId}`}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Link>
        )}

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <FilterChip
            label="Pending"
            count={pendingCount}
            active={showPending}
            onToggle={() => setShowPending((v) => !v)}
            color="text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600"
          />
          <FilterChip
            label="In Progress"
            count={inProgressCount}
            active={showInProgress}
            onToggle={() => setShowInProgress((v) => !v)}
            color="text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
          />
          <FilterChip
            label="Done"
            count={doneCount}
            active={showDone}
            onToggle={() => setShowDone((v) => !v)}
            color="text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
          />
        </div>

        <ViewportToolbar
          scale={viewport.viewport.scale}
          onZoomIn={viewport.zoomIn}
          onZoomOut={viewport.zoomOut}
          onFit={handleFit}
          onReset={viewport.reset}
        />
      </div>
    </div>
  );

  const canvas = (
    <div ref={setCanvasContainer} className="relative flex-1 bg-slate-50 dark:bg-slate-950 overflow-hidden min-h-0 min-w-0">
      {layoutResult.nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
          <div className="text-center">
            <Flag className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No nodes to display.</p>
            <p className="text-xs mt-1">
              {isLoading
                ? 'Loading graph data...'
                : !goalTodo
                ? 'Goal not found.'
                : 'Adjust filters or add todos to see the road.'}
            </p>
          </div>
        </div>
      ) : (
        <BigMapCanvas
          nodes={layoutResult.nodes}
          actionEdges={layoutResult.actionEdges}
          parentChildEdges={layoutResult.parentChildEdges}
          roadEdges={layoutResult.roadEdges}
          execLogNodes={layoutResult.execLogNodes}
          width={layoutResult.width}
          height={layoutResult.height}
          viewport={viewport.viewport}
          isDragging={viewport.isDragging}
          onWheel={viewport.handleWheel}
          onMouseDown={viewport.handleMouseDown}
          onMouseMove={viewport.handleMouseMove}
          onMouseUp={viewport.handleMouseUp}
          mode="neighborhood"
          centerTodoId={goalId}
          highlightTodoId={highlightTodoId}
          onNodeClick={onNodeClick}
          editing={editing}
          onCreateRelation={onCreateRelation}
          onDeleteRelation={onDeleteRelation}
          onUpdateRelation={onUpdateRelation}
          onReconnectRelation={onReconnectRelation}
          onRelationsChange={() => {
            reload();
            onRelationsChange?.();
          }}
          onCreateNodeFromDrag={handleCreateNodeFromDrag}
        />
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading road...
      </div>
    );
  }

  if (mode === 'page') {
    return (
      <div className="flex flex-col h-screen -m-8 p-0">
        {header}
        {canvas}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[480px]">
      {header}
      {canvas}
    </div>
  );
}
