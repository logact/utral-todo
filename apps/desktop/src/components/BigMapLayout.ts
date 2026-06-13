import type { Todo, ActionEdge, TodoRelation, TodoRelationType } from '../types';
import {
  NODE_W,
  NODE_H,
  GOAL_W,
  GOAL_H,
  LEVEL_H,
  NODE_GAP,
  TOP_PAD,
  MIN_SVG_W,
  COMPONENT_PAD_X,
  COMPONENT_PAD_Y,
} from './BigMapConstants';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LayoutNode {
  todo: Todo;
  x: number;
  y: number;
  depth: number;
  componentId: string;
  hasParent: boolean;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  actionEdges: ActionEdge[];
  parentChildEdges: { fromId: string; toId: string }[];
  roadEdges?: TodoRelation[];
  width: number;
  height: number;
}

interface LayoutItem {
  id: string;
  nodes: LayoutNode[];
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/*  Union-Find                                                         */
/* ------------------------------------------------------------------ */

class UnionFind {
  private parent = new Map<string, string>();

  constructor(ids: Iterable<string>) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let curr = id;
    while (this.parent.get(curr) !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getNodeSize(todoId: string, goalId: string | null) {
  const isGoalNode = todoId === goalId;
  return {
    w: isGoalNode ? GOAL_W : NODE_W,
    h: isGoalNode ? GOAL_H : NODE_H,
  };
}

function computeBounds(nodes: LayoutNode[]): { width: number; height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const { w, h } = getNodeSize(n.todo.id, n.todo.nodeType === 'goal' ? n.todo.id : null);
    minX = Math.min(minX, n.x - w / 2);
    maxX = Math.max(maxX, n.x + w / 2);
    minY = Math.min(minY, n.y - h / 2);
    maxY = Math.max(maxY, n.y + h / 2);
  }
  return { width: maxX - minX + COMPONENT_PAD_X, height: maxY - minY + COMPONENT_PAD_Y };
}

/* ------------------------------------------------------------------ */
/*  Hierarchical Layout (per component)                                */
/* ------------------------------------------------------------------ */

function hierarchicalLayout(
  componentTodos: Todo[],
  componentEdges: ActionEdge[],
  goalId: string
): LayoutNode[] {
  const todoMap = new Map(componentTodos.map((t) => [t.id, t]));
  const nodeIds = new Set(componentTodos.map((t) => t.id));

  // Build adjacency: edge from -> to means from is lower, to is upper (toward goal)
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string[]>();

  for (const t of componentTodos) {
    childrenOf.set(t.id, []);
    parentOf.set(t.id, []);
  }

  for (const edge of componentEdges) {
    if (!nodeIds.has(edge.fromTodoId) || !nodeIds.has(edge.toTodoId)) continue;
    if (!childrenOf.has(edge.toTodoId)) childrenOf.set(edge.toTodoId, []);
    if (!parentOf.has(edge.fromTodoId)) parentOf.set(edge.fromTodoId, []);
    childrenOf.get(edge.toTodoId)!.push(edge.fromTodoId);
    parentOf.get(edge.fromTodoId)!.push(edge.toTodoId);
  }

  // Compute depth from goal using BFS
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

  // For nodes with no path from goal (cycles), place them at max depth + 1
  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  for (const t of componentTodos) {
    if (!depth.has(t.id)) {
      depth.set(t.id, maxDepth + 1);
    }
  }

  // Group by depth
  const depthGroups = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(id);
  }

  // Sort within each depth: pending first, then by title
  for (const [, ids] of depthGroups) {
    ids.sort((a, b) => {
      const ta = todoMap.get(a)!;
      const tb = todoMap.get(b)!;
      const doneA = ta.status === 'done' ? 1 : 0;
      const doneB = tb.status === 'done' ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return ta.title.localeCompare(tb.title);
    });
  }

  // Position nodes
  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  const maxNodesInLevel = Math.max(...sortedDepths.map((d) => depthGroups.get(d)!.length), 1);
  const neededW = Math.max(maxNodesInLevel * (NODE_W + NODE_GAP) + NODE_GAP, GOAL_W + NODE_GAP * 2);

