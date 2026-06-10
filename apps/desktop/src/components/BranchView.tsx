import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, GitBranch, Loader2, Maximize2, Minimize2, Plus, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { createTodo, deleteTodo, getTodo, getAllTodos } from '../db/todos';
import { getAllRelations } from '../db/relations';
import type { Todo } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TreeNode {
  todo: Todo;
  children: TreeNode[];
  relationType: 'parent_of' | 'source_from';
  x: number;
  y: number;
  isMainPath: boolean;
  depth: number;
}

interface CrossEdge {
  from: TreeNode;
  to: TreeNode;
  type: 'depends_on' | 'blocked_by' | 'assign_from';
}

interface ViewState {
  scale: number;
  panX: number;
  panY: number;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/* ------------------------------------------------------------------ */
/*  Layout Constants                                                   */
/* ------------------------------------------------------------------ */

const NODE_W = 192;
const NODE_H = 42;
const ROOT_W = 224;
const ROOT_H = 56;
const LEAF_SPACING = 200;
const LEVEL_H = 110;
const MIN_SVG_W = 600;
const TOP_PAD = 28;

/* ------------------------------------------------------------------ */
/*  Layout Helpers                                                     */
/* ------------------------------------------------------------------ */

function countLeaves(n: TreeNode): number {
  if (!n.children.length) return 1;
  return n.children.reduce((s, c) => s + countLeaves(c), 0);
}

function getMaxDepth(n: TreeNode): number {
  if (!n.children.length) return 0;
  return 1 + Math.max(...n.children.map(getMaxDepth));
}

/**
 * Layout tree with the main path centered vertically.
 * The main-path child is always placed directly below its parent,
 * creating a straight "highway" down the center. Other children
 * fan out to the left and right.
 */
function layoutTree(
  n: TreeNode,
  level: number,
  startX: number,
  endX: number,
  isRoot: boolean
) {
  const lc = countLeaves(n);
  const totalW = endX - startX;

  n.x = startX + totalW / 2;
  n.y = TOP_PAD + level * LEVEL_H + (isRoot ? ROOT_H : NODE_H) / 2;

  if (n.children.length === 0) return;

  // Find main-path child index
  const mainIdx = n.children.findIndex((c) => c.isMainPath);

  if (mainIdx === -1) {
    // No main path child — proportional layout for all children
    let cx = startX;
    for (const c of n.children) {
      const cl = countLeaves(c);
      const childW = (cl / lc) * totalW;
      layoutTree(c, level + 1, cx, cx + childW, false);
      cx += childW;
    }
    return;
  }

  // Main-path child exists — center it, split remaining for side branches
  const mainChild = n.children[mainIdx];
  const mainLeaves = countLeaves(mainChild);
  const sideLeaves = lc - mainLeaves;

  // Give main child proportional center space
  const mainW = sideLeaves === 0 ? totalW : Math.max((mainLeaves / lc) * totalW, NODE_W + 40);
  const sideW = totalW - mainW;
  const mainStart = startX + sideW / 2;
  const mainEnd = mainStart + mainW;

  // Layout main child centered (guarantees vertical alignment with parent)
  layoutTree(mainChild, level + 1, mainStart, mainEnd, false);

  // Layout side children in remaining left/right space
  const leftChildren = n.children.slice(0, mainIdx);
  const rightChildren = n.children.slice(mainIdx + 1);
  const leftLeaves = leftChildren.reduce((s, c) => s + countLeaves(c), 0);
  const rightLeaves = rightChildren.reduce((s, c) => s + countLeaves(c), 0);

  let cx = startX;
  for (const c of leftChildren) {
    const cl = countLeaves(c);
    const childW = leftLeaves > 0 ? (cl / leftLeaves) * (sideW / 2) : 0;
    layoutTree(c, level + 1, cx, cx + childW, false);
    cx += childW;
  }

  cx = mainEnd;
  for (const c of rightChildren) {
    const cl = countLeaves(c);
    const childW = rightLeaves > 0 ? (cl / rightLeaves) * (sideW / 2) : 0;
    layoutTree(c, level + 1, cx, cx + childW, false);
    cx += childW;
  }
}

/* ------------------------------------------------------------------ */
/*  Tree Building                                                      */
/* ------------------------------------------------------------------ */

async function findRoot(todoId: string): Promise<string> {
  let current = todoId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const todo = await getTodo(current);
    if (!todo) break;

    const allRelations = await getAllRelations();
    const sourceRel = allRelations.find(
      (r) => r.toTodoId === current && r.type === 'source_from'
    );
    if (sourceRel) {
      current = sourceRel.fromTodoId;
      continue;
    }

    if (todo.parentId) {
      current = todo.parentId;
      continue;
    }

    break;
  }

  return current;
}

