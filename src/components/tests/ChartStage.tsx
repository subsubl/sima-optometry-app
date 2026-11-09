import React from 'react';
import { ExamState } from '../../types/exam';
import {
  ACUITY_LADDER,
  calculateOptotypeHeightPx,
  formatAcuityNotation,
  generateLineOptotypes,
} from '../../engine/acuityMath';
import { computeFullChartWindow } from '../../engine/chartPagination';
import { OptotypeSvg } from '../optotypes/OptotypeSvg';
import {
  AstigmatismDisplay,
  BinocularDisplay,
  ContrastSensitivityDisplay,
  DuochromeBalanceDisplay,
  MacularColorDisplay,
  NearReadingCardDisplay,
} from './ClinicalModules';

interface ChartStageProps {
  state: ExamState;
  isPatientScreen: boolean;
  scaleFactor?: number;
  onUpdateState?: (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => void;
}

export const ChartStage: React.FC<ChartStageProps> = ({
  state,
  isPatientScreen,
  scaleFactor = 1,
  onUpdateState,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = React.useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerHeight) {
      return window.innerHeight;
    }
    return 800;
  });

  const currentWindowRef = React.useRef<{
    pageLogMARs: readonly number[];
    startIndex: number;
    endIndex: number;
  } | undefined>(undefined);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };
    updateSize();

    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(el);

    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const isEtdrs = state.activeCategory === 'etdrs_wizard';
  const targetLogMAR = isEtdrs ? state.etdrsWizard.currentLogMAR : state.activeLogMAR;
  const optotypeSet = isEtdrs ? 'sloan' : state.optotypeSet;
  const isolationMode = isEtdrs
    ? state.etdrsWizard.phase === 'screening'
      ? 'single'
      : 'line'
    : state.isolationMode;

  const fullChartLayout = React.useMemo(() => {
    const layout = computeFullChartWindow({
      calibration: state.calibration,
      scaleFactor,
      containerHeight,
      targetLogMAR,
      hasPatientNotation: isPatientScreen && state.showNotationOnPatient,
      currentWindow: currentWindowRef.current,
    });
    currentWindowRef.current = {
      pageLogMARs: layout.pageLogMARs,
      startIndex: layout.startIndex,
      endIndex: layout.endIndex,
    };
    return layout;
  }, [
    state.calibration,
    scaleFactor,
    containerHeight,
    targetLogMAR,
    isPatientScreen,
    state.showNotationOnPatient,
  ]);

  if (state.isBlackout) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center select-none">
        {!isPatientScreen && (
          <span className="text-xs font-mono uppercase tracking-widest text-neutral-500">
            PATIENT DISPLAY BLACKOUT
          </span>
        )}
      </div>
    );
  }

  const mirrorClass = isPatientScreen && state.calibration.isMirroredRoom ? '-scale-x-100' : '';

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
        <AstigmatismDisplay
          state={state}
          scaleFactor={scaleFactor}
          onUpdateState={onUpdateState}
        />
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
        <MacularColorDisplay
          state={state}
          scaleFactor={scaleFactor}
          onUpdateState={onUpdateState}
        />
      </div>
    );
  }

  if (state.activeCategory === 'near_vision') {
    return (
      <div className={`w-full h-full ${mirrorClass}`}>
        <NearReadingCardDisplay
          state={state}
          scaleFactor={scaleFactor}
          onUpdateState={onUpdateState}
        />
      </div>
    );
  }

  const fgColor = state.invertPolarity ? '#FFFFFF' : '#000000';
  const baseBgColor = state.invertPolarity ? '#000000' : '#FFFFFF';

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

  const renderWithCrowding = (content: React.ReactNode, optoSizePx: number) => {
    if (state.crowdingMode === 'none') return content;

    const strokeThickness = Math.max(2, optoSizePx * 0.2);
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

    return (
      <div
        className="relative inline-flex items-center justify-center"
        style={{ padding: `${gap + strokeThickness}px` }}
      >
        <div
          className="absolute left-4 right-4 top-0"
          style={{ height: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        <div
          className="absolute left-4 right-4 bottom-0"
          style={{ height: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        <div
          className="absolute top-4 bottom-4 left-0"
          style={{ width: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        <div
          className="absolute top-4 bottom-4 right-0"
          style={{ width: `${strokeThickness}px`, backgroundColor: effectiveFgColor }}
        />
        {content}
      </div>
    );
  };

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

    if (isolationMode === 'column') {
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

    if (isolationMode === 'line') {
      const rowContent = (
        <div
          className="flex items-center justify-center"
          style={{ gap: `${activePx}px` }}
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

    // FULL MULTI-LINE CHART with Viewport Height Clipping Prevention
    // Only completely visible rows that fit within the screen height are rendered.
    // The active row is underlined in red, and the page remains stationary while stepping.
    const visibleLines = fullChartLayout.visibleLogMARs.map((lm) => {
      const match = ACUITY_LADDER.find((l) => Math.abs(l.logMAR - lm) < 0.01);
      return (
        match || {
          logMAR: lm,
          snellenUS: '20/20',
          snellenMetric: '6/6',
          decimal: '1.00',
          defaultLettersCount: 5,
          etdrsBaseScore: 85,
        }
      );
    });

    return (
      <div
        className="flex flex-col items-center justify-center max-h-full py-2"
        style={{ gap: `${fullChartLayout.rowGap}px` }}
      >
        {visibleLines.map((lineSpec) => {
          const linePx = Math.max(
            4,
            calculateOptotypeHeightPx(state.calibration, lineSpec.logMAR) * scaleFactor
          );
          const lineSyms = generateLineOptotypes(optotypeSet, lineSpec.logMAR, state.randomSeed);
          const isCurrent = Math.abs(lineSpec.logMAR - targetLogMAR) < 0.01;

          return (
            <div
              key={lineSpec.logMAR}
              onClick={() => onUpdateState?.({ activeLogMAR: lineSpec.logMAR })}
              className={`relative flex items-center justify-center px-4 py-1 cursor-pointer transition-opacity ${
                isCurrent ? 'opacity-100' : 'opacity-80 hover:opacity-100'
              }`}
            >
              {/* Optional Acuity notation at the left edge if enabled */}
              {isPatientScreen && state.showNotationOnPatient && (
                <span
                  className="absolute -left-16 text-xs font-mono font-bold tracking-wider"
                  style={{ color: effectiveFgColor, opacity: isCurrent ? 0.9 : 0.4 }}
                >
                  {formatAcuityNotation(lineSpec.logMAR, state.doctorNotation)}
                </span>
              )}

              {/* Optotypes on this line */}
              <div
                className="flex items-center justify-center"
                style={{ gap: `${linePx * 0.88}px` }}
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

              {/* Red underline indicator beneath the currently active size row */}
              {isCurrent && (
                <div
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full transition-all duration-150 pointer-events-none"
                  style={{
                    width: `calc(100% + ${Math.max(12, linePx * 0.4)}px)`,
                    height: `${Math.max(2.5, 3.5 * scaleFactor)}px`,
                    backgroundColor: '#DC2626',
                    boxShadow: '0 0 8px rgba(220, 38, 38, 0.75)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden select-none"
      style={{ backgroundColor: baseBgColor }}
    >
      {renderDuochromeBackground()}

      <div className={`relative z-10 flex items-center justify-center w-full h-full ${mirrorClass}`}>
        {renderChartContent()}
      </div>

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