  const nodes: LayoutNode[] = [];

  for (const d of sortedDepths) {
    const ids = depthGroups.get(d)!;
    const totalW = ids.length * NODE_W + (ids.length - 1) * NODE_GAP;
    const startX = (neededW - totalW) / 2;
    for (let i = 0; i < ids.length; i++) {
      const todo = todoMap.get(ids[i])!;
      const h = ids[i] === goalId ? GOAL_H : NODE_H;
      nodes.push({
        todo,
        x: startX + i * (NODE_W + NODE_GAP) + NODE_W / 2,
        y: d * LEVEL_H + h / 2,
        depth: d,
        componentId: goalId,
        hasParent: !!todo.parentId,
      });
    }
  }

  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Mini Tree Layout (for isolated parent-child groups)                */
/* ------------------------------------------------------------------ */

function miniTreeLayout(rootTodo: Todo, descendants: Todo[]): LayoutNode[] {
  const all = [rootTodo, ...descendants];
  const todoMap = new Map(all.map((t) => [t.id, t]));

  // Build parent -> children
  const childrenOf = new Map<string, string[]>();
  for (const t of all) childrenOf.set(t.id, []);
  for (const t of descendants) {
    if (t.parentId && childrenOf.has(t.parentId)) {
      childrenOf.get(t.parentId)!.push(t.id);
    }
  }

  // BFS to compute depth from root
  const depth = new Map<string, number>();
  depth.set(rootTodo.id, 0);
  const queue = [rootTodo.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const childId of childrenOf.get(id) || []) {
      depth.set(childId, d + 1);
      queue.push(childId);
    }
  }

  // Group by depth
  const depthGroups = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(id);
  }

  // Sort within depth
  for (const [, ids] of depthGroups) {
    ids.sort((a, b) => {
      const ta = todoMap.get(a)!;
      const tb = todoMap.get(b)!;
      return ta.title.localeCompare(tb.title);
    });
  }

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  const maxNodesInLevel = Math.max(...sortedDepths.map((d) => depthGroups.get(d)!.length), 1);
  const neededW = Math.max(maxNodesInLevel * (NODE_W + NODE_GAP) + NODE_GAP, GOAL_W + NODE_GAP * 2);

