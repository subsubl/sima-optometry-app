import React, { useState, useEffect } from 'react';
import {
  AcuityNotation,
  AstigmatismMode,
  BinocularMode,
  ChartIsolationMode,
  ClinicalTestCategory,
  CrowdingMode,
  DuochromeOverlay,
  ExamState,
  LetterScoreStatus,
  MacularColorMode,
  OptotypeSetId,
} from '../types/exam';
import {
  ACUITY_LADDER,
  computeScoredLineAcuity,
  formatAcuityNotation,
  generateLineOptotypes,
  getDoctorCheatLabel,
} from '../engine/acuityMath';
import { DEFAULT_D15_SHUFFLED, WORKFLOW_PRESETS } from '../engine/examDefaults';
import { NetworkPairingInfo } from '../hooks/useExamSync';
import {
  CLINICAL_CATEGORY_ORDER,
  useClinicalHotkeys,
} from '../hooks/useClinicalHotkeys';
import { ChartStage } from '../components/tests/ChartStage';
import {
  analyzeD15Arrangement,
  ISHIHARA_PLATES,
} from '../components/tests/ClinicalModules';
import { OptotypeSvg } from '../components/optotypes/OptotypeSvg';
import { CalibrationDialog } from '../components/modals/CalibrationDialog';
import { PairingQrDialog } from '../components/modals/PairingQrDialog';
import { DigitalPhoropterConsole } from '../components/phoropter/DigitalPhoropterConsole';
import { MiniPatientPreview } from '../components/preview/MiniPatientPreview';

const SettingsIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

