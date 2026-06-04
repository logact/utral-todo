import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

interface BigMapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  scale: number;
}

export function BigMapControls({ onZoomIn, onZoomOut, onFit, onReset, scale }: BigMapControlsProps) {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 z-30">
      <button
        onClick={onZoomIn}
        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={onZoomOut}
        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
        title="Zoom out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        onClick={onFit}
        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
        title="Fit to screen"
      >
        <Maximize className="w-4 h-4" />
      </button>
      <button
        onClick={onReset}
        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
        title="Reset view"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      <div className="text-center">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          {Math.round(scale * 100)}%
        </span>
      </div>
    </div>
  );
}
