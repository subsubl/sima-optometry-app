import React, { useEffect, useState } from 'react';
import { ExamState } from '../types/exam';
import { ChartStage } from '../components/tests/ChartStage';
import { useClinicalHotkeys } from '../hooks/useClinicalHotkeys';

interface PatientDisplayViewProps {
  state: ExamState;
  updateState: (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => void;
  randomizeOptotypes: () => void;
  onSwitchToDoctor: () => void;
}

export const PatientDisplayView: React.FC<PatientDisplayViewProps> = ({
  state,
  updateState,
  randomizeOptotypes,
  onSwitchToDoctor,
}) => {
  const [showHud, setShowHud] = useState(false);

  useClinicalHotkeys({ state, updateState, randomizeOptotypes });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleMouseMove = () => {
      setShowHud(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setShowHud(false);
      }, 1800);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      className={`relative w-dvw h-dvh overflow-hidden select-none ${
        showHud ? 'cursor-default' : 'cursor-none'
      }`}
    >
      <ChartStage
        state={state}
        isPatientScreen={true}
        scaleFactor={1.0}
        onUpdateState={updateState}
      />

      {state.showCalibrationOnPatient && (
        <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center p-8 text-white font-mono">
          <div className="bg-[#0D0F14] border border-[#262B38] p-6 flex flex-col items-center text-center shadow-2xl space-y-4">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-400">
              OPTICAL CALIBRATION REFERENCE
            </div>
            <div
              className="h-12 bg-red-600 flex items-center justify-between px-3 border-x-4 border-white"
              style={{ width: `${state.calibration.referenceBarPixels}px` }}
            >
              <span className="text-sm font-bold">|◄</span>
              <span className="text-sm font-bold">
                {state.calibration.measuredBarMm.toFixed(1)} mm ({Math.round(state.calibration.referenceBarPixels)} px)
              </span>
              <span className="text-sm font-bold">►|</span>
            </div>
          </div>
        </div>
      )}

      <div
        className={`absolute top-3 right-3 z-40 flex items-center gap-1 bg-[#0D0F14]/90 border border-[#262B38] p-1 font-mono text-[11px] transition-opacity duration-200 ${
          showHud ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={toggleFullscreen}
          className="px-2.5 py-1 bg-[#161922] hover:bg-[#222736] text-neutral-300 uppercase cursor-pointer"
        >
          Fullscreen
        </button>
        <button
          type="button"
          onClick={onSwitchToDoctor}
          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase cursor-pointer"
        >
          Console
        </button>
      </div>
    </div>
  );
};
