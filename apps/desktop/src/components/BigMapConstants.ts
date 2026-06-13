import { ArrowRight, GitBranch, Target, ListOrdered } from 'lucide-react';
import type { ActionEdgeTypeAll, TodoRelationType } from '../types';

export const NODE_W = 64;
export const NODE_H = 28;
export const GOAL_W = 80;
export const GOAL_H = 32;
export const LEVEL_H = 80;
export const NODE_GAP = 24;
export const TOP_PAD = 36;
export const MIN_SVG_W = 600;

// Circle node rendering sizes
export const NODE_CIRCLE_SIZE = 20;
export const GOAL_CIRCLE_SIZE = 24;

export const SATELLITE_SIZE = 16;
export const SATELLITE_GAP = 20;
export const SATELLITE_OFFSET = 16;

export const EDGE_COLORS: Record<ActionEdgeTypeAll, string> = {
  pre_do: '#8b5cf6',
  parent_child: '#64748b',
  to_achieve: '#f59e0b',
  // Legacy
  insight: '#94a3b8',
  try: '#94a3b8',
};

export const EDGE_LABELS: Record<ActionEdgeTypeAll, string> = {
  pre_do: 'predo',
  parent_child: 'parent-children',
  to_achieve: 'to achieve',
  // Legacy
  insight: 'Legacy',
  try: 'Legacy',
};

export const EDGE_ICONS = {
  pre_do: ArrowRight,
  parent_child: GitBranch,
  to_achieve: Target,
  // Legacy
  insight: ListOrdered,
  try: ListOrdered,
};

export const EDGE_DASH: Record<ActionEdgeTypeAll, string> = {
  pre_do: '8,4',
  parent_child: '5,4',
  to_achieve: 'none',
  // Legacy
  insight: '8,4',
  try: '8,4',
};

export type RoadRelationType = TodoRelationType;

export const ROAD_EDGE_COLORS: Record<RoadRelationType, string> = {
  parent_of: '#94a3b8',
  source_from: '#94a3b8',
  achieves: '#6366f1',
  ordered_before: '#10b981',
  depends_on: '#f59e0b',
  blocked_by: '#ef4444',
  assign_from: '#8b5cf6',
};

export const ROAD_EDGE_LABELS: Record<RoadRelationType, string> = {
  parent_of: 'Parent',
  source_from: 'Source',
  achieves: 'Achieves',
  ordered_before: 'Order',
  depends_on: 'Depends',
  blocked_by: 'Blocked',
  assign_from: 'Assign',
};

export const ROAD_EDGE_ICONS = {
  parent_of: GitBranch,
  source_from: GitBranch,
  achieves: Target,
  ordered_before: ListOrdered,
  depends_on: ArrowRight,
  blocked_by: ArrowRight,
  assign_from: ArrowRight,
};

export const ROAD_EDGE_DASH: Record<RoadRelationType, string | undefined> = {
  parent_of: '5,3',
  source_from: '5,3',
  achieves: undefined,
  ordered_before: '8,4',
  depends_on: '4,4',
  blocked_by: '2,2',
  assign_from: '6,3',
};

export const COMPONENT_PAD_X = 80;
export const COMPONENT_PAD_Y = 60;
export const ISOLATED_COLS = 6;
