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
  Link2,
  X,
} from 'lucide-react';
import { BigMapCanvas } from './BigMapCanvas';
import { useBigMapViewport } from '../hooks/useBigMapViewport';
import { computeLayout, computeNeighborhoodLayout, type LayoutResult } from './BigMapLayout';
import { EDGE_COLORS, EDGE_LABELS, EDGE_ICONS } from './BigMapConstants';
import { getAllTodos, getTodo } from '../db/todos';
import { createActionEdge, getAllActionEdges } from '../db/actionEdges';
import { getAllRelations } from '../db/relations';
import { getPlan } from '../db/plans';
import type { Todo, ActionEdge, ActionEdgeType, TodoRelation, TodoRelationType, Plan } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RoadToGoalGraphProps {
  scope: 'global' | 'neighborhood';
  focusTodoId?: string;
  highlightTodoId?: string;
  layersAround?: number;
  mode?: 'page' | 'card';
  title?: string;
  editing?: boolean;
  planId?: string;
  reloadTick?: number;
  onAddToPlan?: (todoId: string) => Promise<void>;
  onRemoveFromPlan?: (todoId: string) => Promise<void>;
  onNodeClick?: (todoId: string) => void;
  onCreateRelation?: (fromTodoId: string, toTodoId: string, type: TodoRelationType) => Promise<void>;
  onDeleteRelation?: (relationId: string) => Promise<void>;
  onUpdateRelation?: (relationId: string, type: TodoRelationType) => Promise<void>;
  onUpdateTodo?: (todoId: string, updates: Partial<Todo>) => Promise<void>;
  onDeleteTodo?: (todoId: string) => Promise<void>;
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
/*  Action-edge type helpers                                           */
/* ------------------------------------------------------------------ */

const ALL_ACTION_EDGE_TYPES: ActionEdgeType[] = ['pre_do', 'parent_child', 'to_achieve'];

function allowedActionEdgeTypes(fromTodo: Todo, toTodo: Todo): ActionEdgeType[] {
  if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'task') return ['pre_do', 'parent_child'];
  if (fromTodo.nodeType === 'goal' && toTodo.nodeType === 'goal') return ['pre_do', 'parent_child'];
  if (fromTodo.nodeType === 'goal' && toTodo.nodeType === 'task') return ['to_achieve'];
  return [];
}