  const nodes: LayoutNode[] = [];
  for (const d of sortedDepths) {
    const ids = depthGroups.get(d)!;
    const totalW = ids.length * NODE_W + (ids.length - 1) * NODE_GAP;
    const startX = (neededW - totalW) / 2;
    for (let i = 0; i < ids.length; i++) {
      const todo = todoMap.get(ids[i])!;
      nodes.push({
        todo,
        x: startX + i * (NODE_W + NODE_GAP) + NODE_W / 2,
        y: d * LEVEL_H + NODE_H / 2,
        depth: d,
        componentId: `group-${rootTodo.id}`,
        hasParent: !!todo.parentId,
      });
    }
  }

  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Grid Packing                                                       */
/* ------------------------------------------------------------------ */

function packItems(items: LayoutItem[], containerWidth: number): LayoutItem[] {
  // Sort by height descending for better packing
  items.sort((a, b) => b.height - a.height);

  let currentX = 0;
  let currentY = 0;
  let rowHeight = 0;

  for (const item of items) {
    if (currentX + item.width > containerWidth && currentX > 0) {
      currentX = 0;
      currentY += rowHeight + COMPONENT_PAD_Y;
      rowHeight = 0;
    }

    // Offset all nodes in this item
    for (const n of item.nodes) {
      n.x += currentX + COMPONENT_PAD_X / 2;
      n.y += currentY + COMPONENT_PAD_Y / 2;
    }

    currentX += item.width + COMPONENT_PAD_X;
    rowHeight = Math.max(rowHeight, item.height);
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  Plan Subgraph Layout (curated ActionEdge subgraph for a goal)       */
/* ------------------------------------------------------------------ */

export function computeSubgraphLayout(
  goalId: string,
  todos: Todo[],
  actionEdges: ActionEdge[],
  containerWidth: number
): LayoutResult {
  const todoMap = new Map(todos.map((t) => [t.id, t]));
  const nodeIds = new Set(todos.map((t) => t.id));

  // Build adjacency: action edge from -> to means from is lower, to is upper (toward goal)
  const childrenOf = new Map<string, string[]>();
  for (const t of todos) {
    childrenOf.set(t.id, []);
  }
  for (const edge of actionEdges) {
    if (!nodeIds.has(edge.fromTodoId) || !nodeIds.has(edge.toTodoId)) continue;
    if (!childrenOf.has(edge.toTodoId)) childrenOf.set(edge.toTodoId, []);
    childrenOf.get(edge.toTodoId)!.push(edge.fromTodoId);
  }

  // Compute depth from goal using BFS
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
  for (const t of todos) {
    if (!depth.has(t.id)) {
      depth.set(t.id, maxDepth + 1);
    }
  }

  // Group by depth and sort within each level
  const depthGroups = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(id);
  }

  for (const [, ids] of depthGroups) {
    ids.sort((a, b) => {
      const ta = todoMap.get(a)!;
      const tb = todoMap.get(b)!;
      const doneA = ta.status === 'done' ? 1 : 0;
      const doneB = tb.status === 'done' ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return ta.title.localeCompare(tb.title);
    });
  }

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  const minDepth = Math.min(...sortedDepths);
  const maxDepthVal = Math.max(...sortedDepths);
  const depthRange = maxDepthVal - minDepth;

  const maxNodesInLevel = Math.max(...sortedDepths.map((d) => depthGroups.get(d)!.length), 1);
  const neededW = Math.max(maxNodesInLevel * (NODE_W + NODE_GAP) + NODE_GAP, MIN_SVG_W);
  const sw = Math.max(neededW, containerWidth);

  const nodes: LayoutNode[] = [];
  for (const d of sortedDepths) {
    const ids = depthGroups.get(d)!;
    const totalW = ids.length * NODE_W + (ids.length - 1) * NODE_GAP;
    const startX = (sw - totalW) / 2;
    for (let i = 0; i < ids.length; i++) {
      const todo = todoMap.get(ids[i])!;
      const isCenter = todo.id === goalId;
      const isGoal = todo.nodeType === 'goal';
      const h = isCenter || isGoal ? GOAL_H : NODE_H;
      nodes.push({
        todo,
        x: startX + i * (NODE_W + NODE_GAP) + NODE_W / 2,
        y: TOP_PAD + (d - minDepth) * LEVEL_H + h / 2,
        depth: d,
        componentId: goalId,
        hasParent: !!todo.parentId,
      });
    }
  }

  const sh = TOP_PAD * 2 + (depthRange + 1) * LEVEL_H + GOAL_H;

  // Parent-child edges within the subgraph (goal -> goal via parentId)
  const parentChildEdges: { fromId: string; toId: string }[] = [];
  for (const todo of todos) {
    if (todo.parentId && nodeIds.has(todo.parentId) && todo.nodeType === 'goal') {
      const parent = todoMap.get(todo.parentId);
      if (parent?.nodeType === 'goal') {
        parentChildEdges.push({ fromId: todo.parentId, toId: todo.id });
      }
    }
  }

  return {
    nodes,
    actionEdges,
    parentChildEdges,
    width: sw,
    height: sh,
  };
}

/* ------------------------------------------------------------------ */
/*  Goal Road Layout (focused Road-to-Goal view)                       */
/* ------------------------------------------------------------------ */

const ROAD_TYPES: TodoRelationType[] = ['parent_of', 'achieves', 'ordered_before'];

export function computeGoalRoadLayout(
  centerId: string,
  todos: Todo[],
  relations: TodoRelation[],
  layersAround: number,
  containerWidth: number
): LayoutResult {
  const todoMap = new Map(todos.map((t) => [t.id, t]));

  // Build adjacency from parentId (goal -> goal only)
  const upNeighbors = new Map<string, string[]>();
  const downNeighbors = new Map<string, string[]>();

  for (const todo of todos) {
    upNeighbors.set(todo.id, []);
    downNeighbors.set(todo.id, []);
  }

  for (const todo of todos) {
    if (todo.parentId && todo.nodeType === 'goal') {
      const parent = todoMap.get(todo.parentId);
      if (parent?.nodeType === 'goal') {
        upNeighbors.get(todo.id)!.push(todo.parentId);
        downNeighbors.get(todo.parentId)!.push(todo.id);
      }
    }
  }

  // Build adjacency from road-to-goal relations
  const spawnedBySource = new Map<string, string[]>();
  const orderedBySource = new Map<string, string[]>();
  const achievesBySource = new Map<string, string[]>();

  for (const rel of relations) {
    const fromTodo = todoMap.get(rel.fromTodoId);
    const toTodo = todoMap.get(rel.toTodoId);
    if (!fromTodo || !toTodo) continue;

    if (rel.type === 'parent_of' || rel.type === 'source_from') {
      if (fromTodo.nodeType === 'goal' && toTodo.nodeType === 'goal') {
        if (!spawnedBySource.has(rel.fromTodoId)) spawnedBySource.set(rel.fromTodoId, []);
        spawnedBySource.get(rel.fromTodoId)!.push(rel.toTodoId);
      }
    } else if (rel.type === 'ordered_before') {
      if (fromTodo.nodeType === toTodo.nodeType) {
        if (!orderedBySource.has(rel.fromTodoId)) orderedBySource.set(rel.fromTodoId, []);
        orderedBySource.get(rel.fromTodoId)!.push(rel.toTodoId);
      }
    } else if (rel.type === 'achieves') {
      if (fromTodo.nodeType === 'task' && toTodo.nodeType === 'goal') {
        if (!achievesBySource.has(rel.fromTodoId)) achievesBySource.set(rel.fromTodoId, []);
        achievesBySource.get(rel.fromTodoId)!.push(rel.toTodoId);
      }
    }
  }

  for (const [sourceId, spawnedIds] of spawnedBySource) {
    for (const spawnedId of spawnedIds) {
      upNeighbors.get(spawnedId)!.push(sourceId);
      downNeighbors.get(sourceId)!.push(spawnedId);
    }
  }

  for (const [sourceId, orderedIds] of orderedBySource) {
    for (const orderedId of orderedIds) {
      upNeighbors.get(orderedId)!.push(sourceId);
      downNeighbors.get(sourceId)!.push(orderedId);
    }
  }

  for (const [taskId, goalIds] of achievesBySource) {
    for (const goalId of goalIds) {
      upNeighbors.get(taskId)!.push(goalId);
      downNeighbors.get(goalId)!.push(taskId);
    }
  }

  // BFS from center, up to `layersAround` hops in each direction
  const inNeighborhood = new Set<string>([centerId]);
  const depthMap = new Map<string, number>();
  depthMap.set(centerId, 0);

  const queue: { id: string; depth: number }[] = [{ id: centerId, depth: 0 }];
  const visited = new Set<string>([centerId]);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (depth > -layersAround) {
      for (const neighbor of upNeighbors.get(id) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          inNeighborhood.add(neighbor);
          depthMap.set(neighbor, depth - 1);
          queue.push({ id: neighbor, depth: depth - 1 });
        }
      }
    }

    if (depth < layersAround) {
      for (const neighbor of downNeighbors.get(id) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          inNeighborhood.add(neighbor);
          depthMap.set(neighbor, depth + 1);
          queue.push({ id: neighbor, depth: depth + 1 });
        }
      }
    }
  }

  const relevantTodos = todos.filter((t) => inNeighborhood.has(t.id));
  const nodeIds = new Set(relevantTodos.map((t) => t.id));

  // Parent-child edges within neighborhood (goal -> goal via parentId or parent_of)
  const parentChildEdges: { fromId: string; toId: string }[] = [];
  for (const todo of todos) {
    if (todo.parentId && nodeIds.has(todo.id) && nodeIds.has(todo.parentId) && todo.nodeType === 'goal') {
      const parent = todoMap.get(todo.parentId);
      if (parent?.nodeType === 'goal') {
        parentChildEdges.push({ fromId: todo.parentId, toId: todo.id });
      }
    }
  }
  for (const rel of relations) {
    if ((rel.type === 'parent_of' || rel.type === 'source_from') && nodeIds.has(rel.fromTodoId) && nodeIds.has(rel.toTodoId)) {
      const fromTodo = todoMap.get(rel.fromTodoId);
      const toTodo = todoMap.get(rel.toTodoId);
      if (fromTodo?.nodeType === 'goal' && toTodo?.nodeType === 'goal') {
        parentChildEdges.push({ fromId: rel.fromTodoId, toId: rel.toTodoId });
      }
    }
  }

  // Road edges within neighborhood
  const roadEdges = relations.filter((r) => {
    if (!nodeIds.has(r.fromTodoId) || !nodeIds.has(r.toTodoId)) return false;
    if (!ROAD_TYPES.includes(r.type)) return false;
    const fromTodo = todoMap.get(r.fromTodoId);
    const toTodo = todoMap.get(r.toTodoId);
    if (!fromTodo || !toTodo) return false;
    if (r.type === 'parent_of' && (fromTodo.nodeType !== 'goal' || toTodo.nodeType !== 'goal')) return false;
    if (r.type === 'achieves' && (fromTodo.nodeType !== 'task' || toTodo.nodeType !== 'goal')) return false;
    if (r.type === 'ordered_before' && fromTodo.nodeType !== toTodo.nodeType) return false;
    return true;
  });

  // Position nodes by depth
  const nodes: LayoutNode[] = relevantTodos.map((t) => ({
    todo: t,
    x: 0,
    y: 0,
    depth: depthMap.get(t.id) ?? 0,
    componentId: centerId,
    hasParent: !!t.parentId,
  }));

  const depthGroups = new Map<number, string[]>();
  for (const n of nodes) {
    if (!depthGroups.has(n.depth)) depthGroups.set(n.depth, []);
    depthGroups.get(n.depth)!.push(n.todo.id);
  }

  for (const [, ids] of depthGroups) {
    ids.sort((a, b) => {
      const nodeA = nodes.find((n) => n.todo.id === a)!;
      const nodeB = nodes.find((n) => n.todo.id === b)!;
      const doneA = nodeA.todo.status === 'done' ? 1 : 0;
      const doneB = nodeB.todo.status === 'done' ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return nodeA.todo.title.localeCompare(nodeB.todo.title);
    });
  }

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  const maxNodesInLevel = Math.max(...sortedDepths.map((d) => depthGroups.get(d)!.length), 1);
  const neededW = Math.max(maxNodesInLevel * (NODE_W + NODE_GAP) + NODE_GAP, MIN_SVG_W);
  const sw = Math.max(neededW, containerWidth);

  for (const d of sortedDepths) {
    const ids = depthGroups.get(d)!;
    const totalW = ids.length * NODE_W + (ids.length - 1) * NODE_GAP;
    const startX = (sw - totalW) / 2;
    for (let i = 0; i < ids.length; i++) {
      const node = nodes.find((n) => n.todo.id === ids[i])!;
      const isCenter = node.todo.id === centerId;
      const isGoal = node.todo.nodeType === 'goal';
      const h = isCenter || isGoal ? GOAL_H : NODE_H;
      node.x = startX + i * (NODE_W + NODE_GAP) + NODE_W / 2;
      node.y = TOP_PAD + (d - Math.min(...sortedDepths)) * LEVEL_H + h / 2;
    }
  }

  const minDepth = Math.min(...sortedDepths);
  const maxDepth = Math.max(...sortedDepths);
  const depthRange = maxDepth - minDepth;
  const sh = TOP_PAD * 2 + (depthRange + 1) * LEVEL_H + GOAL_H;

  return {
    nodes,
    actionEdges: [],
    parentChildEdges,
    roadEdges,
    width: sw,
    height: sh,
  };
}

