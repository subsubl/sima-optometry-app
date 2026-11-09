import { useEffect } from 'react';
import { ACUITY_LADDER, getAcuitySpec } from '../engine/acuityMath';
import {
  AcuityNotation,
  ClinicalTestCategory,
  CrowdingMode,
  DuochromeOverlay,
  ExamState,
  LetterScoreStatus,
} from '../types/exam';

interface HotkeyHandlers {
  state: ExamState;
  updateState: (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => void;
  randomizeOptotypes: () => void;
}

export const CLINICAL_CATEGORY_ORDER: ClinicalTestCategory[] = [
  'va_chart',
  'duochrome_balance',
  'astigmatism',
  'binocular',
  'etdrs_wizard',
  'contrast_wizard',
  'macular_color',
  'near_vision',
];

const NOTATION_ORDER: AcuityNotation[] = ['snellen_us', 'snellen_metric', 'decimal', 'logmar'];
const DUOCHROME_ORDER: DuochromeOverlay[] = ['none', 'split', 'red_only', 'green_only'];
const CROWDING_ORDER: CrowdingMode[] = ['none', 'bars_0.5x', 'bars_1.0x', 'box'];

/**
 * Returns the number of optotypes physically rendered on the active line.
 */
export function getActiveLineLetterCount(state: ExamState): number {
  if (state.activeCategory === 'etdrs_wizard') return 5;
  if (state.isolationMode === 'column') return 5;
  if (state.optotypeSet === 'dyop') return 1;
  return getAcuitySpec(state.activeLogMAR).defaultLettersCount;
}

export function useClinicalHotkeys({ state, updateState, randomizeOptotypes }: HotkeyHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

      switch (e.key) {
        case 'ArrowUp':
        case 'PageUp': {
          e.preventDefault();
          updateState((prev) => {
            const cur =
              prev.activeCategory === 'etdrs_wizard'
                ? prev.etdrsWizard.currentLogMAR
                : prev.activeLogMAR;
            const idx = ACUITY_LADDER.findIndex((l) => Math.abs(l.logMAR - cur) < 0.01);
            const nextIdx = Math.max(0, (idx >= 0 ? idx : 13) - 1);
            const nextLog = ACUITY_LADDER[nextIdx].logMAR;
            if (prev.activeCategory === 'etdrs_wizard') {
              return {
                ...prev,
                etdrsWizard: { ...prev.etdrsWizard, currentLogMAR: nextLog },
              };
            }
            return {
              ...prev,
              activeLogMAR: nextLog,
              currentLineScores: ['untested', 'untested', 'untested', 'untested', 'untested'],
            };
          });
          break;
        }

        case 'ArrowDown':
        case 'PageDown': {
          e.preventDefault();
          updateState((prev) => {
            const cur =
              prev.activeCategory === 'etdrs_wizard'
                ? prev.etdrsWizard.currentLogMAR
                : prev.activeLogMAR;
            const idx = ACUITY_LADDER.findIndex((l) => Math.abs(l.logMAR - cur) < 0.01);
            const nextIdx = Math.min(ACUITY_LADDER.length - 1, (idx >= 0 ? idx : 13) + 1);
            const nextLog = ACUITY_LADDER[nextIdx].logMAR;
            if (prev.activeCategory === 'etdrs_wizard') {
              return {
                ...prev,
                etdrsWizard: { ...prev.etdrsWizard, currentLogMAR: nextLog },
              };
            }
            return {
              ...prev,
              activeLogMAR: nextLog,
              currentLineScores: ['untested', 'untested', 'untested', 'untested', 'untested'],
            };
          });
          break;
        }

        case 'ArrowLeft': {
          e.preventDefault();
          updateState((prev) => {
            const curIdx = CLINICAL_CATEGORY_ORDER.indexOf(prev.activeCategory);
            const nextIdx =
              (curIdx - 1 + CLINICAL_CATEGORY_ORDER.length) %
              CLINICAL_CATEGORY_ORDER.length;
            return {
              ...prev,
              activeCategory: CLINICAL_CATEGORY_ORDER[nextIdx],
            };
          });
          break;
        }

        case 'ArrowRight': {
          e.preventDefault();
          updateState((prev) => {
            const curIdx = CLINICAL_CATEGORY_ORDER.indexOf(prev.activeCategory);
            const nextIdx = (curIdx + 1) % CLINICAL_CATEGORY_ORDER.length;
            return {
              ...prev,
              activeCategory: CLINICAL_CATEGORY_ORDER[nextIdx],
            };
          });
          break;
        }

        case '[':
        case ',': {
          e.preventDefault();
          updateState((prev) => {
            const maxLetters = getActiveLineLetterCount(prev);
            return {
              ...prev,
              activeLetterIndex: (prev.activeLetterIndex - 1 + maxLetters) % maxLetters,
              astigmatismAxisDeg:
                prev.activeCategory === 'astigmatism'
                  ? Math.max(0, prev.astigmatismAxisDeg - 10)
                  : prev.astigmatismAxisDeg,
            };
          });
          break;
        }

        case ']':
        case '.': {
          e.preventDefault();
          updateState((prev) => {
            const maxLetters = getActiveLineLetterCount(prev);
            return {
              ...prev,
              activeLetterIndex: (prev.activeLetterIndex + 1) % maxLetters,
              astigmatismAxisDeg:
                prev.activeCategory === 'astigmatism'
                  ? Math.min(180, prev.astigmatismAxisDeg + 10)
                  : prev.astigmatismAxisDeg,
            };
          });
          break;
        }

        case ' ':
        case 'r':
        case 'R': {
          e.preventDefault();
          randomizeOptotypes();
          break;
        }

        case 'f':
        case 'F': {
          e.preventDefault();
          updateState({ activeCategory: 'va_chart', isolationMode: 'full' });
          break;
        }

        case 'l':
        case 'L': {
          e.preventDefault();
          updateState({ activeCategory: 'va_chart', isolationMode: 'line' });
          break;
        }

        case 's':
        case 'S': {
          e.preventDefault();
          updateState({ activeCategory: 'va_chart', isolationMode: 'single' });
          break;
        }

        case 'v':
        case 'V': {
          e.preventDefault();
          updateState({ activeCategory: 'va_chart', isolationMode: 'column' });
          break;
        }

        case 'c':
        case 'C': {
          e.preventDefault();
          updateState((prev) => {
            const idx = CROWDING_ORDER.indexOf(prev.crowdingMode);
            return {
              ...prev,
              crowdingMode: CROWDING_ORDER[(idx + 1) % CROWDING_ORDER.length],
            };
          });
          break;
        }

        case 'd':
        case 'D': {
          e.preventDefault();
          updateState((prev) => {
            const idx = DUOCHROME_ORDER.indexOf(prev.duochromeOverlay);
            return {
              ...prev,
              duochromeOverlay: DUOCHROME_ORDER[(idx + 1) % DUOCHROME_ORDER.length],
            };
          });
          break;
        }

        case 'i':
        case 'I': {
          e.preventDefault();
          updateState((prev) => ({ ...prev, invertPolarity: !prev.invertPolarity }));
          break;
        }

        case 'n':
        case 'N': {
          e.preventDefault();
          updateState((prev) => {
            const idx = NOTATION_ORDER.indexOf(prev.doctorNotation);
            return {
              ...prev,
              doctorNotation: NOTATION_ORDER[(idx + 1) % NOTATION_ORDER.length],
            };
          });
          break;
        }

        case 'j':
        case 'J': {
          e.preventDefault();
          updateState((prev) => ({
            ...prev,
            jcc: {
              ...prev.jcc,
              flipPosition: prev.jcc?.flipPosition === 1 ? 2 : 1,
            },
          }));
          break;
        }

        case 'b':
        case 'B': {
          e.preventDefault();
          updateState((prev) => ({ ...prev, isBlackout: !prev.isBlackout }));
          break;
        }

        case '1':
        case '2':
        case '3':
        case '4':
        case '5': {
          e.preventDefault();
          const letterIdx = Number(e.key) - 1;
          updateState((prev) => {
            const maxLetters = getActiveLineLetterCount(prev);
            // GUARD: Ignore hotkeys for letter positions that do not exist on the current line
            if (letterIdx >= maxLetters) {
              return prev;
            }

            if (prev.activeCategory === 'etdrs_wizard') {
              const curLog = prev.etdrsWizard.currentLogMAR;
              const key = curLog.toFixed(1);
              const existing = prev.etdrsWizard.lineScores[key] || [
                'untested',
                'untested',
                'untested',
                'untested',
                'untested',
              ];
              const nextRow: LetterScoreStatus[] = [...existing];
              const cur = nextRow[letterIdx];
              nextRow[letterIdx] =
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
            }

            const nextScores = [...prev.currentLineScores];
            const cur = nextScores[letterIdx];
            nextScores[letterIdx] =
              cur === 'untested' ? 'correct' : cur === 'correct' ? 'incorrect' : 'untested';
            return { ...prev, currentLineScores: nextScores };
          });
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, updateState, randomizeOptotypes]);
}
