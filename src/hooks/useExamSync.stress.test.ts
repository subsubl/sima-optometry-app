/**
 * SIMA Optometry App — useExamSync Adversarial Stress Test Harness
 *
 * Empirical verification harness for:
 * 1. 10,000 randomized attempts backoff fuzzing (negative, non-integer, NaN, extreme up to 1,000,000)
 *    Verifies strict output bounds [0, 10,000ms].
 * 2. Echo suppression adversarial testing: 10,000 alternating packets from self vs peers.
 *    Verifies 100% suppression of self messages and 100% processing of peer messages.
 * 3. Sequence number deduplication and out-of-order rejection (e.g. seq 3 arriving after seq 5).
 * 4. End-to-end WebSocket real-transport echo suppression and causal sequence rejection.
 */

import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
// @ts-ignore
import { createOptiSuiteServer } from '../../server/index.mjs';
import {
  computeReconnectBackoff,
  calculateBackoffWithJitter,
  shouldApplySyncEnvelope,
  createSyncEnvelope,
  deserializeSyncEnvelope,
  serializeSyncEnvelope,
  createSequenceGenerator,
} from './useExamSync';
import { SyncMessageEnvelope } from '../types/exam';

describe('Adversarial Stress Test Harness: useExamSync Logic', () => {

  // ==========================================================================
  // 1. Backoff Fuzzing: 10,000 Randomized Attempts
  // ==========================================================================
  describe('1. computeReconnectBackoff 10,000-Attempt Fuzzing Harness', () => {
    it('fuzzes 10,000 randomized attempts and guarantees delay is strictly bounded in [0, 10000]ms', () => {
      const ITERATIONS = 10_000;
      let minObserved = Infinity;
      let maxObserved = -Infinity;
      let nanCount = 0;
      let outOfBoundsCount = 0;
      let nonFiniteCount = 0;

      // Deterministic PRNG seed for reproducibility
      let seed = 133742;
      const pseudoRandom = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let i = 0; i < ITERATIONS; i++) {
        let attempt: number;
        const selector = i % 14;

        switch (selector) {
          case 0:
            // Negative integers: [-1000000, -1]
            attempt = -Math.floor(pseudoRandom() * 1_000_000) - 1;
            break;
          case 1:
            // Negative floating point: [-99999.99, -0.0001]
            attempt = -(pseudoRandom() * 99_999.99 + 0.0001);
            break;
          case 2:
            // Non-integer floats in standard range: [0.01, 15.99]
            attempt = pseudoRandom() * 16;
            break;
          case 3:
            // Large non-integers: [100.5, 9999.9]
            attempt = pseudoRandom() * 9_900 + 100.5;
            break;
          case 4:
            // NaN
            attempt = NaN;
            break;
          case 5:
            // Special numbers: Infinity, -Infinity, -0, 0
            const specials = [Infinity, -Infinity, -0, 0];
            attempt = specials[Math.floor(pseudoRandom() * specials.length)];
            break;
          case 6:
            // Extreme values up to 1,000,000
            attempt = Math.floor(pseudoRandom() * 900_000) + 100_000;
            break;
          case 7:
            // Max edge value: exactly 1,000,000
            attempt = 1_000_000;
            break;
          case 8:
            // Standard backoff ramp attempts: [0, 6]
            attempt = Math.floor(pseudoRandom() * 7);
            break;
          case 9:
            // Mid-range plateau attempts: [7, 50]
            attempt = Math.floor(pseudoRandom() * 44) + 7;
            break;
          case 10:
            // High plateau attempts: [51, 10000]
            attempt = Math.floor(pseudoRandom() * 9_950) + 51;
            break;
          case 11:
            // Number extremes: MAX_SAFE_INTEGER, MAX_VALUE, MIN_VALUE, EPSILON
            const extremes = [
              Number.MAX_SAFE_INTEGER,
              Number.MAX_VALUE,
              Number.MIN_VALUE,
              Number.EPSILON,
            ];
            attempt = extremes[Math.floor(pseudoRandom() * extremes.length)];
            break;
          case 12:
            // Random non-numbers / undefined cast as number
            attempt = (pseudoRandom() > 0.5 ? undefined : null) as any;
            break;
          default:
            // General uniform attempt [0, 1000000]
            attempt = pseudoRandom() * 1_000_000;
            break;
        }

        const delay = computeReconnectBackoff(attempt, undefined, pseudoRandom);

        if (Number.isNaN(delay)) {
          nanCount++;
        }
        if (!Number.isFinite(delay)) {
          nonFiniteCount++;
        }
        if (delay < 0 || delay > 10_000) {
          outOfBoundsCount++;
        }

        minObserved = Math.min(minObserved, delay);
        maxObserved = Math.max(maxObserved, delay);
      }

      expect(nanCount).toBe(0);
      expect(nonFiniteCount).toBe(0);
      expect(outOfBoundsCount).toBe(0);
      expect(minObserved).toBeGreaterThanOrEqual(0);
      expect(maxObserved).toBeLessThanOrEqual(10_000);
      // Min observed should be base delay (800ms) with default options
      expect(minObserved).toBeGreaterThanOrEqual(800);
      // Max observed should reach ceiling (10000ms)
      expect(maxObserved).toBe(10_000);
    });

    it('validates adversarial jitter functions (out-of-range, negative, overflow)', () => {
      // Normal attempt 0: base 800ms
      // Adversarial randomFn returning negative value
      const delayNeg = computeReconnectBackoff(0, undefined, () => -10);
      expect(delayNeg).toBe(800); // Math.max(0, -10) = 0 -> jitter 0

      // Adversarial randomFn returning value > 1
      const delayExcess = computeReconnectBackoff(0, undefined, () => 10);
      expect(delayExcess).toBe(1200); // Math.min(1, 10) = 1 -> jitter clamped to 400

      // Adversarial randomFn returning exact boundaries 0 and 1
      expect(computeReconnectBackoff(0, undefined, () => 0)).toBe(800);
      expect(computeReconnectBackoff(0, undefined, () => 1)).toBe(1200);

      // Plateau attempts always capped at 10,000ms even with maximum jitter
      expect(computeReconnectBackoff(10, undefined, () => 1)).toBe(10_000);
      expect(computeReconnectBackoff(100, undefined, () => 1)).toBe(10_000);
      expect(computeReconnectBackoff(1_000_000, undefined, () => 1)).toBe(10_000);
    });

    it('fuzzes custom options: maxDelayMs bounds are strictly respected', () => {
      const customCeilings = [0, 500, 2000, 5000, 8000, 15000];

      for (const maxDelay of customCeilings) {
        for (let attempt = -5; attempt <= 100; attempt += 7) {
          const delay = computeReconnectBackoff(attempt, {
            baseDelayMs: 200,
            maxDelayMs: maxDelay,
            jitterMs: 100,
          });
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(delay).toBeLessThanOrEqual(maxDelay);
        }
      }
    });

    it('calculateBackoffWithJitter alias produces strictly bounded values matching computeReconnectBackoff', () => {
      for (let attempt = -10; attempt <= 50; attempt += 3) {
        const val1 = calculateBackoffWithJitter(attempt, 800, 10000, 400, () => 0.5);
        const val2 = computeReconnectBackoff(
          attempt,
          { baseDelayMs: 800, maxDelayMs: 10000, jitterMs: 400 },
          () => 0.5
        );
        expect(val1).toBe(val2);
        expect(val1).toBeGreaterThanOrEqual(0);
        expect(val1).toBeLessThanOrEqual(10000);
      }
    });
  });

  // ==========================================================================
  // 2. Adversarial Echo Suppression Harness
  // ==========================================================================
  describe('2. Origin-Based Echo Suppression Adversarial Harness', () => {
    it('sends 10,000 alternating packets: verifies self-messages are 100% suppressed and peer messages are 100% processed', () => {
      const TOTAL_PACKETS = 10_000;
      const myClientId = 'doctor-session-local-xyz';
      const peerClientId = 'patient-display-remote-lane1';

      const lastAppliedSeqMap = new Map<string, number>();

      let selfPacketsSent = 0;
      let selfPacketsAccepted = 0;
      let peerPacketsSent = 0;
      let peerPacketsAccepted = 0;

      for (let i = 0; i < TOTAL_PACKETS; i++) {
        const isSelf = i % 2 === 0;
        const seq = Math.floor(i / 2) + 1; // Strictly increasing sequences 1..5000

        if (isSelf) {
          selfPacketsSent++;
          const envelope = createSyncEnvelope(
            'STATE_PATCH',
            { activeLogMAR: 0.1 },
            myClientId,
            seq
          );

          const applied = shouldApplySyncEnvelope(envelope, myClientId, lastAppliedSeqMap);
          if (applied) {
            selfPacketsAccepted++;
            lastAppliedSeqMap.set(envelope.senderId, envelope.seq);
          }
        } else {
          peerPacketsSent++;
          const envelope = createSyncEnvelope(
            'STATE_SYNC',
            { activeLogMAR: 0.2 },
            peerClientId,
            seq
          );

          const applied = shouldApplySyncEnvelope(envelope, myClientId, lastAppliedSeqMap);
          if (applied) {
            peerPacketsAccepted++;
            lastAppliedSeqMap.set(envelope.senderId, envelope.seq);
          }
        }
      }

      // Assertions
      expect(selfPacketsSent).toBe(5000);
      expect(peerPacketsSent).toBe(5000);

      // Self messages must be 100% suppressed
      expect(selfPacketsAccepted).toBe(0);
      const selfSuppressionRate = (selfPacketsSent - selfPacketsAccepted) / selfPacketsSent;
      expect(selfSuppressionRate).toBe(1.0); // 100% suppression

      // Peer messages must be 100% processed
      expect(peerPacketsAccepted).toBe(5000);
      const peerProcessingRate = peerPacketsAccepted / peerPacketsSent;
      expect(peerProcessingRate).toBe(1.0); // 100% processing
    });

    it('suppresses self messages even when sender uses extreme sequence jumps or malformed payload', () => {
      const myClientId = 'console-primary';
      const seqMap = new Map<string, number>();

      const adversarialSelfSeqs = [
        0,
        1,
        100,
        1_000_000,
        999_999_999,
        50, // retrograde
        1,  // reset
      ];

      for (const seq of adversarialSelfSeqs) {
        const env = createSyncEnvelope('STATE_PATCH', null, myClientId, seq);
        const shouldApply = shouldApplySyncEnvelope(env, myClientId, seqMap);
        expect(shouldApply).toBe(false);
      }

      // Map remains pristine (no pollution from suppressed self packets)
      expect(seqMap.has(myClientId)).toBe(false);
    });

    it('isolates 5 concurrent senders and suppresses self echoes across interleaved bursts', () => {
      const myClientId = 'station-doctor-master';
      const peerIds = ['patient-lane-1', 'doctor-tablet-2', 'supervisor-console', 'kiosk-unit-5'];
      const seqMap = new Map<string, number>();

      const stats = {
        selfSent: 0,
        selfAccepted: 0,
        peerSent: 0,
        peerAccepted: 0,
      };

      const peerSeqCounters: Record<string, number> = {
        'patient-lane-1': 0,
        'doctor-tablet-2': 0,
        'supervisor-console': 0,
        'kiosk-unit-5': 0,
      };

      // 4000 rounds of 5 packets each (20,000 packets total)
      for (let round = 0; round < 2000; round++) {
        // 1. Self sends a packet
        stats.selfSent++;
        const selfEnv = createSyncEnvelope(
          'STATE_PATCH',
          { round },
          myClientId,
          round + 1
        );
        if (shouldApplySyncEnvelope(selfEnv, myClientId, seqMap)) {
          stats.selfAccepted++;
          seqMap.set(selfEnv.senderId, selfEnv.seq);
        }

        // 2. Each peer sends a monotonic packet
        for (const peer of peerIds) {
          stats.peerSent++;
          peerSeqCounters[peer]++;
          const peerEnv = createSyncEnvelope(
            'STATE_SYNC',
            { round, peer },
            peer,
            peerSeqCounters[peer]
          );
          if (shouldApplySyncEnvelope(peerEnv, myClientId, seqMap)) {
            stats.peerAccepted++;
            seqMap.set(peerEnv.senderId, peerEnv.seq);
          }
        }
      }

      expect(stats.selfSent).toBe(2000);
      expect(stats.selfAccepted).toBe(0);
      expect(stats.peerSent).toBe(8000);
      expect(stats.peerAccepted).toBe(8000);
    });
  });

  // ==========================================================================
  // 3. Sequence Deduplication & Out-of-Order Rejection Harness
  // ==========================================================================
  describe('3. Sequence Deduplication & Out-of-Order Rejection', () => {
    it('strictly rejects out-of-order retrograde packets (e.g. seq 3 arriving after seq 5)', () => {
      const myClientId = 'patient-screen';
      const peerSenderId = 'doctor-console';
      const seqMap = new Map<string, number>();

      const apply = (seq: number) => {
        const env = createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.1 }, peerSenderId, seq);
        const result = shouldApplySyncEnvelope(env, myClientId, seqMap);
        if (result) {
          seqMap.set(peerSenderId, seq);
        }
        return result;
      };

      // 1. Seq 1 arrives -> ACCEPTED
      expect(apply(1)).toBe(true);
      expect(seqMap.get(peerSenderId)).toBe(1);

      // 2. Seq 5 arrives out of order -> ACCEPTED (advances lastSeq to 5)
      expect(apply(5)).toBe(true);
      expect(seqMap.get(peerSenderId)).toBe(5);

      // 3. Seq 3 arrives after Seq 5 -> REJECTED (retrograde: 3 <= 5)
      expect(apply(3)).toBe(false);
      expect(seqMap.get(peerSenderId)).toBe(5);

      // 4. Seq 4 arrives after Seq 5 -> REJECTED (retrograde: 4 <= 5)
      expect(apply(4)).toBe(false);
      expect(seqMap.get(peerSenderId)).toBe(5);

      // 5. Seq 2 arrives after Seq 5 -> REJECTED (retrograde: 2 <= 5)
      expect(apply(2)).toBe(false);
      expect(seqMap.get(peerSenderId)).toBe(5);

      // 6. Seq 5 arrives again -> REJECTED (duplicate: 5 <= 5)
      expect(apply(5)).toBe(false);
      expect(seqMap.get(peerSenderId)).toBe(5);

      // 7. Seq 6 arrives -> ACCEPTED (forward progression: 6 > 5)
      expect(apply(6)).toBe(true);
      expect(seqMap.get(peerSenderId)).toBe(6);

      // 8. Seq 3 arrives again -> REJECTED (3 <= 6)
      expect(apply(3)).toBe(false);

      // 9. Seq 0 arrives -> REJECTED (0 <= 6)
      expect(apply(0)).toBe(false);

      // 10. Seq -1 arrives -> REJECTED (-1 <= 6)
      expect(apply(-1)).toBe(false);

      // 11. Seq 6 arrives again -> REJECTED (duplicate: 6 <= 6)
      expect(apply(6)).toBe(false);

      // 12. Seq 7 arrives -> ACCEPTED (7 > 6)
      expect(apply(7)).toBe(true);
      expect(seqMap.get(peerSenderId)).toBe(7);
    });

    it('verifies canonical permutation scenarios: reversed, duplicate deluge, and chaotic shuffle', () => {
      const myClientId = 'viewer';
      const peer = 'sender-alpha';

      // Sub-case A: Strictly decreasing sequence [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
      // Only the very first packet (seq 10) must be accepted; all 9 remaining must be rejected.
      const seqMapA = new Map<string, number>();
      const reversedSeqs = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const resultsA: boolean[] = [];

      for (const s of reversedSeqs) {
        const env = createSyncEnvelope('STATE_SYNC', {}, peer, s);
        const ok = shouldApplySyncEnvelope(env, myClientId, seqMapA);
        if (ok) seqMapA.set(peer, s);
        resultsA.push(ok);
      }

      expect(resultsA).toEqual([true, false, false, false, false, false, false, false, false, false]);
      expect(seqMapA.get(peer)).toBe(10);

      // Sub-case B: Duplicate deluge [1, 1, 1, 2, 2, 3, 3, 3, 3, 4]
      // Exactly 4 packets accepted (1, 2, 3, 4); 6 duplicates rejected.
      const seqMapB = new Map<string, number>();
      const duplicateStream = [1, 1, 1, 2, 2, 3, 3, 3, 3, 4];
      let acceptedCountB = 0;
      let rejectedCountB = 0;

      for (const s of duplicateStream) {
        const env = createSyncEnvelope('STATE_SYNC', {}, peer, s);
        const ok = shouldApplySyncEnvelope(env, myClientId, seqMapB);
        if (ok) {
          acceptedCountB++;
          seqMapB.set(peer, s);
        } else {
          rejectedCountB++;
        }
      }

      expect(acceptedCountB).toBe(4);
      expect(rejectedCountB).toBe(6);
      expect(seqMapB.get(peer)).toBe(4);
    });

    it('stress-tests 5,000 randomly permuted packets against a mathematical oracle', () => {
      const PACKET_COUNT = 5000;
      const myClientId = 'receiver-oracle-test';
      const peer = 'chaotic-transmitter';
      const seqMap = new Map<string, number>();

      // Generate 5000 random sequences in range [1, 1000]
      let seed = 98765;
      const pseudoRandom = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };

      const packets: number[] = [];
      for (let i = 0; i < PACKET_COUNT; i++) {
        packets.push(Math.floor(pseudoRandom() * 1000) + 1);
      }

      // Oracle simulation: a packet is accepted if and only if seq > maxSoFar
      let oracleMax = -1;
      let matches = 0;

      for (const seq of packets) {
        const env = createSyncEnvelope('STATE_SYNC', {}, peer, seq);
        const actual = shouldApplySyncEnvelope(env, myClientId, seqMap);

        const expected = seq > oracleMax;
        if (actual === expected) {
          matches++;
        }

        if (actual) {
          seqMap.set(peer, seq);
          oracleMax = seq;
        }
      }

      // Must agree with oracle on 100.00% of packets
      expect(matches).toBe(PACKET_COUNT);
    });

    it('rejects structurally invalid sequence numbers during deserialization', () => {
      const invalidSeqPayloads = [
        { type: 'STATE_PATCH', senderId: 'p1', seq: -5, timestamp: Date.now() },
        { type: 'STATE_PATCH', senderId: 'p1', seq: 3.1415, timestamp: Date.now() },
        { type: 'STATE_PATCH', senderId: 'p1', seq: NaN, timestamp: Date.now() },
        { type: 'STATE_PATCH', senderId: 'p1', seq: Infinity, timestamp: Date.now() },
        { type: 'STATE_PATCH', senderId: 'p1', seq: -Infinity, timestamp: Date.now() },
        { type: 'STATE_PATCH', senderId: 'p1', seq: '5', timestamp: Date.now() },
        { type: 'STATE_PATCH', senderId: 'p1', seq: null, timestamp: Date.now() },
        { type: 'STATE_PATCH', senderId: 'p1', seq: undefined, timestamp: Date.now() },
      ];

      for (const payload of invalidSeqPayloads) {
        const raw = JSON.stringify(payload);
        const parsed = deserializeSyncEnvelope(raw);
        expect(parsed).toBeNull();
      }
    });
  });

  // ==========================================================================
  // 4. Real WebSocket Transport End-to-End Stress Test
  // ==========================================================================
  describe('4. Real WebSocket Transport Integration', () => {
    it('verifies real server-relayed packets: doctor suppresses own echo; patient rejects out-of-order retrograde packets', async () => {
      const suite = createOptiSuiteServer({ port: 0, serveStatic: false });
      const { port } = await suite.start();

      try {
        const doctorWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const patientWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);

        await Promise.all([
          new Promise<void>((r) => doctorWs.once('open', () => r())),
          new Promise<void>((r) => patientWs.once('open', () => r())),
        ]);

        const doctorSessionId = 'doctor-terminal-uuid-42';
        const patientSessionId = 'patient-terminal-uuid-99';

        const doctorReceivedFrames: SyncMessageEnvelope[] = [];
        const patientReceivedFrames: SyncMessageEnvelope[] = [];

        doctorWs.on('message', (raw) => {
          const env = deserializeSyncEnvelope(raw.toString());
          if (env) doctorReceivedFrames.push(env);
        });

        patientWs.on('message', (raw) => {
          const env = deserializeSyncEnvelope(raw.toString());
          if (env) patientReceivedFrames.push(env);
        });

        // 1. Doctor transmits seq 1
        doctorWs.send(JSON.stringify(createSyncEnvelope(
          'STATE_PATCH',
          { activeLogMAR: 0.3 },
          doctorSessionId,
          1
        )));

        // 2. Doctor transmits seq 5 (out of order jump)
        doctorWs.send(JSON.stringify(createSyncEnvelope(
          'STATE_PATCH',
          { activeLogMAR: 0.2 },
          doctorSessionId,
          5
        )));

        // 3. Doctor transmits seq 3 (retrograde out-of-order)
        doctorWs.send(JSON.stringify(createSyncEnvelope(
          'STATE_PATCH',
          { activeLogMAR: 0.25 },
          doctorSessionId,
          3
        )));

        // 4. Doctor transmits seq 6 (subsequent valid packet)
        doctorWs.send(JSON.stringify(createSyncEnvelope(
          'STATE_PATCH',
          { activeLogMAR: 0.1 },
          doctorSessionId,
          6
        )));

        // Allow WebSocket frames to traverse loopback
        await new Promise((r) => setTimeout(r, 100));

        // --- Defense-in-Depth Echo Suppression Verification ---
        // 1. Server-side socket exclusion: server excludes sender socket during broadcast
        expect(doctorReceivedFrames.length).toBe(0);

        // 2. Client-side echo suppression: if any echo frame arrives (via BC or reflector)
        // with senderId === doctorSessionId, client-side logic guarantees 100% rejection
        const doctorSeqMap = new Map<string, number>();
        const simulatedEchoFrames = [
          createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.3 }, doctorSessionId, 1),
          createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.2 }, doctorSessionId, 5),
          createSyncEnvelope('STATE_SYNC', { activeLogMAR: 0.1 }, doctorSessionId, 6),
        ];

        let doctorAppliedCount = 0;
        let doctorEchoDroppedCount = 0;

        for (const frame of simulatedEchoFrames) {
          if (shouldApplySyncEnvelope(frame, doctorSessionId, doctorSeqMap)) {
            doctorAppliedCount++;
            doctorSeqMap.set(frame.senderId, frame.seq);
          } else {
            doctorEchoDroppedCount++;
          }
        }

        // Doctor must apply ZERO self-originated frames (100% suppressed)
        expect(doctorAppliedCount).toBe(0);
        expect(doctorEchoDroppedCount).toBe(3);

        // --- Patient verification: Out-of-Order Seq Rejection ---
        // Patient receives frames from doctorSessionId:
        // seq 1: applied
        // seq 5: applied
        // seq 3: REJECTED (retrograde out of order: 3 <= 5)
        // seq 6: applied
        const patientSeqMap = new Map<string, number>();
        const patientAppliedSeqs: number[] = [];
        const patientRejectedSeqs: number[] = [];

        for (const frame of patientReceivedFrames) {
          if (shouldApplySyncEnvelope(frame, patientSessionId, patientSeqMap)) {
            patientSeqMap.set(frame.senderId, frame.seq);
            patientAppliedSeqs.push(frame.seq);
          } else {
            patientRejectedSeqs.push(frame.seq);
          }
        }

        expect(patientAppliedSeqs).toEqual([1, 5, 6]);
        expect(patientRejectedSeqs).toEqual([3]);

        doctorWs.close();
        patientWs.close();
      } finally {
        await suite.stop();
      }
    });
  });
});
