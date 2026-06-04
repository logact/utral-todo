import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Network, Filter, Loader2, Eye, EyeOff, Link2, X, Lightbulb, Wrench, ArrowRight } from 'lucide-react';
import { BigMapCanvas } from '../components/BigMapCanvas';
import { BigMapControls } from '../components/BigMapControls';
import { BigMapLegend } from '../components/BigMapLegend';
import { computeLayout } from '../components/BigMapLayout';
import { useBigMapViewport } from '../hooks/useBigMapViewport';
import { createActionEdge, getAllActionEdges } from '../db/actionEdges';
import { getAllTodos } from '../db/todos';
import { getAllRelations } from '../db/relations';
import { EDGE_COLORS } from '../components/BigMapConstants';
import type { Todo, ActionEdge, TodoRelation, ActionEdgeType } from '../types';

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
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export function BigMap() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [actionEdges, setActionEdges] = useState<ActionEdge[]>([]);
  const [relations, setRelations] = useState<TodoRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFitted, setHasFitted] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Status filters
  const [showPending, setShowPending] = useState(true);
  const [showInProgress, setShowInProgress] = useState(true);
  const [showDone, setShowDone] = useState(true);

  const viewport = useBigMapViewport();

  // Connect mode
  const [connectMode, setConnectMode] = useState(false);
  const [connectEdgeType, setConnectEdgeType] = useState<ActionEdgeType>('pre_do');
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [isCreatingEdge, setIsCreatingEdge] = useState(false);

  // Load data
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [allTodos, allEdges, allRelations] = await Promise.all([
        getAllTodos(),
        getAllActionEdges(),
        getAllRelations(),
      ]);
      setTodos(allTodos as Todo[]);
      setActionEdges(allEdges as ActionEdge[]);
      setRelations(allRelations as TodoRelation[]);
      setIsLoading(false);
    }
    load();
  }, []);

  // Escape key to cancel connect mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setConnectMode(false);
        setConnectSourceId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle node click in connect mode
  async function handleNodeClickForConnect(todoId: string) {
    if (!connectMode) return;

    if (!connectSourceId) {
      // Select source
      setConnectSourceId(todoId);
      return;
    }

    if (connectSourceId === todoId) {
      // Clicked same node — deselect
      setConnectSourceId(null);
      return;
    }

    // Create edge from source to target
    setIsCreatingEdge(true);
    try {
      await createActionEdge(connectSourceId, todoId, connectEdgeType);
      // Reload edges
      const allEdges = await getAllActionEdges();
      setActionEdges(allEdges);
      // Reset connect mode
      setConnectSourceId(null);
      setConnectMode(false);
    } catch (err) {
      // Edge may already exist — silently ignore or could show toast
      console.warn('Failed to create edge:', err);
      setConnectSourceId(null);
    } finally {
      setIsCreatingEdge(false);
    }
  }

  // Filtered todos based on status
  const filteredTodos = useMemo(() => {
    return todos.filter((t) => {
      if (t.status === 'done' && !showDone) return false;
      if (t.status === 'in_progress' && !showInProgress) return false;
      if (t.status === 'pending' && !showPending) return false;
      return true;
    });
  }, [todos, showPending, showInProgress, showDone]);

  // Filtered action edges (only include edges where both endpoints are visible)
  const visibleTodoIds = useMemo(() => new Set(filteredTodos.map((t) => t.id)), [filteredTodos]);
  const filteredActionEdges = useMemo(() => {
    return actionEdges.filter(
      (e) => visibleTodoIds.has(e.fromTodoId) && visibleTodoIds.has(e.toTodoId)
    );
  }, [actionEdges, visibleTodoIds]);

  // Compute layout
  const layoutResult = useMemo(() => {
    return computeLayout(filteredTodos, filteredActionEdges, relations);
  }, [filteredTodos, filteredActionEdges, relations]);

  // Auto-fit on first load
  const handleFit = useCallback(() => {
    const container = canvasContainerRef.current;
    if (!container || layoutResult.width === 0) return;
    viewport.zoomToFit(
      layoutResult.width,
      layoutResult.height,
      container.clientWidth,
      container.clientHeight
    );
  }, [layoutResult.width, layoutResult.height, viewport]);

  useEffect(() => {
    if (!isLoading && !hasFitted && layoutResult.width > 0) {
      const timer = setTimeout(() => {
        handleFit();
        setHasFitted(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, hasFitted, layoutResult.width, layoutResult.height, handleFit]);

  // Status counts
  const pendingCount = todos.filter((t) => t.status === 'pending').length;
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
  const doneCount = todos.filter((t) => t.status === 'done').length;
  const goalCount = layoutResult.nodes.filter((n) => n.isGoal).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading map...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen -m-8 p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-indigo-500" />
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Big Map
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {layoutResult.nodes.length} nodes · {layoutResult.actionEdges.length} action edges · {goalCount} goals
            </p>
          </div>
        </div>

        {/* Connect mode controls */}
        <div className="flex items-center gap-2">
          {connectMode ? (
            <>
              {/* Edge type selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                {(['insight', 'try', 'pre_do'] as ActionEdgeType[]).map((type) => {
                  const isActive = connectEdgeType === type;
                  const Icon = type === 'insight' ? Lightbulb : type === 'try' ? Wrench : ArrowRight;
                  return (
                    <button
                      key={type}
                      onClick={() => setConnectEdgeType(type)}
                      disabled={!!connectSourceId}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                        isActive
                          ? 'bg-white dark:bg-slate-700 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                      style={{ color: isActive ? EDGE_COLORS[type] : undefined }}
                      title={connectSourceId ? 'Finish current connection first' : undefined}
                    >
                      <Icon className="w-3 h-3" />
                      {type === 'pre_do' ? 'Pre-do' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  );
                })}
              </div>

              {/* Status text */}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {connectSourceId
                  ? 'Click target node'
                  : 'Click source node'}
              </span>

              {isCreatingEdge && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}

              <button
                onClick={() => {
                  setConnectMode(false);
                  setConnectSourceId(null);
                }}
                className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
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
      </div>

      {/* Canvas area */}
      <div ref={canvasContainerRef} className="relative flex-1 bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {layoutResult.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
            <div className="text-center">
              <Network className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No todos to display.</p>
              <p className="text-xs mt-1">Create some todos and action edges to see the map.</p>
            </div>
          </div>
        ) : (
          <>
            <BigMapCanvas
              nodes={layoutResult.nodes}
              actionEdges={layoutResult.actionEdges}
              parentChildEdges={layoutResult.parentChildEdges}
              width={layoutResult.width}
              height={layoutResult.height}
              viewport={viewport.viewport}
              isDragging={viewport.isDragging}
              onWheel={viewport.handleWheel}
              onMouseDown={viewport.handleMouseDown}
              onMouseMove={viewport.handleMouseMove}
              onMouseUp={viewport.handleMouseUp}
              connectMode={connectMode}
              connectSourceId={connectSourceId}
              connectEdgeType={connectEdgeType}
              onNodeClickForConnect={handleNodeClickForConnect}
            />
            <BigMapControls
              onZoomIn={viewport.zoomIn}
              onZoomOut={viewport.zoomOut}
              onFit={handleFit}
              onReset={viewport.reset}
              scale={viewport.viewport.scale}
            />
            <BigMapLegend />
          </>
        )}
      </div>
    </div>
  );
}
