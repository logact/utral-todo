import { useState, useMemo, useRef, useCallback, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  X,
  Trash2,
  Pencil,
  Loader2,
  Play,
} from 'lucide-react';
import {
  EDGE_COLORS,
  EDGE_LABELS,
  EDGE_DASH,
  ROAD_EDGE_COLORS,
  ROAD_EDGE_LABELS,
  ROAD_EDGE_ICONS,
  ROAD_EDGE_DASH,
  type RoadRelationType,
  NODE_W,
  NODE_H,
  GOAL_W,
  GOAL_H,
  NODE_CIRCLE_SIZE,
  GOAL_CIRCLE_SIZE,
  SATELLITE_SIZE,
} from './BigMapConstants';
import type { ViewportState } from '../hooks/useBigMapViewport';
import type { LayoutNode, LayoutLogNode } from './BigMapLayout';
import type { ActionEdge, ActionEdgeType, NodeType, Todo, TodoRelation, TodoRelationType } from '../types';
import { NewNodeDialog } from './NewNodeDialog';
import { formatDuration, formatTime } from '../utils/date';
import { allowedLinkTypes } from '../utils/relations';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BigMapCanvasProps {
  nodes: LayoutNode[];
  execLogNodes?: LayoutLogNode[];
  actionEdges: ActionEdge[];
  parentChildEdges: { fromId: string; toId: string }[];
  roadEdges?: TodoRelation[];
  width: number;
  height: number;
  viewport: ViewportState;
  isDragging: boolean;
  onWheel: (e: React.WheelEvent, rect: DOMRect) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  mode?: 'global' | 'neighborhood';
  centerTodoId?: string;
  highlightTodoId?: string;
  onNodeClick?: (todoId: string) => void;
  connectMode?: boolean;
  connectSourceId?: string | null;
  connectEdgeType?: ActionEdgeType;
  onNodeClickForConnect?: (todoId: string) => void;
  editing?: boolean;
  onCreateRelation?: (fromTodoId: string, toTodoId: string, type: TodoRelationType) => Promise<void>;
  onDeleteRelation?: (relationId: string) => Promise<void>;
  onUpdateRelation?: (relationId: string, type: TodoRelationType) => Promise<void>;
  onReconnectRelation?: (relationId: string, fromTodoId: string, toTodoId: string) => Promise<void>;
  onRelationsChange?: () => void;
  onCreateNodeFromDrag?: (sourceId: string, title: string, nodeType: NodeType) => void;
}

