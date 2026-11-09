import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DoctorControllerView } from '../views/DoctorControllerView';
import { MiniPatientPreview } from '../components/preview/MiniPatientPreview';
import { DEFAULT_EXAM_STATE } from './examDefaults';
import { ExamState } from '../types/exam';

describe('Context-Sensitive Mode Visibility & Mini Patient Preview Verification', () => {
  const dummyProps = {
    updateState: () => {},
    randomizeOptotypes: () => {},
    resetSession: () => {},
    isConnected: true,
    networkInfo: null,
    onOpenPatientView: () => {},
  };

  describe('1. Mode and Selector Conditional Visibility', () => {
    it('shows optotype selector and aperture controls ONLY when VA chart is active', () => {
      const vaState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'va_chart',
      };

      const html = renderToString(React.createElement(DoctorControllerView, {
        state: vaState,
        ...dummyProps,
      }));

      // Optotype and aperture selectors must be visible
      expect(html).toContain('OPTOTYPE SELECTOR');
      expect(html).toContain('APERTURE ISOLATION');
      expect(html).toContain('CONTOUR CROWDING BARS');
      expect(html).toContain('EXAM SEQUENCE MACROS');

      // Irrelevant test mode selectors must be hidden
      expect(html).not.toContain('ASTIGMATISM &amp; JCC DIAL');
      expect(html).not.toContain('BINOCULAR VISION SELECTOR');
      expect(html).not.toContain('MACULAR &amp; COLOR TEST SELECTOR');
      expect(html).not.toContain('40CM PRESBYOPIA READING CARD');
    });

    it('hides optotype and aperture selectors when Astigmatism mode is chosen', () => {
      const astigState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'astigmatism',
      };

      const html = renderToString(React.createElement(DoctorControllerView, {
        state: astigState,
        ...dummyProps,
      }));

      // Optotype selector must be hidden
      expect(html).not.toContain('OPTOTYPE SELECTOR');
      expect(html).not.toContain('APERTURE ISOLATION');
      expect(html).not.toContain('CONTOUR CROWDING BARS');

      // Astigmatism selectors must be visible
      expect(html).toContain('ASTIGMATISM &amp; JCC DIAL');
      expect(html).toContain('JACKSON CROSS-CYLINDER');
      expect(html).toContain('12-HR CLOCK');
      expect(html).toContain('180° FAN');
      expect(html).toContain('JCC HONEYCOMB');
    });

    it('hides optotype selector when Duochrome Balance mode is chosen', () => {
      const duoState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'duochrome_balance',
      };

      const html = renderToString(React.createElement(DoctorControllerView, {
        state: duoState,
        ...dummyProps,
      }));

      expect(html).not.toContain('OPTOTYPE SELECTOR');
      expect(html).not.toContain('APERTURE ISOLATION');
      expect(html).toContain('DUOCHROME REFRACTION BALANCE');
      expect(html).toContain('RAM-GAP PROTOCOL');
      expect(html).toContain('OU: ADD MINUS');
      expect(html).toContain('OU: ADD PLUS');
    });

    it('hides optotype selector when Binocular mode is chosen', () => {
      const binocState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'binocular',
      };

      const html = renderToString(React.createElement(DoctorControllerView, {
        state: binocState,
        ...dummyProps,
      }));

      expect(html).not.toContain('OPTOTYPE SELECTOR');
      expect(html).not.toContain('APERTURE ISOLATION');
      expect(html).toContain('BINOCULAR VISION SELECTOR');
      expect(html).toContain('WORTH 4-DOT');
      expect(html).toContain('SCHOBER RINGS');
      expect(html).toContain('OXO NONIUS');
      expect(html).toContain('OD/OS BALANCE');
    });

    it('hides optotype selector when Macular & Color mode is chosen', () => {
      const macState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'macular_color',
      };

      const html = renderToString(React.createElement(DoctorControllerView, {
        state: macState,
        ...dummyProps,
      }));

      expect(html).not.toContain('OPTOTYPE SELECTOR');
      expect(html).not.toContain('APERTURE ISOLATION');
      expect(html).toContain('MACULAR &amp; COLOR TEST SELECTOR');
      expect(html).toContain('AMSLER W/B');
      expect(html).toContain('ISHIHARA');
      expect(html).toContain('D-15 HUE');
    });

    it('hides optotype selector and shows 40cm reading card controls when Near Vision is chosen', () => {
      const nearState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'near_vision',
      };

      const html = renderToString(React.createElement(DoctorControllerView, {
        state: nearState,
        ...dummyProps,
      }));

      expect(html).not.toContain('OPTOTYPE SELECTOR');
      expect(html).not.toContain('APERTURE ISOLATION');
      expect(html).toContain('40CM PRESBYOPIA READING CARD');
      expect(html).toContain('PRESBYOPIC ADD POWER');
      expect(html).toContain('40CM READING TIER');
    });

    it('hides optotype selector when Contrast Sensitivity mode is chosen', () => {
      const contrastState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'contrast_wizard',
      };

      const html = renderToString(React.createElement(DoctorControllerView, {
        state: contrastState,
        ...dummyProps,
      }));

      expect(html).not.toContain('OPTOTYPE SELECTOR');
      expect(html).not.toContain('APERTURE ISOLATION');
      expect(html).toContain('CONTRAST SENSITIVITY SELECTOR');
      expect(html).toContain('LETTER CONTRAST');
      expect(html).toContain('SINE GRATING (CPD)');
    });
  });

  describe('2. Mini Floating Patient View Preview Component', () => {
    it('renders floating patient preview when isOpen is true', () => {
      const html = renderToString(React.createElement(MiniPatientPreview, {
        state: DEFAULT_EXAM_STATE,
        isOpen: true,
        onClose: () => {},
      }));

      expect(html).toContain('PATIENT PREVIEW');
      expect(html).toContain('LIVE');
      expect(html).toContain('aria-label="Floating Patient View Preview"');
    });

    it('renders null when isOpen is false', () => {
      const html = renderToString(React.createElement(MiniPatientPreview, {
        state: DEFAULT_EXAM_STATE,
        isOpen: false,
        onClose: () => {},
      }));

      expect(html).toBe('');
    });

    it('renders active blackout overlay inside mini patient preview when state.isBlackout is true', () => {
      const blackoutState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        isBlackout: true,
      };

      const html = renderToString(React.createElement(MiniPatientPreview, {
        state: blackoutState,
        isOpen: true,
        onClose: () => {},
      }));

      expect(html).toContain('BLACKOUT ACTIVE');
    });

    it('has touchscreen drag support (touch-none, touch-action) and NO minimize button (strictly ON/OFF)', () => {
      const html = renderToString(React.createElement(MiniPatientPreview, {
        state: DEFAULT_EXAM_STATE,
        isOpen: true,
        onClose: () => {},
      }));

      // Touch drag styling present
      expect(html).toContain('touch-none');
      expect(html).toContain('touch-action:none');

      // No minimize button
      expect(html).not.toContain('aria-label="Minimize"');
      expect(html).not.toContain('title="Minimize Preview"');

      // Close button exists for clean ON/OFF
      expect(html).toContain('aria-label="Close"');
    });
  });

  describe('3. Mutual Exclusivity of Floating Preview and Doctor Inline View', () => {
    it('disables inline patient viewport in doctor controller when floating preview is enabled', () => {
      const html = renderToString(React.createElement(DoctorControllerView, {
        state: DEFAULT_EXAM_STATE,
        ...dummyProps,
      }));

      // Since DoctorControllerView initializes isPreviewOpen to true,
      // the inline patient view must be disabled and show the floating preview indicator
      expect(html).toContain('INLINE PATIENT VIEW DISABLED');
      expect(html).toContain('ENABLE INLINE VIEW');
      expect(html).toContain('data-testid="inline-preview-disabled"');
      expect(html).not.toContain('data-testid="inline-preview-active"');
    });
  });
});
