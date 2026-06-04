import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import {
  EDGE_COLORS,
  EDGE_LABELS,
  EDGE_DASH,
  NODE_W,
  NODE_H,
  GOAL_W,
  GOAL_H,
} from './BigMapConstants';
import type { ViewportState } from '../hooks/useBigMapViewport';
import type { LayoutNode } from './BigMapLayout';
import type { ActionEdge, ActionEdgeType } from '../types';
import { formatDuration } from '../utils/date';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BigMapCanvasProps {
  nodes: LayoutNode[];
  actionEdges: ActionEdge[];
  parentChildEdges: { fromId: string; toId: string }[];
  width: number;
  height: number;
  viewport: ViewportState;
  isDragging: boolean;
  onWheel: (e: React.WheelEvent, rect: DOMRect) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  connectMode?: boolean;
  connectSourceId?: string | null;
  connectEdgeType?: ActionEdgeType;
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
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function BigMapCanvas({
  nodes,
  actionEdges,
  parentChildEdges,
  width,
  height,
  viewport,
  isDragging,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  connectMode = false,
  connectSourceId = null,
  connectEdgeType = 'pre_do',
  onNodeClickForConnect,
}: BigMapCanvasProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Mouse position in canvas coords for connect mode temp line
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number } | null>(null);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const n of nodes) map.set(n.todo.id, n);
    return map;
  }, [nodes]);

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
    return connected;
  }, [hoveredNodeId, actionEdges, parentChildEdges]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!containerRef.current) return;
      onWheel(e, containerRef.current.getBoundingClientRect());
    },
    [onWheel]
  );

  // Track mouse position in canvas coordinates for connect mode
  const updateMouseCanvasPos = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      setMouseCanvasPos({
        x: (localX - viewport.offsetX) / viewport.scale,
        y: (localY - viewport.offsetY) / viewport.scale,
      });
    },
    [viewport.offsetX, viewport.offsetY, viewport.scale]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (connectMode && connectSourceId) {
        updateMouseCanvasPos(e);
      }
      onMouseMove(e);
    },
    [connectMode, connectSourceId, updateMouseCanvasPos, onMouseMove]
  );

  const handleMouseLeave = useCallback(() => {
    setMouseCanvasPos(null);
    onMouseUp();
  }, [onMouseUp]);

  // In connect mode, disable left-click panning so node clicks work cleanly
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (connectMode && e.button === 0) {
        return;
      }
      onMouseDown(e);
    },
    [connectMode, onMouseDown]
  );

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
      onMouseUp={onMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Transform container */}
      <div className="absolute inset-0" style={transformStyle}>
        {/* SVG edges layer */}
        <svg
          className="absolute pointer-events-none"
          style={{ width, height, left: 0, top: 0 }}
        >
          <defs>
            <marker id="arrow-insight" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.insight} />
            </marker>
            <marker id="arrow-try" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.try} />
            </marker>
            <marker id="arrow-pre_do" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={EDGE_COLORS.pre_do} />
            </marker>
          </defs>

          {/* Parent-child edges (dashed gray) */}
          {parentChildEdges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromId);
            const toNode = nodeMap.get(edge.toId);
            if (!fromNode || !toNode) return null;

            const isDimmed = hoveredNodeId && !hoveredConnectedIds.has(edge.fromId) && !hoveredConnectedIds.has(edge.toId);
            const fromH = fromNode.isGoal ? GOAL_H : NODE_H;
            const toH = toNode.isGoal ? GOAL_H : NODE_H;
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

          {/* Action edges */}
          {actionEdges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromTodoId);
            const toNode = nodeMap.get(edge.toTodoId);
            if (!fromNode || !toNode) return null;

            const isHovered = hoveredEdgeId === edge.id;
            const isDimmed = hoveredNodeId && !(hoveredNodeId === edge.fromTodoId || hoveredNodeId === edge.toTodoId);
            const fromW = fromNode.isGoal ? GOAL_W : NODE_W;
            const fromH = fromNode.isGoal ? GOAL_H : NODE_H;
            const toW = toNode.isGoal ? GOAL_W : NODE_W;
            const toH = toNode.isGoal ? GOAL_H : NODE_H;
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

          {/* Temp line for connect mode */}
          {connectMode && connectSourceId && mouseCanvasPos && (() => {
            const srcNode = nodeMap.get(connectSourceId);
            if (!srcNode) return null;
            const srcH = srcNode.isGoal ? GOAL_H : NODE_H;
            const fromX = srcNode.x;
            const fromY = srcNode.y + srcH / 2;
            const toX = mouseCanvasPos.x;
            const toY = mouseCanvasPos.y;
            const dx = toX - fromX;
            const dy = toY - fromY;
            const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
            const perpX = -(dy / dLen) * 30;
            const perpY = (dx / dLen) * 30;
            const ctrlX = (fromX + toX) / 2 + perpX;
            const ctrlY = (fromY + toY) / 2 + perpY;
            const color = EDGE_COLORS[connectEdgeType];
            const dash = EDGE_DASH[connectEdgeType];
            return (
              <g>
                <path
                  d={`M ${fromX} ${fromY} Q ${ctrlX} ${ctrlY} ${toX} ${toY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={dash}
                  opacity={0.7}
                  markerEnd={`url(#arrow-${connectEdgeType})`}
                />
                <circle cx={toX} cy={toY} r="4" fill={color} opacity={0.5} />
              </g>
            );
          })()}
        </svg>

        {/* Node layer */}
        {nodes.map((node) => {
          const isGoal = node.isGoal;
          const isDone = node.todo.status === 'done';
          const w = isGoal ? GOAL_W : NODE_W;
          const h = isGoal ? GOAL_H : NODE_H;
          const isDimmed = hoveredNodeId && !hoveredConnectedIds.has(node.todo.id) && hoveredNodeId !== node.todo.id;
          const isSelected = hoveredNodeId === node.todo.id;

          return (
            <div
              key={node.todo.id}
              data-node
              className="absolute"
              style={{
                left: node.x - w / 2,
                top: node.y - h / 2,
                width: w,
                opacity: isDimmed ? 0.18 : 1,
                transition: 'opacity 0.2s',
                zIndex: isSelected ? 20 : 10,
              }}
              onMouseEnter={() => setHoveredNodeId(node.todo.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            >
              {/* Hover ring */}
              {isSelected && (
                <div className="absolute -inset-1.5 rounded-xl border-2 border-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20 pointer-events-none" />
              )}
              {/* Source node highlight in connect mode */}
              {connectMode && connectSourceId === node.todo.id && (
                <div className="absolute -inset-1.5 rounded-xl border-2 border-amber-400 bg-amber-50/30 dark:bg-amber-950/20 pointer-events-none animate-pulse" />
              )}

              <div
                className={`relative w-full rounded-xl border cursor-pointer transition-all duration-150 select-none overflow-hidden ${
                  connectMode && connectSourceId === node.todo.id
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600/60'
                    : isGoal
                    ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-500 hover:border-indigo-500 dark:hover:border-indigo-400'
                    : isDone
                    ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 opacity-50'
                    : node.hasParent
                    ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-600'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
                }`}
                style={{
                  height: h,
                  boxShadow: isGoal
                    ? '0 0 0 3px rgba(99,102,241,0.15), 0 4px 16px -4px rgba(99,102,241,0.25)'
                    : connectMode && connectSourceId === node.todo.id
                    ? '0 2px 12px -2px rgba(245,158,11,0.2)'
                    : '0 1px 4px -1px rgba(0,0,0,0.08)',
                }}
                onClick={(e) => {
                  if (connectMode && onNodeClickForConnect) {
                    e.stopPropagation();
                    onNodeClickForConnect(node.todo.id);
                  } else {
                    navigate(`/todo/${node.todo.id}`);
                  }
                }}
              >
                {/* Goal header strip */}
                {isGoal && (
                  <div className="flex items-center gap-1 px-3 py-0.5 bg-indigo-500 dark:bg-indigo-600">
                    <Target className="w-3 h-3 text-white" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Goal</span>
                  </div>
                )}
                <div className={`flex items-center gap-2.5 px-3.5 ${isGoal ? 'py-1.5' : 'h-full'}`}>
                  {node.hasParent && !isGoal && (
                    <div className="w-1 h-4 rounded-full bg-teal-400 shrink-0" />
                  )}
                  <StatusDot status={node.todo.status} />
                  <span
                    className={`text-[13px] font-medium truncate flex-1 min-w-0 leading-tight ${
                      isDone
                        ? 'text-slate-400 dark:text-slate-500 line-through'
                        : isGoal
                        ? 'text-indigo-900 dark:text-indigo-200'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {node.todo.title}
                  </span>
                  {node.todo.estimatedMinutes > 0 && !isGoal && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                      {formatDuration(node.todo.estimatedMinutes)}
                    </span>
                  )}
                  {isGoal && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 shrink-0">
                      <Target className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