interface GraphNodeProps {
  node: LayoutNode;
  isCenter: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  isLinkSource: boolean;
  isDropTarget: boolean;
  isDragSource: boolean;
  isEditing: boolean;
  connectMode: boolean;
  isConnectSource: boolean;
  incomingEntries: { label: string; title: string; color: string }[];
  onNodeEnter: (nodeId: string) => void;
  onNodeLeave: (nodeId: string) => void;
  onNodeMouseDown: (nodeId: string, e: React.MouseEvent) => void;
  onNodeClick: (nodeId: string) => void;
  onNewEdgeMouseDown: (nodeId: string, e: React.MouseEvent) => void;
  onNodeClickForConnect?: (todoId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Status Dot                                                         */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  if (status === 'done') return <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />;
  if (status === 'in_progress') return <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />;
  return <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-500 shrink-0" />;
}

/* ------------------------------------------------------------------ */
/*  Edge Path                                                          */
/* ------------------------------------------------------------------ */

function computeEdgePath(
  fromNode: LayoutNode,
  toNode: LayoutNode,
  _fromW: number,
  fromH: number,
  _toW: number,
  toH: number
) {
  // Determine which edge of each node to use based on relative position
  let fromX: number, fromY: number, toX: number, toY: number;

  const dy = toNode.y - fromNode.y;

  if (dy < 0) {
    // to is above from: start at top of from, end at bottom of to
    fromX = fromNode.x;
    fromY = fromNode.y - fromH / 2;
    toX = toNode.x;
    toY = toNode.y + toH / 2;
  } else {
    // to is below from: start at bottom of from, end at top of to
    fromX = fromNode.x;
    fromY = fromNode.y + fromH / 2;
    toX = toNode.x;
    toY = toNode.y - toH / 2;
  }

  // Quadratic bezier with perpendicular offset
  const dx = toX - fromX;
  const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -(dy / dLen) * 30;
  const perpY = (dx / dLen) * 30;
  const ctrlX = (fromX + toX) / 2 + perpX;
  const ctrlY = (fromY + toY) / 2 + perpY;

  return { fromX, fromY, toX, toY, ctrlX, ctrlY };
}

/* ------------------------------------------------------------------ */
/*  Relation Type Selector                                             */
/* ------------------------------------------------------------------ */

function RelationTypeSelector({
  types,
  onSelect,
  onCancel,
}: {
  types: RoadRelationType[];
  onSelect: (type: RoadRelationType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-2 shadow-lg z-50">
      <span className="text-[10px] text-slate-500 dark:text-slate-400 mr-1">Relation:</span>
      {types.map((type) => {
        const Icon = ROAD_EDGE_ICONS[type];
        const color = ROAD_EDGE_COLORS[type];
        return (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
            style={{ color }}
          >
            <Icon className="w-3 h-3" />
            {ROAD_EDGE_LABELS[type]}
          </button>
        );
      })}
      <button
        onClick={onCancel}
        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors ml-1"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Memoized Node                                                      */
/* ------------------------------------------------------------------ */

const GraphNode = memo(function GraphNode({
  node,
  isCenter,
  isSelected,
  isDimmed,
  isLinkSource,
  isDropTarget,
  isDragSource,
  isEditing,
  connectMode,
  isConnectSource,
  incomingEntries,
  onNodeEnter,
  onNodeLeave,
  onNodeMouseDown,
  onNodeClick,
  onNewEdgeMouseDown,
}: GraphNodeProps) {
  const todo = node.todo;
  const isGoal = todo.nodeType === 'goal';
  const isDone = todo.status === 'done';
  const w = isGoal ? GOAL_W : NODE_W;
  const h = isGoal ? GOAL_H : NODE_H;
  const circleSize = isGoal ? GOAL_CIRCLE_SIZE : NODE_CIRCLE_SIZE;

  const circleColorClass = isGoal
    ? 'bg-indigo-500'
    : isDone
    ? 'bg-emerald-500'
    : todo.status === 'in_progress'
    ? 'bg-indigo-500 animate-pulse'
    : 'bg-slate-300 dark:bg-slate-500';

  const showTooltip = isSelected || isLinkSource || (connectMode && isConnectSource);

  return (
    <div
      data-node
      className="absolute"
      style={{
        left: node.x - w / 2,
        top: node.y - h / 2,
        width: w,
        height: h,
        opacity: isDimmed ? 0.18 : 1,
        transition: 'opacity 0.2s',
        zIndex: isSelected || isLinkSource || isDragSource ? 30 : 10,
      }}
      onMouseEnter={() => onNodeEnter(todo.id)}
      onMouseLeave={() => onNodeLeave(todo.id)}
    >
      {/* Hover ring */}
      {isSelected && (
        <div
          className="absolute rounded-full border-2 border-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20 pointer-events-none"
          style={{
            width: circleSize + 8,
            height: circleSize + 8,
            left: (w - circleSize - 8) / 2,
            top: (h - circleSize - 8) / 2,
          }}
        />
      )}
      {/* Drop target highlight */}
      {isDropTarget && (
        <div
          className="absolute rounded-full border-2 border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20 pointer-events-none animate-pulse"
          style={{
            width: circleSize + 12,
            height: circleSize + 12,
            left: (w - circleSize - 12) / 2,
            top: (h - circleSize - 12) / 2,
          }}
        />
      )}
      {/* Center highlight in neighborhood mode */}
      {isCenter && (
        <div
          className="absolute rounded-full border-2 border-amber-400 bg-amber-50/30 dark:bg-amber-950/20 pointer-events-none"
          style={{
            width: circleSize + 8,
            height: circleSize + 8,
            left: (w - circleSize - 8) / 2,
            top: (h - circleSize - 8) / 2,
          }}
        />
      )}
      {/* Source node highlight in connect mode */}
      {connectMode && isConnectSource && (
        <div
          className="absolute rounded-full border-2 border-amber-400 bg-amber-50/30 dark:bg-amber-950/20 pointer-events-none animate-pulse"
          style={{
            width: circleSize + 8,
            height: circleSize + 8,
            left: (w - circleSize - 8) / 2,
            top: (h - circleSize - 8) / 2,
          }}
        />
      )}
      {/* Linking source highlight */}
      {isLinkSource && (
        <div
          className="absolute rounded-full border-2 border-amber-400 bg-amber-50/30 dark:bg-amber-950/20 pointer-events-none animate-pulse"
          style={{
            width: circleSize + 8,
            height: circleSize + 8,
            left: (w - circleSize - 8) / 2,
            top: (h - circleSize - 8) / 2,
          }}
        />
      )}

      <div
        className="absolute"
        style={{
          left: (w - circleSize) / 2,
          top: (h - circleSize) / 2,
          width: circleSize,
          height: circleSize,
        }}
      >
        <button
          type="button"
          className={`absolute inset-0 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 border-2 border-white/70 dark:border-slate-900/70 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] ${circleColorClass}`}
          onMouseDown={(e) => onNodeMouseDown(todo.id, e)}
          onClick={() => onNodeClick(todo.id)}
        >
          {isGoal && <Target className="w-3.5 h-3.5 text-white" />}
        </button>

        {/* New-edge drag handle */}
        {isEditing && (
          <div
            className={`absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900 shadow-sm cursor-crosshair hover:scale-125 transition-all z-20 ${
              isSelected || isDragSource || isLinkSource ? 'opacity-100' : 'opacity-0'
            }`}
            title="Drag to create relation"
            onMouseDown={(e) => onNewEdgeMouseDown(todo.id, e)}
          />
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 min-w-[180px] max-w-[260px] bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg p-2.5 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Goal header */}
            {isGoal && (
              <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-slate-100 dark:border-slate-700">
                <Target className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Goal
                </span>
              </div>
            )}

            {/* Title row */}
            <div className="flex items-center gap-2">
              {node.hasParent && !isGoal && (
                <div className="w-1 h-4 rounded-full bg-teal-400 shrink-0" />
              )}
              <StatusDot status={todo.status ?? 'pending'} />
              <span
                className={`text-[13px] font-medium truncate flex-1 min-w-0 leading-tight ${
                  isDone
                    ? 'text-slate-400 dark:text-slate-500 line-through'
                    : isGoal
                    ? 'text-indigo-900 dark:text-indigo-200'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {todo.title}
              </span>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {(todo.estimatedMinutes ?? 60) > 0 && !isGoal && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                  {formatDuration(todo.estimatedMinutes ?? 60)}
                </span>
              )}
              {isCenter && (
                <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                  Now
                </span>
              )}
            </div>

            {/* Incoming relation sources */}
            {incomingEntries.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700">
                <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Sources
                </span>
                <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                  {incomingEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                        {entry.title}
                      </span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0">
                        {entry.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Downward arrow */}
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rotate-45" />
          </div>
        )}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function BigMapCanvas({
  nodes,
  execLogNodes = [],
  actionEdges,
  parentChildEdges,
  roadEdges = [],
  width,
  height,
  viewport,
  isDragging,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  mode = 'global',
  centerTodoId,
  highlightTodoId,
  onNodeClick,
  connectMode = false,
  connectSourceId = null,
  connectEdgeType = 'pre_do',
  onNodeClickForConnect,
  editing = false,
  onCreateRelation,
  onDeleteRelation,
  onUpdateRelation,
  onReconnectRelation,
  onRelationsChange,
  onCreateNodeFromDrag,
}: BigMapCanvasProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredExecLogId, setHoveredExecLogId] = useState<string | null>(null);

  const isNeighborhood = mode === 'neighborhood';
  const isEditing = isNeighborhood && editing;
  const effectiveHighlightId = highlightTodoId ?? centerTodoId;

  /* ---------------------------------------------------------------- */
  /*  Editing state                                                    */
  /* ---------------------------------------------------------------- */

  const [linkingFromId, setLinkingFromId] = useState<string | null>(null);
  const [pendingLinkTargetId, setPendingLinkTargetId] = useState<string | null>(null);
  const [showLinkTypeSelector, setShowLinkTypeSelector] = useState(false);

  const [edgeMenuEdge, setEdgeMenuEdge] = useState<TodoRelation | null>(null);
  const [edgeMenuPos, setEdgeMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [edgeTypeChangeEdge, setEdgeTypeChangeEdge] = useState<TodoRelation | null>(null);

  const [newNodeDialog, setNewNodeDialog] = useState<{
    isOpen: boolean;
    sourceId: string;
    defaultType: NodeType;
  }>({ isOpen: false, sourceId: '', defaultType: 'task' });

  const [isProcessing, setIsProcessing] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Drag-to-relation state                                           */
  /* ---------------------------------------------------------------- */

  const [nodeDragSourceId, setNodeDragSourceId] = useState<string | null>(null);
  const [edgeDrag, setEdgeDrag] = useState<{
    relationId: string;
    fixedEnd: 'source' | 'target';
    fixedId: string;
  } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const nodeDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragPathRef = useRef<SVGPathElement>(null);
  const dragCircleRef = useRef<SVGCircleElement>(null);
  const dragInfoRef = useRef<
    | {
        mode: 'connect' | 'node' | 'edge';
        connectSourceId?: string;
        connectEdgeType?: ActionEdgeType;
        nodeDragSourceId?: string;
        edgeDrag?: {
          relationId: string;
          fixedEnd: 'source' | 'target';
          fixedId: string;
        };
      }
    | null
  >(null);

  const isInteractionDragging = nodeDragSourceId !== null || edgeDrag !== null;

  // Refs mirroring interaction state so hover handlers stay stable.
  const nodeDragSourceRef = useRef(nodeDragSourceId);
  nodeDragSourceRef.current = nodeDragSourceId;
  const edgeDragRef = useRef(edgeDrag);
  edgeDragRef.current = edgeDrag;
  const isInteractionDraggingRef = useRef(isInteractionDragging);
  isInteractionDraggingRef.current = isInteractionDragging;
  const dropTargetIdRef = useRef(dropTargetId);
  dropTargetIdRef.current = dropTargetId;

  /* ---------------------------------------------------------------- */
  /*  Link type helpers                                                */
  /* ---------------------------------------------------------------- */

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const n of nodes) map.set(n.todo.id, n);
    return map;
  }, [nodes]);

  const todoById = useMemo(() => {
    const map = new Map<string, Todo>();
    for (const n of nodes) map.set(n.todo.id, n.todo);
    return map;
  }, [nodes]);

  /* ---------------------------------------------------------------- */
  /*  Editing actions                                                  */
  /* ---------------------------------------------------------------- */

  async function handleCreateRelationOfType(fromTodoId: string, toTodoId: string, type: TodoRelationType) {
    if (!onCreateRelation) return;
    setIsProcessing(true);
    try {
      await onCreateRelation(fromTodoId, toTodoId, type);
      onRelationsChange?.();
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDeleteRelationById(relationId: string) {
    if (!onDeleteRelation) return;
    setIsProcessing(true);
    try {
      await onDeleteRelation(relationId);
      onRelationsChange?.();
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleUpdateRelationType(relationId: string, type: TodoRelationType) {
    if (!onUpdateRelation) return;
    setIsProcessing(true);
    try {
      await onUpdateRelation(relationId, type);
      onRelationsChange?.();
    } finally {
      setIsProcessing(false);
    }
  }


  async function commitDrag(targetId: string) {
    if (nodeDragSourceId) {
      await selectLinkTargetForDrag(nodeDragSourceId, targetId);
      setNodeDragSourceId(null);
      return;
    }

    if (edgeDrag) {
      const relation = roadEdges.find((r) => r.id === edgeDrag.relationId);
      if (!relation) {
        setEdgeDrag(null);
        return;
      }
      const newFromId = edgeDrag.fixedEnd === 'target' ? targetId : relation.fromTodoId;
      const newToId = edgeDrag.fixedEnd === 'source' ? targetId : relation.toTodoId;
      if (newFromId === relation.fromTodoId && newToId === relation.toTodoId) {
        setEdgeDrag(null);
        return;
      }
      if (onReconnectRelation) {
        setIsProcessing(true);
        try {
          await onReconnectRelation(relation.id, newFromId, newToId);
          onRelationsChange?.();
        } finally {
          setIsProcessing(false);
        }
      }
      setEdgeDrag(null);
    }
  }

  async function selectLinkTargetForDrag(fromTodoId: string, toTodoId: string) {
    if (fromTodoId === toTodoId) return;
    const fromTodo = todoById.get(fromTodoId);
    const toTodo = todoById.get(toTodoId);
    if (!fromTodo || !toTodo) return;
    const types = allowedLinkTypes(fromTodo, toTodo);
    if (types.length === 0) return;
    if (types.length === 1) {
      await handleCreateRelationOfType(fromTodoId, toTodoId, types[0]);
    } else {
      setLinkingFromId(fromTodoId);
      setPendingLinkTargetId(toTodoId);
      setShowLinkTypeSelector(true);
    }
  }

  function cancelLink() {
    setLinkingFromId(null);
    setPendingLinkTargetId(null);
    setShowLinkTypeSelector(false);
  }

  async function confirmLinkType(type: TodoRelationType) {
    if (!linkingFromId || !pendingLinkTargetId) return;
    await handleCreateRelationOfType(linkingFromId, pendingLinkTargetId, type);
    cancelLink();
  }

  // Click-outside and Escape handlers for menus
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('[data-editing-menu]')) return;
      setEdgeMenuEdge(null);
      setEdgeMenuPos(null);
      setEdgeTypeChangeEdge(null);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setEdgeMenuEdge(null);
        setEdgeMenuPos(null);
        setEdgeTypeChangeEdge(null);
        setNodeDragSourceId(null);
        setEdgeDrag(null);
        setDropTargetId(null);
        setNewNodeDialog((prev) => ({ ...prev, isOpen: false }));
        cancelLink();
      }
    }

    document.addEventListener('click', handleDocClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleDocClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Convert screen mouse event to canvas coordinates
  const toCanvasPoint = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - viewport.offsetX) / viewport.scale,
        y: (e.clientY - rect.top - viewport.offsetY) / viewport.scale,
      };
    },
    [viewport.offsetX, viewport.offsetY, viewport.scale]
  );

  /* ---------------------------------------------------------------- */
  /*  Ref-based drag preview (avoids full React re-renders on move)   */
  /* ---------------------------------------------------------------- */

  function updateDragPreview(point: { x: number; y: number }) {
    if (!dragPathRef.current || !dragCircleRef.current) return;

    const info = dragInfoRef.current;
    if (!info) return;

    let fromX: number | undefined;
    let fromY: number | undefined;
    let color = '#6366f1';
    let dash: string | undefined;
    let markerType: string = 'achieves';

    if (info.mode === 'connect' && info.connectSourceId) {
      const srcNode = nodeMap.get(info.connectSourceId);
      if (srcNode) {
        const srcH = srcNode.todo.nodeType === 'goal' ? GOAL_H : NODE_H;
        fromX = srcNode.x;
        fromY = srcNode.y + srcH / 2;
        color = EDGE_COLORS[info.connectEdgeType ?? 'pre_do'];
        dash = EDGE_DASH[info.connectEdgeType ?? 'pre_do'] ?? undefined;
        markerType = info.connectEdgeType ?? 'pre_do';
      }
    } else if (info.mode === 'node' && info.nodeDragSourceId) {
      const srcNode = nodeMap.get(info.nodeDragSourceId);
      if (srcNode) {
        fromX = srcNode.x;
        fromY = srcNode.y;
      }
    } else if (info.mode === 'edge' && info.edgeDrag) {
      const fixedNode = nodeMap.get(info.edgeDrag.fixedId);
      if (fixedNode) {
        fromX = fixedNode.x;
        fromY = fixedNode.y;
        const relation = roadEdges.find((r) => r.id === info.edgeDrag!.relationId);
        if (relation) {
          color = ROAD_EDGE_COLORS[relation.type];
          dash = ROAD_EDGE_DASH[relation.type] ?? undefined;
          markerType = relation.type;
        }
      }
    }

    if (fromX === undefined || fromY === undefined) return;

    const toX = point.x;
    const toY = point.y;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -(dy / dLen) * 30;
    const perpY = (dx / dLen) * 30;
    const ctrlX = (fromX + toX) / 2 + perpX;
    const ctrlY = (fromY + toY) / 2 + perpY;

    const path = dragPathRef.current;
    path.setAttribute('d', `M ${fromX} ${fromY} Q ${ctrlX} ${ctrlY} ${toX} ${toY}`);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-dasharray', dash ?? '');
    path.setAttribute('marker-end', `url(#arrow-${markerType})`);
    path.setAttribute('opacity', '0.7');

    const circle = dragCircleRef.current;
    circle.setAttribute('cx', String(toX));
    circle.setAttribute('cy', String(toY));
    circle.setAttribute('fill', color);
    circle.setAttribute('opacity', '0.5');
  }

  function hideDragPreview() {
    if (dragPathRef.current) {
      dragPathRef.current.setAttribute('d', '');
      dragPathRef.current.setAttribute('opacity', '0');
    }
    if (dragCircleRef.current) {
      dragCircleRef.current.setAttribute('opacity', '0');
    }
  }

  // Render every TodoRelation as a directed edge.
  const ROAD_TYPES: RoadRelationType[] = [
    'parent_of',
    'source_from',
    'achieves',
    'ordered_before',
    'depends_on',
    'blocked_by',
    'assign_from',
  ];
  const visibleRoadEdges = useMemo(() => {
    return roadEdges
      .filter((r): r is TodoRelation & { type: RoadRelationType } => ROAD_TYPES.includes(r.type as RoadRelationType))
      .filter((r) => {
        if (r.type !== 'parent_of' && r.type !== 'source_from') return true;
        return !parentChildEdges.some((pc) => pc.fromId === r.fromTodoId && pc.toId === r.toTodoId);
      });
  }, [roadEdges, parentChildEdges]);

  // Connected nodes for hover dimming
  const hoveredConnectedIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const connected = new Set<string>([hoveredNodeId]);
    for (const e of actionEdges) {
      if (e.fromTodoId === hoveredNodeId) connected.add(e.toTodoId);
      if (e.toTodoId === hoveredNodeId) connected.add(e.fromTodoId);
    }
    for (const e of parentChildEdges) {
      if (e.fromId === hoveredNodeId) connected.add(e.toId);
      if (e.toId === hoveredNodeId) connected.add(e.fromId);
    }
    for (const r of visibleRoadEdges) {
      if (r.fromTodoId === hoveredNodeId) connected.add(r.toTodoId);
      if (r.toTodoId === hoveredNodeId) connected.add(r.fromTodoId);
    }
    return connected;
  }, [hoveredNodeId, actionEdges, parentChildEdges, visibleRoadEdges]);

  // Precompute incoming relation sources per node for the hover tooltip.
  const incomingEdgesByNodeId = useMemo(() => {
    const map = new Map<string, { label: string; title: string; color: string }[]>();
    for (const n of nodes) map.set(n.todo.id, []);

    for (const edge of actionEdges) {
      const fromNode = nodeMap.get(edge.fromTodoId);
      if (fromNode) {
        const list = map.get(edge.toTodoId) ?? [];
        list.push({
          label: EDGE_LABELS[edge.type] ?? edge.type,
          title: fromNode.todo.title,
          color: EDGE_COLORS[edge.type],
        });
      }
    }

    for (const edge of parentChildEdges) {
      const fromNode = nodeMap.get(edge.fromId);
      if (fromNode) {
        const list = map.get(edge.toId) ?? [];
        list.push({ label: 'Parent', title: fromNode.todo.title, color: '#94a3b8' });
      }
    }

    for (const edge of visibleRoadEdges) {
      const fromNode = nodeMap.get(edge.fromTodoId);
      if (fromNode) {
        const list = map.get(edge.toTodoId) ?? [];
        list.push({
          label: ROAD_EDGE_LABELS[edge.type] ?? edge.type,
          title: fromNode.todo.title,
          color: ROAD_EDGE_COLORS[edge.type],
        });
      }
    }

    return map;
  }, [nodes, actionEdges, parentChildEdges, visibleRoadEdges]);

  const effectiveNodeClick = useCallback(
    (id: string) => {
      if (onNodeClick) {
        onNodeClick(id);
      } else {
        navigate(`/todo/${id}`);
      }
    },
    [onNodeClick, navigate]
  );

  const handleNodeEnter = useCallback((nodeId: string) => {
    setHoveredNodeId(nodeId);
    if (
      isInteractionDraggingRef.current &&
      dragMovedRef.current &&
      nodeDragSourceRef.current !== nodeId &&
      edgeDragRef.current?.fixedId !== nodeId
    ) {
      setDropTargetId(nodeId);
    }
  }, []);

  const handleNodeLeave = useCallback((nodeId: string) => {
    setHoveredNodeId(null);
    if (dropTargetIdRef.current === nodeId) {
      setDropTargetId(null);
    }
  }, []);

  const handleNodeMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (!isEditing || e.button !== 0) return;
      e.stopPropagation();
      dragMovedRef.current = false;
      setNodeDragSourceId(nodeId);
      dragInfoRef.current = { mode: 'node', nodeDragSourceId: nodeId };
      const point = toCanvasPoint(e);
      if (point) {
        nodeDragStartRef.current = point;
        updateDragPreview(point);
      }
    },
    [isEditing, toCanvasPoint]
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      if (connectMode && onNodeClickForConnect) {
        onNodeClickForConnect(nodeId);
      } else if (!linkingFromId) {
        effectiveNodeClick(nodeId);
      }
    },
    [connectMode, onNodeClickForConnect, linkingFromId, effectiveNodeClick]
  );

  const handleNewEdgeMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      handleNodeMouseDown(nodeId, e);
    },
    [handleNodeMouseDown]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!containerRef.current) return;
      onWheel(e, containerRef.current.getBoundingClientRect());
    },
    [onWheel]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (connectMode && connectSourceId && !isInteractionDragging) {
        dragInfoRef.current = {
          mode: 'connect',
          connectSourceId,
          connectEdgeType,
        };
      }

