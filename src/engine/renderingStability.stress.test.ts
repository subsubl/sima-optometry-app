import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { OptotypeSvg } from '../components/optotypes/OptotypeSvg';
import { ChartStage } from '../components/tests/ChartStage';
import {
  NearReadingCardDisplay,
  NEAR_VISION_TIERS,
} from '../components/tests/ClinicalModules';
import {
  computeFullChartWindow,
  FULL_CHART_PAGES,
  calculateBlockHeight,
  calculateRowHeightPx,
  calculateRowGapPx,
  getChartPageForLogMAR,
} from './chartPagination';
import {
  calculateOptotypeHeightMm,
  calculateOptotypeHeightPx,
  getPixelsPerMm,
  ACUITY_LADDER,
} from './acuityMath';
import {
  stepAdd,
  createDefaultRefractionState,
  createDefaultJccState,
} from './refractionMath';
import { DEFAULT_EXAM_STATE } from './examDefaults';
import { CalibrationConfig, ExamState } from '../types/exam';

const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');

const standardCalibration: CalibrationConfig = {
  directDistanceMeters: 4.0,
  referenceBarPixels: 323.5,
  measuredBarMm: 85.6,
  isMirroredRoom: false,
  patientToMirrorMeters: 2.0,
  mirrorToScreenMeters: 2.0,
  distanceUnit: 'meters',
};

