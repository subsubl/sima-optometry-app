import { AcuityNotation, CalibrationConfig, LetterScoreStatus, OptotypeSetId } from '../types/exam';

/**
 * Standard ISO 8596 & ETDRS Acuity Ladder
 * From LogMAR 1.3 (20/400) down to LogMAR -0.3 (20/10) in 0.1 log steps.
 */
export interface AcuityLineSpec {
  logMAR: number;
  snellenUS: string;
  snellenMetric: string;
  decimal: string;
  defaultLettersCount: number;
  etdrsBaseScore: number;
}

export const ACUITY_LADDER: AcuityLineSpec[] = [
  { logMAR: 1.3, snellenUS: '20/400', snellenMetric: '6/120', decimal: '0.05', defaultLettersCount: 1, etdrsBaseScore: 20 },
  { logMAR: 1.2, snellenUS: '20/320', snellenMetric: '6/95',  decimal: '0.06', defaultLettersCount: 2, etdrsBaseScore: 25 },
  { logMAR: 1.1, snellenUS: '20/250', snellenMetric: '6/75',  decimal: '0.08', defaultLettersCount: 2, etdrsBaseScore: 30 },
  { logMAR: 1.0, snellenUS: '20/200', snellenMetric: '6/60',  decimal: '0.10', defaultLettersCount: 3, etdrsBaseScore: 35 },
  { logMAR: 0.9, snellenUS: '20/160', snellenMetric: '6/48',  decimal: '0.13', defaultLettersCount: 3, etdrsBaseScore: 40 },
  { logMAR: 0.8, snellenUS: '20/125', snellenMetric: '6/38',  decimal: '0.16', defaultLettersCount: 4, etdrsBaseScore: 45 },
  { logMAR: 0.7, snellenUS: '20/100', snellenMetric: '6/30',  decimal: '0.20', defaultLettersCount: 4, etdrsBaseScore: 50 },
  { logMAR: 0.6, snellenUS: '20/80',  snellenMetric: '6/24',  decimal: '0.25', defaultLettersCount: 5, etdrsBaseScore: 55 },
  { logMAR: 0.5, snellenUS: '20/63',  snellenMetric: '6/19',  decimal: '0.32', defaultLettersCount: 5, etdrsBaseScore: 60 },
  { logMAR: 0.4, snellenUS: '20/50',  snellenMetric: '6/15',  decimal: '0.40', defaultLettersCount: 5, etdrsBaseScore: 65 },
  { logMAR: 0.3, snellenUS: '20/40',  snellenMetric: '6/12',  decimal: '0.50', defaultLettersCount: 5, etdrsBaseScore: 70 },
  { logMAR: 0.2, snellenUS: '20/32',  snellenMetric: '6/9.5', decimal: '0.63', defaultLettersCount: 5, etdrsBaseScore: 75 },
  { logMAR: 0.1, snellenUS: '20/25',  snellenMetric: '6/7.5', decimal: '0.80', defaultLettersCount: 5, etdrsBaseScore: 80 },
  { logMAR: 0.0, snellenUS: '20/20',  snellenMetric: '6/6',   decimal: '1.00', defaultLettersCount: 5, etdrsBaseScore: 85 },
  { logMAR: -0.1, snellenUS: '20/16', snellenMetric: '6/4.8', decimal: '1.25', defaultLettersCount: 5, etdrsBaseScore: 90 },
  { logMAR: -0.2, snellenUS: '20/12.5', snellenMetric: '6/3.8', decimal: '1.60', defaultLettersCount: 5, etdrsBaseScore: 95 },
  { logMAR: -0.3, snellenUS: '20/10', snellenMetric: '6/3',   decimal: '2.00', defaultLettersCount: 5, etdrsBaseScore: 100 },
];

/**
 * Returns the effective testing distance in meters, accounting for direct or folded mirror geometry.
 */
export function getEffectiveDistanceMeters(cal: CalibrationConfig): number {
  const raw = cal.isMirroredRoom
    ? cal.patientToMirrorMeters + cal.mirrorToScreenMeters
    : cal.directDistanceMeters;
  return Math.max(0.4, Math.min(12.0, raw));
}

/**
 * Returns pixels per millimeter (PPM) from physical ruler calibration.
 */
export function getPixelsPerMm(cal: CalibrationConfig): number {
  const mm = Math.max(10, cal.measuredBarMm);
  return cal.referenceBarPixels / mm;
}

/**
 * Calculates the exact physical height (in millimeters) of an optotype at distance D (meters) and LogMAR.
 * Formula: H = 2 * D_mm * tan( (5 arcmin * 10^LogMAR) / 2 )
 * Where 5 arcminutes = (5 / 60) degrees = (5 * pi) / (60 * 180) radians.
 */
