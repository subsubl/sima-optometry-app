import { describe, expect, it } from 'vitest';
import {
  calculateOptotypeHeightMm,
  calculateOptotypeHeightPx,
  computeScoredLineAcuity,
  formatAcuityNotation,
  generateLineOptotypes,
  getEffectiveDistanceMeters,
  getPixelsPerMm,
} from './acuityMath';
import {
  calculateSphericalEquivalent,
  createDefaultRefractionState,
  cycleOcclusion,
  cyclePrismBase,
  formatAxis,
  formatDiopter,
  formatPrescription,
  roundToStep,
  sanitizeExamState,
  setEyeOcclusion,
  stepAdd,
  stepAxis,
  stepBinocularPd,
  stepCylinder,
  stepMonocularPd,
  stepPd,
  stepPrism,
  stepSphere,
  toggleJccFlip,
  toggleJccPowerStep,
  toggleJccRefinementMode,
  toggleOcclusion,
  transposePrescription,
} from './refractionMath';
import { analyzeD15Arrangement } from '../components/tests/ClinicalModules';
import { DEFAULT_EXAM_STATE } from './examDefaults';
import { LetterScoreStatus } from '../types/exam';

describe('SIMA Optometry App — Trigonometric Calibration & Optometric Math Engine', () => {
  it('calculates exact 5-arcminute physical height at 6.0m and 4.0m (ISO 8596)', () => {
    const h6m2020 = calculateOptotypeHeightMm(6.0, 0.0);
    expect(h6m2020).toBeCloseTo(8.7266, 3);

    const h6m20200 = calculateOptotypeHeightMm(6.0, 1.0);
    expect(h6m20200).toBeCloseTo(87.268, 2);

    const h4m2020 = calculateOptotypeHeightMm(4.0, 0.0);
    expect(h4m2020).toBeCloseTo(5.8178, 3);
  });

  it('computes effective distance for both direct and folded/mirrored exam lanes', () => {
    const directCal = { ...DEFAULT_EXAM_STATE.calibration, isMirroredRoom: false, directDistanceMeters: 5.5 };
    expect(getEffectiveDistanceMeters(directCal)).toBeCloseTo(5.5, 3);

    const mirroredCal = {
      ...DEFAULT_EXAM_STATE.calibration,
      isMirroredRoom: true,
      patientToMirrorMeters: 2.8,
      mirrorToScreenMeters: 3.2,
    };
    expect(getEffectiveDistanceMeters(mirroredCal)).toBeCloseTo(6.0, 3);
  });

  it('converts physical millimeter calibration to exact screen pixels', () => {
    const cal = {
      ...DEFAULT_EXAM_STATE.calibration,
      referenceBarPixels: 342.4,
      measuredBarMm: 85.6,
      isMirroredRoom: false,
      directDistanceMeters: 6.0,
    };
    expect(getPixelsPerMm(cal)).toBeCloseTo(4.0, 3);
    const px2020 = calculateOptotypeHeightPx(cal, 0.0);
    expect(px2020).toBeCloseTo(8.7266 * 4.0, 2);
  });

  it('formats acuity notations across Snellen US, Metric, Decimal, and LogMAR', () => {
    expect(formatAcuityNotation(0.0, 'snellen_us')).toBe('20/20');
    expect(formatAcuityNotation(0.0, 'snellen_metric')).toBe('6/6');
    expect(formatAcuityNotation(0.0, 'decimal')).toBe('1.00');
    expect(formatAcuityNotation(0.0, 'logmar')).toBe('+0.0');
    expect(formatAcuityNotation(0.3, 'snellen_us')).toBe('20/40');
    expect(formatAcuityNotation(-0.1, 'snellen_us')).toBe('20/16');
  });

  it('generates deterministic randomized optotype lines without adjacent duplicates', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const line1 = generateLineOptotypes('sloan', 0.0, seed);
      const line2 = generateLineOptotypes('sloan', 0.0, seed);
      expect(line1).toEqual(line2);
      expect(line1.length).toBe(5);

      for (let i = 1; i < line1.length; i++) {
        expect(line1[i]).not.toBe(line1[i - 1]);
      }
    }
  });

  it('analyzes Farnsworth D-15 cap sequences for normal order and red-green crossings', () => {
    const normalOrder = Array.from({ length: 16 }, (_, i) => i);
    const resNormal = analyzeD15Arrangement(normalOrder);
    expect(resNormal.crossings).toBe(0);
    expect(resNormal.status).toContain('NORMAL TRICHROMATIC ORDER');

    // Simulate Deutan/Protan red-green confusion crossing (1 -> 15 -> 2 -> 14)
    const rgCrossOrder = [0, 1, 15, 2, 14, 3, 13, 4, 12, 5, 11, 6, 10, 7, 9, 8];
    const resRg = analyzeD15Arrangement(rgCrossOrder);
    expect(resRg.crossings).toBeGreaterThan(2);
    expect(resRg.status).toContain('RED-GREEN AXIS');
  });
});

