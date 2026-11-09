/**
 * SIMA Optometry App — Shared Types & Ephemeral Exam State
 * Zero-PHI Ephemeral Clinical Instrument State synchronized in real-time via WebSockets.
 */

export type OptotypeSetId =
  | 'sloan'
  | 'snellen'
  | 'tumbling_e'
  | 'landolt_c'
  | 'numbers'
  | 'hotv'
  | 'pediatric'
  | 'dyop';

export type ChartIsolationMode = 'full' | 'line' | 'column' | 'single';

export type CrowdingMode = 'none' | 'bars_0.5x' | 'bars_1.0x' | 'box';

export type DuochromeOverlay = 'none' | 'split' | 'red_only' | 'green_only';

export type AcuityNotation = 'snellen_us' | 'snellen_metric' | 'decimal' | 'logmar';

export type ClinicalTestCategory =
  | 'va_chart'
  | 'duochrome_balance'
  | 'astigmatism'
  | 'binocular'
  | 'etdrs_wizard'
  | 'contrast_wizard'
  | 'macular_color'
  | 'near_vision';

export type AstigmatismMode = 'clock_dial' | 'sunburst' | 'jcc_dots';

export type BinocularMode = 'worth_4_dot' | 'schober' | 'fixation_disparity' | 'binocular_balance';

export type MacularColorMode =
  | 'amsler_standard'
  | 'amsler_inverted'
  | 'amsler_red'
  | 'amsler_diagonal'
  | 'color_ishihara'
  | 'color_d15';

export type ContrastMode = 'letter_contrast' | 'sine_grating';

export type LetterScoreStatus = 'untested' | 'correct' | 'incorrect';

export interface CalibrationConfig {
  /** Length of the on-screen calibration bar in CSS pixels */
  referenceBarPixels: number;
  /** Physical measured length of the calibration bar in millimeters (default 85.6mm = ISO credit card width or 100mm ruler) */
  measuredBarMm: number;
  /** Whether room uses direct viewing or a folded front mirror */
  isMirroredRoom: boolean;
  /** Direct distance in meters (if !isMirroredRoom) */
  directDistanceMeters: number;
  /** Distance from patient to mirror in meters (if isMirroredRoom) */
  patientToMirrorMeters: number;
  /** Distance from mirror to screen in meters (if isMirroredRoom) */
  mirrorToScreenMeters: number;
  /** Display unit preference for distance in UI ('meters' | 'feet') */
  distanceUnit: 'meters' | 'feet';
}

export interface EtdrsWizardState {
  phase: 'screening' | 'threshold' | 'completed';
  currentLogMAR: number;
  /** Map of logMAR string (e.g. "0.3") to array of 5 letter scores */
  lineScores: Record<string, LetterScoreStatus[]>;
  /** Final calculated LogMAR score */
  finalLogMAR: number | null;
  /** Total ETDRS Letter Score (0-100 scale, where 0.0 LogMAR = 85 letters) */
  totalLetterScore: number | null;
  testedEye: 'OD' | 'OS' | 'OU';
}

export interface ContrastWizardState {
  mode: ContrastMode;
  /** Contrast percentage: 100, 50, 25, 12.5, 6.25, 3.12, 1.56, 0.8 */
  contrastPercent: number;
  /** Target LogMAR size for letter contrast mode */
  letterLogMAR: number;
  /** Spatial frequency in cycles per degree (CPD): 1.5, 3, 6, 12, 18 */
  spatialFrequencyCpd: number;
  /** Grating angle in degrees: 0 (vertical), 45, 90 (horizontal), 135 */
  gratingAngleDeg: number;
  /** Recorded threshold per spatial frequency */
  recordedThresholds: Record<string, number>;
}

export interface ExamState {
  /** Active clinical test module */
  activeCategory: ClinicalTestCategory;
  /** Selected optotype family */
  optotypeSet: OptotypeSetId;
  /** Active LogMAR line (-0.3 to 1.3 in 0.1 steps) */
  activeLogMAR: number;
  /** Isolation presentation mode */
  isolationMode: ChartIsolationMode;
  /** Active index (0-4) within the row when in 'single' or 'column' isolation */
  activeLetterIndex: number;
  /** Crowding / Contour interaction bars */
  crowdingMode: CrowdingMode;
  /** Red/Green Duochrome overlay mode */
  duochromeOverlay: DuochromeOverlay;
  /** Contrast polarity: false = black on white (standard), true = white on black (inverted) */
  invertPolarity: boolean;
  /** Blackout / rest screen between tests */
  isBlackout: boolean;
  /** Randomization seed (incrementing integer to deterministically generate optotype rows on both screens) */
  randomSeed: number;
  /** Preferred notation on Doctor Controller */
  doctorNotation: AcuityNotation;
  /** Whether to show acuity notation labels on the Patient Screen (privacy toggle) */
  showNotationOnPatient: boolean;
  /** Whether the calibration ruler overlay is currently displayed on the Patient Screen */
  showCalibrationOnPatient: boolean;
  /** Letter-by-letter scoring for the currently active line (5 items) */
  currentLineScores: LetterScoreStatus[];
  /** Astigmatism sub-mode */
  astigmatismMode: AstigmatismMode;
  /** Astigmatism axis angle (0 to 180 deg in 5 or 15 deg steps) */
  astigmatismAxisDeg: number;
  /** Binocular sub-mode */
  binocularMode: BinocularMode;
  /** Worth 4-dot angular spacing multiplier (1 = macular 2°, 2.5 = peripheral 5°) */
  worthDotSpread: number;
  /** Macular & Color sub-mode */
  macularColorMode: MacularColorMode;
  /** Color vision plate index (0-7) */
  colorPlateIndex: number;
  /** Farnsworth D-15 arranged cap indices (starts with [0] as fixed Pilot/Ref cap) */
  d15ArrangedCaps: number[];
  /** Farnsworth D-15 unplaced shuffled cap indices (1..15) */
  d15RemainingCaps: number[];
  /** Dyop rotation direction ('cw' | 'ccw') and RPM */
  dyopDirection: 'cw' | 'ccw';
  dyopRpm: number;
  /** Automated ETDRS Wizard state */
  etdrsWizard: EtdrsWizardState;
  /** Contrast Sensitivity Wizard state */
  contrastWizard: ContrastWizardState;
  /** Screen & Room Calibration */
  calibration: CalibrationConfig;

