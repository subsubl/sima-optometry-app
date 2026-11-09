import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 1. In-Memory QR Code Cache
// ============================================================================
const qrMemoryCache = new Map();

/**
 * Returns cached QR code data URL for a given URL, or generates and caches it.
 * Eliminates redundant 15-30ms CPU-bound PNG rasterization on polling.
 */
export async function getCachedQrDataUrl(doctorUrl) {
  if (!doctorUrl) return '';
  if (qrMemoryCache.has(doctorUrl)) {
    return qrMemoryCache.get(doctorUrl);
  }
  try {
    const dataUrl = await QRCode.toDataURL(doctorUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#090B0E',
        light: '#ffffff',
      },
    });
    qrMemoryCache.set(doctorUrl, dataUrl);
    return dataUrl;
  } catch {
    return '';
  }
}

/**
 * Clears the QR code memory cache (useful during network adapter changes or tests).
 */
export function clearQrCache() {
  qrMemoryCache.clear();
}

// ============================================================================
// 2. Network Topology Helpers
// ============================================================================

/**
 * Finds all non-internal IPv4 addresses, separating physical network adapters
 * (Ethernet, Wi-Fi) from virtual container bridges (Docker, libvirt, Tailscale).
 */
export function getAllLanIps() {
  const interfaces = os.networkInterfaces();
  const physicalIps = [];
  const virtualIps = [];

  const VIRTUAL_REGEX = /^(docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|tailscale|wg)/i;

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name] || [];
    const isVirtual = VIRTUAL_REGEX.test(name);

    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('127.')) continue;
        const entry = { name, address: net.address };
        if (isVirtual) {
          virtualIps.push(entry);
        } else {
          physicalIps.push(entry);
        }
      }
    }
  }

  return physicalIps.length > 0 ? physicalIps : virtualIps;
}

/**
 * Finds the primary physical non-internal IPv4 address of the clinic machine.
 */
export function getLocalLanIp() {
  const ips = getAllLanIps();
  return ips.length > 0 ? ips[0].address : '127.0.0.1';
}

// ============================================================================
// 3. Clinical State Defaults & Schema Sanitization Engine
// ============================================================================

export const DEFAULT_SERVER_REFRACTION = {
  od: {
    sphere: 0.0,
    cylinder: 0.0,
    axis: 180,
    pd: 32.0,
    prism: 0.0,
    prismBase: 'IN',
    add: 0.0,
    occlusion: 'OPEN',
  },
  os: {
    sphere: 0.0,
    cylinder: 0.0,
    axis: 180,
    pd: 32.0,
    prism: 0.0,
    prismBase: 'IN',
    add: 0.0,
    occlusion: 'OPEN',
  },
  binocularPd: 64.0,
  workingDistanceCm: 40,
};

export const DEFAULT_SERVER_JCC = {
  flipPosition: 1,
  refinementMode: 'AXIS',
  powerStep: 0.25,
};

export const DEFAULT_SERVER_CALIBRATION = {
  referenceBarPixels: 323.5, // ~85.6mm at 96 DPI
  measuredBarMm: 85.6, // ISO/IEC 7810 ID-1 credit card width
  isMirroredRoom: false,
  directDistanceMeters: 6.0,
  patientToMirrorMeters: 3.0,
  mirrorToScreenMeters: 3.0,
  distanceUnit: 'meters',
};

export const DEFAULT_SERVER_EXAM_STATE = {
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
  calibration: DEFAULT_SERVER_CALIBRATION,
  refraction: DEFAULT_SERVER_REFRACTION,
  jcc: DEFAULT_SERVER_JCC,
};

const VALID_CATEGORIES = new Set([
  'va_chart',
  'duochrome_balance',
  'astigmatism',
  'binocular',
  'etdrs_wizard',
  'contrast_wizard',
  'macular_color',
  'near_vision',
]);

const VALID_OPTOTYPES = new Set([
  'sloan',
  'snellen',
  'tumbling_e',
  'landolt_c',
  'numbers',
  'hotv',
  'pediatric',
  'dyop',
]);

