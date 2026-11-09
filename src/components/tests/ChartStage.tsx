import React from 'react';
import { ExamState } from '../../types/exam';
import {
  ACUITY_LADDER,
  calculateOptotypeHeightPx,
  formatAcuityNotation,
  generateLineOptotypes,
} from '../../engine/acuityMath';
import { OptotypeSvg } from '../optotypes/OptotypeSvg';
import {
  AstigmatismDisplay,
  BinocularDisplay,
  ContrastSensitivityDisplay,
  DuochromeBalanceDisplay,
  MacularColorDisplay,
} from './ClinicalModules';

interface ChartStageProps {
  state: ExamState;
  /** Whether this is the Patient Screen (applies mirror transform & privacy rules) or Doctor Mirror Preview */
  isPatientScreen: boolean;
  /** Scale multiplier (1.0 on real Patient Display, smaller on Doctor Controller preview) */
  scaleFactor?: number;
}

export const ChartStage: React.FC<ChartStageProps> = ({
  state,
  isPatientScreen,
  scaleFactor = 1,
}) => {
  // 1. Blackout / Rest Screen
  if (state.isBlackout) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center select-none">
        {!isPatientScreen && (
          <span className="text-xs font-mono uppercase tracking-widest text-neutral-500">
            Patient Display Blackout (Rest Mode)
          </span>
        )}
      </div>
    );
  }

  // Wrapper transform for Folded/Mirrored Exam Lane (applied ONLY to the physical Patient Display)
  const mirrorClass = isPatientScreen && state.calibration.isMirroredRoom ? '-scale-x-100' : '';

  // 2. Specialized Clinical Modules
  if (state.activeCategory === 'duochrome_balance') {
    return (
      <div className={`w-full h-full ${mirrorClass}`}>
        <DuochromeBalanceDisplay state={state} scaleFactor={scaleFactor} />
      </div>
    );
  }

  if (state.activeCategory === 'astigmatism') {
    return (
      <div className={`w-full h-full ${mirrorClass}`}>
        <AstigmatismDisplay state={state} scaleFactor={scaleFactor} />
      </div>
    );
  }

  if (state.activeCategory === 'binocular') {
    return (
      <div className={`w-full h-full ${mirrorClass}`}>
        <BinocularDisplay state={state} scaleFactor={scaleFactor} />
      </div>
    );
  }

  if (state.activeCategory === 'contrast_wizard') {
    return (
      <div className={`w-full h-full ${mirrorClass}`}>
        <ContrastSensitivityDisplay state={state} scaleFactor={scaleFactor} />
      </div>
    );
  }

  if (state.activeCategory === 'macular_color') {
    return (
      <div className={`w-full h-full ${mirrorClass}`}>
        <MacularColorDisplay state={state} scaleFactor={scaleFactor} />
      </div>
    );
  }

  // 3. Standard Visual Acuity Chart OR Automated (e)ETDRS Wizard
  const isEtdrs = state.activeCategory === 'etdrs_wizard';
  const targetLogMAR = isEtdrs ? state.etdrsWizard.currentLogMAR : state.activeLogMAR;
  const optotypeSet = isEtdrs ? 'sloan' : state.optotypeSet;
  const isolationMode = isEtdrs
    ? state.etdrsWizard.phase === 'screening'
      ? 'single'
      : 'line'
    : state.isolationMode;

  const fgColor = state.invertPolarity ? '#FFFFFF' : '#000000';
  const baseBgColor = state.invertPolarity ? '#000000' : '#FFFFFF';

  // Duochrome background layers
  const renderDuochromeBackground = () => {
    if (state.duochromeOverlay === 'none' || isEtdrs) return null;
    if (state.duochromeOverlay === 'red_only') {
      return <div className="absolute inset-0 bg-[#DC2626] pointer-events-none" />;
    }
    if (state.duochromeOverlay === 'green_only') {
      return <div className="absolute inset-0 bg-[#16A34A] pointer-events-none" />;
    }
    if (state.duochromeOverlay === 'split') {
      return (
        <div className="absolute inset-0 flex pointer-events-none">
          <div className="w-1/2 h-full bg-[#DC2626]" />
          <div className="w-1/2 h-full bg-[#16A34A]" />
        </div>
      );
    }
    return null;
  };

  const effectiveFgColor =
    state.duochromeOverlay !== 'none' && !isEtdrs ? '#000000' : fgColor;

  // Crowding / Contour Interaction Frame Renderer
  const renderWithCrowding = (content: React.ReactNode, optoSizePx: number) => {
    if (state.crowdingMode === 'none') return content;

    const strokeThickness = Math.max(2, optoSizePx * 0.2); // 1 arcminute stroke = 1/5th optotype height
    const gap =
      state.crowdingMode === 'bars_0.5x' ? optoSizePx * 0.5 : optoSizePx * 1.0;

    if (state.crowdingMode === 'box') {
      return (
        <div
          className="inline-flex items-center justify-center"
          style={{
            padding: `${gap}px`,
            border: `${strokeThickness}px solid ${effectiveFgColor}`,
          }}
        >
          {content}
        </div>
      );
    }

    // 4 Flanking Contour Interaction Bars (Top, Bottom, Left, Right)
    return (
      <div
        className="relative inline-flex items-center justify-center"
        style={{ padding: `${gap + strokeThickness}px` }}
      >
        {/* Top Bar */}
        <div
          className="absolute left-4 right-4 top-0"
          style={{ height: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        {/* Bottom Bar */}
        <div
          className="absolute left-4 right-4 bottom-0"
          style={{ height: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        {/* Left Bar */}
        <div
          className="absolute top-4 bottom-4 left-0"
          style={{ width: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        {/* Right Bar */}
        <div
          className="absolute top-4 bottom-4 right-0"
          style={{ width: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        {content}
      </div>
    );
  };

  // Determine which lines to show
  const renderChartContent = () => {
    const activePx = Math.max(
      4,
      calculateOptotypeHeightPx(state.calibration, targetLogMAR) * scaleFactor
    );
    const symbols = generateLineOptotypes(
      optotypeSet,
      targetLogMAR,
      state.randomSeed,
      isolationMode === 'column' || isEtdrs
    );

    // SINGLE OPTOTYPE ISOLATION
    if (isolationMode === 'single' || optotypeSet === 'dyop') {
      const idx = Math.min(symbols.length - 1, Math.max(0, state.activeLetterIndex));
      const sym = symbols[idx] || symbols[0];
      return renderWithCrowding(
        <OptotypeSvg
          symbol={sym}
          sizePx={activePx}
          color={effectiveFgColor}
          dyopDirection={state.dyopDirection}
          dyopRpm={state.dyopRpm}
        />,
        activePx
      );
    }

    // VERTICAL COLUMN ISOLATION
    if (isolationMode === 'column') {
      // Render 4 consecutive acuity steps vertically in a single column
      const activeIdx = ACUITY_LADDER.findIndex(
        (l) => Math.abs(l.logMAR - targetLogMAR) < 0.01
      );
      const startIdx = Math.max(0, Math.min(ACUITY_LADDER.length - 4, activeIdx - 1));
      const slice = ACUITY_LADDER.slice(startIdx, startIdx + 4);

      const colContent = (
        <div className="flex flex-col items-center justify-center" style={{ gap: `${activePx * 0.85}px` }}>
          {slice.map((lineSpec) => {
            const linePx = Math.max(
              4,
              calculateOptotypeHeightPx(state.calibration, lineSpec.logMAR) * scaleFactor
            );
            const rowSyms = generateLineOptotypes(optotypeSet, lineSpec.logMAR, state.randomSeed, true);
            const colSym = rowSyms[state.activeLetterIndex % rowSyms.length];
            return (
              <OptotypeSvg
                key={lineSpec.logMAR}
                symbol={colSym}
                sizePx={linePx}
                color={effectiveFgColor}
              />
            );
          })}
        </div>
      );
      return renderWithCrowding(colContent, activePx);
    }

    // SINGLE HORIZONTAL LINE ISOLATION
    if (isolationMode === 'line') {
      const rowContent = (
        <div
          className="flex items-center justify-center"
          style={{ gap: `${activePx}px` }} // Standard ETDRS inter-letter spacing = 1.0x optotype width
        >
          {symbols.map((sym, idx) => (
            <OptotypeSvg
              key={`${idx}-${sym}`}
              symbol={sym}
              sizePx={activePx}
              color={effectiveFgColor}
            />
          ))}
        </div>
      );
      return renderWithCrowding(rowContent, activePx);
    }

    // FULL MULTI-LINE CHART (Progressive LogMAR Window)
    const activeIdx = ACUITY_LADDER.findIndex(
      (l) => Math.abs(l.logMAR - targetLogMAR) < 0.01
    );
    const centerIdx = activeIdx >= 0 ? activeIdx : 13;
    const startIdx = Math.max(0, Math.min(ACUITY_LADDER.length - 5, centerIdx - 2));
    const visibleLines = ACUITY_LADDER.slice(startIdx, startIdx + 5);

    return (
      <div className="flex flex-col items-center justify-center gap-6">
        {visibleLines.map((lineSpec) => {
          const linePx = Math.max(
            4,
            calculateOptotypeHeightPx(state.calibration, lineSpec.logMAR) * scaleFactor
          );
          const lineSyms = generateLineOptotypes(optotypeSet, lineSpec.logMAR, state.randomSeed);
          const isCurrent = Math.abs(lineSpec.logMAR - targetLogMAR) < 0.01;

          return (
            <div key={lineSpec.logMAR} className="relative flex items-center justify-center">
              {/* Subtle indicator bar for the active line */}
              {isCurrent && (
                <div
                  className="absolute -left-8 w-3 h-1.5 rounded-full"
                  style={{ backgroundColor: '#EF4444' }}
                />
              )}
              <div
                className="flex items-center justify-center"
                style={{ gap: `${linePx * 0.9}px` }}
              >
                {lineSyms.map((sym, i) => (
                  <OptotypeSvg
                    key={`${lineSpec.logMAR}-${i}`}
                    symbol={sym}
                    sizePx={linePx}
                    color={effectiveFgColor}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden select-none"
      style={{ backgroundColor: baseBgColor }}
    >
      {renderDuochromeBackground()}

      {/* Main Optotype Canvas (Mirrored if Patient Screen + Folded Room) */}
      <div className={`relative z-10 flex items-center justify-center ${mirrorClass}`}>
        {renderChartContent()}
      </div>

      {/* Optional Acuity Notation Badge on Patient Screen (Only if clinician enables showNotationOnPatient) */}
      {isPatientScreen && state.showNotationOnPatient && (
        <div
          className="absolute bottom-5 right-6 z-20 px-3.5 py-1.5 rounded-lg text-sm font-mono font-bold tracking-wider opacity-60"
          style={{
            backgroundColor: state.invertPolarity ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            color: fgColor,
          }}
        >
          {formatAcuityNotation(targetLogMAR, state.doctorNotation)}
        </div>
      )}
    </div>
  );
};
