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
import { DEFAULT_EXAM_STATE } from './examDefaults';

describe('OptiSuite 2020 — Trigonometric Calibration & Optometric Math Engine', () => {
  it('calculates exact 5-arcminute physical height at 6.0m and 4.0m (ISO 8596)', () => {
    // At 6.0m (6000mm), 20/20 (0.0 LogMAR) subtends 5 arcminutes -> ~8.7266mm
    const h6m2020 = calculateOptotypeHeightMm(6.0, 0.0);
    expect(h6m2020).toBeCloseTo(8.7266, 3);

    // At 6.0m, 20/200 (1.0 LogMAR) subtends 50 arcminutes -> ~87.268mm
    const h6m20200 = calculateOptotypeHeightMm(6.0, 1.0);
    expect(h6m20200).toBeCloseTo(87.268, 2);

    // At 4.0m (ETDRS standard distance), 20/20 (0.0 LogMAR) -> ~5.8178mm
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
      measuredBarMm: 85.6, // 4.0 px/mm
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

  it('calculates letter-by-letter interpolated LogMAR and Snellen modifiers', () => {
    const res4of5 = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'incorrect'],
      'snellen_us'
    );
    expect(res4of5.interpolatedLogMAR).toBeCloseTo(0.02, 2);
    expect(res4of5.label).toBe('20/20 -1');

    const resFull = computeScoredLineAcuity(
      0.0,
      ['correct', 'correct', 'correct', 'correct', 'correct'],
      'snellen_us'
    );
    expect(resFull.interpolatedLogMAR).toBeCloseTo(0.0, 2);
    expect(resFull.label).toBe('20/20 (Full)');
  });
});
