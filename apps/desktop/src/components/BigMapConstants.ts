import { Lightbulb, Wrench, ArrowRight } from 'lucide-react';
import type { ActionEdgeType } from '../types';

export const NODE_W = 176;
export const NODE_H = 48;
export const GOAL_W = 200;
export const GOAL_H = 52;
export const LEVEL_H = 110;
export const NODE_GAP = 24;
export const TOP_PAD = 36;
export const MIN_SVG_W = 600;

export const EDGE_COLORS: Record<ActionEdgeType, string> = {
  insight: '#f59e0b',
  try: '#3b82f6',
  pre_do: '#8b5cf6',
};

export const EDGE_LABELS: Record<ActionEdgeType, string> = {
  insight: 'Insight',
  try: 'Try',
  pre_do: 'Pre-do',
};

export const EDGE_ICONS = {
  insight: Lightbulb,
  try: Wrench,
  pre_do: ArrowRight,
};

export const EDGE_DASH = {
  insight: 'none',
  try: '5,4',
  pre_do: '8,4',
};

export const COMPONENT_PAD_X = 80;
export const COMPONENT_PAD_Y = 60;
export const ISOLATED_COLS = 6;
