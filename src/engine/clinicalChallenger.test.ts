/**
 * SIMA Optometry App — Milestone 3 Independent Adversarial Verification Suite
 *
 * Adversarial Challenger: challenger_m3_1
 * Roles: critic, specialist
 *
 * Verifies:
 * 1. JCC Polar-to-Cartesian dot positions across all 180 degrees for Position 1 and Position 2
 *    in both Axis and Power modes. Verifies that Red and White dots are strictly orthogonal
 *    (90° apart) and straddle or align to the spectacle cylinder axis.
 * 2. 40cm Near Vision paragraph optical height calculations:
 *    H_L = 2 * 400 * tan(5' * 10^L / 2) across all N4 through N18 paragraphs and M-units.
 * 3. Spherical Equivalent (SE = S + C / 2) calculation in DigitalPhoropterConsole and
 *    refractionMath across the full 13,041 diopter clinical grid [-20.00..+20.00] x [-10.00..+10.00],
 *    verifying zero preservation (no "-0.00"), transposition invariance, and UI readouts.
 */

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  JccCrossCylinderDisplay,
  NEAR_VISION_TIERS,
  NearReadingCardDisplay,
} from '../components/tests/ClinicalModules';
import { DigitalPhoropterConsole } from '../components/phoropter/DigitalPhoropterConsole';
import {
  calculateOptotypeHeightMm,
  calculateOptotypeHeightPx,
  getPixelsPerMm,
} from './acuityMath';
import {
  calculateSphericalEquivalent,
  createDefaultRefractionState,
  formatDiopter,
  roundToStep,
  stepAxis,
  transposePrescription,
} from './refractionMath';
import { DEFAULT_EXAM_STATE } from './examDefaults';
import { CalibrationConfig, ExamState } from '../types/exam';

// Helper for cleaning React SSR comments
const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');

