/**
 * SIMA Optometry App — Clinical Refraction & Phoropter Math Engine
 * Pure mathematical calculations, bounds clamping, axis wrap-around, and optical transpositions.
 */

import {
  ExamState,
  JccFlipPosition,
  JccPowerStep,
  JccRefinementMode,
  JccState,
  OcclusionMode,
  PrismBase,
  RefractionEyeState,
  RefractionState,
} from '../types/exam';

/**
 * Rounds a floating point value to the nearest step increment to eliminate IEEE 754 precision noise.
 */
export function roundToStep(val: number, step: number): number {
  const inv = 1 / step;
  return Math.round(val * inv) / inv;
}

/**
 * Steps sphere power within [-20.00, +20.00] D in specified step increments (default 0.25 D).
 * Clamped strictly to [-20.00, +20.00] without floating point drift.
 */
export function stepSphere(current: number, delta: number): number {
  const clamped = Math.max(-20.0, Math.min(20.0, current + delta));
  return Math.round(clamped * 100) / 100;
}

/**
 * Steps cylinder power within [-10.00, +10.00] D in specified step increments (default 0.25 D).
 * Clamped strictly to [-10.00, +10.00].
 */
export function stepCylinder(current: number, delta: number): number {
  const clamped = Math.max(-10.0, Math.min(10.0, current + delta));
  return Math.round(clamped * 100) / 100;
}

/**
 * Steps optical cylinder axis within [1, 180] degrees with circular cyclic wrap-around:
 * - 180 + 1 => 1
 * - 1 - 1 => 180
 * - 180 + 5 => 5
 * - 2 - 5 => 177
 * - 1 - 5 => 176
 *
 * Never returns 0 or >180 degrees.
 */
export function stepAxis(current: number, deltaDeg: number): number {
  const zeroBased = ((current - 1 + deltaDeg) % 180 + 180) % 180;
  return zeroBased + 1;
}

/**
 * Steps pupillary distance (PD) in millimeters.
 * Monocular range: [25.0, 40.0] mm
 * Binocular range: [50.0, 80.0] mm
 */
export function stepPd(current: number, delta: number, isBinocular = current >= 45.0): number {
  const min = isBinocular ? 50.0 : 25.0;
  const max = isBinocular ? 80.0 : 40.0;
  const clamped = Math.max(min, Math.min(max, current + delta));
  return Math.round(clamped * 10) / 10;
}

/**
 * Steps monocular pupillary distance within [25.0, 40.0] mm in 0.5 mm steps.
 */
export function stepMonocularPd(current: number, delta: number): number {
  return stepPd(current, delta, false);
}

/**
 * Steps binocular pupillary distance within [50.0, 80.0] mm in 0.5 mm steps.
 */
export function stepBinocularPd(current: number, delta: number): number {
  return stepPd(current, delta, true);
}

/**
 * Steps prism diopters within [0.0, 20.0] Δ in specified step increments (default 0.5 Δ).
 */
export function stepPrism(current: number, delta: number): number {
  const clamped = Math.max(0.0, Math.min(20.0, current + delta));
  return Math.round(clamped * 100) / 100;
}

/**
 * Cycles through prism base directions: IN -> OUT -> UP -> DOWN -> IN
 */
export function cyclePrismBase(current: PrismBase): PrismBase {
  const sequence: PrismBase[] = ['IN', 'OUT', 'UP', 'DOWN'];
  const idx = sequence.indexOf(current);
  return sequence[(idx + 1) % sequence.length];
}

/**
 * Steps near vision reading ADD within [0.00, +4.00] D in 0.25 D increments.
 * Cannot be negative.
 */
export function stepAdd(current: number, delta: number): number {
  const clamped = Math.max(0.0, Math.min(4.0, current + delta));
  return Math.round(clamped * 100) / 100;
}

/**
 * Binary toggle between OPEN and OCCLUDED.
 * 'OPEN' -> 'OCCLUDED', 'OCCLUDED' -> 'OPEN', 'PINHOLE' -> 'OPEN'.
 */
export function toggleOcclusion(current: OcclusionMode): OcclusionMode {
  return current === 'OPEN' ? 'OCCLUDED' : 'OPEN';
}

/**
 * Cycles auxiliary occlusion disc: OPEN -> OCCLUDED -> PINHOLE -> OPEN
 */
export function cycleOcclusion(current: OcclusionMode): OcclusionMode {
  if (current === 'OPEN') return 'OCCLUDED';
  if (current === 'OCCLUDED') return 'PINHOLE';
  return 'OPEN';
}

/**
 * Configures phoropter aperture occlusion for monocular or binocular testing.
 * - 'OD': OD open, OS occluded
 * - 'OS': OS open, OD occluded
 * - 'OU': both open
 */
export function setEyeOcclusion(
  refraction: RefractionState,
  testedEye: 'OD' | 'OS' | 'OU'
): RefractionState {
  return {
    ...refraction,
    od: {
      ...refraction.od,
      occlusion: testedEye === 'OS' ? 'OCCLUDED' : 'OPEN',
    },
    os: {
      ...refraction.os,
      occlusion: testedEye === 'OD' ? 'OCCLUDED' : 'OPEN',
    },
  };
}

/**
 * Flips JCC cross-cylinder orientation between Position 1 and Position 2.
 */
export function toggleJccFlip(current: JccFlipPosition): JccFlipPosition {
  return current === 1 ? 2 : 1;
}

/**
 * Toggles JCC refinement stage between AXIS and POWER.
 */
export function toggleJccRefinementMode(current: JccRefinementMode): JccRefinementMode {
  return current === 'AXIS' ? 'POWER' : 'AXIS';
}

/**
 * Toggles JCC power magnitude between 0.25 D and 0.50 D.
 */
