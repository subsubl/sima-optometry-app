/**
 * SIMA Optometry App — Challenger M2 Independent Verification Test Suite
 *
 * Adversarially challenges server/index.mjs against:
 * 1. Cold-start calibration loss: client A CALIBRATION_INIT -> cold server -> client B connect receive exact state
 * 2. Prototype pollution immunity against sanitizeServerExamState and live WebSocket transport
 * 3. Invalid types, non-objects, and schema boundary violations
 * 4. Out-of-range diopters, axes, and optical safety constraints
 * 5. Zombie socket reaping: unresponsive client terminated within 250ms under 100ms heartbeat
 */

import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
// @ts-ignore
import { createOptiSuiteServer, sanitizeServerExamState, DEFAULT_SERVER_EXAM_STATE, DEFAULT_SERVER_CALIBRATION, DEFAULT_SERVER_REFRACTION } from '../../server/index.mjs';

describe('Challenger M2 Independent Adversarial Verification Suite', () => {

  // --------------------------------------------------------------------------
  // Suite 1: Cold-Start Calibration Loss Verification
  // --------------------------------------------------------------------------
  describe('Cold-Start Calibration Loss & Broadcast', () => {
    it('preserves calibrated state sent by Client A on cold start and delivers it immediately to late-joining Client B', async () => {
      const server = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 100 });
      const { port } = await server.start();

      try {
        expect(server.getExamState()).toBeNull();

        const clientA = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((r) => clientA.once('open', () => r()));

        const calibratedPayload = {
          referenceBarPixels: 512.75,
          measuredBarMm: 92.5,
          isMirroredRoom: true,
          directDistanceMeters: 4.8,
          patientToMirrorMeters: 2.4,
          mirrorToScreenMeters: 2.4,
          distanceUnit: 'meters',
        };

        clientA.send(JSON.stringify({
          type: 'CALIBRATION_INIT',
          senderId: 'patient-display-cold',
          payload: calibratedPayload,
        }));

        await new Promise((r) => setTimeout(r, 50));

        const stateOnServer = server.getExamState();
        expect(stateOnServer).not.toBeNull();
        expect(stateOnServer.calibration.referenceBarPixels).toBe(512.75);
        expect(stateOnServer.calibration.measuredBarMm).toBe(92.5);
        expect(stateOnServer.calibration.isMirroredRoom).toBe(true);
        expect(stateOnServer.calibration.directDistanceMeters).toBe(4.8);

        // Connect Client B (e.g. Doctor console)
        const clientB = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const clientBReceived = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timed out waiting for STATE_SYNC on connect')), 2000);
          clientB.once('message', (raw) => {
            clearTimeout(timeout);
            resolve(JSON.parse(raw.toString()));
          });
        });

        const syncMsg = await clientBReceived;
        expect(syncMsg.type).toBe('STATE_SYNC');
        expect(syncMsg.senderId).toBe('server');
        expect(syncMsg.payload.calibration.referenceBarPixels).toBe(512.75);
        expect(syncMsg.payload.calibration.measuredBarMm).toBe(92.5);
        expect(syncMsg.payload.calibration.isMirroredRoom).toBe(true);
        expect(syncMsg.payload.calibration.directDistanceMeters).toBe(4.8);
        expect(syncMsg.payload.calibration.distanceUnit).toBe('meters');

        clientA.close();
        clientB.close();
      } finally {
        await server.stop();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Prototype Pollution Attacks
  // --------------------------------------------------------------------------
  describe('Adversarial Prototype Pollution Attacks', () => {
    it('defends against root __proto__ payloads', () => {
      const p1 = JSON.parse('{"__proto__": {"pollutedRoot": true}}');
      const res = sanitizeServerExamState(p1);
      expect((({} as any)).pollutedRoot).toBeUndefined();
      expect((res as any).pollutedRoot).toBeUndefined();
    });

    it('defends against constructor.prototype payloads', () => {
      const p2 = JSON.parse('{"constructor": {"prototype": {"pollutedCtor": true}}}');
      const res = sanitizeServerExamState(p2);
      expect((({} as any)).pollutedCtor).toBeUndefined();
      expect((res as any).pollutedCtor).toBeUndefined();
    });

    it('defends against nested __proto__ inside refraction and calibration', () => {
      const p3 = JSON.parse(
        '{"refraction": {"__proto__": {"pollutedNested": true}, "od": {"__proto__": {"pollutedOD": true}, "sphere": -2.5}}, "calibration": {"__proto__": {"pollutedCal": true}}}'
      );
      const res = sanitizeServerExamState(p3);
      expect((({} as any)).pollutedNested).toBeUndefined();
      expect((({} as any)).pollutedOD).toBeUndefined();
      expect((({} as any)).pollutedCal).toBeUndefined();
      expect(res.refraction.od.sphere).toBe(-2.5);
    });

    it('defends against live WebSocket prototype pollution attacks across connected clients', async () => {
      const server = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 100 });
      const { port } = await server.start();

      try {
        const attacker = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const victim = new WebSocket(`ws://127.0.0.1:${port}/ws`);

        await Promise.all([
          new Promise<void>((r) => attacker.once('open', () => r())),
          new Promise<void>((r) => victim.once('open', () => r())),
        ]);

        const victimMsgPromise = new Promise<any>((resolve) => {
          victim.once('message', (raw) => resolve(JSON.parse(raw.toString())));
        });

        attacker.send(
          JSON.stringify({
            type: 'STATE_PATCH',
            senderId: 'attacker-client',
            payload: JSON.parse(
              '{"__proto__": {"hackedLive": true}, "constructor": {"prototype": {"rootLive": true}}, "activeLogMAR": 0.4}'
            ),
          })
        );

        const received = await victimMsgPromise;
        expect((({} as any)).hackedLive).toBeUndefined();
        expect((({} as any)).rootLive).toBeUndefined();
        expect(received.payload.activeLogMAR).toBe(0.4);
        expect(received.payload.hackedLive).toBeUndefined();
        expect(received.payload.rootLive).toBeUndefined();

        attacker.close();
        victim.close();
      } finally {
        await server.stop();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Invalid Types and Out-of-Range Diopters
  // --------------------------------------------------------------------------
  describe('Invalid Types & Out-of-Range Diopters', () => {
    it('safely handles non-object and primitive root payloads without throwing', () => {
      expect(sanitizeServerExamState(null)).toEqual(DEFAULT_SERVER_EXAM_STATE);
      expect(sanitizeServerExamState(undefined)).toEqual(DEFAULT_SERVER_EXAM_STATE);
      expect(sanitizeServerExamState(9999)).toEqual(DEFAULT_SERVER_EXAM_STATE);
      expect(sanitizeServerExamState('malicious')).toEqual(DEFAULT_SERVER_EXAM_STATE);
      expect(sanitizeServerExamState(false)).toEqual(DEFAULT_SERVER_EXAM_STATE);
      expect(sanitizeServerExamState([1, 2, 3])).toEqual(DEFAULT_SERVER_EXAM_STATE);
    });

    it('strictly clamps optical diopters, axes, and prism bounds to safe clinical limits', () => {
      const extreme = {
        refraction: {
          od: {
            sphere: 999.0,
            cylinder: -999.0,
            axis: 999,
            pd: 999,
            prism: 999,
            prismBase: 'INVALID',
            add: 999,
            occlusion: 'INVALID',
          },
          os: {
            sphere: -999.0,
            cylinder: 999.0,
            axis: -50,
            pd: -10,
            prism: -50,
            prismBase: 'UP',
            add: -10,
            occlusion: 'PINHOLE',
          },
          binocularPd: 999,
          workingDistanceCm: 999,
        },
      };

      const res = sanitizeServerExamState(extreme);
      // OD bounds
      expect(res.refraction.od.sphere).toBe(25.0);
      expect(res.refraction.od.cylinder).toBe(-15.0);
      expect(res.refraction.od.axis).toBe(180);
      expect(res.refraction.od.pd).toBe(45.0);
      expect(res.refraction.od.prism).toBe(25.0);
      expect(res.refraction.od.prismBase).toBe('IN');
      expect(res.refraction.od.add).toBe(5.0);
      expect(res.refraction.od.occlusion).toBe('OPEN');

      // OS bounds
      expect(res.refraction.os.sphere).toBe(-25.0);
      expect(res.refraction.os.cylinder).toBe(15.0);
      expect(res.refraction.os.axis).toBe(1);
      expect(res.refraction.os.pd).toBe(20.0);
      expect(res.refraction.os.prism).toBe(0.0);
      expect(res.refraction.os.prismBase).toBe('UP');
      expect(res.refraction.os.add).toBe(0.0);
      expect(res.refraction.os.occlusion).toBe('PINHOLE');

      // Binocular bounds
      expect(res.refraction.binocularPd).toBe(85.0);
      expect(res.refraction.workingDistanceCm).toBe(100);
    });

    it('reverts NaN, Infinity, and invalid enum values back to safe defaults', () => {
      const payload = {
        activeCategory: 'NON_EXISTENT',
        optotypeSet: 'HACKED',
        activeLogMAR: NaN,
        isolationMode: 1234,
        activeLetterIndex: -5,
        invertPolarity: 'YES',
        currentLineScores: 'NOT_AN_ARRAY',
        calibration: {
          referenceBarPixels: -100,
          measuredBarMm: NaN,
          directDistanceMeters: 0,
        },
      };

      const res = sanitizeServerExamState(payload);
      expect(res.activeCategory).toBe('va_chart');
      expect(res.optotypeSet).toBe('sloan');
      expect(res.activeLogMAR).toBe(0.0);
      expect(res.isolationMode).toBe('line');
      expect(res.activeLetterIndex).toBe(0);
      expect(res.invertPolarity).toBe(false);
      expect(res.calibration.referenceBarPixels).toBe(DEFAULT_SERVER_CALIBRATION.referenceBarPixels);
      expect(res.calibration.measuredBarMm).toBe(DEFAULT_SERVER_CALIBRATION.measuredBarMm);
      expect(res.calibration.directDistanceMeters).toBe(DEFAULT_SERVER_CALIBRATION.directDistanceMeters);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: Zombie Socket Reaping Under Heartbeat Interval
  // --------------------------------------------------------------------------
  describe('Zombie Socket Reaping Under 100ms Heartbeat', () => {
    it('terminates zombie client ignoring pings within 250ms and evicts it from clients set', async () => {
      const server = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 100 });
      const { port } = await server.start();

      try {
        const zombie = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((r) => zombie.once('open', () => r()));

        // Override pong to completely ignore server pings
        zombie.pong = () => {};

        expect(server.wss.clients.size).toBe(1);

        const connectTime = Date.now();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Zombie was not terminated within 250ms (elapsed: ${Date.now() - connectTime}ms)`));
          }, 250);

          zombie.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        const elapsed = Date.now() - connectTime;
        expect(elapsed).toBeLessThanOrEqual(250);

        // Allow 25ms for server wss.clients to purge closed socket
        await new Promise((r) => setTimeout(r, 25));
        expect(server.wss.clients.size).toBe(0);
      } finally {
        await server.stop();
      }
    });

    it('retains healthy client responding to pings while terminating zombie peer', async () => {
      const server = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 100 });
      const { port } = await server.start();

      try {
        const healthy = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const zombie = new WebSocket(`ws://127.0.0.1:${port}/ws`);

        await Promise.all([
          new Promise<void>((r) => healthy.once('open', () => r())),
          new Promise<void>((r) => zombie.once('open', () => r())),
        ]);

        zombie.pong = () => {};

        expect(server.wss.clients.size).toBe(2);

        const t0 = Date.now();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Zombie was not terminated within 250ms')), 250);
          zombie.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        const elapsed = Date.now() - t0;
        expect(elapsed).toBeLessThanOrEqual(250);

        await new Promise((r) => setTimeout(r, 25));
        expect(server.wss.clients.size).toBe(1);
        expect(healthy.readyState).toBe(WebSocket.OPEN);

        // Verify healthy client survives an additional 300ms
        await new Promise((r) => setTimeout(r, 300));
        expect(healthy.readyState).toBe(WebSocket.OPEN);
        expect(server.wss.clients.size).toBe(1);

        healthy.close();
      } finally {
        await server.stop();
      }
    });
  });
});
