import {
  ExamState,
  JccState,
  RefractionEyeState,
  RefractionState,
} from '../types/exam';

export const DEFAULT_D15_SHUFFLED = [8, 1, 13, 4, 11, 2, 15, 6, 10, 3, 14, 7, 12, 5, 9];

export const DEFAULT_REFRACTION_EYE_STATE_OD: RefractionEyeState = {
  sphere: 0.0,
  cylinder: 0.0,
  axis: 180,
  pd: 32.0,
  prism: 0.0,
  prismBase: 'IN',
  add: 0.0,
  occlusion: 'OPEN',
};

export const DEFAULT_REFRACTION_EYE_STATE_OS: RefractionEyeState = {
  sphere: 0.0,
  cylinder: 0.0,
  axis: 180,
  pd: 32.0,
  prism: 0.0,
  prismBase: 'IN',
  add: 0.0,
  occlusion: 'OPEN',
};

export const DEFAULT_REFRACTION_STATE: RefractionState = {
  od: { ...DEFAULT_REFRACTION_EYE_STATE_OD },
  os: { ...DEFAULT_REFRACTION_EYE_STATE_OS },
  binocularPd: 64.0,
  workingDistanceCm: 40,
};

export const DEFAULT_JCC_STATE: JccState = {
  flipPosition: 1,
  refinementMode: 'AXIS',
  powerStep: 0.25,
};

export const DEFAULT_EXAM_STATE: ExamState = {
  activeCategory: 'va_chart',
  optotypeSet: 'sloan',
  activeLogMAR: 0.0, // 20/20 (6/6)
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
  d15RemainingCaps: [...DEFAULT_D15_SHUFFLED],
  dyopDirection: 'cw',
  dyopRpm: 40,
  etdrsWizard: {
    phase: 'threshold',
    currentLogMAR: 0.4, // Start threshold staircase at 20/50 (0.4 LogMAR)
    lineScores: {},
    finalLogMAR: null,
    totalLetterScore: null,
    testedEye: 'OD',
  },
  contrastWizard: {
    mode: 'letter_contrast',
    contrastPercent: 100,
    letterLogMAR: 0.4, // 20/50 standard Pelli-Robson equivalent
    spatialFrequencyCpd: 6,
    gratingAngleDeg: 0,
    recordedThresholds: {},
  },
  calibration: {
    referenceBarPixels: 323.5, // ~85.6mm at 96 DPI
    measuredBarMm: 85.6, // Standard credit card width (ISO/IEC 7810 ID-1)
    isMirroredRoom: false,
    directDistanceMeters: 6.0, // Standard 6m / 20ft lane
    patientToMirrorMeters: 3.0,
    mirrorToScreenMeters: 3.0,
    distanceUnit: 'meters',
  },
  refraction: DEFAULT_REFRACTION_STATE,
  jcc: DEFAULT_JCC_STATE,
};

export interface WorkflowPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  patch: Partial<ExamState>;
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'habitual_va',
    name: 'Habitual VA (20/40 Line)',
    badge: '1. ENTRY 20/40',
    description: 'Sloan single line at 20/40 (0.3 LogMAR) for rapid entry screening',
    patch: {
      activeCategory: 'va_chart',
      optotypeSet: 'sloan',
      activeLogMAR: 0.3,
      isolationMode: 'line',
      crowdingMode: 'none',
      duochromeOverlay: 'none',
      invertPolarity: false,
    },
  },
  {
    id: 'refraction_20_20',
    name: 'Threshold 20/20 Line',
    badge: '2. 20/20 CHECK',
    description: 'Sloan single line at 20/20 (0.0 LogMAR) for endpoint refraction',
    patch: {
      activeCategory: 'va_chart',
      optotypeSet: 'sloan',
      activeLogMAR: 0.0,
      isolationMode: 'line',
      crowdingMode: 'none',
      duochromeOverlay: 'none',
    },
  },
  {
    id: 'astig_refinement',
    name: 'Astigmatic Clock & JCC',
    badge: '3. CYLINDER',
    description: 'Astigmatic clock dial for cylinder axis & power refinement',
    patch: {
      activeCategory: 'astigmatism',
      astigmatismMode: 'clock_dial',
    },
  },
  {
    id: 'duochrome_check',
    name: 'Duochrome Red/Green Split',
    badge: '4. SPHERE BAL',
    description: 'Split Red/Green verification at 20/25 (0.1 LogMAR)',
    patch: {
      activeCategory: 'va_chart',
      optotypeSet: 'sloan',
      activeLogMAR: 0.1,
      isolationMode: 'line',
      duochromeOverlay: 'split',
    },
  },
  {
    id: 'binocular_worth',
    name: 'Worth 4-Dot Fusion',
    badge: '5. BINOCULAR',
    description: 'Flat fusion & suppression screening',
    patch: {
      activeCategory: 'binocular',
      binocularMode: 'worth_4_dot',
    },
  },
  {
    id: 'pediatric_crowded',
    name: 'Pediatric Crowded Single',
    badge: '6. PEDIATRIC',
    description: 'Isolated pediatric symbol with 0.5x contour crowding bars for amblyopia',
    patch: {
      activeCategory: 'va_chart',
      optotypeSet: 'pediatric',
      activeLogMAR: 0.2,
      isolationMode: 'single',
      crowdingMode: 'bars_0.5x',
      duochromeOverlay: 'none',
    },
  },
];