export function calculateOptotypeHeightMm(distanceMeters: number, logMAR: number): number {
  const distanceMm = distanceMeters * 1000;
  const fiveArcMinRad = (5 * Math.PI) / (60 * 180); // ~0.001454441043328608 rad
  const angleRad = fiveArcMinRad * Math.pow(10, logMAR);
  return 2 * distanceMm * Math.tan(angleRad / 2);
}

/**
 * Calculates the exact pixel height of an optotype on the calibrated screen.
 */
export function calculateOptotypeHeightPx(cal: CalibrationConfig, logMAR: number): number {
  const distanceMeters = getEffectiveDistanceMeters(cal);
  const heightMm = calculateOptotypeHeightMm(distanceMeters, logMAR);
  const ppm = getPixelsPerMm(cal);
  return heightMm * ppm;
}

/**
 * Calculates 1 degree of visual angle in pixels at the current calibration distance.
 * Used for Amsler Grid (20°x20° with 1° squares), Worth 4-Dot angular spread, and Sine Gratings (CPD).
 */
export function calculateOneDegreePx(cal: CalibrationConfig): number {
  const distanceMm = getEffectiveDistanceMeters(cal) * 1000;
  const oneDegRad = Math.PI / 180;
  const oneDegMm = 2 * distanceMm * Math.tan(oneDegRad / 2);
  return oneDegMm * getPixelsPerMm(cal);
}

/**
 * Looks up the AcuityLineSpec for a given LogMAR (rounded to nearest 0.1).
 */
export function getAcuitySpec(logMAR: number): AcuityLineSpec {
  const rounded = Math.round(logMAR * 10) / 10;
  const match = ACUITY_LADDER.find((item) => Math.abs(item.logMAR - rounded) < 0.01);
  return match || ACUITY_LADDER[13]; // fallback to 0.0 (20/20)
}

/**
 * Formats a LogMAR value into the clinician's chosen notation.
 */
export function formatAcuityNotation(logMAR: number, notation: AcuityNotation): string {
  const spec = getAcuitySpec(logMAR);
  switch (notation) {
    case 'snellen_us':
      return spec.snellenUS;
    case 'snellen_metric':
      return spec.snellenMetric;
    case 'decimal':
      return spec.decimal;
    case 'logmar':
      return spec.logMAR >= 0 ? `+${spec.logMAR.toFixed(1)}` : spec.logMAR.toFixed(1);
  }
}

/**
 * Computes interpolated LogMAR and clinical notation based on letter-by-letter scoring on the active line.
 * Accounts for variable optotype counts (1 to 5 letters) on high-LogMAR lines.
 *
 * @param activeLogMAR Current line LogMAR value
 * @param scores Array of letter score statuses
 * @param notation Clinical notation format (snellen_us, snellen_metric, decimal, logmar)
 * @param lineOptotypeCount Optional explicit letter count for the line (defaults to AcuityLadder spec)
 */
export function computeScoredLineAcuity(
  activeLogMAR: number,
  scores: LetterScoreStatus[],
  notation: AcuityNotation,
  lineOptotypeCount?: number
): { interpolatedLogMAR: number; label: string; correctCount: number; testedCount: number } {
  const spec = getAcuitySpec(activeLogMAR);
  const effectiveCount = Math.max(1, lineOptotypeCount ?? spec.defaultLettersCount ?? 5);

  // Only consider scores up to the actual number of letters on this line
  const effectiveScores = scores.slice(0, effectiveCount);
  const correctCount = effectiveScores.filter((s) => s === 'correct').length;
  const incorrectCount = effectiveScores.filter((s) => s === 'incorrect').length;
  const testedCount = correctCount + incorrectCount;
  const baseLabel = formatAcuityNotation(activeLogMAR, notation);

  if (testedCount === 0) {
    return { interpolatedLogMAR: activeLogMAR, label: baseLabel, correctCount: 0, testedCount: 0 };
  }

  // Missed count is strictly relative to the line's actual capacity
  const missedCount = effectiveCount - correctCount;
  // Dynamic per-letter weight: 0.10 / effectiveCount (for standard 5-letter line: 0.02)
  const perLetterWeight = 0.10 / effectiveCount;
  const rawLogMAR = activeLogMAR + missedCount * perLetterWeight;
  const interpolatedLogMAR = Number(rawLogMAR.toFixed(effectiveCount === 3 ? 2 : 3));

  let modifier = '';
  if (correctCount === effectiveCount) {
    modifier = ' (Full)';
  } else if (correctCount === 0) {
    modifier = ` (0/${effectiveCount})`;
  } else {
    // Majority threshold: >= 1 of 1-2, >= 2 of 3-4, >= 3 of 5
    const passThreshold = Math.ceil(effectiveCount / 2);

    if (correctCount >= passThreshold) {
      modifier = ` -${missedCount}`;
    } else {
      const prevSpec = getAcuitySpec(Math.min(1.3, activeLogMAR + 0.1));
      const prevBase = formatAcuityNotation(prevSpec.logMAR, notation);
      return {
        interpolatedLogMAR,
        label: `${prevBase} +${correctCount}`,
        correctCount,
        testedCount,
      };
    }
  }

  return {
    interpolatedLogMAR,
    label: `${baseLabel}${modifier}`,
    correctCount,
    testedCount,
  };
}