describe('Dynamic Optotype Count Acuity Scoring Engine (High-LogMAR lines)', () => {
  it('correctly calculates 1-letter line (20/400, LogMAR 1.30) with exact full credit and zero phantom penalties', () => {
    // 1 of 1 letter correct on 20/400 (exact 1.30 LogMAR)
    const resFull = computeScoredLineAcuity(1.3, ['correct'], 'snellen_us', 1);
    expect(resFull.interpolatedLogMAR).toBe(1.30);
    expect(resFull.label).toBe('20/400 (Full)');
    expect(resFull.correctCount).toBe(1);
    expect(resFull.testedCount).toBe(1);

    // Passed with full 5-element array where unrendered are untested:
    // Must NOT penalize for unrendered 4 letters (legacy defect was 1.38 LogMAR)
    const resFrom5Arr = computeScoredLineAcuity(
      1.3,
      ['correct', 'untested', 'untested', 'untested', 'untested'],
      'snellen_us',
      1
    );
    expect(resFrom5Arr.interpolatedLogMAR).toBe(1.30);
    expect(resFrom5Arr.label).toBe('20/400 (Full)');

    // 0 of 1 letter correct on 20/400 (missed letter = 1.40 LogMAR)
    const resMiss = computeScoredLineAcuity(1.3, ['incorrect'], 'snellen_us', 1);
    expect(resMiss.interpolatedLogMAR).toBe(1.40);
    expect(resMiss.label).toBe('20/400 (0/1)');
    expect(resMiss.correctCount).toBe(0);
    expect(resMiss.testedCount).toBe(1);
  });

  it('correctly calculates 2-letter lines (20/320 & 20/250, 0.05 LogMAR per letter)', () => {
    // 2/2 correct (LogMAR 1.20)
    const res2of2 = computeScoredLineAcuity(1.2, ['correct', 'correct'], 'snellen_us', 2);
    expect(res2of2.interpolatedLogMAR).toBe(1.20);
    expect(res2of2.label).toBe('20/320 (Full)');

    // 1/2 correct (50% pass threshold -> LogMAR 1.25)
    const res1of2 = computeScoredLineAcuity(1.2, ['correct', 'incorrect'], 'snellen_us', 2);
    expect(res1of2.interpolatedLogMAR).toBe(1.25);
    expect(res1of2.label).toBe('20/320 -1');

    // 0/2 correct (LogMAR 1.30)
    const res0of2 = computeScoredLineAcuity(1.2, ['incorrect', 'incorrect'], 'snellen_us', 2);
    expect(res0of2.interpolatedLogMAR).toBe(1.30);
    expect(res0of2.label).toBe('20/320 (0/2)');
  });

  it('correctly calculates 3-letter lines (20/200 & 20/160, 0.0333 LogMAR per letter)', () => {
    // 3/3 correct (LogMAR 1.00)
    const res3of3 = computeScoredLineAcuity(
      1.0,
      ['correct', 'correct', 'correct'],
      'snellen_us',
      3
    );
    expect(res3of3.interpolatedLogMAR).toBe(1.00);
    expect(res3of3.label).toBe('20/200 (Full)');

    // 2/3 correct (passing threshold >= 2 -> 1.00 + 1 * 0.0333 = 1.03)
    const res2of3 = computeScoredLineAcuity(
      1.0,
      ['correct', 'correct', 'incorrect'],
      'snellen_us',
      3
    );
    expect(res2of3.interpolatedLogMAR).toBe(1.03);
    expect(res2of3.label).toBe('20/200 -1');

    // 1/3 correct (failing < 2 -> credits previous line 20/250 +1 -> 1.07)
    const res1of3 = computeScoredLineAcuity(
      1.0,
      ['correct', 'incorrect', 'incorrect'],
      'snellen_us',
      3
    );
    expect(res1of3.interpolatedLogMAR).toBe(1.07);
    expect(res1of3.label).toBe('20/250 +1');

    // 0/3 correct
    const res0of3 = computeScoredLineAcuity(
      1.0,
      ['incorrect', 'incorrect', 'incorrect'],
      'snellen_us',
      3
    );
    expect(res0of3.interpolatedLogMAR).toBe(1.10);
    expect(res0of3.label).toBe('20/200 (0/3)');
  });

  it('correctly calculates 4-letter lines (20/125 & 20/100, 0.025 LogMAR per letter)', () => {
    // 4/4 correct (LogMAR 0.70)
    const res4of4 = computeScoredLineAcuity(
      0.7,
      ['correct', 'correct', 'correct', 'correct'],
      'snellen_us',
      4
    );
    expect(res4of4.interpolatedLogMAR).toBe(0.70);
    expect(res4of4.label).toBe('20/100 (Full)');

    // 3/4 correct (LogMAR 0.725 -> 0.73)
    const res3of4 = computeScoredLineAcuity(
      0.7,
      ['correct', 'correct', 'correct', 'incorrect'],
      'snellen_us',
      4
    );
    expect(res3of4.interpolatedLogMAR).toBeCloseTo(0.725, 2);
    expect(res3of4.label).toBe('20/100 -1');

    // 2/4 correct (LogMAR 0.75)
    const res2of4 = computeScoredLineAcuity(
      0.7,
      ['correct', 'correct', 'incorrect', 'incorrect'],
      'snellen_us',
      4
    );
    expect(res2of4.interpolatedLogMAR).toBe(0.75);
    expect(res2of4.label).toBe('20/100 -2');

    // 1/4 correct (failing < 2 -> credits previous line 20/125 +1 -> 0.775 -> 0.78)
    const res1of4 = computeScoredLineAcuity(
      0.7,
      ['correct', 'incorrect', 'incorrect', 'incorrect'],
      'snellen_us',
      4
    );
    expect(res1of4.interpolatedLogMAR).toBeCloseTo(0.775, 2);
    expect(res1of4.label).toBe('20/125 +1');

    // 0/4 correct
    const res0of4 = computeScoredLineAcuity(
      0.7,
      ['incorrect', 'incorrect', 'incorrect', 'incorrect'],
      'snellen_us',
      4
    );
    expect(res0of4.interpolatedLogMAR).toBe(0.80);
    expect(res0of4.label).toBe('20/100 (0/4)');
  });

  it('correctly calculates 5-letter lines (20/20, 0.02 LogMAR per letter) across all notations', () => {
    // 5/5
    const res5of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'correct'],
      'snellen_us',
      5
    );
    expect(res5of5.interpolatedLogMAR).toBe(0.00);
    expect(res5of5.label).toBe('20/20 (Full)');

    // 4/5
    const res4of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'incorrect'],
      'snellen_us',
      5
    );
    expect(res4of5.interpolatedLogMAR).toBe(0.02);
    expect(res4of5.label).toBe('20/20 -1');

    // 3/5
    const res3of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'incorrect', 'incorrect'],
      'snellen_us',
      5
    );
    expect(res3of5.interpolatedLogMAR).toBe(0.04);
    expect(res3of5.label).toBe('20/20 -2');

    // 2/5 (failing -> previous line 20/25 +2)
    const res2of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'incorrect', 'incorrect', 'incorrect'],
      'snellen_us',
      5
    );
    expect(res2of5.interpolatedLogMAR).toBe(0.06);
    expect(res2of5.label).toBe('20/25 +2');

    // 1/5 (previous line 20/25 +1)
    const res1of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'incorrect', 'incorrect', 'incorrect', 'incorrect'],
      'snellen_us',
      5
    );
    expect(res1of5.interpolatedLogMAR).toBe(0.08);
    expect(res1of5.label).toBe('20/25 +1');

    // 0/5
    const res0of5 = computeScoredLineAcuity(
      0.0,
      ['incorrect', 'incorrect', 'incorrect', 'incorrect', 'incorrect'],
      'snellen_us',
      5
    );
    expect(res0of5.interpolatedLogMAR).toBe(0.10);
    expect(res0of5.label).toBe('20/20 (0/5)');

    // Cross-notation checks on 4/5
    const metric4of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'incorrect'],
      'snellen_metric',
      5
    );
    expect(metric4of5.label).toBe('6/6 -1');

    const decimal4of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'incorrect'],
      'decimal',
      5
    );
    expect(decimal4of5.label).toBe('1.00 -1');

    const logmar4of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'incorrect'],
      'logmar',
      5
    );
    expect(logmar4of5.label).toBe('+0.0 -1');
  });

  it('automatically derives effectiveCount from AcuityLadder when lineOptotypeCount is omitted', () => {
    const full400 = computeScoredLineAcuity(
      1.3,
      ['correct', 'untested', 'untested', 'untested', 'untested'],
      'snellen_us'
    );
    expect(full400.label).toBe('20/400 (Full)');
    expect(full400.interpolatedLogMAR).toBe(1.30);

    const full200 = computeScoredLineAcuity(
      1.0,
      ['correct', 'correct', 'correct', 'untested', 'untested'],
      'snellen_us'
    );
    expect(full200.label).toBe('20/200 (Full)');
    expect(full200.interpolatedLogMAR).toBe(1.00);

    const full20 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'correct'],
      'snellen_us'
    );
    expect(full20.label).toBe('20/20 (Full)');
    expect(full20.interpolatedLogMAR).toBe(0.00);
  });

  it('handles untouched/untested lines gracefully', () => {
    const resUntested = computeScoredLineAcuity(
      0.0,
      ['untested', 'untested', 'untested', 'untested', 'untested'],
      'snellen_us',
      5
    );
    expect(resUntested.interpolatedLogMAR).toBe(0.00);
    expect(resUntested.label).toBe('20/20');
    expect(resUntested.correctCount).toBe(0);
    expect(resUntested.testedCount).toBe(0);
  });
});