/* ------------------------------------------------------------------ */
/*  Main Layout Function                                               */
/* ------------------------------------------------------------------ */

export function computeLayout(
  todos: Todo[],
  actionEdges: ActionEdge[],
  _relations: TodoRelation[]
): LayoutResult {
  const todoMap = new Map(todos.map((t) => [t.id, t]));
  const allTodoIds = new Set(todos.map((t) => t.id));

  // --- Step 1: Find connected components via action edges ---
  const uf = new UnionFind(allTodoIds);
  for (const edge of actionEdges) {
    if (allTodoIds.has(edge.fromTodoId) && allTodoIds.has(edge.toTodoId)) {
      uf.union(edge.fromTodoId, edge.toTodoId);
    }
  }

  const componentMap = new Map<string, Set<string>>();
  for (const id of allTodoIds) {
    const root = uf.find(id);
    if (!componentMap.has(root)) componentMap.set(root, new Set());
    componentMap.get(root)!.add(id);
  }

  // Split into action-edge components and isolated nodes
  const actionComponents: { goalId: string; todoIds: Set<string> }[] = [];
  const isolatedIds = new Set<string>();

  for (const [, ids] of componentMap) {
    const hasEdges = actionEdges.some(
      (e) => ids.has(e.fromTodoId) && ids.has(e.toTodoId)
    );
    if (hasEdges) {
      // Find the topmost node(s) in this component
      const outgoingCount = new Map<string, number>();
      for (const id of ids) outgoingCount.set(id, 0);
      for (const edge of actionEdges) {
        if (ids.has(edge.fromTodoId) && ids.has(edge.toTodoId)) {
          outgoingCount.set(edge.fromTodoId, (outgoingCount.get(edge.fromTodoId) || 0) + 1);
        }
      }

      // Nodes with outgoing edges are "lower" (pointing up). Nodes with NO outgoing edges are topmost goals.
      // But if there's a cycle, all nodes have outgoing edges. In that case, pick the one with fewest outgoing.
      const idsArray = Array.from(ids);
      let goalId = idsArray[0];
      let minOutgoing = Infinity;
      for (const id of idsArray) {
        const count = outgoingCount.get(id) || 0;
        if (count < minOutgoing) {
          minOutgoing = count;
          goalId = id;
        }
      }

      actionComponents.push({ goalId, todoIds: ids });
    } else {
      for (const id of ids) isolatedIds.add(id);
    }
  }

  // Attach children to their parent's action-edge component if applicable
  for (const id of Array.from(isolatedIds)) {
    const todo = todoMap.get(id);
    if (!todo?.parentId) continue;
    // Find which component the parent belongs to
    for (const comp of actionComponents) {
      if (comp.todoIds.has(todo.parentId)) {
        comp.todoIds.add(id);
        isolatedIds.delete(id);
        break;
      }
    }
  }

  // --- Step 2: Layout each action-edge component ---
  const layoutItems: LayoutItem[] = [];

  for (const comp of actionComponents) {
    const compTodos = Array.from(comp.todoIds)
      .map((id) => todoMap.get(id)!)
      .filter(Boolean);
    const compEdges = actionEdges.filter(
      (e) => comp.todoIds.has(e.fromTodoId) && comp.todoIds.has(e.toTodoId)
    );
    const nodes = hierarchicalLayout(compTodos, compEdges, comp.goalId);
    const bounds = computeBounds(nodes);
    layoutItems.push({
      id: comp.goalId,
      nodes,
      width: bounds.width,
      height: bounds.height,
    });
  }

  // --- Step 3: Group isolated nodes by parent-child trees ---
  // Find root-level isolated nodes (no parent OR parent is not isolated)
  const isolatedRoots: Todo[] = [];
  const isolatedChildren = new Map<string, Todo[]>(); // parentId -> children

  for (const id of isolatedIds) {
    const todo = todoMap.get(id)!;
    if (!todo.parentId || !isolatedIds.has(todo.parentId)) {
      isolatedRoots.push(todo);
    } else {
      const parentId = todo.parentId;
      if (!isolatedChildren.has(parentId)) isolatedChildren.set(parentId, []);
      isolatedChildren.get(parentId)!.push(todo);
    }
  }

  // Collect all descendants for each root
  for (const root of isolatedRoots) {
    const descendants: Todo[] = [];
    const queue = [root.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const children = isolatedChildren.get(id) || [];
      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    const nodes = miniTreeLayout(root, descendants);
    const bounds = computeBounds(nodes);
    layoutItems.push({
      id: `group-${root.id}`,
      nodes,
      width: bounds.width,
      height: bounds.height,
    });
  }

  // --- Step 4: Pack all items into a grid ---
  const maxItemWidth = Math.max(...layoutItems.map((i) => i.width), 400);
  const containerWidth = Math.max(maxItemWidth * 2 + COMPONENT_PAD_X, 1200);
  packItems(layoutItems, containerWidth);

  // --- Step 5: Collect all nodes ---
  const allNodes: LayoutNode[] = [];
  for (const item of layoutItems) {
    allNodes.push(...item.nodes);
  }

  // --- Step 6: Compute parent-child edges ---
  const parentChildEdges: { fromId: string; toId: string }[] = [];
  for (const n of allNodes) {
    if (n.todo.parentId && todoMap.has(n.todo.parentId)) {
      parentChildEdges.push({ fromId: n.todo.id, toId: n.todo.parentId });
    }
  }

  // --- Step 7: Compute total bounds ---
  const totalWidth = Math.max(
    ...layoutItems.map((i) => {
      const maxNodeX = Math.max(...i.nodes.map((n) => n.x + NODE_W / 2));
      return maxNodeX + COMPONENT_PAD_X;
    }),
    containerWidth
  );
  const totalHeight = Math.max(
    ...layoutItems.map((i) => {
      const maxNodeY = Math.max(...i.nodes.map((n) => n.y + NODE_H / 2));
      return maxNodeY + COMPONENT_PAD_Y;
    }),
    400
  );

  return {
    nodes: allNodes,
    actionEdges,
    parentChildEdges,
    width: totalWidth,
    height: totalHeight,
  };
}

/* ------------------------------------------------------------------ */
/*  Unified Graph Layout (all goals + tasks, all relations)            */
/* ------------------------------------------------------------------ */

export function computeUnifiedGraphLayout(
  todos: Todo[],
  relations: TodoRelation[],
  containerWidth: number
): LayoutResult {
  const todoMap = new Map(todos.map((t) => [t.id, t]));
  const nodeIds = new Set(todos.map((t) => t.id));

  if (todos.length === 0) {
    return {
      nodes: [],
      actionEdges: [],
      parentChildEdges: [],
      roadEdges: [],
      width: Math.max(MIN_SVG_W, containerWidth),
      height: 400,
    };
  }

  // Build undirected adjacency for weakly-connected components.
  const undirectedNeighbors = new Map<string, string[]>();
  for (const t of todos) undirectedNeighbors.set(t.id, []);
  for (const rel of relations) {
    if (!nodeIds.has(rel.fromTodoId) || !nodeIds.has(rel.toTodoId)) continue;
    undirectedNeighbors.get(rel.fromTodoId)!.push(rel.toTodoId);
    undirectedNeighbors.get(rel.toTodoId)!.push(rel.fromTodoId);
  }

  const components: Set<string>[] = [];
  const visited = new Set<string>();
  for (const t of todos) {
    if (visited.has(t.id)) continue;
    const component = new Set<string>();
    const queue = [t.id];
    visited.add(t.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      component.add(id);
      for (const neighbor of undirectedNeighbors.get(id)!) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  const layoutItems: LayoutItem[] = [];

  for (const component of components) {
    const componentId = Array.from(component).sort()[0];
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    for (const id of component) {
      outgoing.set(id, []);
      incoming.set(id, []);
    }
    for (const rel of relations) {
      if (!component.has(rel.fromTodoId) || !component.has(rel.toTodoId)) continue;
      outgoing.get(rel.fromTodoId)!.push(rel.toTodoId);
      incoming.get(rel.toTodoId)!.push(rel.fromTodoId);
    }

    // Roots are nodes with no incoming edges inside this component.
    let roots = Array.from(component).filter((id) => incoming.get(id)!.length === 0);
    if (roots.length === 0) {
      // Pure cycle: prefer goal nodes, then highest out-degree.
      roots = Array.from(component)
        .sort((a, b) => {
          const typeDiff = (todoMap.get(b)?.nodeType === 'goal' ? 1 : 0) - (todoMap.get(a)?.nodeType === 'goal' ? 1 : 0);
          if (typeDiff !== 0) return typeDiff;
          return outgoing.get(b)!.length - outgoing.get(a)!.length;
        })
        .slice(0, Math.min(3, component.size));
    }

    // Assign depths using longest-path layering from roots.
    const depth = new Map<string, number>();
    const queue = [...roots];
    for (const root of roots) depth.set(root, 0);

    while (queue.length > 0) {
      const id = queue.shift()!;
      const d = depth.get(id)!;
      for (const next of outgoing.get(id)!) {
        if (!depth.has(next) || depth.get(next)! < d + 1) {
          depth.set(next, d + 1);
          if (!queue.includes(next)) queue.push(next);
        }
      }
    }

    // Remaining nodes are in cycles: place them one level below their deepest predecessor.
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of component) {
        if (depth.has(id)) continue;
        const preds = incoming.get(id)!.filter((pid) => depth.has(pid));
        if (preds.length > 0) {
          depth.set(id, Math.max(...preds.map((pid) => depth.get(pid)!)) + 1);
          changed = true;
        }
      }
    }

    let maxDepth = Math.max(0, ...Array.from(depth.values()));
    for (const id of component) {
      if (!depth.has(id)) {
        depth.set(id, maxDepth + 1);
      }
    }
    maxDepth = Math.max(0, ...Array.from(depth.values()));

    const depthGroups = new Map<number, string[]>();
    for (const [id, d] of depth) {
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(id);
    }

    for (const [, ids] of depthGroups) {
      ids.sort((a, b) => {
        const ta = todoMap.get(a)!;
        const tb = todoMap.get(b)!;
        const doneA = ta.status === 'done' ? 1 : 0;
        const doneB = tb.status === 'done' ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        if (ta.nodeType !== tb.nodeType) return ta.nodeType === 'goal' ? -1 : 1;
        return ta.title.localeCompare(tb.title);
      });
    }

    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
    const maxNodesInLevel = Math.max(...sortedDepths.map((d) => depthGroups.get(d)!.length), 1);
    const neededW = Math.max(maxNodesInLevel * (NODE_W + NODE_GAP) + NODE_GAP, MIN_SVG_W);

    const nodes: LayoutNode[] = [];
    for (const d of sortedDepths) {
      const ids = depthGroups.get(d)!;
      const totalW = ids.length * NODE_W + (ids.length - 1) * NODE_GAP;
      const startX = (neededW - totalW) / 2;
      for (let i = 0; i < ids.length; i++) {
        const todo = todoMap.get(ids[i])!;
        const isGoal = todo.nodeType === 'goal';
        nodes.push({
          todo,
          x: startX + i * (NODE_W + NODE_GAP) + NODE_W / 2,
          y: TOP_PAD + d * LEVEL_H + (isGoal ? GOAL_H : NODE_H) / 2,
          depth: d,
          componentId,
          hasParent: false,
        });
      }
    }

    const bounds = computeBounds(nodes);
    layoutItems.push({
      id: componentId,
      nodes,
      width: bounds.width,
      height: bounds.height,
    });
  }

  const maxItemWidth = Math.max(...layoutItems.map((i) => i.width), MIN_SVG_W);
  const packWidth = Math.max(maxItemWidth * 2 + COMPONENT_PAD_X, containerWidth);
  packItems(layoutItems, packWidth);

  const allNodes: LayoutNode[] = [];
  for (const item of layoutItems) allNodes.push(...item.nodes);

  const totalWidth = Math.max(
    ...layoutItems.map((i) => {
      const maxNodeX = Math.max(
        ...i.nodes.map((n) => n.x + (n.todo.nodeType === 'goal' ? GOAL_W : NODE_W) / 2)
      );
      return maxNodeX + COMPONENT_PAD_X;
    }),
    packWidth
  );
  const totalHeight = Math.max(
    ...layoutItems.map((i) => {
      const maxNodeY = Math.max(
        ...i.nodes.map((n) => n.y + (n.todo.nodeType === 'goal' ? GOAL_H : NODE_H) / 2)
      );
      return maxNodeY + COMPONENT_PAD_Y;
    }),
    400
  );

  return {
    nodes: allNodes,
    actionEdges: [],
    parentChildEdges: [],
    roadEdges: relations,
    width: totalWidth,
    height: totalHeight,
  };
}