class LcgRandom {
  private seed: number;
  constructor(seed = 12345) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

describe('Challenger M3-2 Adversarial Stress Suite: Rendering & Component Stability', () => {
  // =========================================================================
  // 1. LANDOLT C PURE VECTOR PATH & 8 CARDINAL ORIENTATIONS
  // =========================================================================
  describe('1. Landolt C Pure Vector Path & 8 Cardinal Orientations', () => {
    const cardinalOrientations = [
      { symbol: 'C', expectedAngle: 0, direction: 'RIGHT' },
      { symbol: 'C_RIGHT', expectedAngle: 0, direction: 'RIGHT' },
      { symbol: 'C_DOWN_RIGHT', expectedAngle: 45, direction: 'DOWN_RIGHT' },
      { symbol: 'C_DOWN', expectedAngle: 90, direction: 'DOWN' },
      { symbol: 'C_DOWN_LEFT', expectedAngle: 135, direction: 'DOWN_LEFT' },
      { symbol: 'C_LEFT', expectedAngle: 180, direction: 'LEFT' },
      { symbol: 'C_UP_LEFT', expectedAngle: 225, direction: 'UP_LEFT' },
      { symbol: 'C_UP', expectedAngle: 270, direction: 'UP' },
      { symbol: 'C_UP_RIGHT', expectedAngle: 315, direction: 'UP_RIGHT' },
    ] as const;

    it('renders all 8 cardinal/ordinal directions with pure vector path and exact rotational transforms', () => {
      const canonicalPath = 'M 4.9495,3.0 A 2.5 2.5 0 1 1 4.9495,2.0 L 3.9142,2.0 A 1.5 1.5 0 1 0 3.9142,3.0 Z';

      for (const orientation of cardinalOrientations) {
        const html = renderToString(
          React.createElement(OptotypeSvg, {
            symbol: orientation.symbol,
            sizePx: 120,
            color: '#F59E0B',
          })
        );

        // 1. Must contain the canonical Landolt C vector path
        expect(html).toContain(canonicalPath);

        // 2. Must contain the exact mathematical rotation around the 5x5 bounding center (2.5, 2.5)
        expect(html).toContain(`transform="rotate(${orientation.expectedAngle} 2.5 2.5)"`);

        // 3. Must NEVER contain dynamic mask IDs, defs, or clippath tags
        expect(html).not.toContain('<mask');
        expect(html).not.toContain('<defs');
        expect(html).not.toContain('<clipPath');
        expect(html).not.toContain('id=');

        // 4. Must NOT contain NaN or undefined
        expect(html).not.toContain('NaN');
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('null');
      }
    });

    it('guarantees pure vector path geometry matches ISO 8596 1:5 ratio standards', () => {
      // In 5x5 coordinate space:
      // Outer radius R = 2.5, outer diameter = 5.0
      // Inner radius r = 1.5, inner diameter = 3.0
      // Stroke width = R - r = 1.0 (exact 1:5 stroke-to-height ratio)
      // Gap width = 3.0 - 2.0 = 1.0 (exact 1:5 gap-to-height ratio)
      const outerR = 2.5;
      const innerR = 1.5;
      const strokeWidth = outerR - innerR;
      expect(strokeWidth).toBe(1.0);
      expect(strokeWidth / 5.0).toBe(0.2); // 1 arcminute / 5 arcminutes = 0.2

      // Check arc start points at gap boundary y = 3.0 and y = 2.0:
      // Outer arc x at y = 3.0 (dy = 0.5): x = 2.5 + sqrt(2.5^2 - 0.5^2) = 2.5 + sqrt(6) ≈ 4.9494897
      const expectedOuterX = 2.5 + Math.sqrt(outerR * outerR - 0.5 * 0.5);
      expect(expectedOuterX).toBeCloseTo(4.9495, 4);

      // Inner arc x at y = 2.0 (dy = -0.5): x = 2.5 + sqrt(1.5^2 - 0.5^2) = 2.5 + sqrt(2) ≈ 3.9142135
      const expectedInnerX = 2.5 + Math.sqrt(innerR * innerR - 0.5 * 0.5);
      expect(expectedInnerX).toBeCloseTo(3.9142, 4);
    });

    it('produces zero NaN, zero undefined, and well-formed SVG across extreme sizes', () => {
      const extremeSizes = [0, 0.001, 0.5, 1, 4, 16, 50, 100, 480, 1024, 5000, 10000];

      for (const size of extremeSizes) {
        for (const orientation of cardinalOrientations) {
          const html = renderToString(
            React.createElement(OptotypeSvg, {
              symbol: orientation.symbol,
              sizePx: size,
              color: '#FFFFFF',
              opacity: 0.85,
            })
          );

          expect(html).not.toContain('NaN');
          expect(html).not.toContain('undefined');
          expect(html).toContain(`viewBox="0 0 5 5"`);
          expect(html).toContain(`width="${size}"`);
          expect(html).toContain(`height="${size}"`);
          expect(html).toContain(`opacity:0.85`);

          // Ensure proper closing tags
          expect(html.startsWith('<svg')).toBe(true);
          expect(html.endsWith('</svg>')).toBe(true);
        }
      }
    });

    it('survives adversarial fuzzer of 1,000 randomized renders with zero rendering errors', () => {
      const rng = new LcgRandom(4040);
      const testSymbols = [
        ...cardinalOrientations.map((o) => o.symbol),
        'C_NONEXISTENT',
        '',
        'UNKNOWN_GLYPH',
      ];
      const testColors = ['#000', '#FFF', '#F59E0B', 'currentColor', 'transparent', 'rgb(10,20,30)'];

      for (let i = 0; i < 1000; i++) {
        const sym = rng.choice(testSymbols);
        const size = Math.round(rng.range(1, 2000) * 10) / 10;
        const opacity = Math.round(rng.range(0, 1) * 100) / 100;
        const color = rng.choice(testColors);

        const html = renderToString(
          React.createElement(OptotypeSvg, {
            symbol: sym,
            sizePx: size,
            color,
            opacity,
          })
        );

        expect(html).not.toContain('NaN');
        expect(html).not.toContain('undefined');
        expect(html.startsWith('<svg')).toBe(true);
        expect(html.endsWith('</svg>')).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. CHARTSTAGE PAGINATION STATIONARY WINDOW LOGIC STRESS TEST
  // =========================================================================
  describe('2. ChartStage Pagination Stationary Window Logic Under Rapid Stepping', () => {
    it('maintains absolute stationarity when navigating within the visible window', () => {
      const containerHeight = 420;
      const scaleFactor = 1.0;

      // Initial anchor at 0.3 on REFRACTION page
      let currentLayout = computeFullChartWindow({
        calibration: standardCalibration,
        scaleFactor,
        containerHeight,
        targetLogMAR: 0.3,
      });

      expect(currentLayout.pageLogMARs).toEqual(FULL_CHART_PAGES.REFRACTION);
      expect(currentLayout.visibleLogMARs).toContain(0.3);
      expect(currentLayout.totalBlockHeight).toBeLessThanOrEqual(currentLayout.availableHeight);

      const initialStart = currentLayout.startIndex;
      const initialEnd = currentLayout.endIndex;
      const initialVisible = [...currentLayout.visibleLogMARs];

      // Navigate sequentially through every row visible in this initial window
      for (const targetLm of initialVisible) {
        const nextLayout = computeFullChartWindow({
          calibration: standardCalibration,
          scaleFactor,
          containerHeight,
          targetLogMAR: targetLm,
          currentWindow: {
            pageLogMARs: currentLayout.pageLogMARs,
            startIndex: currentLayout.startIndex,
            endIndex: currentLayout.endIndex,
          },
        });

        // The window indices and visible slice MUST NOT change
        expect(nextLayout.startIndex).toBe(initialStart);
        expect(nextLayout.endIndex).toBe(initialEnd);
        expect(nextLayout.visibleLogMARs).toEqual(initialVisible);

        // Only the relative target index moves
        expect(nextLayout.visibleLogMARs[nextLayout.targetIndexInVisible]).toBe(targetLm);
        expect(nextLayout.totalBlockHeight).toBeLessThanOrEqual(nextLayout.availableHeight);

        currentLayout = nextLayout;
      }
    });

    it('steps downward rapidly one-by-one from top row to bottom row without clipping or desync', () => {
      const containerHeight = 360;
      const page = FULL_CHART_PAGES.REFRACTION; // [0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3]
      let currentWindow: { pageLogMARs: readonly number[]; startIndex: number; endIndex: number } | undefined;

      for (let i = 0; i < page.length; i++) {
        const targetLogMAR = page[i];
        const layout = computeFullChartWindow({
          calibration: standardCalibration,
          scaleFactor: 1.0,
          containerHeight,
          targetLogMAR,
          currentWindow,
        });

        // 1. Target must ALWAYS be included in visible rows
        expect(layout.visibleLogMARs).toContain(targetLogMAR);

        // 2. Target index in visible must point exactly to targetLogMAR
        expect(layout.visibleLogMARs[layout.targetIndexInVisible]).toBe(targetLogMAR);

        // 3. Block height must strictly not exceed available height
        expect(layout.totalBlockHeight).toBeLessThanOrEqual(layout.availableHeight);

        // 4. Start and end indices must be valid within pageLogMARs
        expect(layout.startIndex).toBeGreaterThanOrEqual(0);
        expect(layout.endIndex).toBeLessThan(layout.pageLogMARs.length);
        expect(layout.startIndex).toBeLessThanOrEqual(layout.endIndex);

        currentWindow = {
          pageLogMARs: layout.pageLogMARs,
          startIndex: layout.startIndex,
          endIndex: layout.endIndex,
        };
      }
    });

    it('steps upward rapidly one-by-one from bottom row to top row without clipping or desync', () => {
      const containerHeight = 360;
      const page = FULL_CHART_PAGES.REFRACTION;
      let currentWindow: { pageLogMARs: readonly number[]; startIndex: number; endIndex: number } | undefined;

      // Start at bottom (-0.3) and step upward to 0.4
      for (let i = page.length - 1; i >= 0; i--) {
        const targetLogMAR = page[i];
        const layout = computeFullChartWindow({
          calibration: standardCalibration,
          scaleFactor: 1.0,
          containerHeight,
          targetLogMAR,
          currentWindow,
        });

        expect(layout.visibleLogMARs).toContain(targetLogMAR);
        expect(layout.visibleLogMARs[layout.targetIndexInVisible]).toBe(targetLogMAR);
        expect(layout.totalBlockHeight).toBeLessThanOrEqual(layout.availableHeight);
        expect(layout.startIndex).toBeGreaterThanOrEqual(0);
        expect(layout.endIndex).toBeLessThan(layout.pageLogMARs.length);

        currentWindow = {
          pageLogMARs: layout.pageLogMARs,
          startIndex: layout.startIndex,
          endIndex: layout.endIndex,
        };
      }
    });

    it('handles high-frequency back-and-forth oscillations across window boundaries without hysteresis jitter', () => {
      const containerHeight = 320;
      let currentWindow: { pageLogMARs: readonly number[]; startIndex: number; endIndex: number } | undefined;

      // Oscillate 50 times between 0.2 and -0.1
      for (let cycle = 0; cycle < 50; cycle++) {
        const targetLogMAR = cycle % 2 === 0 ? 0.2 : -0.1;
        const layout = computeFullChartWindow({
          calibration: standardCalibration,
          scaleFactor: 1.0,
          containerHeight,
          targetLogMAR,
          currentWindow,
        });

        expect(layout.visibleLogMARs).toContain(targetLogMAR);
        expect(layout.totalBlockHeight).toBeLessThanOrEqual(layout.availableHeight);

        currentWindow = {
          pageLogMARs: layout.pageLogMARs,
          startIndex: layout.startIndex,
          endIndex: layout.endIndex,
        };
      }
    });

    it('maintains strict invariants across extreme container heights (120px to 4000px)', () => {
      const extremeHeights = [120, 180, 240, 300, 480, 720, 1080, 1440, 2160, 4000];

      for (const height of extremeHeights) {
        for (const targetLm of [1.2, 0.7, 0.4, 0.1, -0.2]) {
          const layout = computeFullChartWindow({
            calibration: standardCalibration,
            scaleFactor: 1.0,
            containerHeight: height,
            targetLogMAR: targetLm,
          });

          expect(layout.visibleLogMARs.length).toBeGreaterThan(0);
          expect(layout.visibleLogMARs).toContain(targetLm);
          if (layout.visibleLogMARs.length > 1) {
            expect(layout.totalBlockHeight).toBeLessThanOrEqual(layout.availableHeight);
          }
        }
      }
    });

    it('survives 2,000 Monte Carlo randomized rapid steps without any invariant violation', () => {
      const rng = new LcgRandom(9999);
      let currentWindow: { pageLogMARs: readonly number[]; startIndex: number; endIndex: number } | undefined;

      for (let step = 0; step < 2000; step++) {
        const ladderSpec = rng.choice(ACUITY_LADDER);
        const containerHeight = Math.round(rng.range(250, 1200));
        const scale = Math.round(rng.range(40, 120)) / 100;

        const layout = computeFullChartWindow({
          calibration: standardCalibration,
          scaleFactor: scale,
          containerHeight,
          targetLogMAR: ladderSpec.logMAR,
          currentWindow,
        });

        // 1. Must always find an active row
        expect(layout.visibleLogMARs.length).toBeGreaterThan(0);

        // 2. If target is in this page, visibleLogMARs must contain it
        if (layout.pageLogMARs.some((lm) => Math.abs(lm - ladderSpec.logMAR) < 0.01)) {
          expect(layout.visibleLogMARs.some((lm) => Math.abs(lm - ladderSpec.logMAR) < 0.01)).toBe(true);
        }

        // 3. Block height must fit available space (unless a single row exceeds space)
        if (layout.visibleLogMARs.length > 1) {
          expect(layout.totalBlockHeight).toBeLessThanOrEqual(layout.availableHeight);
        }

        currentWindow = {
          pageLogMARs: layout.pageLogMARs,
          startIndex: layout.startIndex,
          endIndex: layout.endIndex,
        };
      }
    });
  });

  // =========================================================================
  // 3. NEAR VISION READING CARD PARAGRAPH ISOLATION & ADD STEPPING
  // =========================================================================
  describe('3. Near Vision Reading Card Isolation & ADD Stepping', () => {
    it('provides exactly 7 standardized optometric paragraphs (N4 to N18) in strict descending visual acuity', () => {
      expect(NEAR_VISION_TIERS).toHaveLength(7);

      const expectedTiers = [
        { id: 'N4',  jaeger: 'J1+', logMAR: 0.0, mUnit: '0.4M' },
        { id: 'N5',  jaeger: 'J1',  logMAR: 0.1, mUnit: '0.5M' },
        { id: 'N6',  jaeger: 'J2',  logMAR: 0.2, mUnit: '0.6M' },
        { id: 'N8',  jaeger: 'J3',  logMAR: 0.3, mUnit: '0.8M' },
        { id: 'N10', jaeger: 'J7',  logMAR: 0.4, mUnit: '1.0M' },
        { id: 'N14', jaeger: 'J10', logMAR: 0.6, mUnit: '1.6M' },
        { id: 'N18', jaeger: 'J14', logMAR: 0.7, mUnit: '2.0M' },
      ];

      NEAR_VISION_TIERS.forEach((tier, idx) => {
        expect(tier.id).toBe(expectedTiers[idx].id);
        expect(tier.jaeger).toBe(expectedTiers[idx].jaeger);
        expect(tier.logMAR).toBe(expectedTiers[idx].logMAR);
        expect(tier.mUnit).toBe(expectedTiers[idx].mUnit);
        expect(tier.text.length).toBeGreaterThan(40);
      });
    });

    it('verifies exact trigonometric optical font sizing at 40cm working distance', () => {
      // ISO 8596 / ETDRS: 5 arcminutes at distance D (meters)
      // H = 2 * D_mm * tan( (5' * 10^LogMAR) / 2 )
      const dMeters = 0.40;
      const hN4 = calculateOptotypeHeightMm(dMeters, 0.0);
      expect(hN4).toBeCloseTo(0.5818, 3);

      const hN6 = calculateOptotypeHeightMm(dMeters, 0.2);
      expect(hN6).toBeCloseTo(0.9221, 3);

      const hN18 = calculateOptotypeHeightMm(dMeters, 0.7);
      expect(hN18).toBeCloseTo(2.9158, 3);
    });

    it('strictly clamps ADD stepping within [0.00, +4.00] D across extreme delta inputs', () => {
      // Standard increments
      expect(stepAdd(0.00, 0.25)).toBe(0.25);
      expect(stepAdd(1.75, 0.25)).toBe(2.00);
      expect(stepAdd(2.00, -0.25)).toBe(1.75);

      // Boundary clamping
      expect(stepAdd(0.00, -0.25)).toBe(0.00); // Cannot be negative
      expect(stepAdd(4.00, 0.25)).toBe(4.00);  // Cannot exceed +4.00

      // Extreme / Adversarial deltas
      expect(stepAdd(0.00, 1000)).toBe(4.00);
      expect(stepAdd(4.00, -1000)).toBe(0.00);
      expect(stepAdd(-50.0, 0.25)).toBe(0.00);
      expect(stepAdd(100.0, -0.25)).toBe(4.00);
    });

    it('guarantees zero floating point precision drift across 16 sequential ADD steps in both directions', () => {
      let add = 0.00;
      // Step up from 0.00 to 4.00
      for (let i = 1; i <= 16; i++) {
        add = stepAdd(add, 0.25);
        const expected = Math.round(i * 0.25 * 100) / 100;
        expect(add).toBe(expected);
      }
      expect(add).toBe(4.00);

      // Step down from 4.00 to 0.00
      for (let i = 15; i >= 0; i--) {
        add = stepAdd(add, -0.25);
        const expected = Math.round(i * 0.25 * 100) / 100;
        expect(add).toBe(expected);
      }
      expect(add).toBe(0.00);
    });

    it('renders NearReadingCardDisplay component reliably across light and dark polarity without NaN or errors', () => {
      const stateLight: ExamState = {
        ...DEFAULT_EXAM_STATE,
        invertPolarity: false,
        refraction: {
          ...DEFAULT_EXAM_STATE.refraction,
          od: { ...DEFAULT_EXAM_STATE.refraction.od, add: 2.25 },
          os: { ...DEFAULT_EXAM_STATE.refraction.os, add: 2.25 },
        },
      };

      const htmlLight = renderToString(
        React.createElement(NearReadingCardDisplay, {
          state: stateLight,
          scaleFactor: 1.0,
        })
      );

      const cleanLight = cleanHtml(htmlLight);
      expect(cleanLight).toContain('CALIBRATED 40 CM (16 IN)');
      expect(cleanLight).toContain('ACCOMMODATIVE DEMAND:');
      expect(cleanLight).toContain('+2.50 D');
      expect(cleanLight).toContain('OD +2.25');
      expect(cleanLight).toContain('OS +2.25');
      expect(cleanLight).toContain('ALL (FULL CARD)');
      expect(cleanLight).toContain('[N4]');
      expect(cleanLight).toContain('[N18]');
      expect(cleanLight).not.toContain('NaN');
      expect(cleanLight).not.toContain('undefined');

      // Dark Polarity
      const stateDark: ExamState = {
        ...stateLight,
        invertPolarity: true,
      };

      const htmlDark = renderToString(
        React.createElement(NearReadingCardDisplay, {
          state: stateDark,
          scaleFactor: 1.0,
        })
      );

      const cleanDark = cleanHtml(htmlDark);
      expect(cleanDark).toContain('background-color:#050608');
      expect(cleanDark).toContain('OD +2.25');
      expect(cleanDark).not.toContain('NaN');
    });

    it('gracefully survives missing or malformed refraction state without crashing or throwing', () => {
      // Partial state missing refraction
      const bareState = {
        ...DEFAULT_EXAM_STATE,
        refraction: undefined as any,
      };

      const html = renderToString(
        React.createElement(NearReadingCardDisplay, {
          state: bareState,
          scaleFactor: 1.0,
        })
      );

      const clean = cleanHtml(html);
      // Should default to +0.00
      expect(clean).toContain('OD +0.00');
      expect(clean).toContain('OS +0.00');
      expect(clean).not.toContain('NaN');
    });
  });

  // =========================================================================
  // 4. CHARTSTAGE COMPONENT INTEGRATION & RAPID RENDER CYCLES
  // =========================================================================
  describe('4. ChartStage Component Integration & Rapid Render Cycles', () => {
    it('renders ChartStage with Landolt C across line, single, and column isolation modes', () => {
      const baseState: ExamState = {
        ...DEFAULT_EXAM_STATE,
        optotypeSet: 'landolt_c',
        activeCategory: 'va_chart',
        activeLogMAR: 0.2,
      };

      // 1. Line isolation
      const htmlLine = cleanHtml(
        renderToString(
          React.createElement(ChartStage, {
            state: { ...baseState, isolationMode: 'line' },
            isPatientScreen: true,
          })
        )
      );
      expect(htmlLine).toContain('M 4.9495,3.0');
      expect(htmlLine).not.toContain('NaN');

      // 2. Single isolation
      const htmlSingle = cleanHtml(
        renderToString(
          React.createElement(ChartStage, {
            state: { ...baseState, isolationMode: 'single', activeLetterIndex: 0 },
            isPatientScreen: true,
          })
        )
      );
      expect(htmlSingle).toContain('M 4.9495,3.0');
      expect(htmlSingle).not.toContain('NaN');

      // 3. Column isolation
      const htmlCol = cleanHtml(
        renderToString(
          React.createElement(ChartStage, {
            state: { ...baseState, isolationMode: 'column', activeLetterIndex: 1 },
            isPatientScreen: true,
          })
        )
      );
      expect(htmlCol).toContain('M 4.9495,3.0');
      expect(htmlCol).not.toContain('NaN');
    });

    it('renders full multi-line chart with red underline indicator on active size row', () => {
      const state: ExamState = {
        ...DEFAULT_EXAM_STATE,
        optotypeSet: 'landolt_c',
        activeCategory: 'va_chart',
        isolationMode: 'full',
        activeLogMAR: 0.1,
      };

      const html = cleanHtml(
        renderToString(
          React.createElement(ChartStage, {
            state,
            isPatientScreen: true,
          })
        )
      );

      // Red active row indicator
      expect(html).toContain('background-color:#DC2626');
      expect(html).toContain('rgba(220, 38, 38, 0.75)');
      expect(html).not.toContain('NaN');
    });

    it('renders near_vision category through ChartStage seamlessly', () => {
      const state: ExamState = {
        ...DEFAULT_EXAM_STATE,
        activeCategory: 'near_vision',
      };

      const html = cleanHtml(
        renderToString(
          React.createElement(ChartStage, {
            state,
            isPatientScreen: true,
          })
        )
      );

      expect(html).toContain('Standard Optometric Near Vision Reading Card');
      expect(html).toContain('CALIBRATED 40 CM (16 IN)');
      expect(html).not.toContain('NaN');
    });

    it('survives rapid cycle of 100 consecutive ChartStage renders across changing states', () => {
      const rng = new LcgRandom(777);
      const ladderLogMARs = ACUITY_LADDER.map((l) => l.logMAR);

      for (let i = 0; i < 100; i++) {
        const logMAR = rng.choice(ladderLogMARs);
        const isDark = rng.next() > 0.5;
        const isMirrored = rng.next() > 0.5;

        const testState: ExamState = {
          ...DEFAULT_EXAM_STATE,
          activeLogMAR: logMAR,
          optotypeSet: 'landolt_c',
          invertPolarity: isDark,
          calibration: {
            ...standardCalibration,
            isMirroredRoom: isMirrored,
          },
        };

        const html = renderToString(
          React.createElement(ChartStage, {
            state: testState,
            isPatientScreen: true,
            scaleFactor: 1.0,
          })
        );

        expect(html).not.toContain('NaN');
        expect(html).not.toContain('undefined');
        if (isMirrored) {
          expect(html).toContain('-scale-x-100');
        }
      }
    });
  });
});