/**
 * Vocabulary pools for each optotype family.
 */
export const OPTOTYPE_POOLS: Record<OptotypeSetId, string[]> = {
  sloan: ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'],
  snellen: ['C', 'D', 'E', 'F', 'L', 'N', 'O', 'P', 'T', 'Z'],
  tumbling_e: ['E_RIGHT', 'E_DOWN', 'E_LEFT', 'E_UP'],
  landolt_c: ['C_RIGHT', 'C_DOWN', 'C_LEFT', 'C_UP', 'C_UP_RIGHT', 'C_DOWN_RIGHT', 'C_DOWN_LEFT', 'C_UP_LEFT'],
  numbers: ['2', '3', '4', '5', '6', '8', '9'],
  hotv: ['H', 'O', 'T', 'V'],
  pediatric: ['APPLE', 'HOUSE', 'SQUARE', 'CIRCLE'],
  dyop: ['DYOP_RING'],
};

/**
 * Human-readable private doctor cheat-sheet label for any optotype symbol.
 */
export function getDoctorCheatLabel(symbol: string): { primary: string; hint?: string } {
  switch (symbol) {
    case 'E_RIGHT':
      return { primary: 'E →', hint: 'Right' };
    case 'E_LEFT':
      return { primary: '← E', hint: 'Left' };
    case 'E_UP':
      return { primary: 'E ↑', hint: 'Up' };
    case 'E_DOWN':
      return { primary: 'E ↓', hint: 'Down' };
    case 'C_RIGHT':
      return { primary: 'C →', hint: 'Right' };
    case 'C_LEFT':
      return { primary: '← C', hint: 'Left' };
    case 'C_UP':
      return { primary: 'C ↑', hint: 'Up' };
    case 'C_DOWN':
      return { primary: 'C ↓', hint: 'Down' };
    case 'C_UP_RIGHT':
      return { primary: 'C ↗', hint: 'Up-Right' };
    case 'C_DOWN_RIGHT':
      return { primary: 'C ↘', hint: 'Down-Right' };
    case 'C_DOWN_LEFT':
      return { primary: 'C ↙', hint: 'Down-Left' };
    case 'C_UP_LEFT':
      return { primary: 'C ↖', hint: 'Up-Left' };
    case 'APPLE':
      return { primary: 'Apple', hint: 'Heart/Apple' };
    case 'HOUSE':
      return { primary: 'House', hint: 'Home' };
    case 'SQUARE':
      return { primary: 'Square', hint: 'Box' };
    case 'CIRCLE':
      return { primary: 'Circle', hint: 'Ring/Ball' };
    case 'DYOP_RING':
      return { primary: 'Dyop', hint: 'Spinning' };
    default:
      return { primary: symbol };
  }
}

/**
 * Deterministic Smart Randomizer (Mulberry32 PRNG)
 * Guarantees both Patient Display and Doctor Controller render the exact same sequence for a given (seed, logMAR, optotypeSet),
 * while preventing adjacent identical optotypes on the same line.
 */
export function generateLineOptotypes(
  optotypeSet: OptotypeSetId,
  logMAR: number,
  seed: number,
  forceFiveLetters = false
): string[] {
  if (optotypeSet === 'dyop') {
    return ['DYOP_RING'];
  }

  const pool = OPTOTYPE_POOLS[optotypeSet] || OPTOTYPE_POOLS.sloan;
  const spec = getAcuitySpec(logMAR);
  const count = forceFiveLetters ? 5 : spec.defaultLettersCount;

  // Combine seed, logMAR, and optotypeSet into a 32-bit unsigned seed
  const logIndex = Math.round((logMAR + 0.5) * 100);
  let state = (seed * 2654435761 + logIndex * 374761393 + optotypeSet.charCodeAt(0) * 668265263) >>> 0;

  const nextRand = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const result: string[] = [];
  const usedInLine = new Set<string>();

  for (let i = 0; i < count; i++) {
    // Filter candidates so we don't repeat adjacent symbols, and if pool >= 5, avoid repeating in the same line
    let candidates = pool.filter((sym) => {
      if (i > 0 && sym === result[i - 1]) return false;
      if (pool.length >= count && usedInLine.has(sym)) return false;
      return true;
    });

    if (candidates.length === 0) {
      candidates = pool.filter((sym) => i === 0 || sym !== result[i - 1]);
    }

    const idx = Math.floor(nextRand() * candidates.length);
    const chosen = candidates[idx];
    result.push(chosen);
    usedInLine.add(chosen);
  }

  return result;
}
