/**
 * SIMA Optometry App — Milestone 2 WebSocket Synchronization & Server Resilience Spec Tests
 *
 * Comprehensive test suite covering:
 * 1. Envelope serialization, deserialization, and structural validation
 * 2. Origin-based echo suppression, causal sequence ordering, and transport deduplication
 * 3. Cold-start calibration initialization, late-joiner hydration, and peer broadcast
 * 4. Malformed payload rejection, schema sanitization, and prototype pollution immunity
 * 5. Reconnection exponential backoff math, jitter bounds, anti-overflow, and edge cases
 * 6. WebSocket ping/pong heartbeat, zombie socket reaping, and safe broadcast isolation
 * 7. QR code in-memory caching and network telemetry
 */

import { describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
// @ts-ignore
import { createOptiSuiteServer, sanitizeServerExamState, getCachedQrDataUrl, clearQrCache, DEFAULT_SERVER_EXAM_STATE, DEFAULT_SERVER_CALIBRATION } from '../../server/index.mjs';
import {
  computeReconnectBackoff,
  calculateBackoffWithJitter,
  createSyncEnvelope,
  serializeSyncEnvelope,
  deserializeSyncEnvelope,
  shouldApplySyncEnvelope,
  createSequenceGenerator,
} from '../hooks/useExamSync';
import { CalibrationConfig, ExamState, SyncMessageEnvelope } from '../types/exam';
import { DEFAULT_EXAM_STATE } from './examDefaults';
import { sanitizeExamState } from './refractionMath';

describe('Milestone 2 Specification Test Suite — WebSocket Sync & Server Resilience', () => {

  // --------------------------------------------------------------------------
  // Suite 1: Envelope Serialization, Deserialization & Structural Validation
  // --------------------------------------------------------------------------
  describe('1. Envelope Serialization & Deserialization', () => {
    it('serializes and deserializes a complete typed envelope without data loss', () => {
      const payload: Partial<ExamState> = {
        activeCategory: 'va_chart',
        optotypeSet: 'landolt_c',
        activeLogMAR: 0.1,
        isolationMode: 'single',
      };
      const envelope = createSyncEnvelope('STATE_PATCH', payload, 'doctor-client-1', 42, 1731182400000);
      const json = serializeSyncEnvelope(envelope);
      const parsed = deserializeSyncEnvelope<Partial<ExamState>>(json);

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('STATE_PATCH');
      expect(parsed?.senderId).toBe('doctor-client-1');
      expect(parsed?.seq).toBe(42);
      expect(parsed?.timestamp).toBe(1731182400000);
      expect(parsed?.payload.optotypeSet).toBe('landolt_c');
    });

    it('deserializes raw Buffer frames as received by Node ws socket', () => {
      const envelope = createSyncEnvelope('PING', null, 'server-core', 1, 1731182400000);
      const buffer = Buffer.from(JSON.stringify(envelope));
      const parsed = deserializeSyncEnvelope(buffer);

      expect(parsed).toEqual(envelope);
    });

    it('rejects non-JSON garbage, truncated strings, and empty input', () => {
      expect(deserializeSyncEnvelope('')).toBeNull();
      expect(deserializeSyncEnvelope('   ')).toBeNull();
      expect(deserializeSyncEnvelope('not a json')).toBeNull();
      expect(deserializeSyncEnvelope('{broken: json')).toBeNull();
      expect(deserializeSyncEnvelope('{"type": "STATE_PATCH"')).toBeNull();
    });

    it('rejects valid JSON primitives and arrays that lack envelope object structure', () => {
      expect(deserializeSyncEnvelope('123')).toBeNull();
      expect(deserializeSyncEnvelope('"hello"')).toBeNull();
      expect(deserializeSyncEnvelope('true')).toBeNull();
      expect(deserializeSyncEnvelope('null')).toBeNull();
      expect(deserializeSyncEnvelope('[]')).toBeNull();
      expect(deserializeSyncEnvelope('[{"type": "STATE_PATCH"}]')).toBeNull();
    });

    it('rejects envelopes with invalid types or missing senderId', () => {
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'MALICIOUS_OP', senderId: 'c1', seq: 1, timestamp: 1 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: '', seq: 1, timestamp: 1 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: '   ', seq: 1, timestamp: 1 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', seq: 1, timestamp: 1 }))).toBeNull();
    });

    it('rejects negative sequence numbers, non-integers, and non-positive timestamps', () => {
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: 'c1', seq: -1, timestamp: 1 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: 'c1', seq: 2.5, timestamp: 1 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: 'c1', seq: NaN, timestamp: 1 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: 'c1', seq: Infinity, timestamp: 1 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: 'c1', seq: 1, timestamp: 0 }))).toBeNull();
      expect(deserializeSyncEnvelope(JSON.stringify({ type: 'STATE_PATCH', senderId: 'c1', seq: 1, timestamp: -100 }))).toBeNull();
    });

    it('generates strictly monotonic sequence numbers per sender session', () => {
      const gen = createSequenceGenerator('doctor-session-10');
      const env1 = gen.nextEnvelope('STATE_PATCH', { activeLogMAR: 0.1 });
      const env2 = gen.nextEnvelope('STATE_PATCH', { activeLogMAR: 0.0 });
      const env3 = gen.nextEnvelope('STATE_PATCH', { activeLogMAR: -0.1 });

      expect(env1.seq).toBe(1);
      expect(env2.seq).toBe(2);
      expect(env3.seq).toBe(3);
      expect(gen.getCurrentSeq()).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Origin-Based Echo Suppression & Sequence Ordering Invariants
  // --------------------------------------------------------------------------
  describe('2. Echo Suppression & Sequence Ordering', () => {
    it('suppresses local echo when received envelope originates from current client session', () => {
      const myClientId = 'doctor-session-alpha';
      const seqMap = new Map<string, number>();

      const echoMsg = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.3 }, myClientId, 1);
      const shouldApply = shouldApplySyncEnvelope(echoMsg, myClientId, seqMap);

      expect(shouldApply).toBe(false);
    });

    it('accepts incoming update from a remote peer client', () => {
      const myClientId = 'patient-display-lane1';
      const peerId = 'doctor-session-alpha';
      const seqMap = new Map<string, number>();

      const peerMsg = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.3 }, peerId, 1);
      const shouldApply = shouldApplySyncEnvelope(peerMsg, myClientId, seqMap);

      expect(shouldApply).toBe(true);
      seqMap.set(peerId, 1);
    });

    it('rejects stale or duplicate sequence numbers from the same sender', () => {
      const myClientId = 'patient-display-lane1';
      const peerId = 'doctor-session-alpha';
      const seqMap = new Map<string, number>();
      seqMap.set(peerId, 5); // Current highest sequence is 5

      // Stale retrograde packet (seq 4 arrives after seq 5)
      const staleMsg = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.5 }, peerId, 4);
      expect(shouldApplySyncEnvelope(staleMsg, myClientId, seqMap)).toBe(false);

      // Duplicate packet (seq 5 arrives again via WebSocket after BroadcastChannel)
      const duplicateMsg = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.4 }, peerId, 5);
      expect(shouldApplySyncEnvelope(duplicateMsg, myClientId, seqMap)).toBe(false);

      // Newer packet (seq 6) is accepted
      const newerMsg = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.3 }, peerId, 6);
      expect(shouldApplySyncEnvelope(newerMsg, myClientId, seqMap)).toBe(true);
    });

    it('tracks sequence numbers independently per sender ID without cross-interference', () => {
      const myClientId = 'patient-display-lane1';
      const doctor1 = 'doctor-primary';
      const doctor2 = 'doctor-assistant-tablet';
      const seqMap = new Map<string, number>();

      seqMap.set(doctor1, 100);

      // Doctor 2 sends seq 1; should be accepted even though doctor 1 is at 100
      const tabletMsg = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.2 }, doctor2, 1);
      expect(shouldApplySyncEnvelope(tabletMsg, myClientId, seqMap)).toBe(true);
      seqMap.set(doctor2, 1);

      // Subsequent doctor 2 message with seq 1 is rejected
      expect(shouldApplySyncEnvelope(tabletMsg, myClientId, seqMap)).toBe(false);
    });

    it('deduplicates identical frames across simultaneous BroadcastChannel (0ms) and WebSocket (20ms) transports', () => {
      const myClientId = 'patient-window-electron';
      const remoteSender = 'doctor-console';
      const seqMap = new Map<string, number>();

      let renderCount = 0;
      const applyStateIfValid = (env: SyncMessageEnvelope) => {
        if (shouldApplySyncEnvelope(env, myClientId, seqMap)) {
          seqMap.set(env.senderId, env.seq);
          renderCount += 1;
        }
      };

      // 1. Doctor triggers state update (seq 15)
      const envelope = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.2 }, remoteSender, 15);

      // 2. BroadcastChannel delivers immediately at T=0ms
      applyStateIfValid(envelope);
      expect(renderCount).toBe(1);

      // 3. WebSocket round-trip delivers identical frame at T=20ms
      applyStateIfValid(envelope);
      // Echo / duplicate suppression guarantees NO secondary render pass
      expect(renderCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Cold-Start Calibration Resilience & Broadcast Behavior
  // --------------------------------------------------------------------------
  describe('3. Cold-Start Calibration Initialization & Broadcast Behavior', () => {
    it('initializes null server state upon receiving CALIBRATION_INIT and broadcasts to peers via createOptiSuiteServer', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        // Step 1: Patient connects first (cold-start)
        const patientWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((res) => patientWs.once('open', () => res()));

        const customCalibration: CalibrationConfig = {
          referenceBarPixels: 480.0,
          measuredBarMm: 100.0,
          isMirroredRoom: true,
          directDistanceMeters: 4.0,
          patientToMirrorMeters: 2.0,
          mirrorToScreenMeters: 2.0,
          distanceUnit: 'meters',
        };

        patientWs.send(JSON.stringify({
          type: 'CALIBRATION_INIT',
          senderId: 'patient-lane-1',
          payload: customCalibration,
        }));

        // Allow server event loop tick
        await new Promise((r) => setTimeout(r, 60));

        const serverState = suite.getExamState();
        expect(serverState).not.toBeNull();
        expect(serverState?.calibration.referenceBarPixels).toBe(480.0);
        expect(serverState?.calibration.isMirroredRoom).toBe(true);

        // Step 2: Doctor connects second (late-joiner); must receive patient calibration
        const doctorWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const doctorReceived = new Promise<any>((resolve) => {
          doctorWs.once('message', (data) => resolve(JSON.parse(data.toString())));
        });

        const syncMsg = await doctorReceived;
        expect(syncMsg.type).toBe('STATE_SYNC');
        expect(syncMsg.payload.calibration.referenceBarPixels).toBe(480.0);
        expect(syncMsg.payload.calibration.isMirroredRoom).toBe(true);

        // Step 3: Peer calibration update broadcast: Doctor updates calibration, Patient receives it
        const patientReceivedUpdate = new Promise<any>((resolve) => {
          patientWs.once('message', (data) => resolve(JSON.parse(data.toString())));
        });

        doctorWs.send(JSON.stringify({
          type: 'CALIBRATION_INIT',
          senderId: 'doctor-console-1',
          payload: { measuredBarMm: 85.6 },
        }));

        const updatedSync = await patientReceivedUpdate;
        expect(updatedSync.type).toBe('STATE_SYNC');
        expect(updatedSync.payload.calibration.measuredBarMm).toBe(85.6);
        expect(updatedSync.payload.calibration.referenceBarPixels).toBe(480.0);

        patientWs.close();
        doctorWs.close();
      } finally {
        await suite.stop();
      }
    });

    it('converges state across 3 concurrent clients (Doctor PC, Doctor iPad, Patient Screen) firing interleaved patches', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        const doctorPC = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const doctorTablet = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const patientScreen = new WebSocket(`ws://127.0.0.1:${port}/ws`);

        await Promise.all([
          new Promise<void>((r) => doctorPC.once('open', () => r())),
          new Promise<void>((r) => doctorTablet.once('open', () => r())),
          new Promise<void>((r) => patientScreen.once('open', () => r())),
        ]);

        let patientReceivedLogMAR = -999;
        patientScreen.on('message', (raw) => {
          const parsed = JSON.parse(raw.toString());
          if (parsed.payload?.activeLogMAR !== undefined) {
            patientReceivedLogMAR = parsed.payload.activeLogMAR;
          }
        });

        // Interleaved updates from PC and Tablet
        doctorPC.send(JSON.stringify({
          type: 'STATE_PATCH',
          senderId: 'doc-pc',
          payload: { activeLogMAR: 0.2 },
        }));
        doctorTablet.send(JSON.stringify({
          type: 'STATE_PATCH',
          senderId: 'doc-tab',
          payload: { activeCategory: 'duochrome_balance' },
        }));
        doctorPC.send(JSON.stringify({
          type: 'STATE_PATCH',
          senderId: 'doc-pc',
          payload: { activeLogMAR: 0.1 },
        }));

        await new Promise((r) => setTimeout(r, 80));

        const finalState = suite.getExamState();
        expect(finalState.activeLogMAR).toBe(0.1);
        expect(finalState.activeCategory).toBe('duochrome_balance');
        expect(patientReceivedLogMAR).toBe(0.1);

        doctorPC.close();
        doctorTablet.close();
        patientScreen.close();
      } finally {
        await suite.stop();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: Malformed Payload Rejection & Server State Protection
  // --------------------------------------------------------------------------
  describe('4. Malformed Payload Rejection & Sanitization', () => {
    it('survives a rapid burst of 50 randomized adversarial payloads without crashing', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((r) => client.once('open', () => r()));

        const malformedBursts = [
          '{{{bad json',
          'null',
          '12345',
          JSON.stringify({ type: 'UNKNOWN', payload: {} }),
          JSON.stringify({ type: 'STATE_PATCH', payload: null }),
          JSON.stringify({ type: 'STATE_PATCH', payload: 'string-not-object' }),
          JSON.stringify({ type: 'STATE_PATCH', payload: [1, 2, 3] }),
          JSON.stringify({ type: 'STATE_PATCH', payload: { refraction: null } }),
          JSON.stringify({ type: 'STATE_PATCH', payload: { calibration: 'broken' } }),
          JSON.stringify({ type: 'STATE_PATCH', payload: { activeLogMAR: NaN } }),
          JSON.stringify({ type: 'STATE_PATCH', payload: { currentLineScores: 'bad' } }),
        ];

        // Fire 50 malformed frames
        for (let i = 0; i < 50; i++) {
          const frame = malformedBursts[i % malformedBursts.length];
          client.send(frame);
        }

        // Immediately follow with a valid frame
        client.send(JSON.stringify({
          type: 'STATE_PATCH',
          senderId: 'doctor-valid',
          payload: { activeLogMAR: 0.0, optotypeSet: 'sloan' },
        }));

        await new Promise((r) => setTimeout(r, 80));

        const state = suite.getExamState();
        expect(state.activeLogMAR).toBe(0.0);
        expect(state.optotypeSet).toBe('sloan');
        expect(state.refraction).toBeDefined();

        client.close();
      } finally {
        await suite.stop();
      }
    });

    it('prevents malformed STATE_PATCH payloads from corrupting server state or crashing peers', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        const clientA = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const clientB = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await Promise.all([
          new Promise<void>((r) => clientA.once('open', () => r())),
          new Promise<void>((r) => clientB.once('open', () => r())),
        ]);

        let clientBReceivedCount = 0;
        let lastReceivedState: any = null;
        clientB.on('message', (raw) => {
          clientBReceivedCount += 1;
          lastReceivedState = JSON.parse(raw.toString());
        });

        // 1. Send completely corrupt primitives
        clientA.send(JSON.stringify({ type: 'STATE_PATCH', payload: null }));
        clientA.send(JSON.stringify({ type: 'STATE_PATCH', payload: 'corrupt string' }));
        clientA.send(JSON.stringify({ type: 'STATE_PATCH', payload: 12345 }));
        clientA.send(JSON.stringify({ type: 'STATE_PATCH', payload: [] }));

        await new Promise((r) => setTimeout(r, 60));

        // Client B must NOT have received any corrupted frames
        expect(clientBReceivedCount).toBe(0);

        // 2. Send partial payload missing nested refraction and calibration objects
        clientA.send(JSON.stringify({
          type: 'STATE_PATCH',
          senderId: 'client-a',
          payload: {
            activeLogMAR: 0.5,
            optotypeSet: 'snellen',
          },
        }));

        await new Promise((r) => setTimeout(r, 60));

        expect(clientBReceivedCount).toBe(1);
        expect(lastReceivedState.payload.activeLogMAR).toBe(0.5);
        expect(lastReceivedState.payload.optotypeSet).toBe('snellen');
        // Critical: Refraction and Calibration were hydrated with valid complete structures
        expect(lastReceivedState.payload.refraction).toBeDefined();
        expect(lastReceivedState.payload.refraction.od.sphere).toBe(0.0);
        expect(lastReceivedState.payload.calibration.referenceBarPixels).toBe(323.5);

        // 3. Prototype pollution attempt
        clientA.send(JSON.stringify({
          type: 'STATE_PATCH',
          payload: {
            __proto__: { isAdmin: true },
            constructor: { prototype: { isHacked: true } },
          },
        }));

        await new Promise((r) => setTimeout(r, 60));

        expect((({} as any)).isAdmin).toBeUndefined();
        expect((({} as any)).isHacked).toBeUndefined();

        clientA.close();
        clientB.close();
      } finally {
        await suite.stop();
      }
    });

    it('sanitizeServerExamState strictly sanitizes enums, optical ranges, and nested structures', () => {
      const sanitized = sanitizeServerExamState({
        activeCategory: 'invalid_category',
        optotypeSet: 'invalid_optotype',
        activeLogMAR: 99.9,
        isolationMode: 'invalid_isolation',
        activeLetterIndex: 10,
        refraction: {
          od: {
            sphere: 999.0, // should clamp to 25
            cylinder: -999.0, // should clamp to -15
            axis: 999, // should clamp to 180
            pd: 10, // should clamp to 20
            prism: 50, // should clamp to 25
            prismBase: 'INVALID',
            occlusion: 'INVALID',
          },
        },
      });

      expect(sanitized.activeCategory).toBe('va_chart');
      expect(sanitized.optotypeSet).toBe('sloan');
      expect(sanitized.activeLogMAR).toBe(3.0); // clamped max
      expect(sanitized.isolationMode).toBe('line');
      expect(sanitized.activeLetterIndex).toBe(0);
      expect(sanitized.refraction.od.sphere).toBe(25);
      expect(sanitized.refraction.od.cylinder).toBe(-15);
      expect(sanitized.refraction.od.axis).toBe(180);
      expect(sanitized.refraction.od.pd).toBe(20);
      expect(sanitized.refraction.od.prism).toBe(25);
      expect(sanitized.refraction.od.prismBase).toBe('IN');
      expect(sanitized.refraction.od.occlusion).toBe('OPEN');
    });

    it('preserves valid near_vision test category during server state sanitization', () => {
      const sanitized = sanitizeServerExamState({
        activeCategory: 'near_vision',
      });
      expect(sanitized.activeCategory).toBe('near_vision');
    });

    it('retains near_vision category patch on server and broadcasts cleanly to peers', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        const doctorWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const patientWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);

        await Promise.all([
          new Promise<void>((r) => doctorWs.once('open', () => r())),
          new Promise<void>((r) => patientWs.once('open', () => r())),
        ]);

        const patientBroadcast = new Promise<any>((resolve) => {
          patientWs.on('message', (raw) => {
            const parsed = JSON.parse(raw.toString());
            if (parsed.type === 'STATE_SYNC' && parsed.payload?.activeCategory === 'near_vision') {
              resolve(parsed);
            }
          });
        });

        doctorWs.send(JSON.stringify({
          type: 'STATE_PATCH',
          senderId: 'doctor-console-1',
          payload: { activeCategory: 'near_vision' },
        }));

        const receivedSync = await patientBroadcast;
        expect(receivedSync.type).toBe('STATE_SYNC');
        expect(receivedSync.payload.activeCategory).toBe('near_vision');

        const serverState = suite.getExamState();
        expect(serverState.activeCategory).toBe('near_vision');

        doctorWs.close();
        patientWs.close();
      } finally {
        await suite.stop();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 5: Reconnection Backoff Algorithm with Jitter Bounds
  // --------------------------------------------------------------------------
  describe('5. Reconnection Backoff Algorithm with Jitter Bounds', () => {
    it('guarantees delay is strictly bounded within [base * 1.5^n, base * 1.5^n + jitter]', () => {
      const options = { baseDelayMs: 800, factor: 1.5, maxDelayMs: 10000, jitterMs: 400 };

      // Verification across attempts 0 through 6
      const expectedBases = [
        800,           // 800 * 1.5^0
        1200,          // 800 * 1.5^1
        1800,          // 800 * 1.5^2
        2700,          // 800 * 1.5^3
        4050,          // 800 * 1.5^4
        6075,          // 800 * 1.5^5
        9113,          // 800 * 1.5^6 (rounded)
      ];

      for (let attempt = 0; attempt <= 6; attempt++) {
        const minVal = computeReconnectBackoff(attempt, options, () => 0.0);
        const midVal = computeReconnectBackoff(attempt, options, () => 0.5);
        const maxVal = computeReconnectBackoff(attempt, options, () => 1.0);

        expect(minVal).toBe(expectedBases[attempt]);
        expect(midVal).toBe(Math.min(10000, expectedBases[attempt] + 200));
        expect(maxVal).toBe(Math.min(10000, expectedBases[attempt] + 400));
      }
    });

    it('strictly clamps delays at maxDelayMs regardless of attempt magnitude (anti-overflow)', () => {
      const options = { baseDelayMs: 800, factor: 1.5, maxDelayMs: 10000, jitterMs: 400 };

      const largeAttempts = [7, 8, 9, 10, 25, 50, 100, 1000];
      for (const attempt of largeAttempts) {
        const delay = computeReconnectBackoff(attempt, options, () => 1.0);
        expect(delay).toBeLessThanOrEqual(10000);
        expect(delay).toBe(10000);
        expect(Number.isFinite(delay)).toBe(true);
      }
    });

    it('demonstrates non-zero variance over randomized trials (preventing thundering herd)', () => {
      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        delays.push(computeReconnectBackoff(2)); // attempt 2: base 1800ms
      }

      const min = Math.min(...delays);
      const max = Math.max(...delays);
      expect(min).toBeGreaterThanOrEqual(1800);
      expect(max).toBeLessThanOrEqual(2200);

      // Verify spread: not all delays are identical
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(10);
    });

    it('gracefully handles edge cases: negative attempts, NaN, and non-integers', () => {
      // Negative attempt clamped to attempt 0 (800ms base)
      expect(computeReconnectBackoff(-1, undefined, () => 0)).toBe(800);
      expect(computeReconnectBackoff(-100, undefined, () => 0)).toBe(800);

      // Non-integer attempt floored
      expect(computeReconnectBackoff(1.9, undefined, () => 0)).toBe(1200);

      // NaN or Infinity handled as attempt 0 / max
      expect(computeReconnectBackoff(NaN, undefined, () => 0)).toBe(800);
      expect(computeReconnectBackoff(Infinity, undefined, () => 0)).toBe(10000);
    });

    it('calculateBackoffWithJitter alias produces identical bounded output', () => {
      const backoff = calculateBackoffWithJitter(0, 800, 10000, 400, () => 0);
      expect(backoff).toBe(800);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 6: Ping/Pong Heartbeat, Zombie Socket Reaper & Safe Broadcast
  // --------------------------------------------------------------------------
  describe('6. Ping/Pong Heartbeat & Zombie Reaper', () => {
    it('maintains active connections that respond with pong to server pings', async () => {
      // Fast heartbeat: 30ms
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 30 });
      const { port } = await suite.start();

      try {
        const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((r) => client.once('open', () => r()));

        // ws client automatically replies with pong to ping frames by RFC 6455
        // Wait across 4 heartbeat ticks (130ms)
        await new Promise((r) => setTimeout(r, 130));

        expect(client.readyState).toBe(WebSocket.OPEN);
        expect(suite.wss.clients.size).toBe(1);

        client.close();
      } finally {
        await suite.stop();
      }
    });

    it('detects zombie half-open connections and terminates them on timeout', async () => {
      // Fast heartbeat: 30ms
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 30 });
      const { port } = await suite.start();

      try {
        const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((r) => client.once('open', () => r()));

        // Simulate zombie socket by intercepting and suppressing pong frames
        (client as any).pong = () => {};

        // Wait for 3 heartbeat cycles (100ms)
        await new Promise((r) => setTimeout(r, 110));

        // Socket should be terminated by server reaper
        expect(suite.wss.clients.size).toBe(0);
      } finally {
        await suite.stop();
      }
    });

    it('answers application-level PING frames with PONG envelopes', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((r) => client.once('open', () => r()));

        const pongReceived = new Promise<any>((resolve) => {
          client.once('message', (raw) => resolve(JSON.parse(raw.toString())));
        });

        client.send(JSON.stringify({ type: 'PING' }));

        const pong = await pongReceived;
        expect(pong.type).toBe('PONG');
        expect(pong.senderId).toBe('server');

        client.close();
      } finally {
        await suite.stop();
      }
    });

    it('ensures broadcast loop does not crash if a client socket drops mid-broadcast', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        const healthyClient1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const doomedClient = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const healthyClient2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);

        await Promise.all([
          new Promise<void>((r) => healthyClient1.once('open', () => r())),
          new Promise<void>((r) => doomedClient.once('open', () => r())),
          new Promise<void>((r) => healthyClient2.once('open', () => r())),
        ]);

        const healthy2Received = new Promise<any>((resolve) => {
          healthyClient2.once('message', (data) => resolve(JSON.parse(data.toString())));
        });

        // Abruptly terminate doomedClient's underlying socket so write will fail
        (doomedClient as any)._socket?.destroy();

        // healthyClient1 broadcasts a message
        healthyClient1.send(JSON.stringify({
          type: 'STATE_PATCH',
          senderId: 'h1',
          payload: { activeLogMAR: 0.4 },
        }));

        const result = await healthy2Received;
        expect(result.type).toBe('STATE_SYNC');
        expect(result.payload.activeLogMAR).toBe(0.4);

        healthyClient1.close();
        healthyClient2.close();
      } finally {
        await suite.stop();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 7: QR Code In-Memory Caching & Network Telemetry
  // --------------------------------------------------------------------------
  describe('7. QR Code In-Memory Caching & Network Telemetry', () => {
    it('serves /api/network-info with QR code and caches QR data URL in memory', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        clearQrCache();

        // 1. First fetch: generates and caches QR code
        const start1 = performance.now();
        const res1 = await fetch(`http://127.0.0.1:${port}/api/network-info`);
        const elapsed1 = performance.now() - start1;
        expect(res1.ok).toBe(true);
        const data1 = await res1.json();
        expect(data1.doctorUrl).toContain(`:${port}/#/doctor`);
        expect(data1.qrDataUrl).toMatch(/^data:image\/png;base64,/);

        // 2. Second fetch: served from in-memory cache
        const start2 = performance.now();
        const res2 = await fetch(`http://127.0.0.1:${port}/api/network-info`);
        const elapsed2 = performance.now() - start2;
        expect(res2.ok).toBe(true);
        const data2 = await res2.json();
        expect(data2.qrDataUrl).toBe(data1.qrDataUrl);

        // Cache hit directly via getCachedQrDataUrl
        const directCached = await getCachedQrDataUrl(data1.doctorUrl);
        expect(directCached).toBe(data1.qrDataUrl);

        // 3. Clear cache
        clearQrCache();
      } finally {
        await suite.stop();
      }
    });
  });
});