export function toggleJccPowerStep(current: JccPowerStep): JccPowerStep {
  return current === 0.25 ? 0.50 : 0.25;
}

/**
 * Computes Spherical Equivalent (SE = Sphere + Cylinder / 2).
 */
export function calculateSphericalEquivalent(sphere: number, cylinder: number): number {
  return roundToStep(sphere + cylinder / 2, 0.125);
}

/**
 * Performs optical transposition between Minus-Cylinder and Plus-Cylinder forms:
 * Sphere' = Sphere + Cylinder
 * Cylinder' = -Cylinder
 * Axis' = (Axis + 90) wrapped to [1..180]
 */
export function transposePrescription(
  sphere: number,
  cylinder: number,
  axis: number
): { sphere: number; cylinder: number; axis: number } {
  return {
    sphere: Math.round((sphere + cylinder) * 100) / 100,
    cylinder: Math.round(-cylinder * 100) / 100,
    axis: stepAxis(axis, 90),
  };
}

/**
 * Formats diopter values with explicit +/- sign and 2 decimal places (e.g. "+1.25", "-0.50", "0.00").
 */
export function formatDiopter(d: number): string {
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2)}`;
}

/**
 * Formats axis angles with 3-digit padding and degree symbol (e.g. "180°", "090°", "005°").
 */
export function formatAxis(axis: number): string {
  return `${axis.toString().padStart(3, '0')}°`;
}

/**
 * Formats clinical prescription string (e.g. "-1.25 -0.75 x 180°").
 */
export function formatPrescription(eye: RefractionEyeState): string {
  return `${formatDiopter(eye.sphere)} ${formatDiopter(eye.cylinder)} x ${formatAxis(eye.axis)}`;
}

/**
 * Creates default initial state for a single eye.
 */
export function createDefaultRefractionEyeState(eye: 'OD' | 'OS' = 'OD'): RefractionEyeState {
  return {
    sphere: 0.0,
    cylinder: 0.0,
    axis: 180,
    pd: 32.0,
    prism: 0.0,
    prismBase: 'IN',
    add: 0.0,
    occlusion: 'OPEN',
  };
}

/**
 * Creates default initial refraction state.
 */
export function createDefaultRefractionState(): RefractionState {
  return {
    od: createDefaultRefractionEyeState('OD'),
    os: createDefaultRefractionEyeState('OS'),
    binocularPd: 64.0,
    workingDistanceCm: 40,
  };
}

/**
 * Creates default initial JCC state.
 */
export function createDefaultJccState(): JccState {
  return {
    flipPosition: 1,
    refinementMode: 'AXIS',
    powerStep: 0.25,
  };
}

/**
 * Sanitizes and hydrates incoming ExamState payloads from WebSockets or local storage.
 * Enforces fallback to clean defaults for any omitted or partially hydrated fields.
 */
export function sanitizeExamState(incoming: Partial<ExamState> | null | undefined): ExamState {
  const defaultRefraction = createDefaultRefractionState();
  const defaultJcc = createDefaultJccState();

  const base: ExamState = {
    activeCategory: 'va_chart',
    optotypeSet: 'sloan',
    activeLogMAR: 0.0,
    isolationMode: 'line',
    activeLetterIndex: 0,
    crowdingMode: 'none',
    duochromeOverlay: 'none',
    invertPolarity: false,
    isBlackout: false,
    randomSeed: 101,
    doctorNotation: 'snellen_us',
    showNotationOnPatient: false,
    showCalibrationOnPatient: false,
    currentLineScores: ['untested', 'untested', 'untested', 'untested', 'untested'],
    astigmatismMode: 'clock_dial',
    astigmatismAxisDeg: 90,
    binocularMode: 'worth_4_dot',
    worthDotSpread: 1.0,
    macularColorMode: 'amsler_standard',
    colorPlateIndex: 0,
    d15ArrangedCaps: [0],
    d15RemainingCaps: [8, 1, 13, 4, 11, 2, 15, 6, 10, 3, 14, 7, 12, 5, 9],
    dyopDirection: 'cw',
    dyopRpm: 40,
    etdrsWizard: {
      phase: 'threshold',
      currentLogMAR: 0.4,
      lineScores: {},
      finalLogMAR: null,
      totalLetterScore: null,
      testedEye: 'OD',
    },
    contrastWizard: {
      mode: 'letter_contrast',
      contrastPercent: 100,
      letterLogMAR: 0.4,
      spatialFrequencyCpd: 6,
      gratingAngleDeg: 0,
      recordedThresholds: {},
    },
    calibration: {
      referenceBarPixels: 323.5,
      measuredBarMm: 85.6,
      isMirroredRoom: false,
      directDistanceMeters: 6.0,
      patientToMirrorMeters: 3.0,
      mirrorToScreenMeters: 3.0,
      distanceUnit: 'meters',
    },
    refraction: defaultRefraction,
    jcc: defaultJcc,
  };

  if (!incoming || typeof incoming !== 'object') {
    return base;
  }

  return {
    ...base,
    ...incoming,
    refraction: {
      ...defaultRefraction,
      ...(incoming.refraction || {}),
      od: {
        ...defaultRefraction.od,
        ...(incoming.refraction?.od || {}),
      },
      os: {
        ...defaultRefraction.os,
        ...(incoming.refraction?.os || {}),
      },
    },
    jcc: {
      ...defaultJcc,
      ...(incoming.jcc || {}),
    },
    calibration: {
      ...base.calibration,
      ...(incoming.calibration || {}),
    },
    etdrsWizard: {
      ...base.etdrsWizard,
      ...(incoming.etdrsWizard || {}),
    },
    contrastWizard: {
      ...base.contrastWizard,
      ...(incoming.contrastWizard || {}),
    },
  };
}