      const needsPreview = isInteractionDragging || (connectMode && connectSourceId);
      if (needsPreview) {
        const point = toCanvasPoint(e as React.MouseEvent);
        if (point) {
          updateDragPreview(point);
          if (nodeDragStartRef.current) {
            const dx = point.x - nodeDragStartRef.current.x;
            const dy = point.y - nodeDragStartRef.current.y;
            if (Math.sqrt(dx * dx + dy * dy) > 4) {
              dragMovedRef.current = true;
            }
          }
        }
      }
      if ('nativeEvent' in e) {
        onMouseMove(e as React.MouseEvent);
      }
    },
    [connectMode, connectSourceId, connectEdgeType, isInteractionDragging, toCanvasPoint, onMouseMove]
  );

  const handleMouseUp = useCallback(() => {
    hideDragPreview();
    if (isInteractionDragging) {
      if (dropTargetId) {
        void commitDrag(dropTargetId);
      } else if (
        nodeDragSourceId &&
        dragMovedRef.current &&
        onCreateNodeFromDrag
      ) {
        const sourceTodo = todoById.get(nodeDragSourceId);
        if (sourceTodo) {
          const defaultType: NodeType = sourceTodo.nodeType === 'goal' ? 'task' : 'goal';
          setNewNodeDialog({
            isOpen: true,
            sourceId: nodeDragSourceId,
            defaultType,
          });
        }
      }
      setNodeDragSourceId(null);
      nodeDragStartRef.current = null;
      setEdgeDrag(null);
      setDropTargetId(null);
    }
    dragInfoRef.current = null;
    onMouseUp();
  }, [dropTargetId, isInteractionDragging, nodeDragSourceId, onCreateNodeFromDrag, onMouseUp, todoById]);

  // Global mouse move/up handlers for dragging outside the container
  useEffect(() => {
    if (!isInteractionDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleMouseMove(e);
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      handleMouseUp();
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isInteractionDragging, handleMouseMove, handleMouseUp]);

  // In connect mode, disable left-click panning so node clicks work cleanly
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isInteractionDragging) {
        e.stopPropagation();
        return;
      }
      if (connectMode && e.button === 0) {
        return;
      }
      onMouseDown(e);
    },
    [connectMode, onMouseDown, isInteractionDragging]
  );

  function startEdgeDrag(
    relation: TodoRelation,
    end: 'source' | 'target',
    e: React.MouseEvent
  ) {
    if (!isEditing || e.button !== 0) return;
    e.stopPropagation();
    const nextEdgeDrag = {
      relationId: relation.id,
      fixedEnd: end === 'source' ? ('target' as const) : ('source' as const),
      fixedId: end === 'source' ? relation.toTodoId : relation.fromTodoId,
    };
    setEdgeDrag(nextEdgeDrag);
    dragInfoRef.current = { mode: 'edge', edgeDrag: nextEdgeDrag };
    const point = toCanvasPoint(e);
    if (point) updateDragPreview(point);
  }

  const handleMouseLeave = useCallback(() => {
    hideDragPreview();
    if (isInteractionDragging) {
      setNodeDragSourceId(null);
      nodeDragStartRef.current = null;
      setEdgeDrag(null);
      setDropTargetId(null);
    }
    dragInfoRef.current = null;
    onMouseUp();
  }, [isInteractionDragging, onMouseUp]);

  const transformStyle = {
    transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
    transformOrigin: '0 0',
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none ${
        connectMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Transform container */}
      <div className="absolute inset-0" style={transformStyle}>
        {/* SVG edges layer */}
        <svg
          className="absolute pointer-events-none"
          style={{ width, height, left: 0, top: 0, overflow: 'visible' }}
        >
          <defs>
            <marker id="arrow-pre_do" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.pre_do} />
            </marker>
            <marker id="arrow-parent_child" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.parent_child} />
            </marker>
            <marker id="arrow-to_achieve" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.to_achieve} />
            </marker>
            {(['parent_of', 'achieves', 'ordered_before'] as const).map((type) => {
              const isOrder = type === 'ordered_before';
              return (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  markerWidth={isOrder ? 12 : 8}
                  markerHeight={isOrder ? 12 : 8}
                  refX={isOrder ? 10 : 7}
                  refY={isOrder ? 5 : 3}
                  orient="auto"
                >
                  <path
                    d={isOrder ? 'M0,0 L0,10 L10,5 z' : 'M0,0 L0,6 L7,3 z'}
                    fill={ROAD_EDGE_COLORS[type]}
                  />
                </marker>
              );
            })}
          </defs>

          {/* Parent-child edges (dashed gray) */}
          {parentChildEdges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromId);
            const toNode = nodeMap.get(edge.toId);
            if (!fromNode || !toNode) return null;

            const isDimmed = hoveredNodeId && !hoveredConnectedIds.has(edge.fromId) && !hoveredConnectedIds.has(edge.toId);
            const fromH = fromNode.todo.nodeType === 'goal' ? GOAL_H : NODE_H;
            const toH = toNode.todo.nodeType === 'goal' ? GOAL_H : NODE_H;
            const { fromX, fromY, toX, toY, ctrlX, ctrlY } = computeEdgePath(
              fromNode, toNode, NODE_W, fromH, NODE_W, toH
            );

            return (
              <path
                key={`pc-${edge.fromId}-${edge.toId}`}
                d={`M ${fromX} ${fromY} Q ${ctrlX} ${ctrlY} ${toX} ${toY}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="4,3"
                opacity={isDimmed ? 0.08 : 0.3}
                style={{ transition: 'opacity 0.2s' }}
              />
            );
          })}

          {/* Road-to-goal relation edges */}
          {visibleRoadEdges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromTodoId);
            const toNode = nodeMap.get(edge.toTodoId);
            if (!fromNode || !toNode) return null;

            const isHovered = hoveredEdgeId === edge.id;
            const isDimmed = hoveredNodeId && !(hoveredNodeId === edge.fromTodoId || hoveredNodeId === edge.toTodoId);
            const fromH = fromNode.todo.nodeType === 'goal' ? GOAL_H : NODE_H;
            const toH = toNode.todo.nodeType === 'goal' ? GOAL_H : NODE_H;
            const { fromX, fromY, toX, toY, ctrlX, ctrlY } = computeEdgePath(
              fromNode, toNode, NODE_W, fromH, NODE_W, toH
            );

            const color = ROAD_EDGE_COLORS[edge.type];
            const dash = ROAD_EDGE_DASH[edge.type];
            const midX = (fromX + toX) / 2 + (ctrlX - (fromX + toX) / 2) * 0.25;
            const midY = (fromY + toY) / 2 + (ctrlY - (fromY + toY) / 2) * 0.25;

            return (
              <g key={edge.id} opacity={isDimmed ? 0.08 : 1}>
                <path
                  d={`M ${fromX} ${fromY} Q ${ctrlX} ${ctrlY} ${toX} ${toY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  strokeDasharray={dash}
                  opacity={isHovered ? 1 : 0.6}
                  markerEnd={`url(#arrow-${edge.type})`}
                  style={{ transition: 'all 0.2s' }}
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                  onClick={(e) => {
                    if (!isEditing) return;
                    e.stopPropagation();
                    setEdgeMenuEdge(edge);
                    setEdgeMenuPos({ x: midX, y: midY });
                  }}
                />
                {isEditing && (
                  <>
                    <circle
                      cx={fromX}
                      cy={fromY}
                      r={5}
                      fill={color}
                      opacity={isHovered ? 0.9 : 0}
                      className="pointer-events-auto cursor-crosshair"
                      style={{ transition: 'opacity 0.2s' }}
                      onMouseDown={(e) => startEdgeDrag(edge, 'source', e)}
                      onMouseEnter={() => setHoveredEdgeId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeId(null)}
                    />
                    <circle
                      cx={toX}
                      cy={toY}
                      r={5}
                      fill={color}
                      opacity={isHovered ? 0.9 : 0}
                      className="pointer-events-auto cursor-crosshair"
                      style={{ transition: 'opacity 0.2s' }}
                      onMouseDown={(e) => startEdgeDrag(edge, 'target', e)}
                      onMouseEnter={() => setHoveredEdgeId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeId(null)}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Action edges */}
          {actionEdges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromTodoId);
            const toNode = nodeMap.get(edge.toTodoId);
            if (!fromNode || !toNode) return null;

            const isHovered = hoveredEdgeId === edge.id;
            const isDimmed = hoveredNodeId && !(hoveredNodeId === edge.fromTodoId || hoveredNodeId === edge.toTodoId);
            const fromW = fromNode.todo.nodeType === 'goal' ? GOAL_W : NODE_W;
            const fromH = fromNode.todo.nodeType === 'goal' ? GOAL_H : NODE_H;
            const toW = toNode.todo.nodeType === 'goal' ? GOAL_W : NODE_W;
            const toH = toNode.todo.nodeType === 'goal' ? GOAL_H : NODE_H;
            const { fromX, fromY, toX, toY, ctrlX, ctrlY } = computeEdgePath(
              fromNode, toNode, fromW, fromH, toW, toH
            );

            const color = EDGE_COLORS[edge.type];
            const dash = EDGE_DASH[edge.type];

            return (
              <g key={edge.id} opacity={isDimmed ? 0.08 : 1}>
                <path
                  d={`M ${fromX} ${fromY} Q ${ctrlX} ${ctrlY} ${toX} ${toY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  strokeDasharray={dash}
                  opacity={isHovered ? 1 : 0.6}
                  markerEnd={`url(#arrow-${edge.type})`}
                  style={{ transition: 'all 0.2s' }}
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                />
                <g
                  transform={`translate(${(fromX + toX) / 2 + (ctrlX - (fromX + toX) / 2) * 0.25}, ${(fromY + toY) / 2 + (ctrlY - (fromY + toY) / 2) * 0.25})`}
                >
                  <rect x="-18" y="-7" width="36" height="14" rx="7" fill={color} opacity={isHovered ? 0.9 : 0.7} />
                  <text x="0" y="3.5" textAnchor="middle" fill="white" fontSize="8" fontWeight="500">
                    {EDGE_LABELS[edge.type]}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Drag/connect preview (updated via refs to avoid React re-renders) */}
          <path
            ref={dragPathRef}
            fill="none"
            strokeWidth={2}
            opacity={0}
            className="pointer-events-none"
          />
          <circle ref={dragCircleRef} r="4" opacity={0} className="pointer-events-none" />

          {/* Exec log satellite lines */}
          {execLogNodes.map((execNode) => {
            const parent = nodeMap.get(execNode.todoId);
            if (!parent) return null;
            const parentW = parent.todo.nodeType === 'goal' ? GOAL_W : NODE_W;
            const fromX = parent.x + parentW / 2;
            const fromY = parent.y;
            const toX = execNode.x - SATELLITE_SIZE / 2;
            const toY = execNode.y;
            return (
              <g key={`exec-line-${execNode.log.id}`}>
                <line
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY}
                  stroke="#8b5cf6"
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  opacity={0.5}
                />
              </g>
            );
          })}
        </svg>

        {/* Node layer */}
        {nodes.map((node) => (
          <GraphNode
            key={node.todo.id}
            node={node}
            isCenter={isNeighborhood && node.todo.id === effectiveHighlightId}
            isSelected={hoveredNodeId === node.todo.id}
            isDimmed={hoveredNodeId ? !hoveredConnectedIds.has(node.todo.id) && hoveredNodeId !== node.todo.id : false}
            isLinkSource={linkingFromId === node.todo.id}
            isDropTarget={dropTargetId === node.todo.id}
            isDragSource={nodeDragSourceId === node.todo.id}
            isEditing={isEditing}
            connectMode={connectMode}
            isConnectSource={connectSourceId === node.todo.id}
            incomingEntries={incomingEdgesByNodeId.get(node.todo.id) ?? []}
            onNodeEnter={handleNodeEnter}
            onNodeLeave={handleNodeLeave}
            onNodeMouseDown={handleNodeMouseDown}
            onNodeClick={handleNodeClick}
            onNewEdgeMouseDown={handleNewEdgeMouseDown}
            onNodeClickForConnect={onNodeClickForConnect}
          />
        ))}

        {/* Exec log satellite nodes */}
        {execLogNodes.map((execNode) => {
          const isHovered = hoveredExecLogId === execNode.log.id;
          return (
            <div
              key={execNode.log.id}
              className="absolute"
              style={{
                left: execNode.x - SATELLITE_SIZE / 2,
                top: execNode.y - SATELLITE_SIZE / 2,
                width: SATELLITE_SIZE,
                height: SATELLITE_SIZE,
                zIndex: isHovered ? 40 : 20,
              }}
              onMouseEnter={() => setHoveredExecLogId(execNode.log.id)}
              onMouseLeave={() => setHoveredExecLogId(null)}
            >
              <button
                type="button"
                onClick={() => navigate(`/todo/${execNode.todoId}/execute`)}
                className="w-full h-full rounded-full bg-violet-500 border-2 border-white dark:border-slate-900 shadow-sm hover:scale-125 transition-transform cursor-pointer"
                title={execNode.log.content}
              />
              {isHovered && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 min-w-[160px] max-w-[220px] bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg p-2 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Play className="w-3 h-3 text-violet-500" />
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                      Exec
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
                      {formatTime(execNode.log.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug break-words max-h-24 overflow-hidden">
                    {execNode.log.content}
                  </p>
                  <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rotate-45" />
                </div>
              )}
            </div>
          );
        })}

        {/* Linking mode banner */}
        {isEditing && linkingFromId && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-3 flex items-center justify-between bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2 z-40 gap-4"
            style={{ minWidth: 240 }}
          >
            <span className="text-xs text-amber-700 dark:text-amber-400">Select a target node to link...</span>
            <button
              onClick={cancelLink}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Link type selector */}
        {isEditing && showLinkTypeSelector && linkingFromId && pendingLinkTargetId && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-12 z-50"
            data-editing-menu
          >
            <RelationTypeSelector
              types={(() => {
                const fromTodo = todoById.get(linkingFromId);
                const toTodo = todoById.get(pendingLinkTargetId);
                return fromTodo && toTodo ? allowedLinkTypes(fromTodo, toTodo) : [];
              })()}
              onSelect={confirmLinkType}
              onCancel={cancelLink}
            />
          </div>
        )}

        {/* Edge action menu */}
        {isEditing && edgeMenuEdge && edgeMenuPos && (
          <div
            data-editing-menu
            className="absolute bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg p-1 z-50 min-w-[120px]"
            style={{ left: edgeMenuPos.x, top: edgeMenuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const fromTodo = todoById.get(edgeMenuEdge.fromTodoId);
              const toTodo = todoById.get(edgeMenuEdge.toTodoId);
              const changeTypes = fromTodo && toTodo ? allowedLinkTypes(fromTodo, toTodo) : [];
              const hasAlternative = changeTypes.length > 1 || (changeTypes.length === 1 && changeTypes[0] !== edgeMenuEdge.type);
              return (
                <>
                  {hasAlternative && (
                    <button
                      onClick={() => {
                        setEdgeTypeChangeEdge(edgeMenuEdge);
                        setEdgeMenuEdge(null);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Change type
                    </button>
                  )}
                  <button
                    onClick={() => {
                      handleDeleteRelationById(edgeMenuEdge.id);
                      setEdgeMenuEdge(null);
                      setEdgeMenuPos(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {/* Edge type change selector */}
        {isEditing && edgeTypeChangeEdge && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-12 z-50"
            data-editing-menu
          >
            <RelationTypeSelector
              types={(() => {
                const fromTodo = todoById.get(edgeTypeChangeEdge.fromTodoId);
                const toTodo = todoById.get(edgeTypeChangeEdge.toTodoId);
                return fromTodo && toTodo ? allowedLinkTypes(fromTodo, toTodo) : [];
              })()}
              onSelect={async (type) => {
                if (edgeTypeChangeEdge) {
                  await handleUpdateRelationType(edgeTypeChangeEdge.id, type);
                }
                setEdgeTypeChangeEdge(null);
              }}
              onCancel={() => setEdgeTypeChangeEdge(null)}
            />
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/30 dark:bg-slate-900/30 z-50">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          </div>
        )}
      </div>

      <NewNodeDialog
        isOpen={newNodeDialog.isOpen}
        onClose={() => setNewNodeDialog((prev) => ({ ...prev, isOpen: false }))}
        sourceNodeType={(() => {
          const todo = todoById.get(newNodeDialog.sourceId);
          return todo?.nodeType ?? 'task';
        })()}
        defaultNodeType={newNodeDialog.defaultType}
        onCreate={(title, nodeType) => {
          onCreateNodeFromDrag?.(newNodeDialog.sourceId, title, nodeType);
          setNewNodeDialog((prev) => ({ ...prev, isOpen: false }));
        }}
      />
    </div>
  );
}