  // --- Milestone 1 Clinical Enhancements ---
  /** Digital Phoropter Refraction state for OD and OS */
  refraction: RefractionState;
  /** Jackson Cross-Cylinder (JCC) refinement state */
  jcc: JccState;
}

// ==========================================
// Digital Phoropter Refraction & JCC Types
// ==========================================

/**
 * Phoropter Refraction Prism Base Orientation
 * - IN: Base-In (nasal)
 * - OUT: Base-Out (temporal)
 * - UP: Base-Up (superior)
 * - DOWN: Base-Down (inferior)
 */
export type PrismBase = 'IN' | 'OUT' | 'UP' | 'DOWN';

/**
 * Phoropter Auxiliary Aperture Occlusion State
 * - OPEN: Fully open aperture
 * - OCCLUDED: Total light occlusion disc
 * - PINHOLE: Pinhole aperture for visual acuity stenopeic verification
 */
export type OcclusionMode = 'OPEN' | 'OCCLUDED' | 'PINHOLE';

/**
 * Jackson Cross-Cylinder (JCC) Orientation Flip Position
 * - 1: Primary orientation (Position 1)
 * - 2: Flipped orientation (Position 2, 90°/180° rotation of principal axes)
 */
export type JccFlipPosition = 1 | 2;

/**
 * Jackson Cross-Cylinder (JCC) Clinical Refinement Mode
 * - AXIS: Cross-cylinder axes straddle spectacle cylinder axis at 45° for axis refinement
 * - POWER: Cross-cylinder principal axes coincide with spectacle cylinder axis for power refinement
 */
export type JccRefinementMode = 'AXIS' | 'POWER';

/**
 * Jackson Cross-Cylinder (JCC) Lens Power Step Magnitude
 * - 0.25: Standard ±0.25 D cross-cylinder for standard acuity
 * - 0.50: Coarse ±0.50 D cross-cylinder for low visual acuity or high astigmatism
 */
export type JccPowerStep = 0.25 | 0.50;

/**
 * Monocular Digital Phoropter Refraction State (OD or OS)
 */
export interface RefractionEyeState {
  /** Sphere power: -20.00 to +20.00 D in 0.25 D steps */
  sphere: number;
  /** Cylinder power: -10.00 to +10.00 D in 0.25 D steps */
  cylinder: number;
  /** Cylinder axis angle: 1 to 180 degrees (integer) */
  axis: number;
  /** Monocular pupillary distance: 25.0 to 40.0 mm in 0.5 mm steps */
  pd: number;
  /** Prism power: 0 to 20 prism diopters (Δ) in 0.5 or 1.0 Δ steps */
  prism: number;
  /** Prism base direction ('IN' | 'OUT' | 'UP' | 'DOWN') */
  prismBase: PrismBase;
  /** Near vision reading addition power: 0.00 to +4.00 D in 0.25 D steps */
  add: number;
  /** Auxiliary occlusion disc state ('OPEN' | 'OCCLUDED' | 'PINHOLE') */
  occlusion: OcclusionMode;
}

/**
 * Full Digital Phoropter Refraction State
 */
export interface RefractionState {
  /** Right eye (Oculus Dexter) phoropter registers */
  od: RefractionEyeState;
  /** Left eye (Oculus Sinister) phoropter registers */
  os: RefractionEyeState;
  /** Binocular pupillary distance in millimeters (50.0 to 80.0 mm) */
  binocularPd: number;
  /** Near reading working distance in centimeters (default 40 cm) */
  workingDistanceCm: number;
}

/**
 * Jackson Cross-Cylinder (JCC) Refinement State
 */
export interface JccState {
  /** Active flip orientation: Position 1 vs Position 2 */
  flipPosition: JccFlipPosition;
  /** Active refinement stage: Cylinder Axis vs Cylinder Power */
  refinementMode: JccRefinementMode;
  /** Cross-cylinder lens power magnitude: ±0.25 D or ±0.50 D */
  powerStep: JccPowerStep;
}

// ==========================================
// WebSocket Synchronization Protocol Types
// ==========================================

export type SyncMessageType =
  | 'STATE_PATCH'
  | 'STATE_SYNC'
  | 'CALIBRATION_INIT'
  | 'PING'
  | 'PONG'
  | 'ACK';

export interface SyncMessageEnvelope<T = any> {
  type: SyncMessageType;
  senderId: string;
  seq: number;
  timestamp: number;
  payload: T;
}