const VALID_ISOLATIONS = new Set(['full', 'line', 'column', 'single']);
const VALID_CROWDINGS = new Set(['none', 'bars_0.5x', 'bars_1.0x', 'box']);
const VALID_DUOCHROMES = new Set(['none', 'split', 'red_only', 'green_only']);
const VALID_NOTATIONS = new Set(['snellen_us', 'snellen_metric', 'decimal', 'logmar']);
const VALID_SCORE_STATUSES = new Set(['untested', 'correct', 'incorrect']);
const VALID_PRISM_BASES = new Set(['IN', 'OUT', 'UP', 'DOWN']);
const VALID_OCCLUSIONS = new Set(['OPEN', 'OCCLUDED', 'PINHOLE']);

function sanitizeEyeRefraction(eye, defaultEye) {
  if (!eye || typeof eye !== 'object' || Array.isArray(eye)) return defaultEye;
  return {
    sphere:
      typeof eye.sphere === 'number' && Number.isFinite(eye.sphere)
        ? Math.max(-25, Math.min(25, Math.round(eye.sphere * 100) / 100))
        : defaultEye.sphere,
    cylinder:
      typeof eye.cylinder === 'number' && Number.isFinite(eye.cylinder)
        ? Math.max(-15, Math.min(15, Math.round(eye.cylinder * 100) / 100))
        : defaultEye.cylinder,
    axis:
      typeof eye.axis === 'number' && Number.isFinite(eye.axis)
        ? Math.max(1, Math.min(180, Math.round(eye.axis)))
        : defaultEye.axis,
    pd:
      typeof eye.pd === 'number' && Number.isFinite(eye.pd)
        ? Math.max(20, Math.min(45, Math.round(eye.pd * 10) / 10))
        : defaultEye.pd,
    prism:
      typeof eye.prism === 'number' && Number.isFinite(eye.prism)
        ? Math.max(0, Math.min(25, Math.round(eye.prism * 100) / 100))
        : defaultEye.prism,
    prismBase: VALID_PRISM_BASES.has(eye.prismBase) ? eye.prismBase : defaultEye.prismBase,
    add:
      typeof eye.add === 'number' && Number.isFinite(eye.add)
        ? Math.max(0, Math.min(5, Math.round(eye.add * 100) / 100))
        : defaultEye.add,
    occlusion: VALID_OCCLUSIONS.has(eye.occlusion) ? eye.occlusion : defaultEye.occlusion,
  };
}

/**
 * Sanitizes and hydrates incoming ExamState payloads to guarantee zero-exception robustness.
 * Protects client monitors from malicious or malformed state injections.
 */
