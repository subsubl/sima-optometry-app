import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ExamState } from '../../types/exam';
import { ChartStage } from '../tests/ChartStage';

interface MiniPatientPreviewProps {
  state: ExamState;
  isOpen: boolean;
  onClose: () => void;
  onOpenExternal?: () => void;
  onUpdateState?: (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => void;
}

type PreviewSize = 'sm' | 'md' | 'lg';

const SIZE_CONFIGS: Record<PreviewSize, { widthPx: number; scaleFactor: number; label: string }> = {
  sm: { widthPx: 260, scaleFactor: 0.22, label: 'SM' },
  md: { widthPx: 340, scaleFactor: 0.28, label: 'MD' },
  lg: { widthPx: 440, scaleFactor: 0.36, label: 'LG' },
};

export const MiniPatientPreview: React.FC<MiniPatientPreviewProps> = ({
  state,
  isOpen,
  onClose,
  onOpenExternal,
  onUpdateState,
}) => {
  const [size, setSize] = useState<PreviewSize>('md');
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
    pointerId: number | null;
  }>({
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0,
    pointerId: null,
  });
  const cardRef = useRef<HTMLElement>(null);

  // Initialize position to bottom-right corner when mounted
  useEffect(() => {
    if (typeof window !== 'undefined' && position === null) {
      const config = SIZE_CONFIGS[size];
      const initialX = Math.max(16, window.innerWidth - config.widthPx - 24);
      const initialY = Math.max(70, window.innerHeight - 300);
      setPosition({ x: initialX, y: initialY });
    }
  }, [position, size]);

  // Handle window resizing to keep preview on-screen
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return null;
        const config = SIZE_CONFIGS[size];
        const maxX = Math.max(8, window.innerWidth - config.widthPx - 8);
        const maxY = Math.max(8, window.innerHeight - 60);
        return {
          x: Math.min(Math.max(8, prev.x), maxX),
          y: Math.min(Math.max(8, prev.y), maxY),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [size]);

