import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { OptotypeSvg } from '../components/optotypes/OptotypeSvg';
import {
  JccCrossCylinderDisplay,
  NEAR_VISION_TIERS,
  NearReadingCardDisplay,
} from '../components/tests/ClinicalModules';
import {
  calculateOptotypeHeightMm,
  getPixelsPerMm,
} from './acuityMath';
import { DEFAULT_EXAM_STATE } from './examDefaults';
import {
  calculateSphericalEquivalent,
  createDefaultJccState,
  createDefaultRefractionState,
  cycleOcclusion,
  cyclePrismBase,
  stepAdd,
  stepAxis,
  stepBinocularPd,
  stepCylinder,
  stepMonocularPd,
  stepPrism,
  stepSphere,
  toggleJccFlip,
  toggleJccPowerStep,
  toggleJccRefinementMode,
  transposePrescription,
} from './refractionMath';
import { CLINICAL_CATEGORY_ORDER } from '../hooks/useClinicalHotkeys';

describe('Milestone 3 Clinical Suite Verification', () => {
  const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');
  describe('1. Pure Vector Landolt C Implementation', () => {
    it('renders exact closed vector path without SVG masks or defs', () => {
      const html = renderToString(
        React.createElement(OptotypeSvg, {
          symbol: 'C',
          sizePx: 100,
          color: '#FFFFFF',
        })
      );

      // Verify exact closed path is rendered
      expect(html).toContain('M 4.9495,3.0 A 2.5 2.5 0 1 1 4.9495,2.0 L 3.9142,2.0 A 1.5 1.5 0 1 0 3.9142,3.0 Z');

      // Verify no dynamic mask IDs or defs exist
      expect(html).not.toContain('<mask');
      expect(html).not.toContain('<defs');
      expect(html).not.toContain('landolt-mask');
    });

    it('correctly maps all 8 ISO 8596 Landolt C orientations to rotation transforms', () => {
      const orientations: Array<{ symbol: string; expectedAngle: number }> = [
        { symbol: 'C', expectedAngle: 0 },
        { symbol: 'C_RIGHT', expectedAngle: 0 },
        { symbol: 'C_DOWN_RIGHT', expectedAngle: 45 },
        { symbol: 'C_DOWN', expectedAngle: 90 },
        { symbol: 'C_DOWN_LEFT', expectedAngle: 135 },
        { symbol: 'C_LEFT', expectedAngle: 180 },
        { symbol: 'C_UP_LEFT', expectedAngle: 225 },
        { symbol: 'C_UP', expectedAngle: 270 },
        { symbol: 'C_UP_RIGHT', expectedAngle: 315 },
      ];

      for (const { symbol, expectedAngle } of orientations) {
        const html = renderToString(
          React.createElement(OptotypeSvg, {
            symbol,
            sizePx: 100,
            color: '#000000',
          })
        );
        expect(html).toContain(`rotate(${expectedAngle} 2.5 2.5)`);
        expect(html).toContain('M 4.9495,3.0');
      }
    });
  });

  describe('2. Jackson Cross-Cylinder (JCC) Refinement Module', () => {
    it('correctly calculates Axis and Power marker positions under Position 1 and Position 2', () => {
      const state = JSON.parse(JSON.stringify(DEFAULT_EXAM_STATE));
      state.astigmatismAxisDeg = 90;

      // Position 1 in AXIS mode
      state.jcc = { flipPosition: 1, refinementMode: 'AXIS', powerStep: 0.25 };
      const htmlPos1 = cleanHtml(
        renderToString(
          React.createElement(JccCrossCylinderDisplay, { state, scaleFactor: 1 })
        )
      );
      expect(htmlPos1).toContain('POS 1');
      expect(htmlPos1).toContain('AXIS');
      expect(htmlPos1).toContain('±0.25 D');
      expect(htmlPos1).toContain('−');
      expect(htmlPos1).toContain('+');

      // Position 2 in AXIS mode
      state.jcc.flipPosition = 2;
      const htmlPos2 = cleanHtml(
        renderToString(
          React.createElement(JccCrossCylinderDisplay, { state, scaleFactor: 1 })
        )
      );
      expect(htmlPos2).toContain('POS 2');

      // Mode switch to POWER
      state.jcc.refinementMode = 'POWER';
      const htmlPower = cleanHtml(
        renderToString(
          React.createElement(JccCrossCylinderDisplay, { state, scaleFactor: 1 })
        )
      );
      expect(htmlPower).toContain('POWER');
      expect(htmlPower).toContain('POWER REFINEMENT:');
    });

    it('toggles JCC flip position, mode, and power step correctly', () => {
      expect(toggleJccFlip(1)).toBe(2);
      expect(toggleJccFlip(2)).toBe(1);

      expect(toggleJccRefinementMode('AXIS')).toBe('POWER');
      expect(toggleJccRefinementMode('POWER')).toBe('AXIS');

      expect(toggleJccPowerStep(0.25)).toBe(0.50);
      expect(toggleJccPowerStep(0.50)).toBe(0.25);
    });
  });

  describe('3. Calibrated 40cm Presbyopia Reading Card', () => {
    it('contains all 7 standard optometric reading tiers (N4 to N18)', () => {
      expect(NEAR_VISION_TIERS).toHaveLength(7);
      const tierIds = NEAR_VISION_TIERS.map((t) => t.id);
      expect(tierIds).toEqual(['N4', 'N5', 'N6', 'N8', 'N10', 'N14', 'N18']);
    });

    it('verifies exact trigonometric optical heights at 40cm viewing distance', () => {
      // At distance D = 0.40m, LogMAR 0.0:
      // H = 2 * 400mm * tan(5' / 2) = 2 * 400 * tan(0.00145444 / 2) ≈ 0.5818 mm
      const hN4 = calculateOptotypeHeightMm(0.40, 0.0);
      expect(hN4).toBeCloseTo(0.5818, 3);

      // N5 (LogMAR 0.1): H ≈ 0.732 mm
      const hN5 = calculateOptotypeHeightMm(0.40, 0.1);
      expect(hN5).toBeCloseTo(0.7324, 3);

      // N18 (LogMAR 0.7): H ≈ 2.916 mm
      const hN18 = calculateOptotypeHeightMm(0.40, 0.7);
      expect(hN18).toBeCloseTo(2.9158, 3);
    });

    it('renders NearReadingCardDisplay with calibrated header and paragraphs', () => {
      const state = JSON.parse(JSON.stringify(DEFAULT_EXAM_STATE));
      state.refraction.od.add = 1.75;
      state.refraction.os.add = 1.75;

      const html = cleanHtml(
        renderToString(
          React.createElement(NearReadingCardDisplay, { state, scaleFactor: 1 })
        )
      );

      expect(html).toContain('CALIBRATED 40 CM (16 IN)');
      expect(html).toContain('+2.50 D');
      expect(html).toContain('OD +1.75');
      expect(html).toContain('OS +1.75');
      expect(html).toContain('ALL (FULL CARD)');
      expect(html).toContain('N4');
      expect(html).toContain('N18');
      expect(html).toContain('Standard Optometric Near Vision Reading Card');
    });
  });

  describe('4. Category Registration & Phoropter Refraction Invariants', () => {
    it('registers near_vision in CLINICAL_CATEGORY_ORDER', () => {
      expect(CLINICAL_CATEGORY_ORDER).toContain('near_vision');
      expect(CLINICAL_CATEGORY_ORDER[CLINICAL_CATEGORY_ORDER.length - 1]).toBe('near_vision');
    });

    it('performs spherical stepping and maintains boundaries', () => {
      expect(stepSphere(0.0, -0.25)).toBe(-0.25);
      expect(stepSphere(-0.25, -0.25)).toBe(-0.50);
      expect(stepSphere(-20.0, -1.0)).toBe(-20.0);
      expect(stepSphere(20.0, 1.0)).toBe(20.0);
    });

    it('performs cylinder stepping and transposition', () => {
      expect(stepCylinder(0.0, -0.25)).toBe(-0.25);
      const transposed = transposePrescription(-1.25, -0.75, 180);
      expect(transposed.sphere).toBe(-2.00);
      expect(transposed.cylinder).toBe(0.75);
      expect(transposed.axis).toBe(90);
    });

    it('calculates spherical equivalent correctly (S + C/2)', () => {
      expect(calculateSphericalEquivalent(-1.25, -0.75)).toBe(-1.625);
      expect(calculateSphericalEquivalent(2.0, -1.0)).toBe(1.5);
    });

    it('cycles prism base through 4 cardinal directions', () => {
      expect(cyclePrismBase('IN')).toBe('OUT');
      expect(cyclePrismBase('OUT')).toBe('UP');
      expect(cyclePrismBase('UP')).toBe('DOWN');
      expect(cyclePrismBase('DOWN')).toBe('IN');
    });

    it('cycles aperture occlusion modes', () => {
      expect(cycleOcclusion('OPEN')).toBe('OCCLUDED');
      expect(cycleOcclusion('OCCLUDED')).toBe('PINHOLE');
      expect(cycleOcclusion('PINHOLE')).toBe('OPEN');
    });

    it('steps Near ADD within [0.00, +4.00] D', () => {
      expect(stepAdd(0.0, 0.25)).toBe(0.25);
      expect(stepAdd(1.75, 0.25)).toBe(2.00);
      expect(stepAdd(0.0, -0.25)).toBe(0.0);
      expect(stepAdd(4.0, 0.25)).toBe(4.0);
    });
  });
});
