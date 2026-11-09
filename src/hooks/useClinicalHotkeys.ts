import { useEffect } from 'react';
import { ACUITY_LADDER } from '../engine/acuityMath';
import {
  AcuityNotation,
  ClinicalTestCategory,
  CrowdingMode,
  DuochromeOverlay,
  ExamState,
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
];

const NOTATION_ORDER: AcuityNotation[] = ['snellen_us', 'snellen_metric', 'decimal', 'logmar'];
const DUOCHROME_ORDER: DuochromeOverlay[] = ['none', 'split', 'red_only', 'green_only'];
const CROWDING_ORDER: CrowdingMode[] = ['none', 'bars_0.5x', 'bars_1.0x', 'box'];

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

        // Left / Right Arrow keys cycle through the clinical test screens (VA Chart <-> Duochrome <-> Astigmatism <-> Binocular <-> eETDRS <-> Contrast <-> Macular/Color)
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

        // [ and ] or , and . step isolated target index or astigmatism axis
        case '[':
        case ',': {
          e.preventDefault();
          updateState((prev) => ({
            ...prev,
            activeLetterIndex: (prev.activeLetterIndex + 4) % 5,
            astigmatismAxisDeg:
              prev.activeCategory === 'astigmatism'
                ? Math.max(0, prev.astigmatismAxisDeg - 10)
                : prev.astigmatismAxisDeg,
          }));
          break;
        }

        case ']':
        case '.': {
          e.preventDefault();
          updateState((prev) => ({
            ...prev,
            activeLetterIndex: (prev.activeLetterIndex + 1) % 5,
            astigmatismAxisDeg:
              prev.activeCategory === 'astigmatism'
                ? Math.min(180, prev.astigmatismAxisDeg + 10)
                : prev.astigmatismAxisDeg,
          }));
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