  // Pointer Drag Handlers (Unified Touchscreen, Stylus & Mouse)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only allow drag on header element (not on buttons or clickable controls)
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;

      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Fallback for environments lacking pointer capture
      }

      const currentX =
        position?.x ?? Math.max(16, window.innerWidth - SIZE_CONFIGS[size].widthPx - 24);
      const currentY = position?.y ?? Math.max(70, window.innerHeight - 300);

      dragStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startX: currentX,
        startY: currentY,
        pointerId: e.pointerId,
      };
      setIsDragging(true);
    },
    [position, size]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      if (
        dragStartRef.current.pointerId !== null &&
        e.pointerId !== dragStartRef.current.pointerId
      ) {
        return;
      }

      const dx = e.clientX - dragStartRef.current.pointerX;
      const dy = e.clientY - dragStartRef.current.pointerY;
      const config = SIZE_CONFIGS[size];
      const maxX = Math.max(8, window.innerWidth - config.widthPx - 8);
      const maxY = Math.max(8, window.innerHeight - 60);

      setPosition({
        x: Math.min(Math.max(8, dragStartRef.current.startX + dx), maxX),
        y: Math.min(Math.max(8, dragStartRef.current.startY + dy), maxY),
      });
    },
    [isDragging, size]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors
      }
      dragStartRef.current.pointerId = null;
      setIsDragging(false);
    },
    [isDragging]
  );

  // Safety net: in case pointerup happens outside window or capture is lost
  useEffect(() => {
    if (!isDragging) return;
    const handleGlobalPointerUp = () => {
      setIsDragging(false);
      dragStartRef.current.pointerId = null;
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  const currentConfig = SIZE_CONFIGS[size];

  return (
    <aside
      ref={cardRef}
      style={{
        position: 'fixed',
        left: position ? `${position.x}px` : undefined,
        top: position ? `${position.y}px` : undefined,
        right: position ? undefined : '24px',
        bottom: position ? undefined : '24px',
        width: `${currentConfig.widthPx}px`,
      }}
      className={`z-50 flex flex-col bg-[#08090C]/95 border border-[#283042] shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-sm overflow-hidden select-none backdrop-blur-md transition-shadow ${
        isDragging ? 'shadow-amber-500/20 border-amber-500/60 cursor-grabbing' : ''
      }`}
      aria-label="Floating Patient View Preview"
    >
      {/* Header Deck & Controls (Draggable Handle with Touchscreen & Mouse Pointer Events) */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
        className="bg-[#0E1118] border-b border-[#1E2535] px-2.5 py-1.5 flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing font-mono text-[11px] touch-none select-none"
      >
        <div className="flex items-center gap-1.5 pointer-events-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-bold tracking-wider text-neutral-200 text-[10px] uppercase">
            PATIENT PREVIEW
          </span>
          <span className="text-[9px] px-1 py-0.2 bg-emerald-950/80 text-emerald-300 border border-emerald-700/40 rounded-xs uppercase">
            LIVE
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Size Cycle */}
          <button
            type="button"
            onClick={() => {
              setSize((prev) => (prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm'));
            }}
            className="px-1.5 py-0.5 bg-[#141824] hover:bg-[#1E2436] text-[10px] font-bold text-neutral-300 hover:text-white border border-[#232B3E] rounded-xs cursor-pointer"
            title={`Current size: ${currentConfig.label}. Click to cycle (SM -> MD -> LG)`}
          >
            {currentConfig.label}
          </button>

          {/* Open in external tab / window */}
          {onOpenExternal && (
            <button
              type="button"
              onClick={onOpenExternal}
              className="p-1 bg-[#141824] hover:bg-[#1E2436] text-neutral-300 hover:text-amber-400 border border-[#232B3E] rounded-xs cursor-pointer"
              title="Open Patient Display in New Window"
              aria-label="Open in new window"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}

          {/* Close preview (Strictly ON/OFF Toggle - No Minimize) */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 bg-[#141824] hover:bg-red-950 text-neutral-400 hover:text-red-300 border border-[#232B3E] rounded-xs cursor-pointer"
            title="Turn Off Preview (Toggle via top bar [PREVIEW [P]])"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Live Optical Canvas Frame (Exact Patient Mirror isPatientScreen={true}) */}
      <div
        className="relative w-full bg-black overflow-hidden border-b border-[#1E2535]"
        style={{ aspectRatio: '16 / 10' }}
      >
        {/* Reticle Corner Marks */}
        <div className="absolute top-1 left-1 w-2 h-2 border-t border-l border-neutral-600/60 z-20 pointer-events-none" />
        <div className="absolute top-1 right-1 w-2 h-2 border-t border-r border-neutral-600/60 z-20 pointer-events-none" />
        <div className="absolute bottom-1 left-1 w-2 h-2 border-b border-l border-neutral-600/60 z-20 pointer-events-none" />
        <div className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-neutral-600/60 z-20 pointer-events-none" />

        <ChartStage
          state={state}
          isPatientScreen={true}
          scaleFactor={currentConfig.scaleFactor}
          onUpdateState={onUpdateState}
        />

        {/* Blackout Indicator Badge if Active */}
        {state.isBlackout && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center pointer-events-none z-30">
            <span className="text-[10px] font-mono font-bold text-red-500 uppercase tracking-widest">
              ● BLACKOUT ACTIVE
            </span>
          </div>
        )}
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="bg-[#0B0D13] px-2.5 py-1 flex items-center justify-between font-mono text-[9px] text-neutral-400">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-amber-400 font-bold uppercase truncate">
            {state.activeCategory === 'va_chart'
              ? `${state.optotypeSet.toUpperCase()} • ${state.isolationMode.toUpperCase()}`
              : state.activeCategory.replace('_', ' ').toUpperCase()}
          </span>
          {state.invertPolarity && (
            <span className="px-1 bg-white text-black font-bold">INV</span>
          )}
          {state.duochromeOverlay !== 'none' && (
            <span className="text-red-400 font-bold">R/G</span>
          )}
        </div>
        <div className="shrink-0 text-neutral-400">
          {state.calibration.directDistanceMeters}m • {state.calibration.measuredBarMm}mm
        </div>
      </div>
    </aside>
  );
};