export function sanitizeServerExamState(incoming, currentExamState = null) {
  const base = currentExamState || DEFAULT_SERVER_EXAM_STATE;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return base;
  }

  const sanitized = { ...base };

  if (VALID_CATEGORIES.has(incoming.activeCategory)) {
    sanitized.activeCategory = incoming.activeCategory;
  }
  if (VALID_OPTOTYPES.has(incoming.optotypeSet)) {
    sanitized.optotypeSet = incoming.optotypeSet;
  }
  if (typeof incoming.activeLogMAR === 'number' && Number.isFinite(incoming.activeLogMAR)) {
    sanitized.activeLogMAR = Math.max(-1.0, Math.min(3.0, Math.round(incoming.activeLogMAR * 100) / 100));
  }
  if (VALID_ISOLATIONS.has(incoming.isolationMode)) {
    sanitized.isolationMode = incoming.isolationMode;
  }
  if (
    typeof incoming.activeLetterIndex === 'number' &&
    Number.isInteger(incoming.activeLetterIndex) &&
    incoming.activeLetterIndex >= 0 &&
    incoming.activeLetterIndex <= 4
  ) {
    sanitized.activeLetterIndex = incoming.activeLetterIndex;
  }
  if (VALID_CROWDINGS.has(incoming.crowdingMode)) {
    sanitized.crowdingMode = incoming.crowdingMode;
  }
  if (VALID_DUOCHROMES.has(incoming.duochromeOverlay)) {
    sanitized.duochromeOverlay = incoming.duochromeOverlay;
  }
  if (typeof incoming.invertPolarity === 'boolean') {
    sanitized.invertPolarity = incoming.invertPolarity;
  }
  if (typeof incoming.isBlackout === 'boolean') {
    sanitized.isBlackout = incoming.isBlackout;
  }
  if (typeof incoming.randomSeed === 'number' && Number.isFinite(incoming.randomSeed)) {
    sanitized.randomSeed = incoming.randomSeed;
  }
  if (VALID_NOTATIONS.has(incoming.doctorNotation)) {
    sanitized.doctorNotation = incoming.doctorNotation;
  }
  if (typeof incoming.showNotationOnPatient === 'boolean') {
    sanitized.showNotationOnPatient = incoming.showNotationOnPatient;
  }
  if (typeof incoming.showCalibrationOnPatient === 'boolean') {
    sanitized.showCalibrationOnPatient = incoming.showCalibrationOnPatient;
  }

  if (Array.isArray(incoming.currentLineScores)) {
    sanitized.currentLineScores = incoming.currentLineScores
      .slice(0, 5)
      .map((status) => (VALID_SCORE_STATUSES.has(status) ? status : 'untested'));
    while (sanitized.currentLineScores.length < 5) {
      sanitized.currentLineScores.push('untested');
    }
  }

  if (incoming.calibration && typeof incoming.calibration === 'object' && !Array.isArray(incoming.calibration)) {
    const cal = incoming.calibration;
    const baseCal = base.calibration || DEFAULT_SERVER_CALIBRATION;
    sanitized.calibration = {
      referenceBarPixels:
        typeof cal.referenceBarPixels === 'number' && cal.referenceBarPixels > 0 && Number.isFinite(cal.referenceBarPixels)
          ? cal.referenceBarPixels
          : baseCal.referenceBarPixels,
      measuredBarMm:
        typeof cal.measuredBarMm === 'number' && cal.measuredBarMm > 0 && Number.isFinite(cal.measuredBarMm)
          ? cal.measuredBarMm
          : baseCal.measuredBarMm,
      isMirroredRoom:
        typeof cal.isMirroredRoom === 'boolean'
          ? cal.isMirroredRoom
          : baseCal.isMirroredRoom,
      directDistanceMeters:
        typeof cal.directDistanceMeters === 'number' && cal.directDistanceMeters > 0 && Number.isFinite(cal.directDistanceMeters)
          ? cal.directDistanceMeters
          : baseCal.directDistanceMeters,
      patientToMirrorMeters:
        typeof cal.patientToMirrorMeters === 'number' && cal.patientToMirrorMeters > 0 && Number.isFinite(cal.patientToMirrorMeters)
          ? cal.patientToMirrorMeters
          : baseCal.patientToMirrorMeters,
      mirrorToScreenMeters:
        typeof cal.mirrorToScreenMeters === 'number' && cal.mirrorToScreenMeters > 0 && Number.isFinite(cal.mirrorToScreenMeters)
          ? cal.mirrorToScreenMeters
          : baseCal.mirrorToScreenMeters,
      distanceUnit: cal.distanceUnit === 'feet' ? 'feet' : 'meters',
    };
  }

  if (incoming.refraction && typeof incoming.refraction === 'object' && !Array.isArray(incoming.refraction)) {
    const baseRef = base.refraction || DEFAULT_SERVER_REFRACTION;
    sanitized.refraction = {
      od: sanitizeEyeRefraction(incoming.refraction.od, baseRef.od || DEFAULT_SERVER_REFRACTION.od),
      os: sanitizeEyeRefraction(incoming.refraction.os, baseRef.os || DEFAULT_SERVER_REFRACTION.os),
      binocularPd:
        typeof incoming.refraction.binocularPd === 'number' && Number.isFinite(incoming.refraction.binocularPd)
          ? Math.max(45, Math.min(85, incoming.refraction.binocularPd))
          : baseRef.binocularPd || 64.0,
      workingDistanceCm:
        typeof incoming.refraction.workingDistanceCm === 'number' && Number.isFinite(incoming.refraction.workingDistanceCm)
          ? Math.max(20, Math.min(100, incoming.refraction.workingDistanceCm))
          : baseRef.workingDistanceCm || 40,
    };
  }

  if (incoming.jcc && typeof incoming.jcc === 'object' && !Array.isArray(incoming.jcc)) {
    sanitized.jcc = {
      flipPosition: incoming.jcc.flipPosition === 2 ? 2 : 1,
      refinementMode: incoming.jcc.refinementMode === 'POWER' ? 'POWER' : 'AXIS',
      powerStep: incoming.jcc.powerStep === 0.5 ? 0.5 : 0.25,
    };
  }

  if (incoming.astigmatismMode && ['clock_dial', 'sunburst', 'jcc_dots'].includes(incoming.astigmatismMode)) {
    sanitized.astigmatismMode = incoming.astigmatismMode;
  }
  if (typeof incoming.astigmatismAxisDeg === 'number' && Number.isFinite(incoming.astigmatismAxisDeg)) {
    sanitized.astigmatismAxisDeg = Math.max(0, Math.min(180, incoming.astigmatismAxisDeg));
  }
  if (incoming.binocularMode && ['worth_4_dot', 'schober', 'fixation_disparity', 'binocular_balance'].includes(incoming.binocularMode)) {
    sanitized.binocularMode = incoming.binocularMode;
  }
  if (typeof incoming.worthDotSpread === 'number' && Number.isFinite(incoming.worthDotSpread)) {
    sanitized.worthDotSpread = Math.max(0.1, Math.min(5.0, incoming.worthDotSpread));
  }
  if (incoming.macularColorMode && typeof incoming.macularColorMode === 'string') {
    sanitized.macularColorMode = incoming.macularColorMode;
  }
  if (typeof incoming.colorPlateIndex === 'number' && Number.isInteger(incoming.colorPlateIndex)) {
    sanitized.colorPlateIndex = incoming.colorPlateIndex;
  }
  if (Array.isArray(incoming.d15ArrangedCaps)) {
    sanitized.d15ArrangedCaps = incoming.d15ArrangedCaps.filter((n) => typeof n === 'number' && Number.isInteger(n));
  }
  if (Array.isArray(incoming.d15RemainingCaps)) {
    sanitized.d15RemainingCaps = incoming.d15RemainingCaps.filter((n) => typeof n === 'number' && Number.isInteger(n));
  }
  if (incoming.dyopDirection === 'cw' || incoming.dyopDirection === 'ccw') {
    sanitized.dyopDirection = incoming.dyopDirection;
  }
  if (typeof incoming.dyopRpm === 'number' && Number.isFinite(incoming.dyopRpm)) {
    sanitized.dyopRpm = incoming.dyopRpm;
  }

  if (incoming.etdrsWizard && typeof incoming.etdrsWizard === 'object' && !Array.isArray(incoming.etdrsWizard)) {
    sanitized.etdrsWizard = {
      ...base.etdrsWizard,
      phase: ['screening', 'threshold', 'completed'].includes(incoming.etdrsWizard.phase)
        ? incoming.etdrsWizard.phase
        : base.etdrsWizard.phase,
      currentLogMAR:
        typeof incoming.etdrsWizard.currentLogMAR === 'number' && Number.isFinite(incoming.etdrsWizard.currentLogMAR)
          ? incoming.etdrsWizard.currentLogMAR
          : base.etdrsWizard.currentLogMAR,
      lineScores:
        incoming.etdrsWizard.lineScores && typeof incoming.etdrsWizard.lineScores === 'object'
          ? incoming.etdrsWizard.lineScores
          : base.etdrsWizard.lineScores,
      finalLogMAR:
        typeof incoming.etdrsWizard.finalLogMAR === 'number' && Number.isFinite(incoming.etdrsWizard.finalLogMAR)
          ? incoming.etdrsWizard.finalLogMAR
          : (incoming.etdrsWizard.finalLogMAR === null ? null : base.etdrsWizard.finalLogMAR),
      totalLetterScore:
        typeof incoming.etdrsWizard.totalLetterScore === 'number' && Number.isFinite(incoming.etdrsWizard.totalLetterScore)
          ? incoming.etdrsWizard.totalLetterScore
          : (incoming.etdrsWizard.totalLetterScore === null ? null : base.etdrsWizard.totalLetterScore),
      testedEye: ['OD', 'OS', 'OU'].includes(incoming.etdrsWizard.testedEye)
        ? incoming.etdrsWizard.testedEye
        : base.etdrsWizard.testedEye,
    };
  }

  if (incoming.contrastWizard && typeof incoming.contrastWizard === 'object' && !Array.isArray(incoming.contrastWizard)) {
    sanitized.contrastWizard = {
      ...base.contrastWizard,
      mode: ['letter_contrast', 'sine_grating'].includes(incoming.contrastWizard.mode)
        ? incoming.contrastWizard.mode
        : base.contrastWizard.mode,
      contrastPercent:
        typeof incoming.contrastWizard.contrastPercent === 'number' && Number.isFinite(incoming.contrastWizard.contrastPercent)
          ? incoming.contrastWizard.contrastPercent
          : base.contrastWizard.contrastPercent,
      letterLogMAR:
        typeof incoming.contrastWizard.letterLogMAR === 'number' && Number.isFinite(incoming.contrastWizard.letterLogMAR)
          ? incoming.contrastWizard.letterLogMAR
          : base.contrastWizard.letterLogMAR,
      spatialFrequencyCpd:
        typeof incoming.contrastWizard.spatialFrequencyCpd === 'number' && Number.isFinite(incoming.contrastWizard.spatialFrequencyCpd)
          ? incoming.contrastWizard.spatialFrequencyCpd
          : base.contrastWizard.spatialFrequencyCpd,
      gratingAngleDeg:
        typeof incoming.contrastWizard.gratingAngleDeg === 'number' && Number.isFinite(incoming.contrastWizard.gratingAngleDeg)
          ? incoming.contrastWizard.gratingAngleDeg
          : base.contrastWizard.gratingAngleDeg,
      recordedThresholds:
        incoming.contrastWizard.recordedThresholds && typeof incoming.contrastWizard.recordedThresholds === 'object'
          ? incoming.contrastWizard.recordedThresholds
          : base.contrastWizard.recordedThresholds,
    };
  }

  return sanitized;
}