async function buildTree(
  rootId: string,
  currentId: string
): Promise<{ tree: TreeNode | null; crossEdges: CrossEdge[] }> {
  const [allTodos, allRelations] = await Promise.all([
    getAllTodos(),
    getAllRelations(),
  ]);

  const todoMap = new Map(allTodos.map((t) => [t.id, t]));
  const subsByParent = new Map<string, Todo[]>();
  const spawnedBySource = new Map<string, string[]>();

  for (const todo of allTodos) {
    if (todo.parentId) {
      if (!subsByParent.has(todo.parentId)) subsByParent.set(todo.parentId, []);
      subsByParent.get(todo.parentId)!.push(todo);
    }
  }

  for (const rel of allRelations) {
    if (rel.type === 'source_from') {
      if (!spawnedBySource.has(rel.fromTodoId)) spawnedBySource.set(rel.fromTodoId, []);
      spawnedBySource.get(rel.fromTodoId)!.push(rel.toTodoId);
    }
  }

  // Build tree structure
  function build(id: string, depth: number, visited: Set<string>): TreeNode | null {
    if (visited.has(id) || depth > 5) return null;
    visited.add(id);

    const todo = todoMap.get(id);
    if (!todo) return null;

    const children: TreeNode[] = [];

    for (const sub of subsByParent.get(id) || []) {
      const n = build(sub.id, depth + 1, new Set(visited));
      if (n) {
        n.relationType = 'parent_of';
        children.push(n);
      }
    }

    for (const sid of spawnedBySource.get(id) || []) {
      const n = build(sid, depth + 1, new Set(visited));
      if (n) {
        n.relationType = 'source_from';
        children.push(n);
      }
    }

    children.sort((a, b) => {
      const ad = a.todo.status === 'done' ? 1 : 0;
      const bd = b.todo.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return a.todo.title.localeCompare(b.todo.title);
    });

    return {
      todo,
      children,
      relationType: 'parent_of',
      x: 0,
      y: 0,
      isMainPath: false,
      depth,
    };
  }

  const tree = build(rootId, 0, new Set());
  if (!tree) return { tree: null, crossEdges: [] };

  // Mark main path (root -> current)
  function markMainPath(node: TreeNode): boolean {
    if (node.todo.id === currentId) {
      node.isMainPath = true;
      return true;
    }
    for (const child of node.children) {
      if (markMainPath(child)) {
        node.isMainPath = true;
        return true;
      }
    }
    return false;
  }
  markMainPath(tree);

  // Collect cross-cutting relations
  const nodeMap = new Map<string, TreeNode>();
  function indexNodes(n: TreeNode) {
    nodeMap.set(n.todo.id, n);
    for (const c of n.children) indexNodes(c);
  }
  indexNodes(tree);

  const crossEdges: CrossEdge[] = [];
  for (const rel of allRelations) {
    if (rel.type === 'depends_on' || rel.type === 'blocked_by' || rel.type === 'assign_from') {
      const fromNode = nodeMap.get(rel.fromTodoId);
      const toNode = nodeMap.get(rel.toTodoId);
      if (fromNode && toNode) {
        crossEdges.push({ from: fromNode, to: toNode, type: rel.type });
      }
    }
  }

  return { tree, crossEdges };
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  if (status === 'done')
    return (
      <span className="w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
      </span>
    );
  if (status === 'in_progress')
    return (
      <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 flex items-center justify-center shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
      </span>
    );
  return (
    <span className="w-5 h-5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
      <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-500" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function BranchView({ currentTodoId }: { currentTodoId: string }) {
  const navigate = useNavigate();
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [crossEdges, setCrossEdges] = useState<CrossEdge[]>([]);
  const [dims, setDims] = useState({ w: MIN_SVG_W, h: 200 });
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Pan / zoom
  const [view, setView] = useState<ViewState>({ scale: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startPanX: 0, startPanY: 0, moved: false });
  const MIN_ZOOM = 0.3;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.2;

  // Expand overlay
  const [isExpanded, setIsExpanded] = useState(false);
  const expandedRef = useRef<HTMLDivElement>(null);
  const [expandedView, setExpandedView] = useState<ViewState>({ scale: 1, panX: 0, panY: 0 });
  const [isExpandedDragging, setIsExpandedDragging] = useState(false);
  const expandedDragRef = useRef({ startX: 0, startY: 0, startPanX: 0, startPanY: 0, moved: false });

  // Create child inline state
  const [creatingForId, setCreatingForId] = useState<string | null>(null);
  const [newChildTitle, setNewChildTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Auto-fit view when tree data or container size changes
  useEffect(() => {
    if (!tree || isExpanded) return;

    const el = document.getElementById('branch-view-container');
    if (!el) return;

    let rafId: number;

    function fit() {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        handleFitView(el.clientWidth, el.clientHeight, false);
      }
    }

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    });

    ro.observe(el);
    rafId = requestAnimationFrame(fit);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [tree, isExpanded]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rootId = await findRoot(currentTodoId);
      const result = await buildTree(rootId, currentTodoId);
      if (cancelled) return;

      if (result.tree) {
        const lc = countLeaves(result.tree);
        const md = getMaxDepth(result.tree);
        const nw = Math.max(lc * LEAF_SPACING, MIN_SVG_W);
        const sw = Math.max(nw + ROOT_W + 120, MIN_SVG_W);
        const sh = TOP_PAD * 2 + (md + 1) * LEVEL_H + ROOT_H;
        const sx = (sw - nw) / 2;

        layoutTree(result.tree, 0, sx, sx + nw, true);
        setTree(result.tree);
        setCrossEdges(result.crossEdges);
        setDims({ w: sw, h: sh });
        setView({ scale: 1, panX: 0, panY: 0 });
        setExpandedView({ scale: 1, panX: 0, panY: 0 });
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [currentTodoId, refreshKey]);

  async function handleCreateChild(parentId: string) {
    if (!newChildTitle.trim()) return;
    await createTodo(newChildTitle.trim(), { parentId });
    setNewChildTitle('');
    setCreatingForId(null);
    setRefreshKey((k) => k + 1);
  }

  async function handleDeleteNode(nodeId: string) {
    await deleteTodo(nodeId);
    setDeletingId(null);
    setRefreshKey((k) => k + 1);
  }

  /* ------------------------------------------------------------------ */
  /*  Pan / Zoom Handlers                                                */
  /* ------------------------------------------------------------------ */

  function handleWheel(e: React.WheelEvent, isExpandedView: boolean) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const setV = isExpandedView ? setExpandedView : setView;
    const current = isExpandedView ? expandedView : view;

    const newScale = clamp(current.scale + delta, MIN_ZOOM, MAX_ZOOM);
    const scaleRatio = newScale / current.scale;
    const newPanX = mouseX - (mouseX - current.panX) * scaleRatio;
    const newPanY = mouseY - (mouseY - current.panY) * scaleRatio;

    setV({ scale: newScale, panX: newPanX, panY: newPanY });
  }

  function handleMouseDown(e: React.MouseEvent, isExpandedView: boolean) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]') || target.closest('button') || target.closest('input')) return;

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
    setV({ ...current, scale: clamp(current.scale + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) });
  }

  function handleZoomOut(isExpandedView: boolean) {
    const setV = isExpandedView ? setExpandedView : setView;
    const current = isExpandedView ? expandedView : view;
    setV({ ...current, scale: clamp(current.scale - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) });
  }

  function handleResetView(isExpandedView: boolean) {
    const setV = isExpandedView ? setExpandedView : setView;
    setV({ scale: 1, panX: 0, panY: 0 });
  }

  function handleFitView(containerW: number, containerH: number, isExpandedView: boolean) {
    if (!tree) return;
    const setV = isExpandedView ? setExpandedView : setView;

    const minX = Math.min(...allNodes.map((n) => n.x - (n.todo.id === rootId ? ROOT_W : NODE_W) / 2));
    const maxX = Math.max(...allNodes.map((n) => n.x + (n.todo.id === rootId ? ROOT_W : NODE_W) / 2));
    const minY = TOP_PAD - 10;
    const maxY = TOP_PAD * 2 + (getMaxDepth(tree) + 1) * LEVEL_H + ROOT_H;

    const contentW = maxX - minX + 80;
    const contentH = maxY - minY + 40;

    const scale = Math.min(containerW / contentW, containerH / contentH, 1.5);
    const panX = (containerW - contentW * scale) / 2 - minX * scale + 40;
    const panY = (containerH - contentH * scale) / 2 - minY * scale + 20;

    setV({ scale: clamp(scale, MIN_ZOOM, MAX_ZOOM), panX, panY });
  }

  const { connections, allNodes, mainPathNodes } = useMemo(() => {
    const conns: { from: TreeNode; to: TreeNode }[] = [];
    const nodes: TreeNode[] = [];
    const mainNodes: TreeNode[] = [];

    function walk(n: TreeNode) {
      nodes.push(n);
      if (n.isMainPath) mainNodes.push(n);
      for (const c of n.children) {
        conns.push({ from: n, to: c });
        walk(c);
      }
    }
    if (tree) walk(tree);
    return { connections: conns, allNodes: nodes, mainPathNodes: mainNodes };
  }, [tree]);

  // Compute connected nodes for hover highlight
  const hoveredConnectedIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const connected = new Set<string>([hoveredId]);
    for (const c of connections) {
      if (c.from.todo.id === hoveredId) connected.add(c.to.todo.id);
      if (c.to.todo.id === hoveredId) connected.add(c.from.todo.id);
    }
    for (const e of crossEdges) {
      if (e.from.todo.id === hoveredId) connected.add(e.to.todo.id);
      if (e.to.todo.id === hoveredId) connected.add(e.from.todo.id);
    }
    return connected;
  }, [hoveredId, connections, crossEdges]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!tree || allNodes.length <= 1) return null;

  const rootId = tree.todo.id;
  const mainPathCount = mainPathNodes.length;
  const sideBranchCount = allNodes.length - mainPathCount;

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden w-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Goal Tree</h2>
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Main Path ({mainPathCount})
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Side Branches ({sideBranchCount})
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
            {allNodes.length} total
          </span>
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleZoomOut(false)}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 w-10 text-center tabular-nums">
              {Math.round(view.scale * 100)}%
            </span>
            <button
              onClick={() => handleZoomIn(false)}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleResetView(false)}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              title="Reset view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('branch-view-container');
                if (el) handleFitView(el.clientWidth, el.clientHeight, false);
              }}
              className="px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] text-slate-500 dark:text-slate-400 transition-colors"
              title="Fit to view"
            >
              Fit
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              title="Expand"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        id="branch-view-container"
        className="relative overflow-hidden w-full select-none"
        style={{ minHeight: dims.h + 16, cursor: isDragging ? 'grabbing' : 'grab', contain: 'layout' }}
        onWheel={(e) => handleWheel(e, false)}
        onMouseDown={(e) => handleMouseDown(e, false)}
        onMouseMove={(e) => handleMouseMove(e, false)}
        onMouseUp={() => handleMouseUp(false)}
        onMouseLeave={() => handleMouseUp(false)}
      >
        <div
          style={{
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`,
            transformOrigin: '0 0',
            width: dims.w,
            maxWidth: '100%',
            height: dims.h + 16,
          }}
        >
          <svg
            width={dims.w}
            height={dims.h + 16}
            viewBox={`0 0 ${dims.w} ${dims.h + 16}`}
            className="block"
            role="img"
            aria-label="Goal tree showing main path and alternative branches"
          >
          <defs>
            <marker id="arr-depends" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
            </marker>
            <marker id="arr-blocked" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#ef4444" />
            </marker>
            <marker id="arr-assign" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#8b5cf6" />
            </marker>
            <linearGradient id="mainPathBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Subtle background band for main path area */}
          {mainPathNodes.length > 1 && (
            <rect
              x={Math.min(...mainPathNodes.map(n => n.x)) - NODE_W / 2 - 20}
              y={TOP_PAD - 10}
              width={NODE_W + 40}
              height={dims.h - TOP_PAD}
              rx={16}
              fill="url(#mainPathBg)"
              stroke="#6366f1"
              strokeWidth={0.5}
              strokeOpacity={0.06}
            />
          )}

          {/* ===================== Tree Edges ===================== */}
          {connections.map((conn, i) => {
            const isSpawned = conn.to.relationType === 'source_from';
            const isMain = conn.to.isMainPath && conn.from.isMainPath;
            const fromH = conn.from.todo.id === rootId ? ROOT_H : NODE_H;
            const fromY = conn.from.y + fromH / 2;
            const toY = conn.to.y - NODE_H / 2;
            const gap = toY - fromY;
            const vLen = gap * 0.42;

            const pathD = conn.from.x === conn.to.x
              ? `M ${conn.from.x} ${fromY} L ${conn.to.x} ${toY}`
              : `M ${conn.from.x} ${fromY} L ${conn.from.x} ${fromY + vLen} C ${conn.from.x} ${fromY + vLen * 1.8}, ${conn.to.x} ${toY - vLen * 1.8}, ${conn.to.x} ${toY}`;

            const isDimmed = hoveredId && !hoveredConnectedIds.has(conn.from.todo.id) && !hoveredConnectedIds.has(conn.to.todo.id);

            return (
              <g key={`tree-${i}`}>
                <path
                  d={pathD}
                  fill="none"
                  strokeWidth={isMain ? 2.5 : 1.5}
                  strokeDasharray={isSpawned ? '5,4' : 'none'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={
                    isSpawned
                      ? 'stroke-amber-400 dark:stroke-amber-500'
                      : isMain
                        ? 'stroke-indigo-500 dark:stroke-indigo-400'
                        : 'stroke-slate-300 dark:stroke-slate-600'
                  }
                  opacity={isDimmed ? 0.1 : isMain ? 0.85 : 0.45}
                />
                {isSpawned && (
                  <circle
                    cx={conn.to.x}
                    cy={toY + 5}
                    r="2.5"
                    className="fill-amber-400 dark:fill-amber-500"
                    opacity={isDimmed ? 0.08 : 0.8}
                  />
                )}
              </g>
            );
          })}

          {/* ===================== Cross Edges ===================== */}
          {crossEdges.map((edge, i) => {
            const isHovered = hoveredId && (hoveredConnectedIds.has(edge.from.todo.id) || hoveredConnectedIds.has(edge.to.todo.id));
            const isDimmed = hoveredId && !isHovered;

            const fromH = edge.from.todo.id === rootId ? ROOT_H : NODE_H;
            const fromY = edge.from.y + fromH / 2;
            const toY = edge.to.y - NODE_H / 2;

            const dx = edge.to.x - edge.from.x;
            const dy = toY - fromY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const perpX = -(dy / dist) * 36;
            const perpY = (dx / dist) * 36;
            const ctrlX = (edge.from.x + edge.to.x) / 2 + perpX;
            const ctrlY = (fromY + toY) / 2 + perpY;

            const color = edge.type === 'depends_on' ? '#3b82f6' : edge.type === 'blocked_by' ? '#ef4444' : '#8b5cf6';
            const marker = edge.type === 'depends_on' ? 'url(#arr-depends)' : edge.type === 'blocked_by' ? 'url(#arr-blocked)' : 'url(#arr-assign)';
            const dash = edge.type === 'depends_on' ? '4,4' : edge.type === 'blocked_by' ? '8,5' : '5,5';

            return (
              <path
                key={`cross-${i}`}
                d={`M ${edge.from.x} ${fromY} Q ${ctrlX} ${ctrlY} ${edge.to.x} ${toY}`}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeDasharray={dash}
                opacity={isDimmed ? 0.06 : isHovered ? 1 : 0.4}
                markerEnd={marker}
                style={{ transition: 'opacity 0.2s' }}
              />
            );
          })}

          {/* ===================== Nodes ===================== */}
          {allNodes.map((node) => {
            const isCurrent = node.todo.id === currentTodoId;
            const isRoot = node.todo.id === rootId;
            const isDone = node.todo.status === 'done';
            const isMain = node.isMainPath;
            const isSideBranch = !isMain && !isRoot && node.depth === 1;
            const w = isRoot ? ROOT_W : NODE_W;
            const h = isRoot ? ROOT_H : NODE_H;

            const isDimmed = hoveredId && !hoveredConnectedIds.has(node.todo.id);
            const isCreating = creatingForId === node.todo.id;
            const isDeleting = deletingId === node.todo.id;
            const hasActiveForm = isCreating || isDeleting;
            const foH = h + (hasActiveForm ? 58 : 0);
            const foY = node.y - h / 2 - (hasActiveForm ? 28 : 0);

            return (
              <g
                key={node.todo.id}
                data-node="true"
                onMouseEnter={() => setHoveredId(node.todo.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: 'pointer' }}
                opacity={isDimmed ? 0.18 : 1}
              >
                {/* Current node glow ring */}
                {isCurrent && (
                  <rect
                    x={node.x - w / 2 - 6}
                    y={node.y - h / 2 - 6}
                    width={w + 12}
                    height={h + 12}
                    rx={14}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    opacity={0.5}
                  >
                    <animate
                      attributeName="opacity"
                      values="0.35;0.55;0.35"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}

                {/* Main path subtle glow */}
                {isMain && !isRoot && !isCurrent && (
                  <rect
                    x={node.x - w / 2 - 2}
                    y={node.y - h / 2 - 2}
                    width={w + 4}
                    height={h + 4}
                    rx={10}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth={1.2}
                    opacity={0.2}
                  />
                )}

                <foreignObject
                  x={node.x - w / 2}
                  y={foY}
                  width={w}
                  height={foH}
                >
                  <div className="flex flex-col items-center justify-start w-full h-full">
                    <div
                      className={`group relative flex items-center gap-2.5 w-full rounded-xl border cursor-pointer transition-all duration-150 select-none shrink-0 px-3.5 ${
                        isRoot
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700/50 hover:border-indigo-400 dark:hover:border-indigo-500'
                          : isCurrent
                            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600/60'
                            : isDone
                              ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 opacity-40'
                              : isMain
                                ? 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-600/50 hover:border-indigo-300 dark:hover:border-indigo-500'
                                : isSideBranch
                                  ? 'bg-white dark:bg-slate-800/80 border-amber-200 dark:border-amber-700/40 hover:border-amber-300 dark:hover:border-amber-500'
                                  : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                      style={{
                        height: h,
                        boxShadow: isRoot
                          ? '0 2px 12px -2px rgba(99,102,241,0.18), 0 1px 2px rgba(0,0,0,0.05)'
                          : isCurrent
                            ? '0 2px 12px -2px rgba(245,158,11,0.2), 0 1px 2px rgba(0,0,0,0.05)'
                            : isMain
                              ? '0 1px 6px -1px rgba(99,102,241,0.1), 0 1px 2px rgba(0,0,0,0.05)'
                              : '0 1px 4px -1px rgba(0,0,0,0.08)',
                        transform: hoveredId === node.todo.id ? 'translateY(-1px)' : 'translateY(0)',
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (dragRef.current.moved || isExpandedDragging) return;
                        navigate(`/todo/${node.todo.id}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/todo/${node.todo.id}`);
                        }
                      }}
                    >
                      {/* Left accent bar for main path */}
                      {isMain && (
                        <div
                          className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full ${
                            isRoot ? 'bg-indigo-500' : 'bg-indigo-400/70'
                          }`}
                        />
                      )}

                      {/* Status dot */}
                      <StatusDot status={node.todo.status} />

                      {/* Title */}
                      <span
                        className={`text-[13px] font-medium truncate flex-1 min-w-0 leading-tight ${
                          isDone
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : isRoot
                              ? 'text-indigo-800 dark:text-indigo-300'
                              : isMain
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {node.todo.title}
                      </span>

                      {/* Done checkmark */}
                      {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}

                      {/* Current badge */}
                      {isCurrent && !isRoot && (
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-md">
                          Current
                        </span>
                      )}

                      {/* Side branch badge */}
                      {isSideBranch && (
                        <span className="text-[9px] font-medium text-amber-700 dark:text-amber-400 shrink-0 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/40">
                          Alt
                        </span>
                      )}

                      {/* Action buttons — appear inside node on hover, right side */}
                      {(hoveredId === node.todo.id || isCreating) && !isDeleting && (
                        <div
                          className="flex items-center gap-0.5 shrink-0 ml-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setCreatingForId(node.todo.id);
                              setNewChildTitle('');
                              setTimeout(() => inputRef.current?.focus(), 50);
                            }}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                            title="Add child"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          {node.todo.id !== rootId && (
                            <button
                              onClick={() => setDeletingId(node.todo.id)}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inline create child form */}
                    {isCreating && (
                      <div
                        className="w-full pt-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="bg-white dark:bg-slate-800 rounded-md border border-indigo-200 dark:border-indigo-700/50 shadow-md p-1.5 flex items-center gap-1.5">
                          <input
                            ref={inputRef}
                            type="text"
                            value={newChildTitle}
                            onChange={(e) => setNewChildTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateChild(node.todo.id);
                              if (e.key === 'Escape') setCreatingForId(null);
                            }}
                            placeholder="New sub-todo..."
                            className="flex-1 min-w-0 px-2 py-1 rounded text-[11px] bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            onClick={() => handleCreateChild(node.todo.id)}
                            disabled={!newChildTitle.trim()}
                            className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => { setCreatingForId(null); setNewChildTitle(''); }}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline delete confirmation */}
                    {isDeleting && (
                      <div
                        className="w-full pt-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="bg-white dark:bg-slate-800 rounded-md border border-rose-200 dark:border-rose-700/50 shadow-md p-2 text-center">
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-1.5">
                            Delete "{node.todo.title}"?
                            {node.children.length > 0 && (
                              <span className="block text-rose-500">Includes {node.children.length} sub-todo(s)</span>
                            )}
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleDeleteNode(node.todo.id)}
                              className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-medium hover:bg-rose-700"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  </div>

      {/* Expanded overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Expanded header */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0">
              <GitBranch className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Goal Tree</h2>
              <div className="flex items-center gap-3 ml-auto">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  Main Path ({mainPathCount})
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Side Branches ({sideBranchCount})
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                  {allNodes.length} total
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleZoomOut(true)}
                    className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 w-10 text-center tabular-nums">
                    {Math.round(expandedView.scale * 100)}%
                  </span>
                  <button
                    onClick={() => handleZoomIn(true)}
                    className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleResetView(true)}
                    className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                    title="Reset view"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (expandedRef.current) {
                        handleFitView(expandedRef.current.clientWidth, expandedRef.current.clientHeight, true);
                      }
                    }}
                    className="px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] text-slate-500 dark:text-slate-400 transition-colors"
                    title="Fit to view"
                  >
                    Fit
                  </button>
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                    title="Collapse"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Expanded graph */}
            <div
              ref={expandedRef}
              className="flex-1 relative overflow-hidden select-none"
              style={{ cursor: isExpandedDragging ? 'grabbing' : 'grab' }}
              onWheel={(e) => handleWheel(e, true)}
              onMouseDown={(e) => handleMouseDown(e, true)}
              onMouseMove={(e) => handleMouseMove(e, true)}
              onMouseUp={() => handleMouseUp(true)}
              onMouseLeave={() => handleMouseUp(true)}
            >
              <div
                style={{
                  transform: `translate(${expandedView.panX}px, ${expandedView.panY}px) scale(${expandedView.scale})`,
                  transformOrigin: '0 0',
                  width: dims.w,
                  height: dims.h + 16,
                }}
              >
                <svg
                  width={dims.w}
                  height={dims.h + 16}
                  viewBox={`0 0 ${dims.w} ${dims.h + 16}`}
                  className="block"
                  role="img"
                  aria-label="Goal tree showing main path and alternative branches"
                >
                  <defs>
                    <marker id="arr-depends-expanded" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
                    </marker>
                    <marker id="arr-blocked-expanded" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="#ef4444" />
                    </marker>
                    <marker id="arr-assign-expanded" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="#8b5cf6" />
                    </marker>
                    <linearGradient id="mainPathBg-expanded" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.03" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>

                  {/* Subtle background band for main path area */}
                  {mainPathNodes.length > 1 && (
                    <rect
                      x={Math.min(...mainPathNodes.map(n => n.x)) - NODE_W / 2 - 20}
                      y={TOP_PAD - 10}
                      width={NODE_W + 40}
                      height={dims.h - TOP_PAD}
                      rx={16}
                      fill="url(#mainPathBg-expanded)"
                      stroke="#6366f1"
                      strokeWidth={0.5}
                      strokeOpacity={0.06}
                    />
                  )}

                  {/* ===================== Tree Edges ===================== */}
                  {connections.map((conn, i) => {
                    const isSpawned = conn.to.relationType === 'source_from';
                    const isMain = conn.to.isMainPath && conn.from.isMainPath;
                    const fromH = conn.from.todo.id === rootId ? ROOT_H : NODE_H;
                    const fromY = conn.from.y + fromH / 2;
                    const toY = conn.to.y - NODE_H / 2;
                    const gap = toY - fromY;
                    const vLen = gap * 0.42;

                    const pathD = conn.from.x === conn.to.x
                      ? `M ${conn.from.x} ${fromY} L ${conn.to.x} ${toY}`
                      : `M ${conn.from.x} ${fromY} L ${conn.from.x} ${fromY + vLen} C ${conn.from.x} ${fromY + vLen * 1.8}, ${conn.to.x} ${toY - vLen * 1.8}, ${conn.to.x} ${toY}`;

                    const isDimmed = hoveredId && !hoveredConnectedIds.has(conn.from.todo.id) && !hoveredConnectedIds.has(conn.to.todo.id);

                    return (
                      <g key={`tree-${i}-expanded`}>
                        <path
                          d={pathD}
                          fill="none"
                          strokeWidth={isMain ? 2.5 : 1.5}
                          strokeDasharray={isSpawned ? '5,4' : 'none'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={
                            isSpawned
                              ? 'stroke-amber-400 dark:stroke-amber-500'
                              : isMain
                                ? 'stroke-indigo-500 dark:stroke-indigo-400'
                                : 'stroke-slate-300 dark:stroke-slate-600'
                          }
                          opacity={isDimmed ? 0.1 : isMain ? 0.85 : 0.45}
                        />
                        {isSpawned && (
                          <circle
                            cx={conn.to.x}
                            cy={toY + 5}
                            r="2.5"
                            className="fill-amber-400 dark:fill-amber-500"
                            opacity={isDimmed ? 0.08 : 0.8}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* ===================== Cross Edges ===================== */}
                  {crossEdges.map((edge, i) => {
                    const isHovered = hoveredId && (hoveredConnectedIds.has(edge.from.todo.id) || hoveredConnectedIds.has(edge.to.todo.id));
                    const isDimmed = hoveredId && !isHovered;

                    const fromH = edge.from.todo.id === rootId ? ROOT_H : NODE_H;
                    const fromY = edge.from.y + fromH / 2;
                    const toY = edge.to.y - NODE_H / 2;

                    const dx = edge.to.x - edge.from.x;
                    const dy = toY - fromY;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const perpX = -(dy / dist) * 36;
                    const perpY = (dx / dist) * 36;
                    const ctrlX = (edge.from.x + edge.to.x) / 2 + perpX;
                    const ctrlY = (fromY + toY) / 2 + perpY;

                    const color = edge.type === 'depends_on' ? '#3b82f6' : edge.type === 'blocked_by' ? '#ef4444' : '#8b5cf6';
                    const marker = edge.type === 'depends_on' ? 'url(#arr-depends-expanded)' : edge.type === 'blocked_by' ? 'url(#arr-blocked-expanded)' : 'url(#arr-assign-expanded)';
                    const dash = edge.type === 'depends_on' ? '4,4' : edge.type === 'blocked_by' ? '8,5' : '5,5';

                    return (
                      <path
                        key={`cross-${i}-expanded`}
                        d={`M ${edge.from.x} ${fromY} Q ${ctrlX} ${ctrlY} ${edge.to.x} ${toY}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={isHovered ? 2.5 : 1.5}
                        strokeDasharray={dash}
                        opacity={isDimmed ? 0.06 : isHovered ? 1 : 0.4}
                        markerEnd={marker}
                        style={{ transition: 'opacity 0.2s' }}
                      />
                    );
                  })}

                  {/* ===================== Nodes ===================== */}
                  {allNodes.map((node) => {
                    const isCurrent = node.todo.id === currentTodoId;
                    const isRoot = node.todo.id === rootId;
                    const isDone = node.todo.status === 'done';
                    const isMain = node.isMainPath;
                    const isSideBranch = !isMain && !isRoot && node.depth === 1;
                    const w = isRoot ? ROOT_W : NODE_W;
                    const h = isRoot ? ROOT_H : NODE_H;

                    const isDimmed = hoveredId && !hoveredConnectedIds.has(node.todo.id);
                    const isCreating = creatingForId === node.todo.id;
                    const isDeleting = deletingId === node.todo.id;
                    const hasActiveForm = isCreating || isDeleting;
                    const foH = h + (hasActiveForm ? 58 : 0);
                    const foY = node.y - h / 2 - (hasActiveForm ? 28 : 0);

                    return (
                      <g
                        key={`${node.todo.id}-expanded`}
                        data-node="true"
                        onMouseEnter={() => setHoveredId(node.todo.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{ cursor: 'pointer' }}
                        opacity={isDimmed ? 0.18 : 1}
                      >
                        {/* Current node glow ring */}
                        {isCurrent && (
                          <rect
                            x={node.x - w / 2 - 6}
                            y={node.y - h / 2 - 6}
                            width={w + 12}
                            height={h + 12}
                            rx={14}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            opacity={0.5}
                          >
                            <animate
                              attributeName="opacity"
                              values="0.35;0.55;0.35"
                              dur="3s"
                              repeatCount="indefinite"
                            />
                          </rect>
                        )}

                        {/* Main path subtle glow */}
                        {isMain && !isRoot && !isCurrent && (
                          <rect
                            x={node.x - w / 2 - 2}
                            y={node.y - h / 2 - 2}
                            width={w + 4}
                            height={h + 4}
                            rx={10}
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth={1.2}
                            opacity={0.2}
                          />
                        )}

                        <foreignObject
                          x={node.x - w / 2}
                          y={foY}
                          width={w}
                          height={foH}
                        >
                          <div className="flex flex-col items-center justify-start w-full h-full">
                            <div
                              className={`group relative flex items-center gap-2.5 w-full rounded-xl border cursor-pointer transition-all duration-150 select-none shrink-0 px-3.5 ${
                                isRoot
                                  ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700/50 hover:border-indigo-400 dark:hover:border-indigo-500'
                                  : isCurrent
                                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600/60'
                                    : isDone
                                      ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 opacity-40'
                                      : isMain
                                        ? 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-600/50 hover:border-indigo-300 dark:hover:border-indigo-500'
                                        : isSideBranch
                                          ? 'bg-white dark:bg-slate-800/80 border-amber-200 dark:border-amber-700/40 hover:border-amber-300 dark:hover:border-amber-500'
                                          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-500'
                              }`}
                              style={{
                                height: h,
                                boxShadow: isRoot
                                  ? '0 2px 12px -2px rgba(99,102,241,0.18), 0 1px 2px rgba(0,0,0,0.05)'
                                  : isCurrent
                                    ? '0 2px 12px -2px rgba(245,158,11,0.2), 0 1px 2px rgba(0,0,0,0.05)'
                                    : isMain
                                      ? '0 1px 6px -1px rgba(99,102,241,0.1), 0 1px 2px rgba(0,0,0,0.05)'
                                      : '0 1px 4px -1px rgba(0,0,0,0.08)',
                                transform: hoveredId === node.todo.id ? 'translateY(-1px)' : 'translateY(0)',
                              }}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (expandedDragRef.current.moved) return;
                                navigate(`/todo/${node.todo.id}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  navigate(`/todo/${node.todo.id}`);
                                }
                              }}
                            >
                              {/* Left accent bar for main path */}
                              {isMain && (
                                <div
                                  className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full ${
                                    isRoot ? 'bg-indigo-500' : 'bg-indigo-400/70'
                                  }`}
                                />
                              )}

                              <StatusDot status={node.todo.status} />

                              <span
                                className={`text-[13px] font-medium truncate flex-1 min-w-0 leading-tight ${
                                  isDone
                                    ? 'text-slate-400 dark:text-slate-500 line-through'
                                    : isRoot
                                      ? 'text-indigo-800 dark:text-indigo-300'
                                      : isMain
                                        ? 'text-slate-800 dark:text-slate-200'
                                        : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {node.todo.title}
                              </span>

                              {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}

                              {isCurrent && !isRoot && (
                                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-md">
                                  Current
                                </span>
                              )}

                              {isSideBranch && (
                                <span className="text-[9px] font-medium text-amber-700 dark:text-amber-400 shrink-0 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/40">
                                  Alt
                                </span>
                              )}

                              {(hoveredId === node.todo.id || isCreating) && !isDeleting && (
                                <div
                                  className="flex items-center gap-0.5 shrink-0 ml-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setCreatingForId(node.todo.id);
                                      setNewChildTitle('');
                                      setTimeout(() => inputRef.current?.focus(), 50);
                                    }}
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                                    title="Add child"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  {node.todo.id !== rootId && (
                                    <button
                                      onClick={() => setDeletingId(node.todo.id)}
                                      className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {isCreating && (
                              <div className="w-full pt-1.5" onClick={(e) => e.stopPropagation()}>
                                <div className="bg-white dark:bg-slate-800 rounded-md border border-indigo-200 dark:border-indigo-700/50 shadow-md p-1.5 flex items-center gap-1.5">
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    value={newChildTitle}
                                    onChange={(e) => setNewChildTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleCreateChild(node.todo.id);
                                      if (e.key === 'Escape') setCreatingForId(null);
                                    }}
                                    placeholder="New sub-todo..."
                                    className="flex-1 min-w-0 px-2 py-1 rounded text-[11px] bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <button
                                    onClick={() => handleCreateChild(node.todo.id)}
                                    disabled={!newChildTitle.trim()}
                                    className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Add
                                  </button>
                                  <button
                                    onClick={() => { setCreatingForId(null); setNewChildTitle(''); }}
                                    className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {isDeleting && (
                              <div className="w-full pt-1.5" onClick={(e) => e.stopPropagation()}>
                                <div className="bg-white dark:bg-slate-800 rounded-md border border-rose-200 dark:border-rose-700/50 shadow-md p-2 text-center">
                                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-1.5">
                                    Delete "{node.todo.title}"?
                                    {node.children.length > 0 && (
                                      <span className="block text-rose-500">Includes {node.children.length} sub-todo(s)</span>
                                    )}
                                  </p>
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => handleDeleteNode(node.todo.id)}
                                      className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-medium hover:bg-rose-700"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={() => setDeletingId(null)}
                                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