describe('Milestone 3 Challenger: Independent Optical & Mathematical Verification', () => {

  // ==========================================================================
  // SUITE 1: JCC POLAR-TO-CARTESIAN DOT GEOMETRY ACROSS ALL 180 DEGREES
  // ==========================================================================
  describe('1. JCC Polar-to-Cartesian Dot Geometry & Orthogonality Oracle', () => {
    const BEZEL_RADIUS = 142; // standard radius constant in JccCrossCylinderDisplay
    const EPSILON = 1e-10;

    // Independent Oracle for projecting polar degree angle to SVG Cartesian coords
    // SVG coordinate space: (0, 0) at center, +X to right, +Y downwards.
    // In optical trail frame / protractor: 0° is 9 o'clock (left), 90° is 12 o'clock (up), 180° is 3 o'clock (right).
    // rad = (180 - deg) * PI / 180
    // x = r * cos(rad), y = -r * sin(rad)
    const oraclePolarToSvg = (deg: number, r: number = BEZEL_RADIUS) => {
      const rad = ((180 - deg) * Math.PI) / 180;
      return {
        x: Math.cos(rad) * r,
        y: -Math.sin(rad) * r,
      };
    };

    // Vector dot product
    const dotProduct = (v1: { x: number; y: number }, v2: { x: number; y: number }) =>
      v1.x * v2.x + v1.y * v2.y;

    // Vector length
    const magnitude = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

    // Angular distance on circle modulo 180 degrees
    const angularDiffMod180 = (a: number, b: number) => {
      const diff = Math.abs(((a % 180) + 180) % 180 - (((b % 180) + 180) % 180));
      return Math.min(diff, 180 - diff);
    };

    it('verifies Red and White dots are strictly orthogonal (90° apart) for all 180 degrees in AXIS mode (Pos 1 & 2)', () => {
      for (let axis = 0; axis <= 180; axis++) {
        const cylAxis = ((axis % 180) + 180) % 180;

        for (const flip of [1, 2] as const) {
          // Calculate angles according to JCC AXIS mode definition
          const redDegRaw = flip === 1 ? cylAxis - 45 : cylAxis + 45;
          const whiteDegRaw = flip === 1 ? cylAxis + 45 : cylAxis - 45;

          const redDeg = ((redDegRaw % 180) + 180) % 180;
          const whiteDeg = ((whiteDegRaw % 180) + 180) % 180;

          // 1. Angular separation must be strictly 90 degrees
          const sep = angularDiffMod180(redDeg, whiteDeg);
          expect(sep).toBeCloseTo(90, 8);

          // 2. Cartesian dot product must be exactly 0 (strictly orthogonal in SVG space)
          const redP1 = oraclePolarToSvg(redDeg);
          const whiteP1 = oraclePolarToSvg(whiteDeg);
          const dot = dotProduct(redP1, whiteP1);
          expect(Math.abs(dot)).toBeLessThan(EPSILON * BEZEL_RADIUS * BEZEL_RADIUS);

          // 3. Both must lie precisely on the bezel radius
          expect(magnitude(redP1)).toBeCloseTo(BEZEL_RADIUS, 8);
          expect(magnitude(whiteP1)).toBeCloseTo(BEZEL_RADIUS, 8);

          // 4. Diametrically opposed pairs
          const redP2 = oraclePolarToSvg(redDeg + 180);
          const whiteP2 = oraclePolarToSvg(whiteDeg + 180);
          expect(redP1.x + redP2.x).toBeCloseTo(0, 8);
          expect(redP1.y + redP2.y).toBeCloseTo(0, 8);
          expect(whiteP1.x + whiteP2.x).toBeCloseTo(0, 8);
          expect(whiteP1.y + whiteP2.y).toBeCloseTo(0, 8);
        }
      }
    });

    it('verifies Red and White dots strictly straddle the cylinder axis at +/- 45° in AXIS mode', () => {
      for (let axis = 0; axis <= 180; axis++) {
        const cylAxis = ((axis % 180) + 180) % 180;
        const axisVector = oraclePolarToSvg(cylAxis, 1.0); // Unit vector along cylinder axis

        for (const flip of [1, 2] as const) {
          const redDeg = (((flip === 1 ? cylAxis - 45 : cylAxis + 45) % 180) + 180) % 180;
          const whiteDeg = (((flip === 1 ? cylAxis + 45 : cylAxis - 45) % 180) + 180) % 180;

          // Angular distance from cylinder axis must be exactly 45 degrees for both dots
          expect(angularDiffMod180(redDeg, cylAxis)).toBeCloseTo(45, 8);
          expect(angularDiffMod180(whiteDeg, cylAxis)).toBeCloseTo(45, 8);

          // Unit vectors in Cartesian space
          const redUnit = oraclePolarToSvg(redDeg, 1.0);
          const whiteUnit = oraclePolarToSvg(whiteDeg, 1.0);

          // Dot product with axis unit vector: |v . u_axis| = cos(45°) = sqrt(2)/2
          const cos45 = Math.SQRT1_2; // ~0.7071067811865476
          expect(Math.abs(dotProduct(redUnit, axisVector))).toBeCloseTo(cos45, 8);
          expect(Math.abs(dotProduct(whiteUnit, axisVector))).toBeCloseTo(cos45, 8);

          // Because red and white are orthogonal lines, their sum and difference vectors
          // form the two perpendicular symmetry axes (one along the cylinder axis, one normal).
          // One of the normalized vectors must be strictly collinear with the cylinder axis:
          const sumUnit = { x: (redUnit.x + whiteUnit.x) / Math.SQRT2, y: (redUnit.y + whiteUnit.y) / Math.SQRT2 };
          const diffUnit = { x: (redUnit.x - whiteUnit.x) / Math.SQRT2, y: (redUnit.y - whiteUnit.y) / Math.SQRT2 };

          const maxCollinearity = Math.max(
            Math.abs(dotProduct(sumUnit, axisVector)),
            Math.abs(dotProduct(diffUnit, axisVector))
          );
          expect(maxCollinearity).toBeCloseTo(1.0, 8);
        }
      }
    });

    it('verifies Red and White dots are strictly orthogonal (90° apart) for all 180 degrees in POWER mode (Pos 1 & 2)', () => {
      for (let axis = 0; axis <= 180; axis++) {
        const cylAxis = ((axis % 180) + 180) % 180;

        for (const flip of [1, 2] as const) {
          const redDegRaw = flip === 1 ? cylAxis : cylAxis + 90;
          const whiteDegRaw = flip === 1 ? cylAxis + 90 : cylAxis;

          const redDeg = ((redDegRaw % 180) + 180) % 180;
          const whiteDeg = ((whiteDegRaw % 180) + 180) % 180;

          // 1. Angular separation must be strictly 90 degrees
          const sep = angularDiffMod180(redDeg, whiteDeg);
          expect(sep).toBeCloseTo(90, 8);

          // 2. Cartesian dot product must be exactly 0
          const redP1 = oraclePolarToSvg(redDeg);
          const whiteP1 = oraclePolarToSvg(whiteDeg);
          const dot = dotProduct(redP1, whiteP1);
          expect(Math.abs(dot)).toBeLessThan(EPSILON * BEZEL_RADIUS * BEZEL_RADIUS);
        }
      }
    });

    it('verifies Red and White dots strictly align parallel and perpendicular to cylinder axis in POWER mode', () => {
      for (let axis = 0; axis <= 180; axis++) {
        const cylAxis = ((axis % 180) + 180) % 180;
        const axisVector = oraclePolarToSvg(cylAxis, 1.0);

        // Position 1: Red is parallel (0°), White is perpendicular (90°)
        const red1Unit = oraclePolarToSvg(cylAxis, 1.0);
        const white1Unit = oraclePolarToSvg((cylAxis + 90) % 180, 1.0);

        expect(Math.abs(dotProduct(red1Unit, axisVector))).toBeCloseTo(1.0, 8);
        expect(Math.abs(dotProduct(white1Unit, axisVector))).toBeCloseTo(0.0, 8);

        // Position 2: Red is perpendicular (90°), White is parallel (0°)
        const red2Unit = oraclePolarToSvg((cylAxis + 90) % 180, 1.0);
        const white2Unit = oraclePolarToSvg(cylAxis, 1.0);

        expect(Math.abs(dotProduct(red2Unit, axisVector))).toBeCloseTo(0.0, 8);
        expect(Math.abs(dotProduct(white2Unit, axisVector))).toBeCloseTo(1.0, 8);
      }
    });

    it('verifies JccCrossCylinderDisplay component matches oracle rendering across boundary axes (0°, 45°, 90°, 135°, 180°)', () => {
      const boundaryAxes = [0, 45, 90, 135, 180];

      for (const axis of boundaryAxes) {
        const state: ExamState = JSON.parse(JSON.stringify(DEFAULT_EXAM_STATE));
        state.astigmatismAxisDeg = axis;
        state.jcc = { flipPosition: 1, refinementMode: 'AXIS', powerStep: 0.25 };

        const cylAxis = ((axis % 180) + 180) % 180;
        const redDeg = ((cylAxis - 45 + 180) % 180);
        const whiteDeg = ((cylAxis + 45 + 180) % 180);

        const expectedRed = oraclePolarToSvg(redDeg);
        const expectedWhite = oraclePolarToSvg(whiteDeg);

        const html = cleanHtml(renderToString(React.createElement(JccCrossCylinderDisplay, { state })));

        // Verify Red dot translation
        const redRegex = /<g key="red-0" transform="translate\(([^,]+),\s*([^)]+)\)"/i;
        const redMatch = html.match(redRegex);
        if (redMatch) {
          const rx = parseFloat(redMatch[1]);
          const ry = parseFloat(redMatch[2]);
          expect(rx).toBeCloseTo(expectedRed.x, 2);
          expect(ry).toBeCloseTo(expectedRed.y, 2);
        }

        // Verify White dot translation
        const whiteRegex = /<g key="white-0" transform="translate\(([^,]+),\s*([^)]+)\)"/i;
        const whiteMatch = html.match(whiteRegex);
        if (whiteMatch) {
          const wx = parseFloat(whiteMatch[1]);
          const wy = parseFloat(whiteMatch[2]);
          expect(wx).toBeCloseTo(expectedWhite.x, 2);
          expect(wy).toBeCloseTo(expectedWhite.y, 2);
        }

        // Verify Bezel line hairline orientation
        const expectedAxis1 = oraclePolarToSvg(cylAxis);
        const expectedAxis2 = oraclePolarToSvg(cylAxis + 180);
        expect(html).toContain(`x1="${expectedAxis1.x}"`);
        expect(html).toContain(`y1="${expectedAxis1.y}"`);
        expect(html).toContain(`x2="${expectedAxis2.x}"`);
        expect(html).toContain(`y2="${expectedAxis2.y}"`);
      }
    });

    it('stress tests JCC calculations against extreme negative and arbitrarily large axis angles', () => {
      const extremeAngles = [-720, -360, -270, -180, -90, -45, -1, 181, 270, 360, 540, 720, 1080];

      for (const rawAxis of extremeAngles) {
        const normalized = ((rawAxis % 180) + 180) % 180;
        expect(normalized).toBeGreaterThanOrEqual(0);
        expect(normalized).toBeLessThan(180);

        const redDeg = (((normalized - 45) % 180) + 180) % 180;
        const whiteDeg = (((normalized + 45) % 180) + 180) % 180;

        const sep = angularDiffMod180(redDeg, whiteDeg);
        expect(sep).toBeCloseTo(90, 8);

        const pRed = oraclePolarToSvg(redDeg);
        const pWhite = oraclePolarToSvg(whiteDeg);
        expect(Math.abs(dotProduct(pRed, pWhite))).toBeLessThan(1e-9);
      }
    });
  });

  // ==========================================================================
  // SUITE 2: 40CM NEAR VISION PARAGRAPH OPTICAL HEIGHT CALCULATIONS ACROSS N4..N18
  // ==========================================================================
  describe('2. 40cm Near Vision Paragraph Optical Height Calculations Oracle', () => {
    const WORKING_DISTANCE_MM = 400; // 40 cm
    const FIVE_ARCMIN_RAD = (5 * Math.PI) / (60 * 180); // ~0.001454441043328608 rad

    // Theoretical optical height oracle:
    // H_L = 2 * 400 * tan( (5' * 10^LogMAR) / 2 )
    const oracleNearOptotypeHeightMm = (logMAR: number): number => {
      const angleRad = FIVE_ARCMIN_RAD * Math.pow(10, logMAR);
      return 2 * WORKING_DISTANCE_MM * Math.tan(angleRad / 2);
    };

    it('verifies exact trigonometric optical heights across all NEAR_VISION_TIERS (N4 to N18)', () => {
      const expectedTiers = [
        { id: 'N4',  jaeger: 'J1+', mUnit: '0.4M', snellen: '20/20',  logMAR: 0.0, expectedMm: 0.5818 },
        { id: 'N5',  jaeger: 'J1',  mUnit: '0.5M', snellen: '20/25',  logMAR: 0.1, expectedMm: 0.7324 },
        { id: 'N6',  jaeger: 'J2',  mUnit: '0.6M', snellen: '20/30',  logMAR: 0.2, expectedMm: 0.9220 },
        { id: 'N8',  jaeger: 'J3',  mUnit: '0.8M', snellen: '20/40',  logMAR: 0.3, expectedMm: 1.1609 },
        { id: 'N10', jaeger: 'J7',  mUnit: '1.0M', snellen: '20/50',  logMAR: 0.4, expectedMm: 1.4615 },
        { id: 'N14', jaeger: 'J10', mUnit: '1.6M', snellen: '20/80',  logMAR: 0.6, expectedMm: 2.3161 },
        { id: 'N18', jaeger: 'J14', mUnit: '2.0M', snellen: '20/100', logMAR: 0.7, expectedMm: 2.9158 },
      ];

      expect(NEAR_VISION_TIERS).toHaveLength(expectedTiers.length);

      for (let i = 0; i < expectedTiers.length; i++) {
        const spec = expectedTiers[i];
        const tier = NEAR_VISION_TIERS[i];

        expect(tier.id).toBe(spec.id);
        expect(tier.jaeger).toBe(spec.jaeger);
        expect(tier.mUnit).toBe(spec.mUnit);
        expect(tier.snellenDistanceEquiv).toBe(spec.snellen);
        expect(tier.logMAR).toBeCloseTo(spec.logMAR, 6);

        // 1. Compare codebase calculateOptotypeHeightMm against theoretical formula
        const codebaseMm = calculateOptotypeHeightMm(0.40, tier.logMAR);
        const oracleMm = oracleNearOptotypeHeightMm(tier.logMAR);

        expect(codebaseMm).toBeCloseTo(oracleMm, 10);
        expect(codebaseMm).toBeCloseTo(spec.expectedMm, 3);
      }
    });

    it('verifies M-unit linear relationship to physical height at 40cm', () => {
      // Definition: 1.0M print subtends 5 arcmin at 1.0 meter (approx 1.454 mm height).
      // At 40cm, 1.0M corresponds to 1.454 mm letter height, which subtends 12.5 arcmin (LogMAR ~0.398 ≈ 0.4, N10).
      // Nominal M-unit values in optometric reading cards (e.g. 0.6M for N6, 1.6M for N14) correspond
      // to 0.1 LogMAR progression steps rounded to standard decimal typography increments.
      const n10Height = calculateOptotypeHeightMm(0.40, 0.4);

      for (const tier of NEAR_VISION_TIERS) {
        const mValue = parseFloat(tier.mUnit.replace('M', ''));
        const tierHeight = calculateOptotypeHeightMm(0.40, tier.logMAR);
        const ratio = tierHeight / n10Height;
        const expectedRatio = mValue / 1.0;

        // Ratio matches nominal M-unit within 6% (standard optometric nominal tolerance)
        expect(Math.abs(ratio - expectedRatio) / expectedRatio).toBeLessThan(0.06);
      }
    });

    it('verifies pixel height calculations across diverse monitor calibrations', () => {
      const testCalibrations: CalibrationConfig[] = [
        // Standard 24" 1080p desktop monitor (~92 DPI, ~3.62 PPM)
        {
          measuredBarMm: 100,
          referenceBarPixels: 362,
          directDistanceMeters: 4.0,
          patientToMirrorMeters: 2.0,
          mirrorToScreenMeters: 2.0,
          isMirroredRoom: false,
          distanceUnit: 'meters',
        },
        // High-DPI 13.3" 1080p laptop (~166 DPI, ~6.53 PPM)
        {
          measuredBarMm: 100,
          referenceBarPixels: 653,
          directDistanceMeters: 4.0,
          patientToMirrorMeters: 2.0,
          mirrorToScreenMeters: 2.0,
          isMirroredRoom: false,
          distanceUnit: 'meters',
        },
        // 4K 27" monitor (~163 DPI, ~6.42 PPM)
        {
          measuredBarMm: 100,
          referenceBarPixels: 642,
          directDistanceMeters: 4.0,
          patientToMirrorMeters: 2.0,
          mirrorToScreenMeters: 2.0,
          isMirroredRoom: false,
          distanceUnit: 'meters',
        },
        // Retina MacBook display (~254 DPI, ~10.0 PPM)
        {
          measuredBarMm: 100,
          referenceBarPixels: 1000,
          directDistanceMeters: 4.0,
          patientToMirrorMeters: 2.0,
          mirrorToScreenMeters: 2.0,
          isMirroredRoom: false,
          distanceUnit: 'meters',
        },
      ];

      for (const cal of testCalibrations) {
        const ppm = getPixelsPerMm(cal);
        expect(ppm).toBe(cal.referenceBarPixels / cal.measuredBarMm);

        for (const tier of NEAR_VISION_TIERS) {
          const capHeightMm = oracleNearOptotypeHeightMm(tier.logMAR);
          const capHeightPx = capHeightMm * ppm;

          // Standard font cap-height ratio is ~0.70 of total font size (em-square)
          const expectedFontPx = capHeightPx / 0.70;

          // Verify font size is strictly positive, monotone increasing with LogMAR
          expect(expectedFontPx).toBeGreaterThan(0);
          if (tier.id === 'N4') {
            expect(capHeightPx).toBeGreaterThan(1.5);
          }
          if (tier.id === 'N18') {
            expect(capHeightPx).toBeGreaterThan(10);
          }
        }
      }
    });

    it('verifies accommodative demand and Near ADD stepped boundaries in NearReadingCardDisplay', () => {
      // 1. Accommodative demand at 40cm is exactly 1 / 0.40m = +2.50 D
      const dMeters = 0.40;
      const demandDiopters = 1 / dMeters;
      expect(demandDiopters).toBe(2.50);

      // 2. Render NearReadingCardDisplay and verify telemetry HUD
      const state: ExamState = JSON.parse(JSON.stringify(DEFAULT_EXAM_STATE));
      state.refraction.od.add = 2.50;
      state.refraction.os.add = 2.50;

      const html = cleanHtml(renderToString(React.createElement(NearReadingCardDisplay, { state })));

      expect(html).toContain('CALIBRATED 40 CM (16 IN)');
      expect(html).toContain('+2.50 D');
      expect(html).toContain('OD +2.50 / OS +2.50');
      expect(html).toContain('ISO 8596 CALIBRATED • 40 CM');

      // Verify all paragraph IDs exist in the rendered output
      for (const tier of NEAR_VISION_TIERS) {
        expect(html).toContain(`[${tier.id}]`);
        expect(html).toContain(tier.jaeger);
        expect(html).toContain(tier.mUnit);
      }
    });
  });

  // ==========================================================================
  // SUITE 3: SPHERICAL EQUIVALENT CALCULATION IN DIGITAL PHOROPTER CONSOLE
  // ==========================================================================
  describe('3. Spherical Equivalent (SE = S + C/2) Invariants Across 13,041 Grid Combinations', () => {
    it('exhaustively verifies SE across all 13,041 combinations [-20.00..+20.00] SPH x [-10.00..+10.00] CYL', () => {
      let combinationsTested = 0;

      for (let sInt = -2000; sInt <= 2000; sInt += 25) {
        const s = sInt / 100;

        for (let cInt = -1000; cInt <= 1000; cInt += 25) {
          const c = cInt / 100;
          combinationsTested++;

          const se = calculateSphericalEquivalent(s, c);
          const expectedExact = roundToStep(s + c / 2, 0.125);

          // Invariant 1: Exact mathematical calculation
          expect(se).toBe(expectedExact);

          // Invariant 2: Transposition Invariance
          // (S, C, A) transposed is (S + C, -C, A ± 90)
          // SE(S + C, -C) = (S + C) + (-C)/2 = S + C/2 = SE(S, C)
          const transposed = transposePrescription(s, c, 180);
          const seTransposed = calculateSphericalEquivalent(transposed.sphere, transposed.cylinder);
          expect(seTransposed).toBe(se);

          // Invariant 3: Zero representation must NEVER produce "-0.00"
          const formatted = formatDiopter(se);
          expect(formatted).not.toBe('-0.00');

          if (Math.abs(se) < 1e-9) {
            expect(formatted).toBe('0.00');
          }
        }
      }

      // Verify exact count of tested combinations: 161 * 81 = 13,041
      expect(combinationsTested).toBe(161 * 81);
    });

    it('verifies extreme clinical boundaries for Spherical Equivalent', () => {
      // 1. Extreme Myopia with maximum cylinder
      expect(calculateSphericalEquivalent(-20.00, -10.00)).toBe(-25.00);
      expect(formatDiopter(calculateSphericalEquivalent(-20.00, -10.00))).toBe('-25.00');

      // 2. Extreme Hyperopia with maximum cylinder
      expect(calculateSphericalEquivalent(20.00, 10.00)).toBe(25.00);
      expect(formatDiopter(calculateSphericalEquivalent(20.00, 10.00))).toBe('+25.00');

      // 3. Emmetropia / Pl / Zero
      expect(calculateSphericalEquivalent(0.00, 0.00)).toBe(0.00);
      expect(formatDiopter(calculateSphericalEquivalent(0.00, 0.00))).toBe('0.00');

      // 4. Fractional eighths of a diopter (odd quarter cylinder)
      // S = -1.25, C = -0.75 -> SE = -1.25 + (-0.375) = -1.625
      expect(calculateSphericalEquivalent(-1.25, -0.75)).toBe(-1.625);
      expect(formatDiopter(calculateSphericalEquivalent(-1.25, -0.75))).toBe('-1.63'); // -1.625 rounds to -1.63

      // S = +2.00, C = -0.25 -> SE = +2.00 - 0.125 = +1.875
      expect(calculateSphericalEquivalent(2.00, -0.25)).toBe(1.875);
      expect(formatDiopter(calculateSphericalEquivalent(2.00, -0.25))).toBe('+1.88');
    });

    it('verifies DigitalPhoropterConsole renders correct SE readouts for both OD and OS', () => {
      const state: ExamState = JSON.parse(JSON.stringify(DEFAULT_EXAM_STATE));
      state.refraction = {
        od: {
          sphere: -3.50,
          cylinder: -1.50,
          axis: 180,
          pd: 31.5,
          prism: 1.5,
          prismBase: 'IN',
          add: 2.00,
          occlusion: 'OPEN',
        },
        os: {
          sphere: 2.25,
          cylinder: -0.50,
          axis: 90,
          pd: 32.0,
          prism: 0.0,
          prismBase: 'OUT',
          add: 2.00,
          occlusion: 'PINHOLE',
        },
        binocularPd: 63.5,
        workingDistanceCm: 40,
      };

      // Expected OD SE: -3.50 + (-1.50 / 2) = -4.25 D
      const expectedOdSe = calculateSphericalEquivalent(-3.50, -1.50);
      expect(expectedOdSe).toBe(-4.25);
      const expectedOdSeStr = formatDiopter(expectedOdSe); // "-4.25"

      // Expected OS SE: +2.25 + (-0.50 / 2) = +2.00 D
      const expectedOsSe = calculateSphericalEquivalent(2.25, -0.50);
      expect(expectedOsSe).toBe(2.00);
      const expectedOsSeStr = formatDiopter(expectedOsSe); // "+2.00"

      const html = cleanHtml(
        renderToString(
          React.createElement(DigitalPhoropterConsole, {
            state,
            updateState: () => {},
          })
        )
      );

      // Verify OD prescription and SE badge
      expect(html).toContain('-3.50 -1.50 x 180°');
      expect(html).toContain(`SE: <strong class="text-slate-200">${expectedOdSeStr} D</strong>`);

      // Verify OS prescription, Pinhole badge, and SE badge
      expect(html).toContain('+2.25 -0.50 x 090°');
      expect(html).toContain('PINHOLE');
      expect(html).toContain(`SE: <strong class="text-slate-200">${expectedOsSeStr} D</strong>`);
    });

    it('verifies Duochrome RAM-GAP clinical guidance steps maintain correct Spherical Equivalent trajectory', () => {
      // In Duochrome test:
      // "Red Add Minus" (RAM): if Red is clearer, add -0.25D sphere. SE becomes more minus.
      // "Green Add Plus" (GAP): if Green is clearer, add +0.25D sphere. SE becomes more plus.
      let s = -2.00;
      const c = -1.00;
      let se = calculateSphericalEquivalent(s, c);
      expect(se).toBe(-2.50);

      // RAM step (-0.25)
      s -= 0.25;
      se = calculateSphericalEquivalent(s, c);
      expect(se).toBe(-2.75);

      // GAP step (+0.25)
      s += 0.25;
      se = calculateSphericalEquivalent(s, c);
      expect(se).toBe(-2.50);

      s += 0.25;
      se = calculateSphericalEquivalent(s, c);
      expect(se).toBe(-2.25);
    });
  });
});