// ============================================================================
// 4. Safe Socket Transmission & Broadcast
// ============================================================================

function safeSend(client, data) {
  if (client && client.readyState === WebSocket.OPEN) {
    try {
      client.send(data, (err) => {
        if (err) {
          // Socket write failed asynchronously; ignore
        }
      });
    } catch {
      // Synchronous socket write exception caught safely
    }
  }
}

function broadcastSync(wss, outbound, excludeWs = null) {
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      safeSend(client, outbound);
    }
  }
}

// ============================================================================
// 5. Server Factory Function
// ============================================================================

export function createOptiSuiteServer({
  port = process.env.PORT !== undefined ? Number(process.env.PORT) : 3020,
  serveStatic = true,
  heartbeatIntervalMs = 25000,
} = {}) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let currentExamState = null;
  let boundPort = port;
  let serverSeq = 0;

  // --------------------------------------------------------------------------
  // Heartbeat & Zombie Socket Reaper (25s Interval)
  // --------------------------------------------------------------------------
  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        // Socket failed to respond to previous ping -> terminate zombie connection
        try {
          client.terminate();
        } catch {
          // Ignore termination errors
        }
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        try {
          client.terminate();
        } catch {
          // Ignore termination errors
        }
      }
    }
  }, heartbeatIntervalMs);

  // Unreference timer so it doesn't prevent Node process termination in tests
  if (pingInterval.unref) {
    pingInterval.unref();
  }

  const cleanup = () => {
    clearInterval(pingInterval);
  };
  server.on('close', cleanup);
  wss.on('close', cleanup);

  // --------------------------------------------------------------------------
  // Express Middleware & Endpoints
  // --------------------------------------------------------------------------
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());

  app.get('/api/network-info', async (req, res) => {
    const lanAdapters = getAllLanIps();
    const allIps = lanAdapters.map((a) => a.address);

    const hostHeader = req.headers.host || '';
    const incomingHost = hostHeader.split(':')[0];
    const isIncomingLan =
      incomingHost &&
      incomingHost !== 'localhost' &&
      incomingHost !== '127.0.0.1' &&
      incomingHost !== '::1';

    const requestedIp = req.query.ip ? String(req.query.ip).trim() : null;
    const lanIp =
      requestedIp ||
      (isIncomingLan
        ? incomingHost
        : process.env.HOST_IP || allIps[0] || '127.0.0.1');

    const uiPort = process.env.VITE_PORT ? Number(process.env.VITE_PORT) : boundPort;
    const doctorUrl = `http://${lanIp}:${uiPort}/#/doctor`;
    const patientUrl = `http://${lanIp}:${uiPort}/#/patient`;

    // Retrieve cached QR code data URL (avoids CPU-bound 240x240 PNG rasterization)
    const qrDataUrl = await getCachedQrDataUrl(doctorUrl);

    res.json({
      lanIp,
      allLanIps: allIps,
      adapters: lanAdapters,
      port: uiPort,
      doctorUrl,
      patientUrl,
      qrDataUrl,
      connectedClients: wss.clients.size,
    });
  });

  if (serveStatic) {
    const distPath = path.resolve(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // --------------------------------------------------------------------------
  // WebSocket Connection Lifecycle
  // --------------------------------------------------------------------------
  wss.on('connection', (ws) => {
    ws.isAlive = true;

    // Standard RFC 6455 pong frame listener
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Push existing authoritative state to newly connected client
    if (currentExamState) {
      safeSend(
        ws,
        JSON.stringify({
          type: 'STATE_SYNC',
          senderId: 'server',
          seq: ++serverSeq,
          timestamp: Date.now(),
          payload: currentExamState,
        })
      );
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== 'object') return;

        // Heartbeat application-level frames
        if (msg.type === 'PING') {
          safeSend(
            ws,
            JSON.stringify({
              type: 'PONG',
              senderId: 'server',
              seq: ++serverSeq,
              timestamp: Date.now(),
            })
          );
          return;
        }

        if (msg.type === 'PONG') {
          ws.isAlive = true;
          return;
        }

        // --------------------------------------------------------------------
        // CALIBRATION_INIT Handling (Cold-Start & Runtime Updates)
        // --------------------------------------------------------------------
        if (msg.type === 'CALIBRATION_INIT' && msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)) {
          if (!currentExamState) {
            // Cold start: Patient Display connected first. Initialize with default state + calibration.
            currentExamState = sanitizeServerExamState(
              { calibration: msg.payload },
              DEFAULT_SERVER_EXAM_STATE
            );
          } else {
            // Runtime update: Merge incoming calibration with existing state.
            currentExamState = sanitizeServerExamState(
              {
                ...currentExamState,
                calibration: {
                  ...currentExamState.calibration,
                  ...msg.payload,
                },
              },
              currentExamState
            );
          }

          const outbound = JSON.stringify({
            type: 'STATE_SYNC',
            senderId: msg.senderId || 'server',
            seq: typeof msg.seq === 'number' ? msg.seq : ++serverSeq,
            timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
            payload: currentExamState,
          });

          // Broadcast updated calibration state to all other connected clients
          broadcastSync(wss, outbound, ws);
          return;
        }

        // --------------------------------------------------------------------
        // STATE_PATCH Handling (Sanitized Mutator)
        // --------------------------------------------------------------------
        if (msg.type === 'STATE_PATCH') {
          if (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) {
            // Reject malformed payload: do not mutate server state
            return;
          }

          currentExamState = sanitizeServerExamState(msg.payload, currentExamState);

          const outbound = JSON.stringify({
            type: 'STATE_SYNC',
            senderId: msg.senderId || 'server',
            seq: typeof msg.seq === 'number' ? msg.seq : ++serverSeq,
            timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
            payload: currentExamState,
          });

          broadcastSync(wss, outbound, ws);
        }
      } catch {
        // Ignore malformed JSON frames safely
      }
    });
  });

  return {
    app,
    server,
    wss,
    getExamState: () => currentExamState,
    setExamState: (s) => {
      currentExamState = s;
    },
    start: () =>
      new Promise((resolve, reject) => {
        const onError = (err) => {
          server.removeListener('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          const addr = server.address();
          boundPort = typeof addr === 'object' && addr ? addr.port : port;
          const lanIp = getLocalLanIp();
          console.log(`\n=============================================================`);
          console.log(`  SIMA Optometry App — Clinical Server Active`);
          console.log(`  • Patient Display   : http://${lanIp}:${boundPort}/#/patient`);
          console.log(`  • Doctor Console    : http://${lanIp}:${boundPort}/#/doctor`);
          console.log(`=============================================================\n`);
          resolve({ port: boundPort, lanIp });
        };

        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '0.0.0.0');
      }),
    stop: () =>
      new Promise((resolve) => {
        clearInterval(pingInterval);
        for (const client of wss.clients) {
          try {
            client.terminate();
          } catch {
            // Ignore termination errors during shutdown
          }
        }
        wss.close(() => {
          server.close(resolve);
        });
      }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const suite = createOptiSuiteServer({ serveStatic: true });
  suite.start();
}