interface DoctorControllerViewProps {
  state: ExamState;
  updateState: (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => void;
  randomizeOptotypes: () => void;
  resetSession: () => void;
  isConnected: boolean;
  networkInfo: NetworkPairingInfo | null;
  onOpenPatientView: () => void;
  onRefreshNetworkInfo?: (ip?: string) => void;
}

const OPTOTYPE_KEYS: Array<{ id: OptotypeSetId; label: string; sample: string }> = [
  { id: 'sloan', label: 'SLOAN', sample: 'H' },
  { id: 'snellen', label: 'SNELLEN', sample: 'E' },
  { id: 'tumbling_e', label: 'TUMBLING E', sample: 'E_RIGHT' },
  { id: 'landolt_c', label: 'LANDOLT C', sample: 'C_RIGHT' },
  { id: 'numbers', label: 'NUMBERS', sample: '8' },
  { id: 'hotv', label: 'HOTV', sample: 'V' },
  { id: 'pediatric', label: 'PEDIATRIC', sample: 'HOUSE' },
  { id: 'dyop', label: 'DYOP RING', sample: 'DYOP_RING' },
];

const TEST_DECK_MODES: Array<{ id: ClinicalTestCategory; code: string; label: string }> = [
  { id: 'va_chart', code: '01', label: 'VA CHART' },
  { id: 'duochrome_balance', code: '02', label: 'DUOCHROME' },
  { id: 'astigmatism', code: '03', label: 'ASTIGMATISM' },
  { id: 'binocular', code: '04', label: 'BINOCULAR' },
  { id: 'etdrs_wizard', code: '05', label: 'eETDRS' },
  { id: 'contrast_wizard', code: '06', label: 'CONTRAST' },
  { id: 'macular_color', code: '07', label: 'MACULAR / COLOR' },
  { id: 'near_vision', code: '08', label: 'NEAR VISION' },
];

const NEAR_READING_TIERS = [
  { tier: 'N4', jaeger: 'J1+', logMar: 0.0, snellenEquiv: '20/20' },
  { tier: 'N5', jaeger: 'J2', logMar: 0.1, snellenEquiv: '20/25' },
  { tier: 'N6', jaeger: 'J3', logMar: 0.2, snellenEquiv: '20/32' },
  { tier: 'N8', jaeger: 'J5', logMar: 0.3, snellenEquiv: '20/40' },
  { tier: 'N10', jaeger: 'J7', logMar: 0.4, snellenEquiv: '20/50' },
  { tier: 'N14', jaeger: 'J10', logMar: 0.6, snellenEquiv: '20/80' },
  { tier: 'N18', jaeger: 'J14', logMar: 0.8, snellenEquiv: '20/125' },
];

export const DoctorControllerView: React.FC<DoctorControllerViewProps> = ({
  state,
  updateState,
  randomizeOptotypes,
  resetSession,
  isConnected,
  networkInfo,
  onOpenPatientView,
  onRefreshNetworkInfo,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

  useClinicalHotkeys({ state, updateState, randomizeOptotypes });

  // P hotkey toggles the floating patient preview
  useEffect(() => {
    const handlePreviewHotkey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.closest('dialog[open]'))
      ) {
        return;
      }

      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setIsPreviewOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handlePreviewHotkey);
    return () => window.removeEventListener('keydown', handlePreviewHotkey);
  }, []);

  const activeLogMAR =
    state.activeCategory === 'etdrs_wizard'
      ? state.etdrsWizard.currentLogMAR
      : state.activeLogMAR;

  const activeSymbols = generateLineOptotypes(
    state.activeCategory === 'etdrs_wizard' ? 'sloan' : state.optotypeSet,
    activeLogMAR,
    state.randomSeed,
    state.isolationMode === 'column' || state.activeCategory === 'etdrs_wizard'
  );

  const scoredAcuity = computeScoredLineAcuity(
    activeLogMAR,
    state.currentLineScores,
    state.doctorNotation
  );

  const stepAcuitySize = (direction: 'larger' | 'smaller') => {
    const idx = ACUITY_LADDER.findIndex((l) => Math.abs(l.logMAR - activeLogMAR) < 0.01);
    const curIdx = idx >= 0 ? idx : 13;
    const nextIdx =
      direction === 'larger'
        ? Math.max(0, curIdx - 1)
        : Math.min(ACUITY_LADDER.length - 1, curIdx + 1);
    const nextLogMAR = ACUITY_LADDER[nextIdx].logMAR;

    if (state.activeCategory === 'etdrs_wizard') {
      updateState((prev) => ({
        ...prev,
        etdrsWizard: { ...prev.etdrsWizard, currentLogMAR: nextLogMAR },
      }));
    } else {
      updateState({
        activeLogMAR: nextLogMAR,
        currentLineScores: ['untested', 'untested', 'untested', 'untested', 'untested'],
      });
    }
  };

  const stepCategory = (dir: -1 | 1) => {
    const curIdx = CLINICAL_CATEGORY_ORDER.indexOf(state.activeCategory);
    const nextIdx =
      (curIdx + dir + CLINICAL_CATEGORY_ORDER.length) % CLINICAL_CATEGORY_ORDER.length;
    updateState({ activeCategory: CLINICAL_CATEGORY_ORDER[nextIdx] });
  };

  // Automated eETDRS Staircase & Standard Line Scoring Handler
  const handleLetterScoreTap = (idx: number) => {
    if (state.activeCategory === 'etdrs_wizard') {
      updateState((prev) => {
        const curLog = prev.etdrsWizard.currentLogMAR;
        const key = curLog.toFixed(1);
        const existing = prev.etdrsWizard.lineScores[key] || [
          'untested',
          'untested',
          'untested',
          'untested',
          'untested',
        ];
        const nextRow = [...existing];
        const cur = nextRow[idx];
        nextRow[idx] =
          cur === 'untested' ? 'correct' : cur === 'correct' ? 'incorrect' : 'untested';

        const nextLineScores = { ...prev.etdrsWizard.lineScores, [key]: nextRow };
        const currentLineCorrect = nextRow.filter((s) => s === 'correct').length;
        const currentLineTested = nextRow.filter((s) => s !== 'untested').length;
        const missedOnCurrent = 5 - currentLineCorrect;
        const estimatedLogMAR = Number((curLog + missedOnCurrent * 0.02).toFixed(2));
        const estimatedLetterScore = Math.max(
          0,
          Math.min(100, Math.round(85 - 50 * estimatedLogMAR))
        );

        let nextLogMAR = curLog;
        let nextPhase = prev.etdrsWizard.phase;
        let nextSeed = prev.randomSeed;

        if (currentLineTested === 5) {
          if (currentLineCorrect >= 3 && curLog > -0.3) {
            nextLogMAR = Number((curLog - 0.1).toFixed(1));
            nextPhase = 'threshold';
            nextSeed = prev.randomSeed + 1;
          } else {
            nextPhase = 'completed';
          }
        }

        return {
          ...prev,
          randomSeed: nextSeed,
          etdrsWizard: {
            ...prev.etdrsWizard,
            phase: nextPhase,
            currentLogMAR: nextLogMAR,
            lineScores: nextLineScores,
            finalLogMAR: estimatedLogMAR,
            totalLetterScore: estimatedLetterScore,
          },
        };
      });
      return;
    }

    updateState((prev) => {
      const next = [...prev.currentLineScores];
      const cur = next[idx];
      next[idx] = cur === 'untested' ? 'correct' : cur === 'correct' ? 'incorrect' : 'untested';
      return {
        ...prev,
        activeLetterIndex: idx,
        currentLineScores: next,
      };
    });
  };

  const handleMarkAllCorrect = () => {
    if (state.activeCategory === 'etdrs_wizard') {
      updateState((prev) => {
        const curLog = prev.etdrsWizard.currentLogMAR;
        const key = curLog.toFixed(1);
        const nextRow: LetterScoreStatus[] = [
          'correct',
          'correct',
          'correct',
          'correct',
          'correct',
        ];
        const nextLineScores = { ...prev.etdrsWizard.lineScores, [key]: nextRow };
        const estimatedLogMAR = Number(curLog.toFixed(2));
        const estimatedLetterScore = Math.max(
          0,
          Math.min(100, Math.round(85 - 50 * estimatedLogMAR))
        );
        const canDescend = curLog > -0.3;

        return {
          ...prev,
          randomSeed: canDescend ? prev.randomSeed + 1 : prev.randomSeed,
          etdrsWizard: {
            ...prev.etdrsWizard,
            phase: canDescend ? 'threshold' : 'completed',
            currentLogMAR: canDescend ? Number((curLog - 0.1).toFixed(1)) : curLog,
            lineScores: nextLineScores,
            finalLogMAR: estimatedLogMAR,
            totalLetterScore: estimatedLetterScore,
          },
        };
      });
      return;
    }

    updateState({
      currentLineScores: ['correct', 'correct', 'correct', 'correct', 'correct'],
    });
  };

  const d15Analysis = analyzeD15Arrangement(state.d15ArrangedCaps || [0]);

  // Determine which primary selector/ladder should be active in the Left Bay
  const isAcuityLadderApplicable =
    state.activeCategory === 'va_chart' ||
    state.activeCategory === 'etdrs_wizard' ||
    state.activeCategory === 'duochrome_balance' ||
    (state.activeCategory === 'contrast_wizard' && state.contrastWizard.mode === 'letter_contrast');

  return (
    <div className="min-h-dvh w-full bg-[#08090C] text-[#E2E8F0] flex flex-col select-none font-sans">
      {/* TOP INSTRUMENT CONSOLE DECK */}
      <header className="bg-[#0D0F14] border-b border-[#1E2330] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
        {/* Brand Identity */}
        <div className="flex items-center gap-2.5 pr-2">
          <div className="w-7 h-7 bg-[#151922] border border-[#2D3446] flex items-center justify-center">
            <div className="w-3.5 h-3.5 border-2 border-amber-500 rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-amber-400 rounded-full" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-mono font-black tracking-[0.22em] text-white">
              SIMA
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
              OPTOMETRY
            </span>
          </div>
        </div>

        {/* Center Mode Carousel Deck (Left/Right Keyboard Navigable) */}
        <div className="flex items-center bg-[#07080B] border border-[#1E2330] p-0.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => stepCategory(-1)}
            title="Previous Test Mode (Left Arrow Key)"
            className="px-2.5 py-1.5 bg-[#12151E] hover:bg-[#1C212E] text-neutral-400 hover:text-white font-mono text-xs border-r border-[#1E2330] cursor-pointer active:bg-amber-500 active:text-black"
          >
            ◄
          </button>

          {TEST_DECK_MODES.map((m) => {
            const isActive = state.activeCategory === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => updateState({ activeCategory: m.id })}
                className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition border-t-2 cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#191E2B] text-white border-t-amber-500 font-bold'
                    : 'bg-transparent text-neutral-400 hover:text-neutral-200 hover:bg-[#11141C] border-t-transparent'
                }`}
              >
                <span className="text-[9px] text-neutral-500 mr-1">{m.code}</span>
                {m.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => stepCategory(1)}
            title="Next Test Mode (Right Arrow Key)"
            className="px-2.5 py-1.5 bg-[#12151E] hover:bg-[#1C212E] text-neutral-400 hover:text-white font-mono text-xs border-l border-[#1E2330] cursor-pointer active:bg-amber-500 active:text-black"
          >
            ►
          </button>
        </div>

        {/* Right Hardware Controls */}
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <div className="flex bg-[#07080B] border border-[#1E2330] p-0.5">
            {(
              [
                { id: 'snellen_us', label: '20/XX' },
                { id: 'snellen_metric', label: '6/XX' },
                { id: 'decimal', label: 'DEC' },
                { id: 'logmar', label: 'LOG' },
              ] as Array<{ id: AcuityNotation; label: string }>
            ).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => updateState({ doctorNotation: n.id })}
                className={`px-2 py-1 text-[10px] uppercase cursor-pointer ${
                  state.doctorNotation === n.id
                    ? 'bg-amber-500 text-black font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => updateState({ isBlackout: !state.isBlackout })}
            className={`px-2.5 py-1.5 border uppercase cursor-pointer ${
              state.isBlackout
                ? 'bg-red-600 text-white border-red-500 font-bold'
                : 'bg-[#13161F] text-neutral-300 border-[#262B38] hover:bg-[#1C202D]'
            }`}
            title="Blackout Patient Screen (Key: B)"
          >
            {state.isBlackout ? '● BLK ON' : 'BLK'}
          </button>

          {/* Floating Patient Preview Toggle Button */}
          <button
            type="button"
            onClick={() => setIsPreviewOpen((prev) => !prev)}
            className={`px-2.5 py-1.5 border uppercase cursor-pointer flex items-center gap-1.5 font-bold transition ${
              isPreviewOpen
                ? 'bg-[#10241B] text-emerald-300 border-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-[#13161F] text-neutral-400 border-[#262B38] hover:bg-[#1C202D] hover:text-white'
            }`}
            title="Toggle Mini Floating Patient Preview (Key: P)"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isPreviewOpen ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
              }`}
            />
            <span>PREVIEW [P]</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQrOpen(true)}
            className="px-2.5 py-1.5 bg-[#13161F] hover:bg-[#1C202D] border border-[#262B38] text-neutral-200 uppercase cursor-pointer"
          >
            Pair Remote
          </button>

          <button
            type="button"
            onClick={onOpenPatientView}
            className="px-2.5 py-1.5 bg-[#13161F] hover:bg-[#1C202D] border border-[#262B38] text-amber-400 font-bold uppercase cursor-pointer"
          >
            Patient Screen
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 bg-[#13161F] hover:bg-[#1C202D] border border-[#262B38] text-neutral-300 hover:text-white cursor-pointer"
            title="Settings & Calibration"
            aria-label="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN 3-BAY CLINICAL INSTRUMENT DECK */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2 p-2 max-w-[1920px] w-full mx-auto">
        {/* LEFT BAY (3 cols): ADAPTIVE TEST LADDER / PRIMARY SELECTOR */}
        <section className="lg:col-span-3 bg-[#0D0F14] border border-[#1E2330] flex flex-col p-2 gap-2">
          {/* A. Acuity Drum (VA Chart, eETDRS, Duochrome, Letter Contrast) */}
          {isAcuityLadderApplicable && (
            <>
              <div className="flex items-center justify-between px-1 border-b border-[#1A1E29] pb-1.5 font-mono">
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                  ACUITY DRUM ({state.doctorNotation.replace('_', ' ')})
                </span>
                <span className="text-xs font-bold text-amber-400">
                  {formatAcuityNotation(activeLogMAR, state.doctorNotation)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 font-mono">
                <button
                  type="button"
                  onClick={() => stepAcuitySize('larger')}
                  className="py-2.5 bg-[#151822] hover:bg-[#1E2330] active:bg-amber-500 active:text-black border border-[#282E3E] text-xs font-bold text-white uppercase tracking-wider cursor-pointer"
                >
                  ▲ LARGER [↑]
                </button>
                <button
                  type="button"
                  onClick={() => stepAcuitySize('smaller')}
                  className="py-2.5 bg-[#151822] hover:bg-[#1E2330] active:bg-amber-500 active:text-black border border-[#282E3E] text-xs font-bold text-white uppercase tracking-wider cursor-pointer"
                >
                  ▼ SMALLER [↓]
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1 flex-1 content-start font-mono">
                {ACUITY_LADDER.map((spec) => {
                  const isSelected = Math.abs(spec.logMAR - activeLogMAR) < 0.01;
                  const is2020 = Math.abs(spec.logMAR - 0.0) < 0.01;
                  const primaryLabel = formatAcuityNotation(spec.logMAR, state.doctorNotation);
                  const logStr =
                    spec.logMAR >= 0 ? `+${spec.logMAR.toFixed(1)}` : spec.logMAR.toFixed(1);

                  return (
                    <button
                      key={spec.logMAR}
                      type="button"
                      onClick={() => {
                        if (state.activeCategory === 'etdrs_wizard') {
                          updateState((prev) => ({
                            ...prev,
                            etdrsWizard: { ...prev.etdrsWizard, currentLogMAR: spec.logMAR },
                          }));
                        } else {
                          updateState({
                            activeLogMAR: spec.logMAR,
                            currentLineScores: [
                              'untested',
                              'untested',
                              'untested',
                              'untested',
                              'untested',
                            ],
                          });
                        }
                      }}
                      className={`flex items-center justify-between px-2.5 py-2 border text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 border-amber-400 text-black font-black'
                          : is2020
                          ? 'bg-[#101917] border-emerald-600/60 text-emerald-300 hover:bg-[#152320]'
                          : 'bg-[#12151E] border-[#1F2432] text-neutral-200 hover:bg-[#1A1F2C]'
                      }`}
                    >
                      <span className="text-xs font-bold tracking-tight">{primaryLabel}</span>
                      <span
                        className={`text-[10px] ${
                          isSelected ? 'text-black/80 font-bold' : 'text-neutral-500'
                        }`}
                      >
                        {state.doctorNotation === 'logmar' ? spec.snellenUS : logStr}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* B. Astigmatism Cylinder Axis Stepper Deck (when in Astigmatism Mode) */}
          {state.activeCategory === 'astigmatism' && (
            <div className="flex flex-col gap-2 font-mono h-full">
              <div className="flex items-center justify-between px-1 border-b border-[#1A1E29] pb-1.5">
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                  CYLINDER AXIS
                </span>
                <span className="text-sm font-bold text-amber-400">
                  {state.astigmatismAxisDeg}°
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updateState((prev) => ({
                      ...prev,
                      astigmatismAxisDeg: (prev.astigmatismAxisDeg + 5) % 181,
                    }))
                  }
                  className="py-2.5 bg-[#151822] hover:bg-[#1E2330] border border-[#282E3E] text-xs font-bold text-white uppercase cursor-pointer"
                >
                  ▲ +5° AXIS [↑]
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateState((prev) => ({
                      ...prev,
                      astigmatismAxisDeg: Math.max(0, prev.astigmatismAxisDeg - 5),
                    }))
                  }
                  className="py-2.5 bg-[#151822] hover:bg-[#1E2330] border border-[#282E3E] text-xs font-bold text-white uppercase cursor-pointer"
                >
                  ▼ -5° AXIS [↓]
                </button>
              </div>

              <div className="text-[10px] uppercase tracking-wider text-neutral-400 px-1 pt-1">
                RAPID AXIS PRESETS
              </div>
              <div className="grid grid-cols-2 gap-1 flex-1 content-start">
                {[180, 165, 150, 135, 120, 105, 90, 75, 60, 45, 30, 15, 0].map((deg) => {
                  const isSelected = state.astigmatismAxisDeg === deg;
                  return (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => updateState({ astigmatismAxisDeg: deg })}
                      className={`py-2 px-2.5 border text-center font-bold text-xs cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-[#12151E] border-[#1F2432] text-neutral-300 hover:bg-[#1A1F2C]'
                      }`}
                    >
                      {deg}°
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* C. Binocular Test Target Selector (when in Binocular Mode) */}
          {state.activeCategory === 'binocular' && (
            <div className="flex flex-col gap-2 font-mono h-full">
              <div className="flex items-center justify-between px-1 border-b border-[#1A1E29] pb-1.5">
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                  BINOCULAR TARGET
                </span>
                <span className="text-xs font-bold text-amber-400">
                  {state.binocularMode.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              <div className="space-y-1.5 flex-1 content-start">
                {(
                  [
                    { id: 'worth_4_dot', label: 'WORTH 4-DOT (FUSION)', code: 'W4D' },
                    { id: 'schober', label: 'SCHOBER RINGS (HETERO)', code: 'SCH' },
                    { id: 'fixation_disparity', label: 'OXO NONIUS (DISPARITY)', code: 'OXO' },
                    { id: 'binocular_balance', label: 'OD/OS BALANCE (PRISM)', code: 'BAL' },
                  ] as Array<{ id: BinocularMode; label: string; code: string }>
                ).map((bm) => {
                  const isSelected = state.binocularMode === bm.id;
                  return (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => updateState({ binocularMode: bm.id })}
                      className={`w-full py-3 px-3 text-left border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500 text-black border-amber-400 font-bold'
                          : 'bg-[#12151E] border-[#1F2432] text-neutral-300 hover:bg-[#1A1F2C]'
                      }`}
                    >
                      <span className="text-xs">{bm.label}</span>
                      <span className="text-[10px] opacity-75">{bm.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* D. Macular & Color Target Selector (when in Macular/Color Mode) */}
          {state.activeCategory === 'macular_color' && (
            <div className="flex flex-col gap-2 font-mono h-full">
              <div className="flex items-center justify-between px-1 border-b border-[#1A1E29] pb-1.5">
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                  COLOR & MACULAR TARGET
                </span>
                <span className="text-xs font-bold text-amber-400">
                  {state.macularColorMode.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              <div className="space-y-1.5 flex-1 content-start">
                {(
                  [
                    { id: 'amsler_standard', label: 'AMSLER WHITE ON BLACK' },
                    { id: 'amsler_inverted', label: 'AMSLER BLACK ON WHITE' },
                    { id: 'amsler_red', label: 'AMSLER RED ON BLACK' },
                    { id: 'amsler_diagonal', label: 'CENTRAL SCOTOMA (X)' },
                    { id: 'color_ishihara', label: 'ISHIHARA PSEUDO-ISOCHROMATIC' },
                    { id: 'color_d15', label: 'FARNSWORTH D-15 HUE' },
                  ] as Array<{ id: MacularColorMode; label: string }>
                ).map((mc) => {
                  const isSelected = state.macularColorMode === mc.id;
                  return (
                    <button
                      key={mc.id}
                      type="button"
                      onClick={() => updateState({ macularColorMode: mc.id })}
                      className={`w-full py-2.5 px-3 text-left border text-xs cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500 text-black border-amber-400 font-bold'
                          : 'bg-[#12151E] border-[#1F2432] text-neutral-300 hover:bg-[#1A1F2C]'
                      }`}
                    >
                      {mc.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* E. 40cm Presbyopia Reading Tier Ladder (when in Near Vision Mode) */}
          {state.activeCategory === 'near_vision' && (
            <div className="flex flex-col gap-2 font-mono h-full">
              <div className="flex items-center justify-between px-1 border-b border-[#1A1E29] pb-1.5">
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                  40CM READING TIER
                </span>
                <span className="text-xs font-bold text-amber-400">
                  N-POINT / JAEGER
                </span>
              </div>

              <div className="space-y-1.5 flex-1 content-start">
                {NEAR_READING_TIERS.map((tier) => {
                  const isSelected = Math.abs(tier.logMar - activeLogMAR) < 0.05;
                  return (
                    <button
                      key={tier.tier}
                      type="button"
                      onClick={() => updateState({ activeLogMAR: tier.logMar })}
                      className={`w-full py-2.5 px-3 border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500 text-black border-amber-400 font-bold'
                          : 'bg-[#12151E] border-[#1F2432] text-neutral-300 hover:bg-[#1A1F2C]'
                      }`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold">{tier.tier}</span>
                        <span className="text-[11px] opacity-80">({tier.jaeger})</span>
                      </div>
                      <span className="text-[10px] opacity-75">{tier.snellenEquiv}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* F. Sine Grating CPD Spatial Frequency Ladder (when in Contrast Sine Grating Mode) */}
          {state.activeCategory === 'contrast_wizard' &&
            state.contrastWizard.mode === 'sine_grating' && (
              <div className="flex flex-col gap-2 font-mono h-full">
                <div className="flex items-center justify-between px-1 border-b border-[#1A1E29] pb-1.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                    SPATIAL FREQUENCY
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    {state.contrastWizard.spatialFrequencyCpd} CPD
                  </span>
                </div>

                <div className="space-y-1.5 flex-1 content-start">
                  {[1.5, 3, 6, 12, 18].map((cpd) => {
                    const isSelected = state.contrastWizard.spatialFrequencyCpd === cpd;
                    return (
                      <button
                        key={cpd}
                        type="button"
                        onClick={() =>
                          updateState((prev) => ({
                            ...prev,
                            contrastWizard: {
                              ...prev.contrastWizard,
                              spatialFrequencyCpd: cpd,
                            },
                          }))
                        }
                        className={`w-full py-2.5 px-3 border flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-emerald-500 text-black border-emerald-400 font-bold'
                            : 'bg-[#12151E] border-[#1F2432] text-neutral-300 hover:bg-[#1A1F2C]'
                        }`}
                      >
                        <span className="text-sm font-bold">{cpd} CPD</span>
                        <span className="text-[10px] opacity-75">
                          {cpd <= 3 ? 'LOW FREQ' : cpd <= 6 ? 'MID FREQ' : 'HIGH FREQ'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
        </section>

        {/* CENTER BAY (5 cols): DIGITAL PHOROPTER LCD, OPTICAL VIEWPORT & SCORING DECK */}
        <section className="lg:col-span-5 flex flex-col gap-2">
          {/* Digital Instrument Telemetry LCD Strip */}
          <div className="bg-[#0B0D12] border border-[#1E2330] px-3.5 py-2 flex items-center justify-between font-mono">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-black tracking-tight text-amber-400">
                {scoredAcuity.label}
              </span>
              <span className="text-xs text-neutral-400">
                LOG{' '}
                {scoredAcuity.interpolatedLogMAR >= 0
                  ? `+${scoredAcuity.interpolatedLogMAR.toFixed(2)}`
                  : scoredAcuity.interpolatedLogMAR.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] uppercase">
              <span className="px-2 py-0.5 bg-[#151924] border border-[#262C3D] text-neutral-300">
                {state.activeCategory === 'va_chart'
                  ? `${state.optotypeSet.toUpperCase()} • ${state.isolationMode.toUpperCase()}`
                  : state.activeCategory.replace('_', ' ').toUpperCase()}
              </span>
              {state.crowdingMode !== 'none' && state.activeCategory === 'va_chart' && (
                <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-600/50 text-emerald-300">
                  CROWD {state.crowdingMode.replace('bars_', '')}
                </span>
              )}
              {state.duochromeOverlay !== 'none' && (
                <span className="px-2 py-0.5 bg-red-950/80 border border-red-500/50 text-red-300">
                  {state.duochromeOverlay.toUpperCase()}
                </span>
              )}
              {state.invertPolarity && (
                <span className="px-2 py-0.5 bg-white text-black font-bold">INVERT</span>
              )}
            </div>
          </div>

          {/* Live Optical Viewport (Un-Mirrored Clinician Stage) - Disabled when Floating Preview is Active */}
          {isPreviewOpen ? (
            <div
              className="bg-[#0B0D12] border border-[#1A202C] p-4 flex flex-col items-center justify-center text-center gap-2 font-mono min-h-[140px] rounded-xs select-none"
              data-testid="inline-preview-disabled"
            >
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                <span>INLINE PATIENT VIEW DISABLED</span>
              </div>
              <p className="text-[11px] text-neutral-400 max-w-sm leading-relaxed">
                Live patient view is active in the movable floating preview widget. Drag the preview anywhere or close it to restore inline view.
              </p>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="mt-1 px-3 py-1.5 bg-[#141824] hover:bg-[#1E2436] border border-[#2B3448] hover:border-amber-400/60 text-neutral-300 hover:text-white text-xs font-bold rounded-xs cursor-pointer transition flex items-center gap-1.5"
              >
                <span>ENABLE INLINE VIEW</span>
                <span className="text-[10px] text-neutral-500">(Closes Floating Preview)</span>
              </button>
            </div>
          ) : (
            <div
              className="bg-[#0D0F14] border border-[#1E2330] p-2 flex-1 flex flex-col justify-center"
              data-testid="inline-preview-active"
            >
              <div
                className="relative w-full mx-auto overflow-hidden border border-[#2A3042] bg-black"
                style={{ aspectRatio: '16 / 10' }}
              >
                <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 border-t border-l border-neutral-500/40 z-20 pointer-events-none" />
                <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 border-t border-r border-neutral-500/40 z-20 pointer-events-none" />
                <div className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 border-b border-l border-neutral-500/40 z-20 pointer-events-none" />
                <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-b border-r border-neutral-500/40 z-20 pointer-events-none" />

                <ChartStage
                  state={state}
                  isPatientScreen={false}
                  scaleFactor={0.44}
                  onUpdateState={updateState}
                />
              </div>
            </div>
          )}

          {/* Target Answer Keystrip & Scoring (VA Chart & eETDRS only) */}
          {(state.activeCategory === 'va_chart' ||
            state.activeCategory === 'etdrs_wizard') && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-2.5 space-y-2 font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-400">
                <span>TARGET VERIFICATION & SCORING KEYS [1–5]</span>
                <div className="flex items-center gap-1.5">
                  {(state.isolationMode === 'single' ||
                    state.isolationMode === 'column') && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          updateState({
                            activeLetterIndex:
                              (state.activeLetterIndex + activeSymbols.length - 1) %
                              activeSymbols.length,
                          })
                        }
                        className="px-2 py-0.5 bg-[#161923] hover:bg-[#232838] border border-[#2C3244] text-neutral-200 cursor-pointer"
                      >
                        ◄ [
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateState({
                            activeLetterIndex:
                              (state.activeLetterIndex + 1) % activeSymbols.length,
                          })
                        }
                        className="px-2 py-0.5 bg-[#161923] hover:bg-[#232838] border border-[#2C3244] text-neutral-200 cursor-pointer"
                      >
                        ] ►
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleMarkAllCorrect}
                    className="px-2 py-0.5 bg-[#12221D] hover:bg-[#193029] border border-emerald-600/50 text-emerald-300 cursor-pointer"
                  >
                    ALL ✓
                  </button>
                  <button
                    type="button"
                    onClick={randomizeOptotypes}
                    className="px-3 py-0.5 bg-amber-500 hover:bg-amber-400 text-black font-bold cursor-pointer"
                  >
                    RANDOMIZE [SPACE]
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {activeSymbols.map((sym, idx) => {
                  const cheat = getDoctorCheatLabel(sym);
                  const currentScores =
                    state.activeCategory === 'etdrs_wizard'
                      ? state.etdrsWizard.lineScores[activeLogMAR.toFixed(1)] || [
                          'untested',
                          'untested',
                          'untested',
                          'untested',
                          'untested',
                        ]
                      : state.currentLineScores;
                  const status: LetterScoreStatus = currentScores[idx] || 'untested';
                  const isTarget =
                    (state.isolationMode === 'single' ||
                      state.isolationMode === 'column') &&
                    state.activeLetterIndex === idx;

                  let keyStyle =
                    'bg-[#131720] border-[#252B3B] text-white hover:bg-[#1B202D]';
                  if (status === 'correct') {
                    keyStyle =
                      'bg-[#0E231C] border-emerald-500 text-emerald-300 border-t-2 border-t-emerald-400';
                  } else if (status === 'incorrect') {
                    keyStyle =
                      'bg-[#271216] border-red-500 text-red-300 border-t-2 border-t-red-400';
                  }

                  return (
                    <button
                      key={`${idx}-${sym}`}
                      type="button"
                      onClick={() => handleLetterScoreTap(idx)}
                      className={`relative flex flex-col items-center justify-center py-2.5 px-1 border transition cursor-pointer ${keyStyle} ${
                        isTarget ? 'ring-1 ring-amber-400' : ''
                      }`}
                    >
                      <span className="absolute top-1 left-1.5 text-[9px] text-neutral-500">
                        {idx + 1}
                      </span>
                      <span className="absolute top-1 right-1.5 text-[10px] font-bold">
                        {status === 'correct' ? '✓' : status === 'incorrect' ? '✕' : ''}
                      </span>
                      <span className="text-lg font-black tracking-tight mt-1">
                        {cheat.primary}
                      </span>
                      {cheat.hint && (
                        <span className="text-[9px] text-neutral-400 uppercase">
                          {cheat.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DIGITAL PHOROPTER REFRACTION CONSOLE */}
          <DigitalPhoropterConsole
            state={state}
            updateState={updateState}
            className="rounded border border-[#1E2330]"
          />
        </section>

        {/* RIGHT BAY (4 cols): CONTEXT-SENSITIVE SELECTORS & CONTROLS */}
        <section className="lg:col-span-4 flex flex-col gap-2 font-mono">
          {/* ========================================================================= */}
          {/* 1. VA CHART MODE: OPTOTYPE SELECTOR, APERTURE, CROWDING, FILTERS, MACROS  */}
          {/* ========================================================================= */}
          {state.activeCategory === 'va_chart' && (
            <>
              {/* Optotype Selector */}
              <div className="bg-[#0D0F14] border border-[#1E2330] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1">
                  <span>OPTOTYPE SELECTOR</span>
                  <span className="text-amber-400 font-bold">{state.optotypeSet.toUpperCase()}</span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {OPTOTYPE_KEYS.map((k) => {
                    const isSelected = state.optotypeSet === k.id;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() =>
                          updateState({
                            optotypeSet: k.id,
                            activeLetterIndex: 0,
                            currentLineScores: [
                              'untested',
                              'untested',
                              'untested',
                              'untested',
                              'untested',
                            ],
                          })
                        }
                        className={`flex flex-col items-center justify-center py-2.5 px-1 border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1B2130] border-amber-500 border-t-2 border-t-amber-400 text-white'
                            : 'bg-[#12151E] border-[#212634] text-neutral-400 hover:text-white hover:bg-[#171B26]'
                        }`}
                      >
                        <div className="h-6 flex items-center justify-center mb-1.5">
                          <OptotypeSvg
                            symbol={k.sample}
                            sizePx={20}
                            color={isSelected ? '#F59E0B' : '#CBD5E1'}
                          />
                        </div>
                        <span className="text-[10px] font-bold tracking-wider uppercase">
                          {k.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Dyop Spin Controls if Dyop Set Active */}
                {state.optotypeSet === 'dyop' && (
                  <div className="pt-2 border-t border-[#1A1E29] flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex border border-[#252B3B]">
                      <button
                        type="button"
                        onClick={() => updateState({ dyopDirection: 'cw' })}
                        className={`px-2.5 py-1 font-bold uppercase cursor-pointer ${
                          state.dyopDirection === 'cw'
                            ? 'bg-amber-500 text-black'
                            : 'bg-[#12151E] text-neutral-400'
                        }`}
                      >
                        CW ↻
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState({ dyopDirection: 'ccw' })}
                        className={`px-2.5 py-1 font-bold uppercase cursor-pointer ${
                          state.dyopDirection === 'ccw'
                            ? 'bg-amber-500 text-black'
                            : 'bg-[#12151E] text-neutral-400'
                        }`}
                      >
                        CCW ↺
                      </button>
                    </div>

                    <div className="flex gap-1">
                      {[20, 40, 60].map((rpm) => (
                        <button
                          key={rpm}
                          type="button"
                          onClick={() => updateState({ dyopRpm: rpm })}
                          className={`px-2 py-1 border font-bold cursor-pointer ${
                            state.dyopRpm === rpm
                              ? 'bg-emerald-500 text-black border-emerald-400'
                              : 'bg-[#12151E] border-[#212634] text-neutral-400'
                          }`}
                        >
                          {rpm} RPM
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Aperture & Isolation */}
              <div className="bg-[#0D0F14] border border-[#1E2330] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1">
                  <span>APERTURE ISOLATION</span>
                  <span>KEYS: F / L / V / S</span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'full', label: 'FULL [F]', glyph: '⣿⣿' },
                      { id: 'line', label: 'H-LINE [L]', glyph: '══' },
                      { id: 'column', label: 'V-COL [V]', glyph: '║' },
                      { id: 'single', label: 'SINGLE [S]', glyph: '回' },
                    ] as Array<{ id: ChartIsolationMode; label: string; glyph: string }>
                  ).map((iso) => {
                    const isSelected = state.isolationMode === iso.id;
                    return (
                      <button
                        key={iso.id}
                        type="button"
                        onClick={() => updateState({ isolationMode: iso.id })}
                        className={`flex flex-col items-center justify-center py-2 px-1 border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1B2130] border-amber-500 border-t-2 border-t-amber-400 text-white font-bold'
                            : 'bg-[#12151E] border-[#212634] text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="text-sm leading-none mb-1 text-amber-400">
                          {iso.glyph}
                        </span>
                        <span className="text-[10px]">{iso.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400 mb-1">
                    CONTOUR CROWDING BARS [KEY: C]
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'none', label: 'OFF' },
                        { id: 'bars_0.5x', label: '0.5× BARS' },
                        { id: 'bars_1.0x', label: '1.0× BARS' },
                        { id: 'box', label: 'FRAME BOX' },
                      ] as Array<{ id: CrowdingMode; label: string }>
                    ).map((cr) => (
                      <button
                        key={cr.id}
                        type="button"
                        onClick={() => updateState({ crowdingMode: cr.id })}
                        className={`py-2 text-[10px] font-bold border uppercase cursor-pointer ${
                          state.crowdingMode === cr.id
                            ? 'bg-emerald-500 text-black border-emerald-400'
                            : 'bg-[#12151E] border-[#212634] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {cr.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optical Filters & Polarity */}
              <div className="bg-[#0D0F14] border border-[#1E2330] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1">
                  <span>OPTICAL FILTERS & POLARITY</span>
                  <span>KEYS: D / I</span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'none', label: 'CLEAR', dot: 'bg-neutral-400' },
                      {
                        id: 'split',
                        label: 'R/G SPLIT',
                        dot: 'bg-gradient-to-r from-red-500 to-green-500',
                      },
                      { id: 'red_only', label: 'RED 625', dot: 'bg-red-500' },
                      { id: 'green_only', label: 'GRN 535', dot: 'bg-green-500' },
                    ] as Array<{ id: DuochromeOverlay; label: string; dot: string }>
                  ).map((dc) => (
                    <button
                      key={dc.id}
                      type="button"
                      onClick={() => updateState({ duochromeOverlay: dc.id })}
                      className={`flex items-center justify-center gap-1.5 py-2 px-1 text-[10px] font-bold border uppercase cursor-pointer ${
                        state.duochromeOverlay === dc.id
                          ? 'bg-[#1B2130] border-amber-500 text-white'
                          : 'bg-[#12151E] border-[#212634] text-neutral-400 hover:text-white'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${dc.dot}`} />
                      <span>{dc.label}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => updateState({ invertPolarity: !state.invertPolarity })}
                  className={`w-full py-2 text-[11px] font-bold border uppercase tracking-wider cursor-pointer ${
                    state.invertPolarity
                      ? 'bg-white text-black border-white'
                      : 'bg-[#12151E] border-[#212634] text-neutral-300 hover:text-white'
                  }`}
                >
                  {state.invertPolarity
                    ? '■ INVERTED: WHITE ON BLACK [I]'
                    : '□ STANDARD: BLACK ON WHITE [I]'}
                </button>
              </div>

              {/* Sequence Macros */}
              <div className="bg-[#0D0F14] border border-[#1E2330] p-2.5 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1 mb-2">
                    <span>EXAM SEQUENCE MACROS</span>
                    <button
                      type="button"
                      onClick={resetSession}
                      className="text-neutral-400 hover:text-amber-400 uppercase cursor-pointer"
                    >
                      [RESET]
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {WORKFLOW_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          updateState((prev) => ({
                            ...prev,
                            ...preset.patch,
                            currentLineScores: [
                              'untested',
                              'untested',
                              'untested',
                              'untested',
                              'untested',
                            ],
                          }))
                        }
                        className="py-2 px-2.5 bg-[#12151E] hover:bg-[#1B202E] active:bg-amber-500 active:text-black border border-[#212634] text-left text-[11px] font-bold text-neutral-200 uppercase truncate cursor-pointer"
                      >
                        {preset.badge}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-[10px] text-neutral-500 border-t border-[#1A1E29] pt-1.5 flex items-center justify-between">
                  <span>←/→ TEST MODE • ↑/↓ SIZE • SPACE SHUFFLE</span>
                  <span>[ / ] TARGET</span>
                </div>
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* 2. DUOCHROME BALANCE MODE: RAM-GAP PROTOCOL & SPHERICAL STEPPERS           */}
          {/* ========================================================================= */}
          {state.activeCategory === 'duochrome_balance' && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-3 space-y-3 flex-1 flex flex-col font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1.5">
                <span>DUOCHROME REFRACTION BALANCE</span>
                <span className="text-amber-400 font-bold">RAM-GAP PROTOCOL</span>
              </div>

              <div className="bg-[#07090D] border border-amber-500/30 p-2.5 rounded text-xs space-y-1">
                <div className="font-bold text-amber-400 text-[11px] tracking-wide">
                  CLINICAL BALANCE PRINCIPLE (RAM-GAP):
                </div>
                <div className="text-neutral-300 text-[11px] leading-relaxed">
                  • <strong className="text-red-400">RED CLEARER?</strong> Patient is under-plused (myopic focus). <strong className="text-amber-300">ADD MINUS (-0.25 D)</strong>.
                </div>
                <div className="text-neutral-300 text-[11px] leading-relaxed">
                  • <strong className="text-emerald-400">GREEN CLEARER?</strong> Patient is over-plused (hyperopic focus). <strong className="text-amber-300">ADD PLUS (+0.25 D)</strong>.
                </div>
                <div className="text-neutral-400 text-[10px] italic pt-0.5">
                  Endpoint reached when letters on Red and Green appear equally sharp.
                </div>
              </div>

              {/* 1-Click RAM-GAP Refraction Steppers */}
              <div className="space-y-2 pt-1">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                  RAPID RAM-GAP SPHERICAL STEPS
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateState((prev) => ({
                        ...prev,
                        refraction: {
                          ...prev.refraction,
                          od: {
                            ...prev.refraction.od,
                            sphere: prev.refraction.od.sphere - 0.25,
                          },
                          os: {
                            ...prev.refraction.os,
                            sphere: prev.refraction.os.sphere - 0.25,
                          },
                        },
                      }))
                    }
                    className="py-3 bg-[#241215] hover:bg-[#34181D] border border-red-500/60 text-red-300 font-bold text-xs uppercase cursor-pointer"
                  >
                    OU: ADD MINUS (-0.25 D)
                    <div className="text-[9px] text-red-400/80 font-normal">RED CLEARER</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateState((prev) => ({
                        ...prev,
                        refraction: {
                          ...prev.refraction,
                          od: {
                            ...prev.refraction.od,
                            sphere: prev.refraction.od.sphere + 0.25,
                          },
                          os: {
                            ...prev.refraction.os,
                            sphere: prev.refraction.os.sphere + 0.25,
                          },
                        },
                      }))
                    }
                    className="py-3 bg-[#10241A] hover:bg-[#163324] border border-emerald-500/60 text-emerald-300 font-bold text-xs uppercase cursor-pointer"
                  >
                    OU: ADD PLUS (+0.25 D)
                    <div className="text-[9px] text-emerald-400/80 font-normal">GREEN CLEARER</div>
                  </button>
                </div>
              </div>

              {/* Filter Overlays */}
              <div className="space-y-1.5 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                  FILTER PRESENTATION
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'split', label: 'SPLIT R/G' },
                      { id: 'red_only', label: 'RED ONLY (630nm)' },
                      { id: 'green_only', label: 'GRN ONLY (530nm)' },
                    ] as Array<{ id: DuochromeOverlay; label: string }>
                  ).map((dc) => (
                    <button
                      key={dc.id}
                      type="button"
                      onClick={() => updateState({ duochromeOverlay: dc.id })}
                      className={`py-2 px-1 text-[10px] font-bold border uppercase cursor-pointer ${
                        state.duochromeOverlay === dc.id
                          ? 'bg-[#1B2130] border-amber-500 text-white font-bold'
                          : 'bg-[#12151E] border-[#212634] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {dc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => updateState({ invertPolarity: !state.invertPolarity })}
                  className={`w-full py-2 text-[11px] font-bold border uppercase tracking-wider cursor-pointer ${
                    state.invertPolarity
                      ? 'bg-white text-black border-white'
                      : 'bg-[#12151E] border-[#212634] text-neutral-300 hover:text-white'
                  }`}
                >
                  {state.invertPolarity
                    ? '■ INVERTED: WHITE ON BLACK [I]'
                    : '□ STANDARD: BLACK ON WHITE [I]'}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. ASTIGMATISM MODE: CLOCK DIAL, FAN, JCC HONEYCOMB, AXIS & FLIP CONTROLS */}
          {/* ========================================================================= */}
          {state.activeCategory === 'astigmatism' && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-3 space-y-3 flex-1 flex flex-col font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1.5">
                <span>ASTIGMATISM & JCC DIAL</span>
                <span className="text-amber-400 font-bold">{state.astigmatismMode.replace('_', ' ').toUpperCase()}</span>
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'clock_dial', label: '12-HR CLOCK' },
                    { id: 'sunburst', label: '180° FAN' },
                    { id: 'jcc_dots', label: 'JCC HONEYCOMB' },
                  ] as Array<{ id: AstigmatismMode; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => updateState({ astigmatismMode: m.id })}
                    className={`py-2.5 text-[11px] font-bold border uppercase cursor-pointer transition ${
                      state.astigmatismMode === m.id
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-[#131720] border-[#252B3B] text-neutral-300 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Jackson Cross-Cylinder (JCC) Refinement Panel */}
              <div className="bg-[#08090C] border border-[#1E2330] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-400">
                  <span>JACKSON CROSS-CYLINDER (JCC)</span>
                  <span className="text-amber-400 font-bold">KEY: J</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateState((prev) => ({
                        ...prev,
                        jcc: {
                          ...prev.jcc,
                          flipPosition: prev.jcc?.flipPosition === 1 ? 2 : 1,
                        },
                      }))
                    }
                    className="py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase cursor-pointer"
                  >
                    FLIP JCC (POS {state.jcc?.flipPosition ?? 1})
                  </button>

                  <div className="flex border border-[#252B3B]">
                    <button
                      type="button"
                      onClick={() =>
                        updateState((prev) => ({
                          ...prev,
                          jcc: { ...prev.jcc, powerStep: 0.25 },
                        }))
                      }
                      className={`flex-1 py-1.5 text-xs font-bold cursor-pointer ${
                        state.jcc?.powerStep === 0.25
                          ? 'bg-emerald-500 text-black'
                          : 'bg-[#131720] text-neutral-400'
                      }`}
                    >
                      ±0.25 D
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateState((prev) => ({
                          ...prev,
                          jcc: { ...prev.jcc, powerStep: 0.5 },
                        }))
                      }
                      className={`flex-1 py-1.5 text-xs font-bold cursor-pointer ${
                        state.jcc?.powerStep === 0.5
                          ? 'bg-emerald-500 text-black'
                          : 'bg-[#131720] text-neutral-400'
                      }`}
                    >
                      ±0.50 D
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-neutral-400 leading-relaxed bg-[#0F121A] p-2 border border-[#1E2330]">
                  • <strong>AXIS REFINEMENT</strong>: Align handle with principal axis. Patient chooses sharper flip. Rotate axis toward red dots ("Chase the Red").
                  <br />
                  • <strong>POWER REFINEMENT</strong>: Align dots with principal axis. Red sharper = add -0.50D cyl & +0.25D sph (maintaining SE).
                </div>
              </div>

              {/* Polarity Invert Toggle */}
              <button
                type="button"
                onClick={() => updateState({ invertPolarity: !state.invertPolarity })}
                className={`w-full py-2 text-[11px] font-bold border uppercase tracking-wider cursor-pointer ${
                  state.invertPolarity
                    ? 'bg-white text-black border-white'
                    : 'bg-[#12151E] border-[#212634] text-neutral-300 hover:text-white'
                }`}
              >
                {state.invertPolarity
                  ? '■ INVERTED: WHITE ON BLACK [I]'
                  : '□ STANDARD: BLACK ON WHITE [I]'}
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. BINOCULAR MODE: WORTH 4-DOT, SCHOBER, OXO, OD/OS BALANCE SELECTORS      */}
          {/* ========================================================================= */}
          {state.activeCategory === 'binocular' && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-3 space-y-3 flex-1 flex flex-col font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1.5">
                <span>BINOCULAR VISION SELECTOR</span>
                <span className="text-amber-400 font-bold">{state.binocularMode.replace('_', ' ').toUpperCase()}</span>
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'worth_4_dot', label: 'WORTH 4-DOT' },
                    { id: 'schober', label: 'SCHOBER RINGS' },
                    { id: 'fixation_disparity', label: 'OXO NONIUS' },
                    { id: 'binocular_balance', label: 'OD/OS BALANCE' },
                  ] as Array<{ id: BinocularMode; label: string }>
                ).map((bm) => (
                  <button
                    key={bm.id}
                    type="button"
                    onClick={() => updateState({ binocularMode: bm.id })}
                    className={`py-2.5 text-[11px] font-bold border uppercase cursor-pointer ${
                      state.binocularMode === bm.id
                        ? 'bg-amber-500 text-black border-amber-400 font-bold'
                        : 'bg-[#131720] border-[#252B3B] text-neutral-300 hover:text-white'
                    }`}
                  >
                    {bm.label}
                  </button>
                ))}
              </div>

              {/* Worth 4-Dot Specific Controls */}
              {state.binocularMode === 'worth_4_dot' && (
                <div className="space-y-2 bg-[#08090C] border border-[#1E2330] p-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-400">
                    <span>DOT ANGULAR SPREAD</span>
                    <span className="text-amber-400 font-bold">{state.worthDotSpread}° DEMAND</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: '2° (MACULAR)', val: 0.7 },
                      { label: '4° (PARAMACULAR)', val: 1.0 },
                      { label: '6° (PERIPHERAL)', val: 1.6 },
                    ].map((sp) => (
                      <button
                        key={sp.label}
                        type="button"
                        onClick={() => updateState({ worthDotSpread: sp.val })}
                        className={`py-2 text-[10px] border font-bold cursor-pointer ${
                          Math.abs(state.worthDotSpread - sp.val) < 0.1
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-[#131720] border-[#252B3B] text-neutral-400'
                        }`}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>

                  <div className="text-[10px] text-neutral-300 bg-[#0F121A] p-2 border border-[#1E2330] space-y-1">
                    <div className="font-bold text-amber-400 uppercase text-[9px]">CLINICAL INTERPRETATION:</div>
                    <div>• <strong>4 DOTS:</strong> Normal fusion (1 red top, 2 green side, 1 white bottom)</div>
                    <div>• <strong>2 RED DOTS:</strong> Left eye (OS) suppression</div>
                    <div>• <strong>3 GREEN DOTS:</strong> Right eye (OD) suppression</div>
                    <div>• <strong>5 DOTS:</strong> Diplopia (Strabismus / decompensated phoria)</div>
                  </div>
                </div>
              )}

              {/* Polarity Invert Toggle */}
              <button
                type="button"
                onClick={() => updateState({ invertPolarity: !state.invertPolarity })}
                className={`w-full py-2 text-[11px] font-bold border uppercase tracking-wider cursor-pointer ${
                  state.invertPolarity
                    ? 'bg-white text-black border-white'
                    : 'bg-[#12151E] border-[#212634] text-neutral-300 hover:text-white'
                }`}
              >
                {state.invertPolarity
                  ? '■ INVERTED: WHITE ON BLACK [I]'
                  : '□ STANDARD: BLACK ON WHITE [I]'}
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. eETDRS WIZARD MODE: PROTOCOL DECK, EYE, STAIRCASE TELEMETRY             */}
          {/* ========================================================================= */}
          {state.activeCategory === 'etdrs_wizard' && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-3 space-y-3 flex-1 flex flex-col font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1.5">
                <span>eETDRS CLINICAL PROTOCOL</span>
                <span className="text-amber-400 font-bold">SLOAN MANDATORY</span>
              </div>

              {/* Eye Selection */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                  TESTED EYE
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['OD', 'OS', 'OU'] as const).map((eye) => (
                    <button
                      key={eye}
                      type="button"
                      onClick={() =>
                        updateState((prev) => ({
                          ...prev,
                          etdrsWizard: { ...prev.etdrsWizard, testedEye: eye },
                        }))
                      }
                      className={`py-2 text-xs font-bold border cursor-pointer ${
                        state.etdrsWizard.testedEye === eye
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-[#131720] border-[#252B3B] text-neutral-300'
                      }`}
                    >
                      {eye}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protocol Staircase Status */}
              <div className="bg-[#08090C] border border-[#1E2330] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-neutral-400">PHASE:</span>
                  <span className="text-emerald-400 font-bold uppercase">
                    {state.etdrsWizard.phase}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-neutral-400">FINAL LOGMAR:</span>
                  <span className="text-amber-400 font-bold">
                    {state.etdrsWizard.finalLogMAR !== null
                      ? state.etdrsWizard.finalLogMAR.toFixed(2)
                      : 'IN PROGRESS'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-neutral-400">ETDRS LETTERS:</span>
                  <span className="text-amber-400 font-bold">
                    {state.etdrsWizard.totalLetterScore !== null
                      ? `${state.etdrsWizard.totalLetterScore} / 100`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Restart Protocol Button */}
              <button
                type="button"
                onClick={() =>
                  updateState((prev) => ({
                    ...prev,
                    randomSeed: prev.randomSeed + 1,
                    etdrsWizard: {
                      phase: 'threshold',
                      currentLogMAR: 0.4,
                      lineScores: {},
                      finalLogMAR: null,
                      totalLetterScore: null,
                      testedEye: prev.etdrsWizard.testedEye,
                    },
                  }))
                }
                className="w-full py-2.5 bg-[#171C28] hover:bg-[#22293A] border border-[#2C3347] text-xs text-neutral-200 uppercase cursor-pointer"
              >
                RESTART eETDRS PROTOCOL
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. CONTRAST SENSITIVITY MODE: CONTRAST %, CPD SPATIAL FREQUENCY & ANGLES   */}
          {/* ========================================================================= */}
          {state.activeCategory === 'contrast_wizard' && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-3 space-y-3 flex-1 flex flex-col font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1.5">
                <span>CONTRAST SENSITIVITY SELECTOR</span>
                <span className="text-amber-400 font-bold">
                  {state.contrastWizard.contrastPercent}% (LogCS{' '}
                  {Math.log10(100 / state.contrastWizard.contrastPercent).toFixed(2)})
                </span>
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updateState((prev) => ({
                      ...prev,
                      contrastWizard: { ...prev.contrastWizard, mode: 'letter_contrast' },
                    }))
                  }
                  className={`py-2 text-[11px] font-bold border uppercase cursor-pointer ${
                    state.contrastWizard.mode === 'letter_contrast'
                      ? 'bg-amber-500 text-black border-amber-400'
                      : 'bg-[#131720] border-[#252B3B] text-neutral-300'
                  }`}
                >
                  LETTER CONTRAST
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateState((prev) => ({
                      ...prev,
                      contrastWizard: { ...prev.contrastWizard, mode: 'sine_grating' },
                    }))
                  }
                  className={`py-2 text-[11px] font-bold border uppercase cursor-pointer ${
                    state.contrastWizard.mode === 'sine_grating'
                      ? 'bg-amber-500 text-black border-amber-400'
                      : 'bg-[#131720] border-[#252B3B] text-neutral-300'
                  }`}
                >
                  SINE GRATING (CPD)
                </button>
              </div>

              {/* Contrast % Buttons */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                  CONTRAST PERCENT
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[100, 50, 25, 12.5, 6.25, 3.12, 1.56, 0.8].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() =>
                        updateState((prev) => ({
                          ...prev,
                          contrastWizard: { ...prev.contrastWizard, contrastPercent: pct },
                        }))
                      }
                      className={`py-1.5 text-[11px] border font-bold cursor-pointer ${
                        state.contrastWizard.contrastPercent === pct
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-[#131720] border-[#252B3B] text-neutral-300'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Sine Grating Angles if in Grating Mode */}
              {state.contrastWizard.mode === 'sine_grating' && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                    GRATING ORIENTATION
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { deg: 0, label: 'VERT |' },
                      { deg: 45, label: '45° /' },
                      { deg: 90, label: 'HORIZ —' },
                      { deg: 135, label: '135° \\' },
                    ].map((g) => (
                      <button
                        key={g.deg}
                        type="button"
                        onClick={() =>
                          updateState((prev) => ({
                            ...prev,
                            contrastWizard: {
                              ...prev.contrastWizard,
                              gratingAngleDeg: g.deg,
                            },
                          }))
                        }
                        className={`py-1.5 text-[10px] border font-bold cursor-pointer ${
                          state.contrastWizard.gratingAngleDeg === g.deg
                            ? 'bg-emerald-500 text-black border-emerald-400'
                            : 'bg-[#131720] border-[#252B3B] text-neutral-300'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Polarity Invert Toggle */}
              <button
                type="button"
                onClick={() => updateState({ invertPolarity: !state.invertPolarity })}
                className={`w-full py-2 text-[11px] font-bold border uppercase tracking-wider cursor-pointer ${
                  state.invertPolarity
                    ? 'bg-white text-black border-white'
                    : 'bg-[#12151E] border-[#212634] text-neutral-300 hover:text-white'
                }`}
              >
                {state.invertPolarity
                  ? '■ INVERTED: WHITE ON BLACK [I]'
                  : '□ STANDARD: BLACK ON WHITE [I]'}
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 7. MACULAR / COLOR VISION: AMSLER, ISHIHARA PLATES & D-15 HUE CONTROLS     */}
          {/* ========================================================================= */}
          {state.activeCategory === 'macular_color' && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-3 space-y-3 flex-1 flex flex-col font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1.5">
                <span>MACULAR & COLOR TEST SELECTOR</span>
                <span className="text-amber-400 font-bold">{state.macularColorMode.replace('_', ' ').toUpperCase()}</span>
              </div>

              {/* Sub-mode Selector */}
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'amsler_standard', label: 'AMSLER W/B' },
                    { id: 'amsler_inverted', label: 'AMSLER B/W' },
                    { id: 'amsler_red', label: 'AMSLER RED' },
                    { id: 'amsler_diagonal', label: 'SCOTOMA X' },
                    { id: 'color_ishihara', label: 'ISHIHARA' },
                    { id: 'color_d15', label: 'D-15 HUE' },
                  ] as Array<{ id: MacularColorMode; label: string }>
                ).map((mc) => (
                  <button
                    key={mc.id}
                    type="button"
                    onClick={() => updateState({ macularColorMode: mc.id })}
                    className={`py-2 text-[10px] font-bold border uppercase cursor-pointer ${
                      state.macularColorMode === mc.id
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-[#131720] border-[#252B3B] text-neutral-300 hover:text-white'
                    }`}
                  >
                    {mc.label}
                  </button>
                ))}
              </div>

              {/* Ishihara Plate Grid */}
              {state.macularColorMode === 'color_ishihara' && (
                <div className="space-y-1.5 bg-[#090B0E] p-2 border border-[#1E2330]">
                  <div className="text-[11px] text-emerald-400 font-bold">
                    PLATE TYPE: {ISHIHARA_PLATES[state.colorPlateIndex % ISHIHARA_PLATES.length].type}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {ISHIHARA_PLATES.map((pl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => updateState({ colorPlateIndex: idx })}
                        className={`py-1.5 text-xs font-bold border cursor-pointer ${
                          state.colorPlateIndex === idx
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-[#131720] border-[#252B3B] text-neutral-300'
                        }`}
                      >
                        #{pl.number}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* D-15 Controls */}
              {state.macularColorMode === 'color_d15' && (
                <div className="space-y-2 bg-[#090B0E] p-2.5 border border-[#1E2330]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">ANALYSIS:</span>
                    <span
                      className={
                        d15Analysis.crossings > 0
                          ? 'text-red-400 font-bold'
                          : 'text-emerald-400 font-bold'
                      }
                    >
                      {d15Analysis.status} ({d15Analysis.crossings} crossings)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateState({
                          d15ArrangedCaps: [0],
                          d15RemainingCaps: [...DEFAULT_D15_SHUFFLED],
                        })
                      }
                      className="py-2 bg-[#131720] hover:bg-[#1E2433] border border-[#252B3B] text-neutral-200 uppercase cursor-pointer text-xs"
                    >
                      SHUFFLE CAPS
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateState({
                          d15ArrangedCaps: Array.from({ length: 16 }, (_, i) => i),
                          d15RemainingCaps: [],
                        })
                      }
                      className="py-2 bg-[#131720] hover:bg-[#1E2433] border border-[#252B3B] text-amber-400 uppercase cursor-pointer text-xs font-bold"
                    >
                      SOLVE REFERENCE
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 8. NEAR VISION MODE: 40CM PRESBYOPIA READING DECK & ADD CONTROLS           */}
          {/* ========================================================================= */}
          {state.activeCategory === 'near_vision' && (
            <div className="bg-[#0D0F14] border border-[#1E2330] p-3 space-y-3 flex-1 flex flex-col font-mono">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-400 border-b border-[#1A1E29] pb-1.5">
                <span>40CM PRESBYOPIA READING CARD</span>
                <span className="text-amber-400 font-bold">+2.50 D DEMAND</span>
              </div>

              {/* Add Power Refraction Steppers */}
              <div className="bg-[#08090C] border border-[#1E2330] p-2.5 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                  PRESBYOPIC ADD POWER
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#10141D] p-2 border border-[#212838] flex flex-col items-center">
                    <span className="text-[10px] text-amber-400 font-bold">OD ADD</span>
                    <span className="text-base font-bold text-white">
                      +{(state.refraction?.od?.add ?? 0).toFixed(2)} D
                    </span>
                    <div className="flex gap-1 mt-1.5 w-full">
                      <button
                        type="button"
                        onClick={() =>
                          updateState((prev) => ({
                            ...prev,
                            refraction: {
                              ...prev.refraction,
                              od: {
                                ...prev.refraction.od,
                                add: Math.max(0, (prev.refraction.od.add ?? 0) - 0.25),
                              },
                            },
                          }))
                        }
                        className="flex-1 py-1 bg-[#161B26] hover:bg-[#202738] border border-[#2C344A] text-xs font-bold"
                      >
                        -0.25
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateState((prev) => ({
                            ...prev,
                            refraction: {
                              ...prev.refraction,
                              od: {
                                ...prev.refraction.od,
                                add: (prev.refraction.od.add ?? 0) + 0.25,
                              },
                            },
                          }))
                        }
                        className="flex-1 py-1 bg-[#161B26] hover:bg-[#202738] border border-[#2C344A] text-xs font-bold text-amber-400"
                      >
                        +0.25
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#10141D] p-2 border border-[#212838] flex flex-col items-center">
                    <span className="text-[10px] text-emerald-400 font-bold">OS ADD</span>
                    <span className="text-base font-bold text-white">
                      +{(state.refraction?.os?.add ?? 0).toFixed(2)} D
                    </span>
                    <div className="flex gap-1 mt-1.5 w-full">
                      <button
                        type="button"
                        onClick={() =>
                          updateState((prev) => ({
                            ...prev,
                            refraction: {
                              ...prev.refraction,
                              os: {
                                ...prev.refraction.os,
                                add: Math.max(0, (prev.refraction.os.add ?? 0) - 0.25),
                              },
                            },
                          }))
                        }
                        className="flex-1 py-1 bg-[#161B26] hover:bg-[#202738] border border-[#2C344A] text-xs font-bold"
                      >
                        -0.25
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateState((prev) => ({
                            ...prev,
                            refraction: {
                              ...prev.refraction,
                              os: {
                                ...prev.refraction.os,
                                add: (prev.refraction.os.add ?? 0) + 0.25,
                              },
                            },
                          }))
                        }
                        className="flex-1 py-1 bg-[#161B26] hover:bg-[#202738] border border-[#2C344A] text-xs font-bold text-emerald-400"
                      >
                        +0.25
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Working Distance Note */}
              <div className="text-[10px] text-neutral-400 bg-[#0F121A] p-2.5 border border-[#1E2330] leading-relaxed">
                • <strong>WORKING DISTANCE</strong>: Standardized at 40 cm (16 inches), creating an optical vergence demand of +2.50 D.
                <br />
                • Grade reading speed and comfortable threshold with Jaeger (J1–J14) and point-size (N4–N18) tiers.
              </div>
            </div>
          )}
        </section>
      </main>

      {/* MINI FLOATING PATIENT VIEW PREVIEW */}
      <MiniPatientPreview
        state={state}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onOpenExternal={onOpenPatientView}
        onUpdateState={updateState}
      />

      <CalibrationDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        calibration={state.calibration}
        showCalibrationOnPatient={state.showCalibrationOnPatient}
        showNotationOnPatient={state.showNotationOnPatient}
        isConnected={isConnected}
        connectedClients={networkInfo?.connectedClients}
        onUpdateCalibration={(cal, showOnPatient, showNotation) =>
          updateState({
            calibration: cal,
            showCalibrationOnPatient:
              showOnPatient !== undefined ? showOnPatient : state.showCalibrationOnPatient,
            showNotationOnPatient:
              showNotation !== undefined ? showNotation : state.showNotationOnPatient,
          })
        }
      />

      <PairingQrDialog
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        networkInfo={networkInfo}
        onSelectIp={onRefreshNetworkInfo}
      />
    </div>
  );
};
