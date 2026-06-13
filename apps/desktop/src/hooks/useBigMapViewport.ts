import { useState, useCallback, useRef, useEffect } from 'react';

export interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_FACTOR = 1.15;

export function useBigMapViewport() {
  const [viewport, setViewport] = useState<ViewportState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const dragStartRef = useRef({ x: 0, y: 0 });
  const viewportStartRef = useRef({ offsetX: 0, offsetY: 0 });
  const pendingDragRef = useRef<{ dx: number; dy: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const flushDrag = useCallback(() => {
    rafRef.current = null;
    if (pendingDragRef.current) {
      const { dx, dy } = pendingDragRef.current;
      pendingDragRef.current = null;
      setViewport((prev) => ({
        ...prev,
        offsetX: viewportStartRef.current.offsetX + dx,
        offsetY: viewportStartRef.current.offsetY + dy,
      }));
    }
  }, []);

  const zoomIn = useCallback(() => {
    setViewport((prev) => {
      const newScale = Math.min(prev.scale * ZOOM_FACTOR, MAX_SCALE);
      return { ...prev, scale: newScale };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((prev) => {
      const newScale = Math.max(prev.scale / ZOOM_FACTOR, MIN_SCALE);
      return { ...prev, scale: newScale };
    });
  }, []);

  const zoomToFit = useCallback(
    (contentWidth: number, contentHeight: number, containerWidth: number, containerHeight: number) => {
      const padding = 40;
      const scaleX = (containerWidth - padding * 2) / contentWidth;
      const scaleY = (containerHeight - padding * 2) / contentHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      const offsetX = (containerWidth - contentWidth * scale) / 2;
      const offsetY = (containerHeight - contentHeight * scale) / 2;
      setViewport({ scale, offsetX, offsetY });
    },
    []
  );

  const centerOn = useCallback(
    (nodeX: number, nodeY: number, containerWidth: number, containerHeight: number, scale?: number) => {
      const s = scale ?? viewportRef.current.scale;
      const offsetX = containerWidth / 2 - nodeX * s;
      const offsetY = containerHeight / 2 - nodeY * s;
      setViewport({ scale: s, offsetX, offsetY });
    },
    []
  );

  const reset = useCallback(() => {
    setViewport({ scale: 1, offsetX: 0, offsetY: 0 });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent, containerRect: DOMRect) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
      setViewport((prev) => {
        const newScale = Math.min(Math.max(prev.scale * delta, MIN_SCALE), MAX_SCALE);
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;
        const scaleRatio = newScale / prev.scale;
        const newOffsetX = mouseX - (mouseX - prev.offsetX) * scaleRatio;
        const newOffsetY = mouseY - (mouseY - prev.offsetY) * scaleRatio;
        return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
      });
    },
    []
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    viewportStartRef.current = {
      offsetX: viewportRef.current.offsetX,
      offsetY: viewportRef.current.offsetY,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      pendingDragRef.current = { dx, dy };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushDrag);
      }
    },
    [isDragging, flushDrag]
  );

  const handleMouseUp = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    flushDrag();
    setIsDragging(false);
  }, [flushDrag]);

  return {
    viewport,
    isDragging,
    zoomIn,
    zoomOut,
    zoomToFit,
    centerOn,
    reset,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
