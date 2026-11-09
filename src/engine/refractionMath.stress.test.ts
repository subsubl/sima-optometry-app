/**
 * SIMA Optometry App — Adversarial Stress & Property-Based Monte Carlo Fuzzing Suite
 * Validates mathematical invariants, boundary transitions, out-of-bound clamping,
 * optical transposition symmetries, and state sanitization resilience under adversarial inputs.
 */

import { describe, expect, it } from 'vitest';
import {
  calculateSphericalEquivalent,
  createDefaultJccState,
  createDefaultRefractionEyeState,
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
import {
  AcuityNotation,
  AstigmatismMode,
  BinocularMode,
  ChartIsolationMode,
  ClinicalTestCategory,
  CrowdingMode,
  DuochromeOverlay,
  ExamState,
  JccFlipPosition,
  JccPowerStep,
  JccRefinementMode,
  LetterScoreStatus,
  MacularColorMode,
  OcclusionMode,
  OptotypeSetId,
  PrismBase,
} from '../types/exam';

// Pseudo-random number generator with deterministic seed (xorshift128+) for reproducible fuzzing runs
class SeededRandom {
  private s0: number;
  private s1: number;

  constructor(seed = 0xdeadbeef) {
    this.s0 = seed >>> 0;
    this.s1 = (seed ^ 0x41c64e6d) >>> 0;
  }

  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return ((this.s0 + this.s1) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

describe('Adversarial Stress Test: stepAxis Cyclic & Modulo Invariants', () => {
  it('passes exact canonical cyclic boundary transitions', () => {
    // Exact transitions specified in clinical phoropter spec
    expect(stepAxis(180, 1)).toBe(1);
    expect(stepAxis(1, -1)).toBe(180);
    expect(stepAxis(180, 5)).toBe(5);
    expect(stepAxis(1, -5)).toBe(176);
    expect(stepAxis(2, -5)).toBe(177);
    expect(stepAxis(175, 10)).toBe(5);
    expect(stepAxis(5, -10)).toBe(175);
    expect(stepAxis(180, 15)).toBe(15);
    expect(stepAxis(10, -15)).toBe(175);
    expect(stepAxis(180, 180)).toBe(180);
    expect(stepAxis(180, -180)).toBe(180);
    expect(stepAxis(90, 180)).toBe(90);
    expect(stepAxis(90, -180)).toBe(90);
    expect(stepAxis(90, 360)).toBe(90);
    expect(stepAxis(90, -360)).toBe(90);
    expect(stepAxis(45, 0)).toBe(45);
    expect(stepAxis(1, 0)).toBe(1);
    expect(stepAxis(180, 0)).toBe(180);
  });

  it('preserves invariant [1, 180] across 10,000 randomized Monte Carlo axes & deltas (-3600 to +3600)', () => {
    const rng = new SeededRandom(1001);
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      // Test across random initial axes (including negative, zero, and out-of-range)
      const initialAxis = rng.nextInt(-500, 500);
      const delta = rng.nextInt(-3600, 3600);

      const result = stepAxis(initialAxis, delta);

      // Invariant 1: Result MUST be a safe integer
      expect(Number.isInteger(result)).toBe(true);

      // Invariant 2: Result MUST be strictly within [1, 180]
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(180);

      // Invariant 3: Equivalence under 180-degree phase shift (Z/180Z cyclic symmetry)
      const shiftedResult = stepAxis(initialAxis, delta + 180 * rng.nextInt(-20, 20));
      expect(result).toBe(shiftedResult);
    }
  });

  it('satisfies group action / composition law: stepAxis(stepAxis(a, d1), d2) === stepAxis(a, d1 + d2)', () => {
    const rng = new SeededRandom(2002);
    const iterations = 5000;

    for (let i = 0; i < iterations; i++) {
      const a = rng.nextInt(1, 180);
      const d1 = rng.nextInt(-1800, 1800);
      const d2 = rng.nextInt(-1800, 1800);

      const stepWise = stepAxis(stepAxis(a, d1), d2);
      const combined = stepAxis(a, d1 + d2);

      expect(stepWise).toBe(combined);
    }
  });

  it('forms a complete Hamiltonian cycle of length 180 without skipping or repeating any axis', () => {
    for (let start = 1; start <= 180; start++) {
      let current = start;
      const visited = new Set<number>();

      for (let step = 0; step < 180; step++) {
        visited.add(current);
        current = stepAxis(current, 1);
      }

      // After 180 steps of +1, we must return to start and have visited all 180 axes
      expect(current).toBe(start);
      expect(visited.size).toBe(180);
      for (let expected = 1; expected <= 180; expected++) {
        expect(visited.has(expected)).toBe(true);
      }
    }
  });

  it('forms a complete reverse Hamiltonian cycle of length 180 with step -1', () => {
    for (let start = 1; start <= 180; start++) {
      let current = start;
      const visited = new Set<number>();

      for (let step = 0; step < 180; step++) {
        visited.add(current);
        current = stepAxis(current, -1);
      }

      expect(current).toBe(start);
      expect(visited.size).toBe(180);
    }
  });
});

describe('Adversarial Stress Test: Out-of-Bounds Clamping Invariants', () => {
  const rng = new SeededRandom(3003);

  describe('stepSphere [-20.00, +20.00]', () => {
    it('strictly clamps extreme out-of-bound values', () => {
      expect(stepSphere(-1000, 0)).toBe(-20.00);
      expect(stepSphere(1000, 0)).toBe(20.00);
      expect(stepSphere(-20.00, -0.25)).toBe(-20.00);
      expect(stepSphere(-20.00, -100)).toBe(-20.00);
      expect(stepSphere(20.00, 0.25)).toBe(20.00);
      expect(stepSphere(20.00, 100)).toBe(20.00);
      expect(stepSphere(25.00, -2.00)).toBe(20.00);
      expect(stepSphere(-25.00, 2.00)).toBe(-20.00);
    });

    it('preserves clamping invariant across 5,000 Monte Carlo trials', () => {
      for (let i = 0; i < 5000; i++) {
        const cur = rng.nextFloat(-100, 100);
        const delta = rng.nextFloat(-50, 50);
        const result = stepSphere(cur, delta);

        expect(result).toBeGreaterThanOrEqual(-20.00);
        expect(result).toBeLessThanOrEqual(20.00);

        // Verification oracle
        const expected = Math.round(Math.max(-20.0, Math.min(20.0, cur + delta)) * 100) / 100;
        expect(result).toBe(expected);
      }
    });
  });

  describe('stepCylinder [-10.00, +10.00]', () => {
    it('strictly clamps extreme out-of-bound values', () => {
      expect(stepCylinder(-500, 0)).toBe(-10.00);
      expect(stepCylinder(500, 0)).toBe(10.00);
      expect(stepCylinder(-10.00, -0.25)).toBe(-10.00);
      expect(stepCylinder(10.00, 0.25)).toBe(10.00);
      expect(stepCylinder(15.00, -2.00)).toBe(10.00);
      expect(stepCylinder(-15.00, 2.00)).toBe(-10.00);
    });

    it('preserves clamping invariant across 5,000 Monte Carlo trials', () => {
      for (let i = 0; i < 5000; i++) {
        const cur = rng.nextFloat(-50, 50);
        const delta = rng.nextFloat(-25, 25);
        const result = stepCylinder(cur, delta);

        expect(result).toBeGreaterThanOrEqual(-10.00);
        expect(result).toBeLessThanOrEqual(10.00);

        const expected = Math.round(Math.max(-10.0, Math.min(10.0, cur + delta)) * 100) / 100;
        expect(result).toBe(expected);
      }
    });
  });

  describe('stepAdd [0.00, +4.00]', () => {
    it('strictly clamps extreme out-of-bound values and prevents negative ADD', () => {
      expect(stepAdd(-100, 0)).toBe(0.00);
      expect(stepAdd(100, 0)).toBe(4.00);
      expect(stepAdd(0.00, -0.25)).toBe(0.00);
      expect(stepAdd(0.00, -5.00)).toBe(0.00);
      expect(stepAdd(4.00, 0.25)).toBe(4.00);
      expect(stepAdd(4.00, 10.00)).toBe(4.00);
      expect(stepAdd(6.00, -1.00)).toBe(4.00);
    });

    it('preserves clamping invariant across 5,000 Monte Carlo trials', () => {
      for (let i = 0; i < 5000; i++) {
        const cur = rng.nextFloat(-20, 20);
        const delta = rng.nextFloat(-10, 10);
        const result = stepAdd(cur, delta);

        expect(result).toBeGreaterThanOrEqual(0.00);
        expect(result).toBeLessThanOrEqual(4.00);

        const expected = Math.round(Math.max(0.0, Math.min(4.0, cur + delta)) * 100) / 100;
        expect(result).toBe(expected);
      }
    });
  });

  describe('stepPrism [0.0, 20.0]', () => {
    it('strictly clamps extreme out-of-bound values and prevents negative prism', () => {
      expect(stepPrism(-100, 0)).toBe(0.0);
      expect(stepPrism(100, 0)).toBe(20.0);
      expect(stepPrism(0.0, -0.5)).toBe(0.0);
      expect(stepPrism(0.0, -10.0)).toBe(0.0);
      expect(stepPrism(20.0, 0.5)).toBe(20.0);
      expect(stepPrism(20.0, 50.0)).toBe(20.0);
      expect(stepPrism(30.0, -5.0)).toBe(20.0);
    });

    it('preserves clamping invariant across 5,000 Monte Carlo trials', () => {
      for (let i = 0; i < 5000; i++) {
        const cur = rng.nextFloat(-20, 50);
        const delta = rng.nextFloat(-20, 20);
        const result = stepPrism(cur, delta);

        expect(result).toBeGreaterThanOrEqual(0.0);
        expect(result).toBeLessThanOrEqual(20.0);

        const expected = Math.round(Math.max(0.0, Math.min(20.0, cur + delta)) * 100) / 100;
        expect(result).toBe(expected);
      }
    });
  });

  describe('stepPd [25.0, 40.0] monocular & [50.0, 80.0] binocular', () => {
    it('strictly clamps monocular PD to [25.0, 40.0]', () => {
      expect(stepMonocularPd(-50, 0)).toBe(25.0);
      expect(stepMonocularPd(100, 0)).toBe(40.0);
      expect(stepMonocularPd(25.0, -0.5)).toBe(25.0);
      expect(stepMonocularPd(40.0, 0.5)).toBe(40.0);
      expect(stepMonocularPd(15.0, 2.0)).toBe(25.0);
      expect(stepMonocularPd(45.0, -2.0)).toBe(40.0);
    });

    it('strictly clamps binocular PD to [50.0, 80.0]', () => {
      expect(stepBinocularPd(-50, 0)).toBe(50.0);
      expect(stepBinocularPd(150, 0)).toBe(80.0);
      expect(stepBinocularPd(50.0, -0.5)).toBe(50.0);
      expect(stepBinocularPd(80.0, 0.5)).toBe(80.0);
      expect(stepBinocularPd(40.0, 2.0)).toBe(50.0);
      expect(stepBinocularPd(90.0, -2.0)).toBe(80.0);
    });

    it('preserves PD invariants across 5,000 Monte Carlo trials', () => {
      for (let i = 0; i < 5000; i++) {
        const curMono = rng.nextFloat(-50, 100);
        const deltaMono = rng.nextFloat(-20, 20);
        const resMono = stepMonocularPd(curMono, deltaMono);
        expect(resMono).toBeGreaterThanOrEqual(25.0);
        expect(resMono).toBeLessThanOrEqual(40.0);

        const curBino = rng.nextFloat(-50, 150);
        const deltaBino = rng.nextFloat(-20, 20);
        const resBino = stepBinocularPd(curBino, deltaBino);
        expect(resBino).toBeGreaterThanOrEqual(50.0);
        expect(resBino).toBeLessThanOrEqual(80.0);
      }
    });
  });
});

describe('Adversarial Stress Test: Optical Transposition Involutive Symmetries', () => {
  const rng = new SeededRandom(4004);

  it('proves double transposition is an exact mathematical involution (identity operator)', () => {
    for (let i = 0; i < 5000; i++) {
      const s = Math.round(rng.nextFloat(-15, 15) * 4) / 4;
      const c = Math.round(rng.nextFloat(-8, 8) * 4) / 4;
      const a = rng.nextInt(1, 180);

      const t1 = transposePrescription(s, c, a);
      const t2 = transposePrescription(t1.sphere, t1.cylinder, t1.axis);

      // Spherical, cylindrical, and axial components must identically match initial state
      expect(t2.sphere).toBeCloseTo(s, 2);
      expect(t2.cylinder).toBeCloseTo(c, 2);
      expect(t2.axis).toBe(a);
    }
  });

  it('preserves Spherical Equivalent (SE = S + C / 2) under transposition', () => {
    for (let i = 0; i < 5000; i++) {
      const s = Math.round(rng.nextFloat(-15, 15) * 4) / 4;
      const c = Math.round(rng.nextFloat(-8, 8) * 4) / 4;
      const a = rng.nextInt(1, 180);

      const seBefore = calculateSphericalEquivalent(s, c);
      const transposed = transposePrescription(s, c, a);
      const seAfter = calculateSphericalEquivalent(transposed.sphere, transposed.cylinder);

      expect(seAfter).toBe(seBefore);
    }
  });
});

describe('Adversarial Stress Test: sanitizeExamState Resilience & Hydration Fuzzer', () => {
  const rng = new SeededRandom(5005);

  const REQUIRED_TOP_LEVEL_KEYS: (keyof ExamState)[] = [
    'activeCategory',
    'optotypeSet',
    'activeLogMAR',
    'isolationMode',
    'activeLetterIndex',
    'crowdingMode',
    'duochromeOverlay',
    'invertPolarity',
    'isBlackout',
    'randomSeed',
    'doctorNotation',
    'showNotationOnPatient',
    'showCalibrationOnPatient',
    'currentLineScores',
    'astigmatismMode',
    'astigmatismAxisDeg',
    'binocularMode',
    'worthDotSpread',
    'macularColorMode',
    'colorPlateIndex',
    'd15ArrangedCaps',
    'd15RemainingCaps',
    'dyopDirection',
    'dyopRpm',
    'etdrsWizard',
    'contrastWizard',
    'calibration',
    'refraction',
    'jcc',
  ];

  function verifyStateIntegrity(state: ExamState) {
    expect(state).toBeDefined();
    expect(typeof state).toBe('object');
    expect(state).not.toBeNull();

    // Verify all 29 top-level keys exist and are not undefined
    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
      expect(state[key]).toBeDefined();
    }

    // Verify Refraction structure
    expect(state.refraction).toBeDefined();
    expect(typeof state.refraction).toBe('object');
    expect(state.refraction.od).toBeDefined();
    expect(state.refraction.os).toBeDefined();
    expect(typeof state.refraction.binocularPd).toBe('number');
    expect(typeof state.refraction.workingDistanceCm).toBe('number');

    // Verify OD registers
    expect(typeof state.refraction.od.sphere).toBe('number');
    expect(typeof state.refraction.od.cylinder).toBe('number');
    expect(typeof state.refraction.od.axis).toBe('number');
    expect(typeof state.refraction.od.pd).toBe('number');
    expect(typeof state.refraction.od.prism).toBe('number');
    expect(state.refraction.od.prismBase).toBeDefined();
    expect(typeof state.refraction.od.add).toBe('number');
    expect(state.refraction.od.occlusion).toBeDefined();

    // Verify OS registers
    expect(typeof state.refraction.os.sphere).toBe('number');
    expect(typeof state.refraction.os.cylinder).toBe('number');
    expect(typeof state.refraction.os.axis).toBe('number');
    expect(typeof state.refraction.os.pd).toBe('number');
    expect(typeof state.refraction.os.prism).toBe('number');
    expect(state.refraction.os.prismBase).toBeDefined();
    expect(typeof state.refraction.os.add).toBe('number');
    expect(state.refraction.os.occlusion).toBeDefined();

    // Verify JCC structure
    expect(state.jcc).toBeDefined();
    expect(typeof state.jcc).toBe('object');
    expect(state.jcc.flipPosition === 1 || state.jcc.flipPosition === 2).toBe(true);
    expect(state.jcc.refinementMode === 'AXIS' || state.jcc.refinementMode === 'POWER').toBe(true);
    expect(state.jcc.powerStep === 0.25 || state.jcc.powerStep === 0.50).toBe(true);

    // Verify Calibration structure
    expect(state.calibration).toBeDefined();
    expect(typeof state.calibration.referenceBarPixels).toBe('number');
    expect(typeof state.calibration.measuredBarMm).toBe('number');
    expect(typeof state.calibration.isMirroredRoom).toBe('boolean');
    expect(typeof state.calibration.directDistanceMeters).toBe('number');
  }

  it('handles null, undefined, primitives, arrays, and non-object inputs without throwing and returns complete defaults', () => {
    const edgeCases: any[] = [
      null,
      undefined,
      0,
      1,
      -1,
      NaN,
      Infinity,
      -Infinity,
      '',
      'invalid string payload',
      true,
      false,
      Symbol('test'),
      [],
      [1, 2, 3],
      ['foo', 'bar'],
      new Date(),
      new RegExp('abc'),
      () => ({ activeCategory: 'va_chart' }),
      Object.create(null),
    ];

    for (const input of edgeCases) {
      expect(() => {
        const result = sanitizeExamState(input);
        verifyStateIntegrity(result);
      }).not.toThrow();
    }
  });

  it('hydrates legacy partial states missing refraction, jcc, or calibration without error', () => {
    const legacyCases: Partial<ExamState>[] = [
      {},
      { activeCategory: 'va_chart' },
      { activeCategory: 'astigmatism', astigmatismAxisDeg: 120 },
      { activeCategory: 'duochrome_balance', duochromeOverlay: 'split' },
      { activeLogMAR: 0.5, optotypeSet: 'tumbling_e' },
      { isolationMode: 'single', activeLetterIndex: 2 },
      {
        refraction: {
          od: {
            sphere: -1.75,
            cylinder: -0.50,
            axis: 90,
            pd: 31.5,
            prism: 1.0,
            prismBase: 'UP',
            add: 1.25,
            occlusion: 'OPEN',
          },
          os: {
            sphere: -2.00,
            cylinder: 0.00,
            axis: 180,
            pd: 32.0,
            prism: 0.0,
            prismBase: 'IN',
            add: 1.25,
            occlusion: 'OPEN',
          },
          binocularPd: 63.5,
          workingDistanceCm: 40,
        },
      },
      {
        jcc: {
          flipPosition: 2,
          refinementMode: 'POWER',
          powerStep: 0.50,
        },
      },
    ];

    for (const partial of legacyCases) {
      const result = sanitizeExamState(partial);
      verifyStateIntegrity(result);
    }
  });

  // Generator for valid randomized Partial<ExamState> omitting random subsets of keys
  function generateRandomPartialExamState(rng: SeededRandom): Partial<ExamState> {
    const partial: Partial<ExamState> = {};

    const categories: ClinicalTestCategory[] = [
      'va_chart',
      'duochrome_balance',
      'astigmatism',
      'binocular',
      'etdrs_wizard',
      'contrast_wizard',
      'macular_color',
    ];
    const optotypes: OptotypeSetId[] = [
      'sloan',
      'snellen',
      'tumbling_e',
      'landolt_c',
      'numbers',
      'hotv',
      'pediatric',
      'dyop',
    ];
    const isolations: ChartIsolationMode[] = ['full', 'line', 'column', 'single'];
    const crowdings: CrowdingMode[] = ['none', 'bars_0.5x', 'bars_1.0x', 'box'];
    const duochromes: DuochromeOverlay[] = ['none', 'split', 'red_only', 'green_only'];
    const notations: AcuityNotation[] = ['snellen_us', 'snellen_metric', 'decimal', 'logmar'];
    const astigModes: AstigmatismMode[] = ['clock_dial', 'sunburst', 'jcc_dots'];
    const binocModes: BinocularMode[] = ['worth_4_dot', 'schober', 'fixation_disparity', 'binocular_balance'];
    const macModes: MacularColorMode[] = [
      'amsler_standard',
      'amsler_inverted',
      'amsler_red',
      'amsler_diagonal',
      'color_ishihara',
      'color_d15',
    ];
    const bases: PrismBase[] = ['IN', 'OUT', 'UP', 'DOWN'];
    const occlusions: OcclusionMode[] = ['OPEN', 'OCCLUDED', 'PINHOLE'];
    const jccFlips: JccFlipPosition[] = [1, 2];
    const jccModes: JccRefinementMode[] = ['AXIS', 'POWER'];
    const jccSteps: JccPowerStep[] = [0.25, 0.50];

    if (rng.next() > 0.5) partial.activeCategory = rng.pick(categories);
    if (rng.next() > 0.5) partial.optotypeSet = rng.pick(optotypes);
    if (rng.next() > 0.5) partial.activeLogMAR = rng.nextFloat(-0.3, 1.3);
    if (rng.next() > 0.5) partial.isolationMode = rng.pick(isolations);
    if (rng.next() > 0.5) partial.activeLetterIndex = rng.nextInt(0, 4);
    if (rng.next() > 0.5) partial.crowdingMode = rng.pick(crowdings);
    if (rng.next() > 0.5) partial.duochromeOverlay = rng.pick(duochromes);
    if (rng.next() > 0.5) partial.invertPolarity = rng.next() > 0.5;
    if (rng.next() > 0.5) partial.isBlackout = rng.next() > 0.5;
    if (rng.next() > 0.5) partial.randomSeed = rng.nextInt(1, 10000);
    if (rng.next() > 0.5) partial.doctorNotation = rng.pick(notations);
    if (rng.next() > 0.5) partial.showNotationOnPatient = rng.next() > 0.5;
    if (rng.next() > 0.5) partial.showCalibrationOnPatient = rng.next() > 0.5;
    if (rng.next() > 0.5) partial.astigmatismMode = rng.pick(astigModes);
    if (rng.next() > 0.5) partial.astigmatismAxisDeg = rng.nextInt(0, 180);
    if (rng.next() > 0.5) partial.binocularMode = rng.pick(binocModes);
    if (rng.next() > 0.5) partial.worthDotSpread = rng.nextFloat(0.5, 3.0);
    if (rng.next() > 0.5) partial.macularColorMode = rng.pick(macModes);

    if (rng.next() > 0.4) {
      partial.refraction = {
        od: {
          sphere: Math.round(rng.nextFloat(-20, 20) * 4) / 4,
          cylinder: Math.round(rng.nextFloat(-10, 10) * 4) / 4,
          axis: rng.nextInt(1, 180),
          pd: Math.round(rng.nextFloat(25, 40) * 2) / 2,
          prism: Math.round(rng.nextFloat(0, 20) * 2) / 2,
          prismBase: rng.pick(bases),
          add: Math.round(rng.nextFloat(0, 4) * 4) / 4,
          occlusion: rng.pick(occlusions),
        },
        os: {
          sphere: Math.round(rng.nextFloat(-20, 20) * 4) / 4,
          cylinder: Math.round(rng.nextFloat(-10, 10) * 4) / 4,
          axis: rng.nextInt(1, 180),
          pd: Math.round(rng.nextFloat(25, 40) * 2) / 2,
          prism: Math.round(rng.nextFloat(0, 20) * 2) / 2,
          prismBase: rng.pick(bases),
          add: Math.round(rng.nextFloat(0, 4) * 4) / 4,
          occlusion: rng.pick(occlusions),
        },
        binocularPd: Math.round(rng.nextFloat(50, 80) * 2) / 2,
        workingDistanceCm: 40,
      };
    }

    if (rng.next() > 0.4) {
      partial.jcc = {
        flipPosition: rng.pick(jccFlips),
        refinementMode: rng.pick(jccModes),
        powerStep: rng.pick(jccSteps),
      };
    }

    return partial;
  }

  it('guarantees complete valid ExamState across 10,000 randomized Partial<ExamState> hydration runs', () => {
    const fuzzerRng = new SeededRandom(6006);
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const partial = generateRandomPartialExamState(fuzzerRng);
      const result = sanitizeExamState(partial);
      verifyStateIntegrity(result);

      // Verify that values explicitly provided in partial were preserved
      if (partial.activeCategory) expect(result.activeCategory).toBe(partial.activeCategory);
      if (partial.optotypeSet) expect(result.optotypeSet).toBe(partial.optotypeSet);
      if (partial.activeLogMAR !== undefined) expect(result.activeLogMAR).toBe(partial.activeLogMAR);
      if (partial.refraction) {
        expect(result.refraction.od.sphere).toBe(partial.refraction.od.sphere);
        expect(result.refraction.od.cylinder).toBe(partial.refraction.od.cylinder);
        expect(result.refraction.od.axis).toBe(partial.refraction.od.axis);
      }
      if (partial.jcc) {
        expect(result.jcc.flipPosition).toBe(partial.jcc.flipPosition);
        expect(result.jcc.refinementMode).toBe(partial.jcc.refinementMode);
      }
    }
  });

  // Generator for deeply nested arbitrary malformed JSON trees
  function generateArbitraryMalformedJson(rng: SeededRandom, depth = 0): any {
    if (depth > 3) {
      const leafTypes = [null, 0, -42, 99.9, 'malformed_leaf', true, false];
      return rng.pick(leafTypes);
    }

    const roll = rng.next();
    if (roll < 0.15) return null;
    if (roll < 0.30) return rng.nextInt(-10000, 10000);
    if (roll < 0.45) return `str_${rng.nextInt(0, 99999)}`;
    if (roll < 0.60) {
      const len = rng.nextInt(0, 4);
      return Array.from({ length: len }, () => generateArbitraryMalformedJson(rng, depth + 1));
    }

    const obj: Record<string, any> = {};
    const keyPool = [
      'activeCategory',
      'refraction',
      'jcc',
      'calibration',
      'od',
      'os',
      'sphere',
      'cylinder',
      'axis',
      'pd',
      'prism',
      'add',
      'occlusion',
      'flipPosition',
      'unknownKey_' + rng.nextInt(1, 100),
      '__proto__',
    ];

    const propCount = rng.nextInt(0, 5);
    for (let i = 0; i < propCount; i++) {
      const key = rng.pick(keyPool);
      obj[key] = generateArbitraryMalformedJson(rng, depth + 1);
    }
    return obj;
  }

  it('survives 10,000 iterations of completely arbitrary malformed JSON fuzzing without ever throwing', () => {
    const fuzzerRng = new SeededRandom(7007);
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const malformedPayload = generateArbitraryMalformedJson(fuzzerRng);

      let result: ExamState | undefined;
      expect(() => {
        result = sanitizeExamState(malformedPayload);
      }).not.toThrow();

      // Invariant: returned result is ALWAYS a defined non-null object
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
    }
  });

  it('surfaces architectural limitation: shallow object spread passes through explicit undefined/null property values', () => {
    // When incoming payload explicitly provides null or undefined on property keys,
    // JS object spread {...base, ...incoming} overwrites the default with null/undefined.
    const payloadWithExplicitNull = { activeCategory: null as any };
    const resNull = sanitizeExamState(payloadWithExplicitNull);
    // Does NOT throw, but activeCategory is overwritten with null:
    expect(resNull.activeCategory).toBeNull();

    const payloadWithExplicitUndefined = { activeCategory: undefined as any };
    const resUndef = sanitizeExamState(payloadWithExplicitUndefined);
    expect(resUndef.activeCategory).toBeUndefined();

    const payloadWithNestedNull = {
      refraction: {
        od: {
          sphere: null as any,
        },
      },
    };
    const resNested = sanitizeExamState(payloadWithNestedNull as any);
    expect(resNested.refraction.od.sphere).toBeNull();
  });
});
