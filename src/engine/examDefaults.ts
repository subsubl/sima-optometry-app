import { ExamState } from '../types/exam';

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
  dyopDirection: 'cw',
  dyopRpm: 40,
  etdrsWizard: {
    phase: 'screening',
    currentLogMAR: 0.7, // Start screening at 20/100
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
    badge: '1. Entry VA',
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
    badge: '2. 20/20 Check',
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
    badge: '3. Cylinder',
    description: 'Astigmatic clock dial for cylinder axis & power refinement',
    patch: {
      activeCategory: 'astigmatism',
      astigmatismMode: 'clock_dial',
    },
  },
  {
    id: 'duochrome_check',
    name: 'Duochrome Red/Green Split',
    badge: '4. Sphere Bal',
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
    badge: '5. Binocular',
    description: 'Flat fusion & suppression screening',
    patch: {
      activeCategory: 'binocular',
      binocularMode: 'worth_4_dot',
    },
  },
  {
    id: 'pediatric_crowded',
    name: 'Pediatric Crowded Single',
    badge: '6. Pediatric',
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
