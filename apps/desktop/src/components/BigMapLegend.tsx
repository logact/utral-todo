import { Lightbulb, Wrench, ArrowRight, Circle } from 'lucide-react';
import { EDGE_COLORS } from './BigMapConstants';

export function BigMapLegend() {
  return (
    <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg p-4 z-30 space-y-3">
      {/* Edge types */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Edges
        </p>
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3 h-3" style={{ color: EDGE_COLORS.insight }} />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Insight</span>
        </div>
        <div className="flex items-center gap-2">
          <Wrench className="w-3 h-3" style={{ color: EDGE_COLORS.try }} />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Try</span>
        </div>
        <div className="flex items-center gap-2">
          <ArrowRight className="w-3 h-3" style={{ color: EDGE_COLORS.pre_do }} />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Pre-do</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0 border-t border-dashed border-slate-400" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Parent-child</span>
        </div>
      </div>

      {/* Node types */}
      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Nodes
        </p>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Goal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-slate-200 bg-white dark:bg-slate-800" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Regular</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-slate-200 bg-white dark:bg-slate-800 flex items-center justify-center">
            <div className="w-1 h-2 rounded-full bg-teal-400" />
          </div>
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Child todo</span>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Status
        </p>
        <div className="flex items-center gap-2">
          <Circle className="w-2.5 h-2.5 text-slate-300 dark:text-slate-500" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">In progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Done</span>
        </div>
      </div>
    </div>
  );
}
