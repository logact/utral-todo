import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Flag, Plus, X, Link2,
  Loader2, Target, ZoomIn, ZoomOut,
  Maximize2, Minimize2, RotateCcw,
} from 'lucide-react';
import { getAllActionEdges } from '../db/actionEdges';
import { createTodo, getAllTodos } from '../db/todos';
import type { Todo, ActionEdge, ActionEdgeType } from '../types';
import { formatDuration } from '../utils/date';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JourneyPathProps {
  goalTodo: Todo;
  edges: ActionEdge[];
  highlightTodoId?: string;
  onCreateEdge?: (fromTodoId: string, toTodoId: string, type: ActionEdgeType) => Promise<void>;
  onDeleteEdge?: (edgeId: string) => Promise<void>;
  onEdgesChange?: () => void;
  onNodeClick?: (todoId: string) => void;
}

interface GraphNode {
  todo: Todo;
  x: number;
  y: number;
  depth: number;
}

interface ViewState {
  scale: number;
  panX: number;
  panY: number;
}

/* ------------------------------------------------------------------ */
/*  Constants (shared with BigMap)                                     */
/* ------------------------------------------------------------------ */

import {
  NODE_W,
  NODE_H,
  GOAL_W,
  GOAL_H,
  LEVEL_H,
  NODE_GAP,
  TOP_PAD,
  MIN_SVG_W,
  EDGE_COLORS,
  EDGE_LABELS,
  EDGE_ICONS,
  EDGE_DASH,
} from './BigMapConstants';

/* ------------------------------------------------------------------ */
/*  Status Dot                                                         */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  if (status === 'done') return <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />;
  if (status === 'in_progress') return <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />;
  return <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-500" />;
}

/* ------------------------------------------------------------------ */
/*  Edge Type Selector                                                 */
/* ------------------------------------------------------------------ */

function EdgeTypeSelector({ onSelect, onCancel }: { onSelect: (type: ActionEdgeType) => void; onCancel: () => void }) {
  const types: ActionEdgeType[] = ['insight', 'try', 'pre_do'];
  return (
    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-2 shadow-sm z-50">
      <span className="text-[10px] text-slate-500 dark:text-slate-400 mr-1">Relation:</span>
      {types.map((type) => {
        const Icon = EDGE_ICONS[type];
        return (
          <button key={type} onClick={() => onSelect(type)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
            style={{ color: EDGE_COLORS[type] }}>
            <Icon className="w-3 h-3" />{EDGE_LABELS[type]}
          </button>
        );
      })}
      <button onClick={onCancel} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors ml-1">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Graph Layout                                                       */
/* ------------------------------------------------------------------ */

function layoutGraph(
  nodes: GraphNode[],
  edges: ActionEdge[],
  goalId: string,
  containerWidth: number
): { nodes: GraphNode[]; width: number; height: number } {
  // Build adjacency: edges point from child -> parent (toward goal)
  const childrenOf = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map(n => n.todo.id));

  for (const n of nodes) {
    childrenOf.set(n.todo.id, []);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.fromTodoId) || !nodeIds.has(edge.toTodoId)) continue;
    if (!childrenOf.has(edge.toTodoId)) childrenOf.set(edge.toTodoId, []);
    childrenOf.get(edge.toTodoId)!.push(edge.fromTodoId);
  }

  // Compute depth from goal (goal = 0, its children = 1, etc.)
  const depth = new Map<string, number>();
  depth.set(goalId, 0);
  const queue = [goalId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const childId of childrenOf.get(id) || []) {
      if (!depth.has(childId) || depth.get(childId)! < d + 1) {
        depth.set(childId, d + 1);
        queue.push(childId);
      }
    }
  }

  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  for (const n of nodes) {
    if (!depth.has(n.todo.id)) {
      depth.set(n.todo.id, maxDepth + 1);
    }
  }

  const depthGroups = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(id);
  }

  for (const [, ids] of depthGroups) {
    ids.sort((a, b) => {
      const nodeA = nodes.find(n => n.todo.id === a)!;
      const nodeB = nodes.find(n => n.todo.id === b)!;
      const doneA = nodeA.todo.status === 'done' ? 1 : 0;
      const doneB = nodeB.todo.status === 'done' ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return nodeA.todo.title.localeCompare(nodeB.todo.title);
    });
  }

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  const maxNodesInLevel = Math.max(...sortedDepths.map(d => depthGroups.get(d)!.length), 1);
  const neededW = Math.max(maxNodesInLevel * (NODE_W + NODE_GAP) + NODE_GAP, MIN_SVG_W);
  const sw = Math.max(neededW, containerWidth);

  for (const d of sortedDepths) {
    const ids = depthGroups.get(d)!;
    const totalW = ids.length * NODE_W + (ids.length - 1) * NODE_GAP;
    const startX = (sw - totalW) / 2;
    for (let i = 0; i < ids.length; i++) {
      const node = nodes.find(n => n.todo.id === ids[i])!;
      node.x = startX + i * (NODE_W + NODE_GAP) + NODE_W / 2;
      node.y = TOP_PAD + d * LEVEL_H + (d === 0 ? GOAL_H : NODE_H) / 2;
      node.depth = d;
    }
  }

  const sh = TOP_PAD * 2 + (Math.max(...sortedDepths) + 1) * LEVEL_H + GOAL_H;
  return { nodes, width: sw, height: sh };
}