describe('Digital Phoropter Refraction State Helpers & Math', () => {
  describe('stepSphere', () => {
    it('steps sphere positively and negatively in 0.25D increments', () => {
      expect(stepSphere(0.00, 0.25)).toBe(0.25);
      expect(stepSphere(0.00, -0.25)).toBe(-0.25);
      expect(stepSphere(-2.25, -0.25)).toBe(-2.50);
      expect(stepSphere(-2.25, 0.25)).toBe(-2.00);
      expect(stepSphere(1.75, 0.50)).toBe(2.25);
    });

    it('clamps sphere to clinical bounds [-20.00, +20.00]', () => {
      expect(stepSphere(20.00, 0.25)).toBe(20.00);
      expect(stepSphere(19.75, 0.50)).toBe(20.00);
      expect(stepSphere(-20.00, -0.25)).toBe(-20.00);
      expect(stepSphere(-19.75, -0.50)).toBe(-20.00);
    });

    it('maintains strict 2-decimal floating point precision without IEEE-754 drift', () => {
      expect(stepSphere(0.70, 0.25)).toBe(0.95);
      expect(stepSphere(-0.10, -0.20)).toBe(-0.30);
    });
  });

  describe('stepCylinder', () => {
    it('steps cylinder in 0.25D increments', () => {
      expect(stepCylinder(0.00, -0.25)).toBe(-0.25);
      expect(stepCylinder(-0.75, -0.25)).toBe(-1.00);
      expect(stepCylinder(-1.50, 0.25)).toBe(-1.25);
    });

    it('clamps cylinder to clinical bounds [-10.00, +10.00]', () => {
      expect(stepCylinder(-10.00, -0.25)).toBe(-10.00);
      expect(stepCylinder(-9.75, -0.50)).toBe(-10.00);
      expect(stepCylinder(10.00, 0.25)).toBe(10.00);
    });
  });

  describe('stepAxis', () => {
    it('rotates axis within standard range [1, 180]', () => {
      expect(stepAxis(90, 5)).toBe(95);
      expect(stepAxis(90, -5)).toBe(85);
      expect(stepAxis(1, 1)).toBe(2);
      expect(stepAxis(179, 1)).toBe(180);
      expect(stepAxis(180, -1)).toBe(179);
    });

    it('wraps around upper boundary 180 -> 1', () => {
      expect(stepAxis(180, 1)).toBe(1);
      expect(stepAxis(180, 5)).toBe(5);
      expect(stepAxis(175, 10)).toBe(5);
      expect(stepAxis(180, 15)).toBe(15);
    });

    it('wraps around lower boundary 1 -> 180', () => {
      expect(stepAxis(1, -1)).toBe(180);
      expect(stepAxis(1, -5)).toBe(176);
      expect(stepAxis(5, -10)).toBe(175);
      expect(stepAxis(10, -15)).toBe(175);
    });

    it('handles full 180/360-degree rotations and identity steps correctly', () => {
      expect(stepAxis(90, 180)).toBe(90);
      expect(stepAxis(90, -180)).toBe(90);
      expect(stepAxis(90, 360)).toBe(90);
      expect(stepAxis(180, 180)).toBe(180);
      expect(stepAxis(180, 360)).toBe(180);
      expect(stepAxis(45, 0)).toBe(45);
    });
  });

  describe('stepAdd', () => {
    it('steps reading add in 0.25D increments', () => {
      expect(stepAdd(0.00, 0.25)).toBe(0.25);
      expect(stepAdd(1.25, 0.25)).toBe(1.50);
      expect(stepAdd(2.00, -0.25)).toBe(1.75);
    });

    it('clamps add between 0.00 and +4.00, preventing negative values', () => {
      expect(stepAdd(0.00, -0.25)).toBe(0.00);
      expect(stepAdd(0.00, -1.00)).toBe(0.00);
      expect(stepAdd(4.00, 0.25)).toBe(4.00);
      expect(stepAdd(3.75, 0.50)).toBe(4.00);
    });
  });

  describe('toggleOcclusion & cycleOcclusion', () => {
    it('toggles occlusion between OPEN and OCCLUDED', () => {
      expect(toggleOcclusion('OPEN')).toBe('OCCLUDED');
      expect(toggleOcclusion('OCCLUDED')).toBe('OPEN');
      expect(toggleOcclusion('PINHOLE')).toBe('OPEN');
    });

    it('cycles occlusion through OPEN -> OCCLUDED -> PINHOLE -> OPEN', () => {
      expect(cycleOcclusion('OPEN')).toBe('OCCLUDED');
      expect(cycleOcclusion('OCCLUDED')).toBe('PINHOLE');
      expect(cycleOcclusion('PINHOLE')).toBe('OPEN');
    });
  });

  describe('stepPd & stepPrism & cyclePrismBase', () => {
    it('steps monocular PD in 0.5mm increments and clamps [25.0, 40.0]', () => {
      expect(stepPd(32.0, 0.5)).toBe(32.5);
      expect(stepPd(25.0, -0.5)).toBe(25.0);
      expect(stepPd(40.0, 0.5)).toBe(40.0);
      expect(stepMonocularPd(30.0, 0.5)).toBe(30.5);
      expect(stepMonocularPd(25.0, -1.0)).toBe(25.0);
    });

    it('steps binocular PD in 0.5mm increments and clamps [50.0, 80.0]', () => {
      expect(stepPd(64.0, 0.5)).toBe(64.5);
      expect(stepPd(50.0, -1.0)).toBe(50.0);
      expect(stepPd(80.0, 1.0)).toBe(80.0);
      expect(stepBinocularPd(62.0, -0.5)).toBe(61.5);
    });

    it('steps prism diopters and clamps between 0 and 20', () => {
      expect(stepPrism(0.0, 0.5)).toBe(0.5);
      expect(stepPrism(0.0, -0.5)).toBe(0.0);
      expect(stepPrism(20.0, 0.5)).toBe(20.0);
      expect(stepPrism(19.5, 1.0)).toBe(20.0);
    });

    it('cycles prism base direction through IN -> OUT -> UP -> DOWN -> IN', () => {
      expect(cyclePrismBase('IN')).toBe('OUT');
      expect(cyclePrismBase('OUT')).toBe('UP');
      expect(cyclePrismBase('UP')).toBe('DOWN');
      expect(cyclePrismBase('DOWN')).toBe('IN');
    });
  });

  describe('setEyeOcclusion', () => {
    it('configures aperture occlusion correctly for OD, OS, and OU', () => {
      const initial = createDefaultRefractionState();

      const odTested = setEyeOcclusion(initial, 'OD');
      expect(odTested.od.occlusion).toBe('OPEN');
      expect(odTested.os.occlusion).toBe('OCCLUDED');

      const osTested = setEyeOcclusion(initial, 'OS');
      expect(osTested.od.occlusion).toBe('OCCLUDED');
      expect(osTested.os.occlusion).toBe('OPEN');

      const ouTested = setEyeOcclusion(initial, 'OU');
      expect(ouTested.od.occlusion).toBe('OPEN');
      expect(ouTested.os.occlusion).toBe('OPEN');
    });
  });

  describe('JCC Toggles, Spherical Equivalent & Prescription Utilities', () => {
    it('toggles JCC flip position, refinement mode, and power step', () => {
      expect(toggleJccFlip(1)).toBe(2);
      expect(toggleJccFlip(2)).toBe(1);

      expect(toggleJccRefinementMode('AXIS')).toBe('POWER');
      expect(toggleJccRefinementMode('POWER')).toBe('AXIS');

      expect(toggleJccPowerStep(0.25)).toBe(0.50);
      expect(toggleJccPowerStep(0.50)).toBe(0.25);
    });

    it('calculates spherical equivalent accurately', () => {
      // SE = Sphere + Cylinder / 2
      expect(calculateSphericalEquivalent(-2.00, -1.00)).toBe(-2.50);
      expect(calculateSphericalEquivalent(1.00, -0.50)).toBe(0.75);
      expect(calculateSphericalEquivalent(0.00, 0.00)).toBe(0.00);
    });

    it('transposes prescriptions accurately between minus- and plus-cylinder', () => {
      // -1.50 -1.00 x 180 -> -2.50 +1.00 x 90
      const res = transposePrescription(-1.50, -1.00, 180);
      expect(res.sphere).toBe(-2.50);
      expect(res.cylinder).toBe(1.00);
      expect(res.axis).toBe(90);

      // +2.00 +0.75 x 45 -> +2.75 -0.75 x 135
      const res2 = transposePrescription(2.00, 0.75, 45);
      expect(res2.sphere).toBe(2.75);
      expect(res2.cylinder).toBe(-0.75);
      expect(res2.axis).toBe(135);
    });

    it('formats diopter, axis, and complete prescriptions', () => {
      expect(formatDiopter(1.25)).toBe('+1.25');
      expect(formatDiopter(-0.50)).toBe('-0.50');
      expect(formatDiopter(0.00)).toBe('0.00');

      expect(formatAxis(180)).toBe('180°');
      expect(formatAxis(90)).toBe('090°');
      expect(formatAxis(5)).toBe('005°');

      const eye = {
        sphere: -1.25,
        cylinder: -0.75,
        axis: 180,
        pd: 32.0,
        prism: 0.0,
        prismBase: 'IN' as const,
        add: 0.0,
        occlusion: 'OPEN' as const,
      };
      expect(formatPrescription(eye)).toBe('-1.25 -0.75 x 180°');
    });
  });

  describe('sanitizeExamState', () => {
    it('returns default exam state when input is null or undefined', () => {
      const sanitizedNull = sanitizeExamState(null);
      expect(sanitizedNull.refraction).toBeDefined();
      expect(sanitizedNull.refraction.od.sphere).toBe(0.0);
      expect(sanitizedNull.jcc.flipPosition).toBe(1);

      const sanitizedUndefined = sanitizeExamState(undefined);
      expect(sanitizedUndefined.refraction).toBeDefined();
      expect(sanitizedUndefined.jcc).toBeDefined();
    });

    it('hydrates legacy states missing refraction and jcc without mutation or error', () => {
      const legacyState = {
        activeCategory: 'astigmatism' as const,
        activeLogMAR: 0.3,
        // no refraction or jcc
      };
      const hydrated = sanitizeExamState(legacyState);
      expect(hydrated.activeCategory).toBe('astigmatism');
      expect(hydrated.activeLogMAR).toBe(0.3);
      expect(hydrated.refraction).toBeDefined();
      expect(hydrated.refraction.binocularPd).toBe(64.0);
      expect(hydrated.refraction.od.axis).toBe(180);
      expect(hydrated.jcc).toBeDefined();
      expect(hydrated.jcc.refinementMode).toBe('AXIS');
    });
  });
});
