import React, { useEffect, useId, useRef } from 'react';
import { CalibrationConfig } from '../../types/exam';
import {
  calculateOptotypeHeightMm,
  calculateOptotypeHeightPx,
  getEffectiveDistanceMeters,
  getPixelsPerMm,
} from '../../engine/acuityMath';

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  calibration: CalibrationConfig;
  showCalibrationOnPatient: boolean;
  showNotationOnPatient: boolean;
  isConnected: boolean;
  connectedClients?: number;
  onUpdateCalibration: (
    next: CalibrationConfig,
    showOnPatient?: boolean,
    showNotation?: boolean
  ) => void;
}

export const CalibrationDialog: React.FC<CalibrationDialogProps> = ({
  isOpen,
  onClose,
  calibration,
  showCalibrationOnPatient,
  showNotationOnPatient,
  isConnected,
  connectedClients = 1,
  onUpdateCalibration,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  const effectiveMeters = getEffectiveDistanceMeters(calibration);
  const ppm = getPixelsPerMm(calibration);
  const dpi = Math.round(ppm * 25.4);
  const mm2020 = calculateOptotypeHeightMm(effectiveMeters, 0.0);
  const px2020 = calculateOptotypeHeightPx(calibration, 0.0);
  const mm20200 = calculateOptotypeHeightMm(effectiveMeters, 1.0);
  const px20200 = calculateOptotypeHeightPx(calibration, 1.0);

  const patch = (partial: Partial<CalibrationConfig>) => {
    onUpdateCalibration({ ...calibration, ...partial });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
      className="m-auto w-full max-w-2xl bg-[#0D0F14] text-[#E2E8F0] border border-[#262B38] shadow-2xl p-0 backdrop:bg-black/80"
    >
      {/* Top Instrument Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#13161F] border-b border-[#262B38]">
        <div className="flex items-center gap-3">
          <span className="w-2 h-4 bg-amber-500 inline-block" />
          <h2 id={titleId} className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-white">
            System Settings & Optical Calibration
          </h2>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="px-2.5 py-1 bg-[#1C202B] hover:bg-[#282E3D] border border-[#2E3446] text-xs font-mono text-neutral-300 cursor-pointer"
        >
          ESC
        </button>
      </div>

      <div className="p-5 space-y-5 text-xs">
        {/* Section 1: Lane Distance & Optical Folding */}
        <div className="bg-[#12151E] border border-[#222734] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E2330] pb-2.5">
            <span className="font-mono font-bold uppercase tracking-wider text-amber-400">
              01 // Exam Lane Geometry & Distance
            </span>
            <div className="flex border border-[#2D3343] bg-[#090B0E]">
              <button
                type="button"
                onClick={() => patch({ isMirroredRoom: false })}
                className={`px-3 py-1 font-mono text-[11px] uppercase cursor-pointer ${
                  !calibration.isMirroredRoom
                    ? 'bg-amber-500 text-black font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Direct Path
              </button>
              <button
                type="button"
                onClick={() => patch({ isMirroredRoom: true })}
                className={`px-3 py-1 font-mono text-[11px] uppercase cursor-pointer ${
                  calibration.isMirroredRoom
                    ? 'bg-amber-500 text-black font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Mirrored Fold
              </button>
            </div>
          </div>

          {!calibration.isMirroredRoom ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between font-mono">
                <span className="text-neutral-400">PATIENT TO DISPLAY DISTANCE</span>
                <span className="text-sm font-bold text-white">
                  {calibration.directDistanceMeters.toFixed(2)} m / {(calibration.directDistanceMeters * 3.28084).toFixed(1)} ft
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={8.0}
                step={0.05}
                value={calibration.directDistanceMeters}
                onChange={(e) => patch({ directDistanceMeters: Number(e.target.value) })}
                className="w-full"
              />
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {[
                  { label: '6.0m (20ft)', val: 6.0 },
                  { label: '4.0m (13ft)', val: 4.0 },
                  { label: '3.0m (10ft)', val: 3.0 },
                  { label: '2.0m', val: 2.0 },
                  { label: '0.4m (Near)', val: 0.4 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => patch({ directDistanceMeters: preset.val })}
                    className={`py-1.5 font-mono text-[11px] border cursor-pointer ${
                      Math.abs(calibration.directDistanceMeters - preset.val) < 0.03
                        ? 'bg-[#1E293B] border-amber-500 text-amber-300 font-bold'
                        : 'bg-[#090B0E] border-[#222734] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 font-mono">
              <div>
                <div className="flex justify-between text-neutral-400 mb-1">
                  <span>PATIENT → MIRROR</span>
                  <span className="text-white font-bold">{calibration.patientToMirrorMeters.toFixed(2)} m</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={5.0}
                  step={0.05}
                  value={calibration.patientToMirrorMeters}
                  onChange={(e) => patch({ patientToMirrorMeters: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-neutral-400 mb-1">
                  <span>MIRROR → MONITOR</span>
                  <span className="text-white font-bold">{calibration.mirrorToScreenMeters.toFixed(2)} m</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={5.0}
                  step={0.05}
                  value={calibration.mirrorToScreenMeters}
                  onChange={(e) => patch({ mirrorToScreenMeters: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Screen Millimeter Calibration */}
        <div className="bg-[#12151E] border border-[#222734] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E2330] pb-2.5">
            <span className="font-mono font-bold uppercase tracking-wider text-amber-400">
              02 // Monitor Pixel Pitch Calibration
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateCalibration(
                  calibration,
                  !showCalibrationOnPatient,
                  showNotationOnPatient
                )
              }
              className={`px-3 py-1 font-mono text-[11px] uppercase border cursor-pointer ${
                showCalibrationOnPatient
                  ? 'bg-emerald-500 text-black border-emerald-400 font-bold'
                  : 'bg-[#090B0E] text-neutral-300 border-[#2D3343] hover:border-neutral-500'
              }`}
            >
              {showCalibrationOnPatient
                ? '● Projecting Bar on Patient Screen'
                : 'Project Bar on Patient Screen'}
            </button>
          </div>

          <div className="flex flex-col items-center justify-center py-3 bg-[#090B0E] border border-[#1E2330] overflow-x-auto">
            <div
              className="h-7 bg-red-600 flex items-center justify-between px-2 border-x-2 border-white font-mono text-[11px] font-bold text-white"
              style={{ width: `${calibration.referenceBarPixels}px` }}
            >
              <span>|◄</span>
              <span>
                {calibration.measuredBarMm.toFixed(1)} mm ({Math.round(calibration.referenceBarPixels)} px)
              </span>
              <span>►|</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
            <div>
              <div className="flex justify-between text-neutral-400 mb-1">
                <span>REFERENCE BAR PIXELS</span>
                <span className="text-white">{Math.round(calibration.referenceBarPixels)} px</span>
              </div>
              <input
                type="range"
                min={120}
                max={600}
                step={0.5}
                value={calibration.referenceBarPixels}
                onChange={(e) => patch({ referenceBarPixels: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <div className="text-neutral-400 mb-1">MEASURED LENGTH (MM)</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={20}
                  max={500}
                  step={0.1}
                  value={calibration.measuredBarMm}
                  onChange={(e) => patch({ measuredBarMm: Math.max(10, Number(e.target.value)) })}
                  className="w-24 px-2.5 py-1 bg-[#090B0E] border border-[#2D3343] text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => patch({ measuredBarMm: 85.6 })}
                  className="px-2.5 py-1 bg-[#1A1E29] hover:bg-[#252B3B] border border-[#2D3343] text-[11px] text-neutral-300 cursor-pointer"
                >
                  ID Card 85.6mm
                </button>
                <button
                  type="button"
                  onClick={() => patch({ measuredBarMm: 100.0 })}
                  className="px-2.5 py-1 bg-[#1A1E29] hover:bg-[#252B3B] border border-[#2D3343] text-[11px] text-neutral-300 cursor-pointer"
                >
                  Ruler 100mm
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Patient Monitor Options & Telemetry */}
        <div className="bg-[#12151E] border border-[#222734] p-4 flex flex-wrap items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-3">
            <span className="text-neutral-400">PATIENT MONITOR NOTATION OVERLAY:</span>
            <button
              type="button"
              onClick={() =>
                onUpdateCalibration(
                  calibration,
                  showCalibrationOnPatient,
                  !showNotationOnPatient
                )
              }
              className={`px-3 py-1 text-[11px] uppercase border cursor-pointer ${
                showNotationOnPatient
                  ? 'bg-amber-500 text-black border-amber-400 font-bold'
                  : 'bg-[#090B0E] text-neutral-400 border-[#2D3343]'
              }`}
            >
              {showNotationOnPatient ? 'VISIBLE ON PATIENT SCREEN' : 'HIDDEN (PATIENT BLINDED)'}
            </button>
          </div>

          <div className="text-[11px] text-neutral-400">
            SYNC: <span className={isConnected ? 'text-emerald-400' : 'text-amber-400'}>{isConnected ? 'ONLINE' : 'STANDALONE'}</span> ({connectedClients} DISPLAYS)
          </div>
        </div>

        {/* Optical Telemetry Strip */}
        <div className="grid grid-cols-4 gap-2 font-mono bg-[#090B0E] border border-[#1E2330] p-3 text-center">
          <div>
            <div className="text-[10px] text-neutral-500">OPTICAL PATH</div>
            <div className="text-xs font-bold text-white mt-0.5">
              {effectiveMeters.toFixed(2)}m ({(effectiveMeters * 3.28084).toFixed(1)}ft)
            </div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500">PITCH / DPI</div>
            <div className="text-xs font-bold text-amber-400 mt-0.5">
              {ppm.toFixed(2)} px/mm ({dpi})
            </div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500">20/20 (0.0)</div>
            <div className="text-xs font-bold text-emerald-400 mt-0.5">
              {mm2020.toFixed(2)}mm / {px2020.toFixed(1)}px
            </div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500">20/200 (1.0)</div>
            <div className="text-xs font-bold text-neutral-200 mt-0.5">
              {mm20200.toFixed(1)}mm / {Math.round(px20200)}px
            </div>
          </div>
        </div>

        <form method="dialog" className="flex justify-end pt-1">
          <button
            type="submit"
            value="save"
            autoFocus
            onClick={() => onUpdateCalibration(calibration, false, showNotationOnPatient)}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            Apply & Close
          </button>
        </form>
      </div>
    </dialog>
  );
};