/* ------------------------------------------------------------------ */
/*  Pan / Zoom Helpers                                                 */
/* ------------------------------------------------------------------ */

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function JourneyPath({ goalTodo, edges, highlightTodoId, onCreateEdge, onDeleteEdge, onEdgesChange, onNodeClick }: JourneyPathProps) {
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [dims, setDims] = useState({ w: MIN_SVG_W, h: 300 });
  const [loading, setLoading] = useState(true);
  const [linkingFromId, setLinkingFromId] = useState<string | null>(null);
  const [showEdgeSelector, setShowEdgeSelector] = useState(false);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan / zoom state
  const [view, setView] = useState<ViewState>({ scale: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startPanX: 0, startPanY: 0, moved: false });

  // Expand overlay
  const [isExpanded, setIsExpanded] = useState(false);
  const expandedRef = useRef<HTMLDivElement>(null);
  const [expandedView, setExpandedView] = useState<ViewState>({ scale: 1, panX: 0, panY: 0 });
  const [isExpandedDragging, setIsExpandedDragging] = useState(false);
  const expandedDragRef = useRef({ startX: 0, startY: 0, startPanX: 0, startPanY: 0, moved: false });

  // Auto-fit tracking
  const hasAutoFitRef = useRef(false);

  // Reset auto-fit when goal changes
  useEffect(() => {
    hasAutoFitRef.current = false;
  }, [goalTodo.id]);

  // Auto-fit view when graph loads
  useEffect(() => {
    if (!loading && graphNodes.length > 0 && !isExpanded && !hasAutoFitRef.current) {
      hasAutoFitRef.current = true;
      const timer = setTimeout(() => {
        if (containerRef.current) {
          handleFitView(containerRef.current.clientWidth, containerRef.current.clientHeight, false);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [loading, graphNodes.length, isExpanded]);

  // Fetch todos involved in the graph
  const loadGraph = useCallback(async () => {
    setLoading(true);
    const [allEdges, todos] = await Promise.all([
      getAllActionEdges(),
      getAllTodos(),
    ]);

    const connectedIds = new Set<string>([goalTodo.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of allEdges) {
        if (connectedIds.has(edge.fromTodoId) && !connectedIds.has(edge.toTodoId)) {
          connectedIds.add(edge.toTodoId);
          changed = true;
        }
        if (connectedIds.has(edge.toTodoId) && !connectedIds.has(edge.fromTodoId)) {
          connectedIds.add(edge.fromTodoId);
          changed = true;
        }
      }
    }

    const relevantTodos = todos.filter(t => connectedIds.has(t.id));
    const nodes: GraphNode[] = relevantTodos.map(t => ({
      todo: t,
      x: 0, y: 0, depth: 0,
    }));
    const relevantEdges = allEdges.filter(e => connectedIds.has(e.fromTodoId) && connectedIds.has(e.toTodoId));

    const width = containerRef.current?.clientWidth || MIN_SVG_W;
    const result = layoutGraph(nodes, relevantEdges, goalTodo.id, width);
    setGraphNodes(result.nodes);
    setDims({ w: result.width, h: result.height });
    setLoading(false);

    // Reset view on new data
    setView({ scale: 1, panX: 0, panY: 0 });
  }, [goalTodo.id]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph, edges]);

  // Recompute layout for expanded view when it opens
  useEffect(() => {
    if (isExpanded && expandedRef.current && graphNodes.length > 0) {
      const width = expandedRef.current.clientWidth;
      const freshNodes = graphNodes.map(n => ({ ...n, x: 0, y: 0, depth: 0 }));
      const relevantEdges = edges.filter(e =>
        graphNodes.some(n => n.todo.id === e.fromTodoId) &&
        graphNodes.some(n => n.todo.id === e.toTodoId)
      );
      const result = layoutGraph(freshNodes, relevantEdges, goalTodo.id, width);
      setGraphNodes(result.nodes);
      setDims({ w: result.width, h: result.height });
      setExpandedView({ scale: 1, panX: 0, panY: 0 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  // Restore normal layout when closing expand
  const closeExpanded = useCallback(() => {
    setIsExpanded(false);
    // Recompute with normal container width
    const timer = setTimeout(() => {
      const width = containerRef.current?.clientWidth || MIN_SVG_W;
      const freshNodes = graphNodes.map(n => ({ ...n, x: 0, y: 0, depth: 0 }));
      const relevantEdges = edges.filter(e =>
        graphNodes.some(n => n.todo.id === e.fromTodoId) &&
        graphNodes.some(n => n.todo.id === e.toTodoId)
      );
      const result = layoutGraph(freshNodes, relevantEdges, goalTodo.id, width);
      setGraphNodes(result.nodes);
      setDims({ w: result.width, h: result.height });
      setView({ scale: 1, panX: 0, panY: 0 });
    }, 0);
    return () => clearTimeout(timer);
  }, [graphNodes, edges, goalTodo.id]);

  // Compute SVG edge positions from layout data (not DOM)
  const edgePositions = useMemo(() => {
    const positions: {
      edge: ActionEdge;
      fromX: number; fromY: number;
      toX: number; toY: number;
    }[] = [];

    for (const edge of edges) {
      const fromNode = graphNodes.find(n => n.todo.id === edge.fromTodoId);
      const toNode = graphNodes.find(n => n.todo.id === edge.toTodoId);
      if (!fromNode || !toNode) continue;

      const fromH = edge.fromTodoId === goalTodo.id ? GOAL_H : NODE_H;
      const toH = edge.toTodoId === goalTodo.id ? GOAL_H : NODE_H;

      positions.push({
        edge,
        fromX: fromNode.x,
        fromY: fromNode.y - fromH / 2,
        toX: toNode.x,
        toY: toNode.y + toH / 2,
      });
    }
    return positions;
  }, [edges, graphNodes, goalTodo.id]);

  // Connected nodes for hover
  const hoveredConnectedIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const connected = new Set<string>([hoveredNodeId]);
    for (const e of edges) {
      if (e.fromTodoId === hoveredNodeId) connected.add(e.toTodoId);
      if (e.toTodoId === hoveredNodeId) connected.add(e.fromTodoId);
    }
    return connected;
  }, [hoveredNodeId, edges]);

  // Pan / Zoom handlers
  function handleWheel(e: React.WheelEvent, isExpandedView: boolean) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const setV = isExpandedView ? setExpandedView : setView;
    const current = isExpandedView ? expandedView : view;

    const newScale = clamp(current.scale + delta, 0.3, 3);
    const scaleRatio = newScale / current.scale;
    const newPanX = mouseX - (mouseX - current.panX) * scaleRatio;
    const newPanY = mouseY - (mouseY - current.panY) * scaleRatio;

    setV({ scale: newScale, panX: newPanX, panY: newPanY });
  }

  function handleMouseDown(e: React.MouseEvent, isExpandedView: boolean) {
    if (e.button !== 0) return;
    // Don't start drag if clicking on a node or interactive element
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]') || target.closest('button')) return;

    const setDragging = isExpandedView ? setIsExpandedDragging : setIsDragging;
    const dragState = isExpandedView ? expandedDragRef : dragRef;
    const current = isExpandedView ? expandedView : view;

    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: current.panX,
      startPanY: current.panY,
      moved: false,
    };
    setDragging(true);
  }

  function handleMouseMove(e: React.MouseEvent, isExpandedView: boolean) {
    const dragState = isExpandedView ? expandedDragRef : dragRef;
    const isDrag = isExpandedView ? isExpandedDragging : isDragging;
    if (!isDrag) return;

    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      dragState.current.moved = true;
    }

    const setV = isExpandedView ? setExpandedView : setView;
    const current = isExpandedView ? expandedView : view;

    setV({
      ...current,
      panX: dragState.current.startPanX + dx,
      panY: dragState.current.startPanY + dy,
    });
  }

  function handleMouseUp(isExpandedView: boolean) {
    const setDragging = isExpandedView ? setIsExpandedDragging : setIsDragging;
    setDragging(false);
    const dragState = isExpandedView ? expandedDragRef : dragRef;
    dragState.current.moved = false;
  }

  function handleZoomIn(isExpandedView: boolean) {
    const setV = isExpandedView ? setExpandedView : setView;
    const current = isExpandedView ? expandedView : view;
    setV({ ...current, scale: clamp(current.scale + 0.2, 0.3, 3) });
  }

  function handleZoomOut(isExpandedView: boolean) {
    const setV = isExpandedView ? setExpandedView : setView;
    const current = isExpandedView ? expandedView : view;
    setV({ ...current, scale: clamp(current.scale - 0.2, 0.3, 3) });
  }

  function handleResetView(isExpandedView: boolean) {
    const setV = isExpandedView ? setExpandedView : setView;
    setV({ scale: 1, panX: 0, panY: 0 });
  }

  function handleFitView(containerW: number, containerH: number, isExpandedView: boolean) {
    if (graphNodes.length === 0) return;
    const setV = isExpandedView ? setExpandedView : setView;

    const minX = Math.min(...graphNodes.map(n => n.x - (n.todo.id === goalTodo.id ? GOAL_W : NODE_W) / 2));
    const maxX = Math.max(...graphNodes.map(n => n.x + (n.todo.id === goalTodo.id ? GOAL_W : NODE_W) / 2));
    const minY = Math.min(...graphNodes.map(n => n.y - (n.todo.id === goalTodo.id ? GOAL_H : NODE_H) / 2));
    const maxY = Math.max(...graphNodes.map(n => n.y + (n.todo.id === goalTodo.id ? GOAL_H : NODE_H) / 2));

    const contentW = maxX - minX + NODE_GAP * 2;
    const contentH = maxY - minY + TOP_PAD * 2;

    const scale = Math.min(containerW / contentW, containerH / contentH, 1.5);
    const panX = (containerW - contentW * scale) / 2 - minX * scale + NODE_GAP;
    const panY = (containerH - contentH * scale) / 2 - minY * scale + TOP_PAD;

    setV({ scale: clamp(scale, 0.3, 3), panX, panY });
  }

  function handleSelectForLink(todoId: string) {
    setLinkingFromId(todoId);
  }

  function handleLinkTarget(todoId: string) {
    if (!linkingFromId || todoId === linkingFromId) {
      setLinkingFromId(null);
      return;
    }
    setPendingTargetId(todoId);
    setShowEdgeSelector(true);
  }

  async function handleEdgeTypeSelect(type: ActionEdgeType) {
    if (!linkingFromId || !pendingTargetId || !onCreateEdge) return;
    await onCreateEdge(linkingFromId, pendingTargetId, type);
    setLinkingFromId(null);
    setPendingTargetId(null);
    setShowEdgeSelector(false);
    onEdgesChange?.();
  }

  async function handleAddNode() {
    if (!newNodeTitle.trim()) return;
    const newTodo = await createTodo(newNodeTitle.trim());
    const targetId = highlightTodoId && highlightTodoId !== goalTodo.id
      ? highlightTodoId
      : goalTodo.id;
    if (onCreateEdge) {
      await onCreateEdge(newTodo.id, targetId, 'pre_do');
    }
    setNewNodeTitle('');
    setShowAddNode(false);
    await loadGraph();
  }

  // Graph content renderer (shared between normal and expanded)
  function renderGraph(
    currentView: ViewState,
    containerRefProp: React.RefObject<HTMLDivElement | null>,
    dragActive: boolean,
    isExpandedView: boolean
  ) {
    return (
      <div
        ref={containerRefProp}
        className="relative overflow-hidden w-full select-none"
        style={{
          minHeight: dims.h,
          cursor: dragActive ? 'grabbing' : 'grab',
          height: isExpandedView ? '100%' : undefined,
        }}
        onMouseDown={e => handleMouseDown(e, isExpandedView)}
        onMouseMove={e => handleMouseMove(e, isExpandedView)}
        onMouseUp={() => handleMouseUp(isExpandedView)}
        onMouseLeave={() => handleMouseUp(isExpandedView)}
        onWheel={e => handleWheel(e, isExpandedView)}
      >
        <div
          className="graph-content"
          style={{
            transform: `translate(${currentView.panX}px, ${currentView.panY}px) scale(${currentView.scale})`,
            transformOrigin: '0 0',
            width: dims.w,
            height: dims.h,
            position: 'relative',
          }}
        >
          {/* SVG edges */}
          <svg
            className="absolute pointer-events-none"
            style={{ width: dims.w, height: dims.h, left: 0, top: 0 }}
          >
            <defs>
              <marker id={`arrow-insight${isExpandedView ? '-expanded' : ''}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.insight} />
              </marker>
              <marker id={`arrow-try${isExpandedView ? '-expanded' : ''}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.try} />
              </marker>
              <marker id={`arrow-pre_do${isExpandedView ? '-expanded' : ''}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.pre_do} />
              </marker>
            </defs>

            {edgePositions.map(pos => {
              const isHovered = hoveredEdgeId === pos.edge.id;
              const isDimmed = hoveredNodeId && !(hoveredNodeId === pos.edge.fromTodoId || hoveredNodeId === pos.edge.toTodoId);
              const dx = pos.toX - pos.fromX;
              const dy = pos.toY - pos.fromY;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const perpX = -(dy / dist) * 30;
              const perpY = (dx / dist) * 30;
              const ctrlX = (pos.fromX + pos.toX) / 2 + perpX;
              const ctrlY = (pos.fromY + pos.toY) / 2 + perpY;
              const color = EDGE_COLORS[pos.edge.type];
              const dash = EDGE_DASH[pos.edge.type];
              const markerId = `arrow-${pos.edge.type}${isExpandedView ? '-expanded' : ''}`;

              return (
                <g key={pos.edge.id} opacity={isDimmed ? 0.08 : 1}>
                  <path d={`M ${pos.fromX} ${pos.fromY} Q ${ctrlX} ${ctrlY} ${pos.toX} ${pos.toY}`}
                    fill="none" stroke={color} strokeWidth={isHovered ? 2.5 : 1.5}
                    strokeDasharray={dash} opacity={isHovered ? 1 : 0.6}
                    markerEnd={`url(#${markerId})`}
                    style={{ transition: 'all 0.2s' }}
                    className="pointer-events-auto cursor-pointer"
                    onMouseEnter={() => setHoveredEdgeId(pos.edge.id)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                    onClick={() => onDeleteEdge?.(pos.edge.id)} />
                  <g transform={`translate(${(pos.fromX + pos.toX) / 2 + perpX * 0.25}, ${(pos.fromY + pos.toY) / 2 + perpY * 0.25})`}>
                    <rect x="-18" y="-7" width="36" height="14" rx="7" fill={color} opacity={isHovered ? 0.9 : 0.7} />
                    <text x="0" y="3.5" textAnchor="middle" fill="white" fontSize="8" fontWeight="500">
                      {EDGE_LABELS[pos.edge.type]}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {graphNodes.map(node => {
            const isGoal = node.todo.isGoal === true || node.todo.id === goalTodo.id;
            const isHighlight = highlightTodoId === node.todo.id;
            const isDone = node.todo.status === 'done';
            const w = isGoal ? GOAL_W : NODE_W;
            const h = isGoal ? GOAL_H : NODE_H;
            const isDimmed = hoveredNodeId && !hoveredConnectedIds.has(node.todo.id) && hoveredNodeId !== node.todo.id;
            const isSelected = linkingFromId === node.todo.id;
            const isLinkingTarget = !!linkingFromId && linkingFromId !== node.todo.id && !isGoal;

            return (
              <div key={node.todo.id}
                data-node="true"
                className="absolute"
                style={{
                  left: node.x - w / 2, top: node.y - h / 2,
                  width: w, opacity: isDimmed ? 0.18 : 1,
                  transition: 'opacity 0.2s', zIndex: isSelected ? 20 : isHighlight ? 15 : isGoal ? 12 : 10,
                }}
                onMouseEnter={() => setHoveredNodeId(node.todo.id)}
                onMouseLeave={() => setHoveredNodeId(null)}>

                {isSelected && <div className="absolute -inset-1.5 rounded-xl border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20" />}
                {isHighlight && <div className="absolute -inset-1.5 rounded-xl border-2 border-amber-400/70 bg-amber-50/30 dark:bg-amber-950/10" />}

                <div
                  className={`relative flex items-center gap-2.5 w-full rounded-xl border cursor-pointer transition-all duration-150 select-none px-3.5 ${
                    isHighlight && isGoal
                      ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/50 hover:border-amber-400'
                      : isHighlight
                      ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/50 hover:border-amber-400'
                      : isGoal
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700/50 hover:border-indigo-400'
                      : isDone
                      ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 opacity-50'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                  style={{
                    height: h,
                    boxShadow: isHighlight ? '0 2px 12px -2px rgba(245,158,11,0.15)' : isGoal ? '0 2px 12px -2px rgba(99,102,241,0.15)' : '0 1px 4px -1px rgba(0,0,0,0.08)',
                  }}
                  onClick={() => {
                    const moved = isExpandedView ? expandedDragRef.current.moved : dragRef.current.moved;
                    if (moved) return;
                    if (isLinkingTarget) handleLinkTarget(node.todo.id);
                    else if (!linkingFromId) onNodeClick?.(node.todo.id);
                  }}>
                  {isGoal ? (
                    <Target className="w-4 h-4 text-indigo-500 shrink-0" />
                  ) : (
                    <StatusDot status={node.todo.status} />
                  )}
                  <span className={`text-[13px] font-medium truncate flex-1 min-w-0 leading-tight ${
                    isDone ? 'text-slate-400 dark:text-slate-500 line-through' : isHighlight
                      ? 'text-amber-900 dark:text-amber-300' : isGoal
                      ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'
                  }`}>{node.todo.title}</span>
                  {node.todo.estimatedMinutes > 0 && !isGoal && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{formatDuration(node.todo.estimatedMinutes)}</span>
                  )}
                  {isGoal && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-white dark:text-indigo-100 uppercase tracking-wider shrink-0 bg-indigo-500 dark:bg-indigo-600 px-2 py-0.5 rounded">
                      <Target className="w-3 h-3" />
                      Goal
                    </span>
                  )}
                  {isHighlight && <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">Now</span>}
                  {!isGoal && !linkingFromId && (
                    <button onClick={e => { e.stopPropagation(); handleSelectForLink(node.todo.id); }}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-500 transition-all shrink-0 p-0.5" title="Create link">
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isLinkingTarget && <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 shrink-0 animate-pulse">Link?</span>}
                </div>
              </div>
            );
          })}

          {/* Add node button */}
          {!showAddNode && (
            <div className="absolute" style={{ left: dims.w / 2 - 12, top: dims.h - 40 }}>
              <button onClick={() => setShowAddNode(true)}
                className="w-6 h-6 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                <Plus className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Toolbar component
  function Toolbar({ isExpandedView }: { isExpandedView: boolean }) {
    const current = isExpandedView ? expandedView : view;
    const containerEl = isExpandedView ? expandedRef.current : containerRef.current;
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleZoomOut(isExpandedView)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 w-10 text-center tabular-nums">
          {Math.round(current.scale * 100)}%
        </span>
        <button
          onClick={() => handleZoomIn(isExpandedView)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleResetView(isExpandedView)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          title="Reset view"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            if (containerEl) {
              handleFitView(containerEl.clientWidth, containerEl.clientHeight, isExpandedView);
            }
          }}
          className="px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] text-slate-500 dark:text-slate-400 transition-colors"
          title="Fit to view"
        >
          Fit
        </button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <button
          onClick={() => isExpandedView ? closeExpanded() : setIsExpanded(true)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          title={isExpandedView ? 'Collapse' : 'Expand'}
        >
          {isExpandedView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
          <Flag className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Road to Goal</h2>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">Action Map</span>
          <div className="flex items-center gap-3 ml-auto">
            {edges.length > 0 && (
              <div className="flex items-center gap-2 mr-2">
                {(Object.keys(EDGE_COLORS) as ActionEdgeType[]).map(type => {
                  const count = edges.filter(e => e.type === type).length;
                  if (count === 0) return null;
                  const Icon = EDGE_ICONS[type];
                  return (
                    <span key={type} className="flex items-center gap-1 text-[10px]" style={{ color: EDGE_COLORS[type] }}>
                      <Icon className="w-3 h-3" />{count}
                    </span>
                  );
                })}
              </div>
            )}
            <span className="text-xs text-slate-400 dark:text-slate-500">{graphNodes.length} nodes</span>
            <Toolbar isExpandedView={false} />
          </div>
        </div>

        {/* Linking mode banner */}
        {linkingFromId && (
          <div className="mx-5 mt-3 flex items-center justify-between bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
            <span className="text-xs text-amber-700 dark:text-amber-400">Select a target node to link...</span>
            <button onClick={() => { setLinkingFromId(null); setShowEdgeSelector(false); setPendingTargetId(null); }}
              className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        )}

        {/* Edge type selector */}
        {showEdgeSelector && linkingFromId && pendingTargetId && (
          <div className="mx-5 mt-3 flex justify-center">
            <EdgeTypeSelector onSelect={handleEdgeTypeSelect}
              onCancel={() => { setShowEdgeSelector(false); setPendingTargetId(null); setLinkingFromId(null); }} />
          </div>
        )}

        {/* Add node form */}
        {showAddNode && (
          <div className="mx-5 mt-3 flex items-center gap-2">
            <input type="text" value={newNodeTitle} onChange={e => setNewNodeTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddNode(); if (e.key === 'Escape') { setShowAddNode(false); setNewNodeTitle(''); } }}
              placeholder="New step title..." autoFocus
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={handleAddNode} disabled={!newNodeTitle.trim()}
              className="text-xs font-medium px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 disabled:opacity-40">Add</button>
            <button onClick={() => { setShowAddNode(false); setNewNodeTitle(''); }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Graph */}
        <div style={{ minHeight: dims.h }}>
          {renderGraph(view, containerRef, isDragging, false)}
        </div>
      </div>

      {/* Expanded overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeExpanded}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Expanded header */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap shrink-0">
              <Flag className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Road to Goal</h2>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">Action Map</span>
              <div className="flex items-center gap-3 ml-auto">
                {edges.length > 0 && (
                  <div className="flex items-center gap-2 mr-2">
                    {(Object.keys(EDGE_COLORS) as ActionEdgeType[]).map(type => {
                      const count = edges.filter(e => e.type === type).length;
                      if (count === 0) return null;
                      const Icon = EDGE_ICONS[type];
                      return (
                        <span key={type} className="flex items-center gap-1 text-[10px]" style={{ color: EDGE_COLORS[type] }}>
                          <Icon className="w-3 h-3" />{count}
                        </span>
                      );
                    })}
                  </div>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500">{graphNodes.length} nodes</span>
                <Toolbar isExpandedView={true} />
              </div>
            </div>

            {/* Expanded graph */}
            <div className="flex-1 relative overflow-hidden" ref={expandedRef}>
              {renderGraph(expandedView, expandedRef, isExpandedDragging, true)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