function actionEdgeTypesForSource(sourceTodo: Todo | null): ActionEdgeType[] {
  if (!sourceTodo) return ALL_ACTION_EDGE_TYPES;
  if (sourceTodo.nodeType === 'task') return ['pre_do', 'parent_child'];
  return ['pre_do', 'parent_child', 'to_achieve'];
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const EMPTY_LAYOUT: LayoutResult = {
  nodes: [],
  actionEdges: [],
  parentChildEdges: [],
  roadEdges: [],
  width: 0,
  height: 0,
};

export function RoadToGoalGraph({
  scope,
  focusTodoId,
  highlightTodoId,
  layersAround = 2,
  mode = 'card',
  title = 'Road to Goal',
  editing = false,
  planId,
  reloadTick = 0,
  onAddToPlan,
  onRemoveFromPlan,
  onNodeClick,
  onCreateRelation,
  onDeleteRelation,
  onUpdateRelation,
  onUpdateTodo,
  onDeleteTodo,
  onRelationsChange,
}: RoadToGoalGraphProps) {
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(null);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [actionEdges, setActionEdges] = useState<ActionEdge[]>([]);
  const [relations, setRelations] = useState<TodoRelation[]>([]);
  const [activePlanTodoIds, setActivePlanTodoIds] = useState<Set<string> | null>(null);
  const [focusTodo, setFocusTodo] = useState<Todo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFitted, setHasFitted] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  // Status filters
  const [showPending, setShowPending] = useState(true);
  const [showInProgress, setShowInProgress] = useState(true);
  const [showDone, setShowDone] = useState(true);

  // Connect mode (global scope only)
  const [connectMode, setConnectMode] = useState(false);
  const [connectEdgeType, setConnectEdgeType] = useState<ActionEdgeType>('pre_do');
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [isCreatingEdge, setIsCreatingEdge] = useState(false);

  const viewport = useBigMapViewport();

  // Reset fit when scope/focus changes
  useEffect(() => {
    setHasFitted(false);
  }, [scope, focusTodoId, layersAround]);

  // Measure the canvas container width (needed for neighborhood layout)
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
    const [allTodos, allEdges, allRelations] = await Promise.all([
      getAllTodos(),
      scope === 'global' ? getAllActionEdges() : Promise.resolve<ActionEdge[]>([]),
      getAllRelations(),
    ]);

    let plan: Plan | undefined;
    if (scope === 'neighborhood' && planId) {
      plan = await getPlan(planId);
    }

    if (signal?.cancelled) return;

    setTodos(allTodos);
    setActionEdges(allEdges);
    setRelations(allRelations);
    setActivePlanTodoIds(plan ? new Set(plan.todoIds) : null);

    if (scope === 'neighborhood' && focusTodoId) {
      const center = await getTodo(focusTodoId);
      if (!signal?.cancelled) setFocusTodo(center ?? null);
    } else {
      if (!signal?.cancelled) setFocusTodo(null);
    }

    if (!signal?.cancelled) setIsLoading(false);
  }, [scope, focusTodoId, planId, reloadTick]);

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

  // Handle node click in connect mode (global scope)
  async function handleNodeClickForConnect(todoId: string) {
    if (!connectMode) return;

    if (!connectSourceId) {
      setConnectSourceId(todoId);
      return;
    }

    if (connectSourceId === todoId) {
      setConnectSourceId(null);
      return;
    }

    const fromTodo = todos.find((t) => t.id === connectSourceId);
    const toTodo = todos.find((t) => t.id === todoId);
    if (!fromTodo || !toTodo) {
      setConnectSourceId(null);
      return;
    }

    const allowed = allowedActionEdgeTypes(fromTodo, toTodo);
    if (allowed.length === 0) {
      console.warn('No allowed edge type for this node pair');
      setConnectSourceId(null);
      return;
    }

    const effectiveType = allowed.includes(connectEdgeType) ? connectEdgeType : allowed[0];

    setIsCreatingEdge(true);
    try {
      await createActionEdge(connectSourceId, todoId, effectiveType);
      const allEdges = await getAllActionEdges();
      setActionEdges(allEdges);
      setConnectSourceId(null);
      setConnectMode(false);
    } catch (err) {
      console.warn('Failed to create edge:', err);
      setConnectSourceId(null);
    } finally {
      setIsCreatingEdge(false);
    }
  }

  // Filtered todos based on status (always keep the focus node visible)
  const filteredTodos = useMemo(() => {
    const list = todos.filter((t) => {
      if (scope === 'neighborhood' && t.id === focusTodoId) return true;
      if (t.status === 'done' && !showDone) return false;
      if (t.status === 'in_progress' && !showInProgress) return false;
      if (t.status === 'pending' && !showPending) return false;
      return true;
    });
    // Defensive: getAllTodos can race with getTodo; make sure the focus goal is
    // in the graph even if it is missing from the bulk list.
    if (scope === 'neighborhood' && focusTodo && !list.some((t) => t.id === focusTodoId)) {
      list.push(focusTodo);
    }
    return list;
  }, [todos, showPending, showInProgress, showDone, scope, focusTodoId, focusTodo]);

  // Filtered action edges (only include edges where both endpoints are visible)
  const visibleTodoIds = useMemo(() => new Set(filteredTodos.map((t) => t.id)), [filteredTodos]);
  const filteredActionEdges = useMemo(() => {
    return actionEdges.filter(
      (e) => visibleTodoIds.has(e.fromTodoId) && visibleTodoIds.has(e.toTodoId)
    );
  }, [actionEdges, visibleTodoIds]);

  // Road-to-goal relations are shown for the whole neighborhood; active plan
  // membership only drives the add/remove menu UI in BigMapCanvas.
  const visibleRelations = useMemo(() => {
    return relations;
  }, [relations]);

  // Compute layout
  const layoutResult = useMemo<LayoutResult>(() => {
    if (isLoading) return EMPTY_LAYOUT;

    if (scope === 'global') {
      return computeLayout(filteredTodos, filteredActionEdges, visibleRelations);
    }

    if (!focusTodoId || containerWidth === 0) return EMPTY_LAYOUT;
    return computeNeighborhoodLayout(focusTodoId, filteredTodos, visibleRelations, layersAround, containerWidth);
  }, [isLoading, scope, filteredTodos, filteredActionEdges, visibleRelations, focusTodoId, layersAround, containerWidth]);

  // Auto-fit on first load; in neighborhood mode center on the focus goal.
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

    if (scope === 'neighborhood' && focusTodoId) {
      const node = layoutResult.nodes.find((n) => n.todo.id === focusTodoId);
      if (node) {
        const padding = 40;
        const scaleX = (canvasContainer.clientWidth - padding * 2) / layoutResult.width;
        const scaleY = (canvasContainer.clientHeight - padding * 2) / layoutResult.height;
        const scale = Math.min(scaleX, scaleY, 1);
        viewport.centerOn(node.x, node.y, canvasContainer.clientWidth, canvasContainer.clientHeight, scale);
        return;
      }
    }

    handleFit();
  }, [layoutResult, scope, focusTodoId, viewport, handleFit, canvasContainer]);

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
        {mode === 'page' && scope === 'neighborhood' && (
          <Link
            to="/map"
            className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Global
          </Link>
        )}
        <Network className="w-5 h-5 text-indigo-500 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {scope === 'global' ? 'Global' : 'Neighborhood'} · {layoutResult.nodes.length} nodes
            {goalCount > 0 && ` · ${goalCount} goals`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto flex-wrap">
        {mode === 'card' && focusTodoId && (
          <Link
            to={`/map?center=${focusTodoId}`}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Link>
        )}

        {/* Connect mode controls (global only) */}
        {scope === 'global' && (
          <div className="flex items-center gap-2">
            {connectMode ? (
              <>
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                  {(() => {
                    const sourceTodo = connectSourceId
                      ? todos.find((t) => t.id === connectSourceId) ?? null
                      : null;
                    return actionEdgeTypesForSource(sourceTodo).map((type) => {
                      const isActive = connectEdgeType === type;
                      const Icon = EDGE_ICONS[type];
                      return (
                        <button
                          key={type}
                          onClick={() => setConnectEdgeType(type)}
                          disabled={!!connectSourceId}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            isActive
                              ? 'bg-white dark:bg-slate-700 shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                          style={{ color: isActive ? EDGE_COLORS[type] : undefined }}
                          title={connectSourceId ? 'Finish current connection first' : undefined}
                        >
                          <Icon className="w-3 h-3" />
                          {EDGE_LABELS[type]}
                        </button>
                      );
                    });
                  })()}
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {connectSourceId ? 'Click target node' : 'Click source node'}
                </span>
                {isCreatingEdge && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                <button
                  onClick={() => {
                    setConnectMode(false);
                    setConnectSourceId(null);
                  }}
                  className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConnectMode(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                Connect
              </button>
            )}
          </div>
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
                : scope === 'neighborhood' && !focusTodo
                ? 'Focus todo not found.'
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
          width={layoutResult.width}
          height={layoutResult.height}
          viewport={viewport.viewport}
          isDragging={viewport.isDragging}
          onWheel={viewport.handleWheel}
          onMouseDown={viewport.handleMouseDown}
          onMouseMove={viewport.handleMouseMove}
          onMouseUp={viewport.handleMouseUp}
          mode={scope}
          centerTodoId={focusTodoId}
          highlightTodoId={highlightTodoId}
          onNodeClick={onNodeClick}
          editing={editing}
          planTodoIds={activePlanTodoIds ?? undefined}
          onAddToPlan={onAddToPlan}
          onRemoveFromPlan={onRemoveFromPlan}
          onCreateRelation={onCreateRelation}
          onDeleteRelation={onDeleteRelation}
          onUpdateRelation={onUpdateRelation}
          onUpdateTodo={onUpdateTodo}
          onDeleteTodo={onDeleteTodo}
          onRelationsChange={() => {
            reload();
            onRelationsChange?.();
          }}
          connectMode={connectMode}
          connectSourceId={connectSourceId}
          connectEdgeType={connectEdgeType}
          onNodeClickForConnect={handleNodeClickForConnect}
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
