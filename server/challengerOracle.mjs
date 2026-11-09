/**
 * SIMA Optometry App — Challenger M2 Independent Oracle Harness
 *
 * Adversarial stress harness verifying:
 * 1. Cold-start calibration loss resilience
 * 2. Prototype pollution immunity in sanitizeServerExamState and live WebSocket transport
 * 3. Invalid types, non-object payloads, and schema abuse
 * 4. Out-of-range diopters, axes, and clinical optical constraints
 * 5. Zombie socket reaping within 250ms under a 100ms heartbeat interval
 */

import { WebSocket } from 'ws';
import {
  createOptiSuiteServer,
  sanitizeServerExamState,
  DEFAULT_SERVER_EXAM_STATE,
  DEFAULT_SERVER_CALIBRATION,
  DEFAULT_SERVER_REFRACTION,
} from './index.mjs';

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedChecks++;
  console.log(`  ✓ ${message}`);
}

async function runColdStartCalibrationTests() {
  console.log('\n--- [Test 1/4] Cold-Start Calibration Loss & State Broadcast ---');

  const server = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 100 });
  const { port } = await server.start();

  try {
    // Verify cold server state is initially null
    assert(server.getExamState() === null, 'Cold server starts with null exam state');

    // Client A connects first
    const clientA = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((res) => clientA.once('open', res));

    const calibratedState = {
      referenceBarPixels: 512.75,
      measuredBarMm: 92.5,
      isMirroredRoom: true,
      directDistanceMeters: 4.8,
      patientToMirrorMeters: 2.4,
      mirrorToScreenMeters: 2.4,
      distanceUnit: 'meters',
    };

    // Client A sends CALIBRATION_INIT
    clientA.send(
      JSON.stringify({
        type: 'CALIBRATION_INIT',
        senderId: 'patient-display-unit',
        payload: calibratedState,
      })
    );

    // Give server event loop a brief tick to process
    await new Promise((r) => setTimeout(r, 40));

    // Server state must now be initialized with exact calibration
    const serverState = server.getExamState();
    assert(serverState !== null, 'Server exam state initialized after CALIBRATION_INIT');
    assert(
      serverState.calibration.referenceBarPixels === calibratedState.referenceBarPixels,
      'Server stored exact referenceBarPixels'
    );
    assert(
      serverState.calibration.measuredBarMm === calibratedState.measuredBarMm,
      'Server stored exact measuredBarMm'
    );
    assert(
      serverState.calibration.isMirroredRoom === true,
      'Server stored exact isMirroredRoom (true)'
    );
    assert(
      serverState.calibration.directDistanceMeters === calibratedState.directDistanceMeters,
      'Server stored exact directDistanceMeters'
    );

    // Client B connects to server (late joiner / doctor remote console)
    const clientB = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const clientBReceivedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for STATE_SYNC on connect')), 2000);
      clientB.once('message', (raw) => {
        clearTimeout(timeout);
        resolve(JSON.parse(raw.toString()));
      });
    });

    const syncMessage = await clientBReceivedPromise;
    assert(syncMessage.type === 'STATE_SYNC', 'Client B received STATE_SYNC immediately on connect');
    assert(syncMessage.senderId === 'server', 'STATE_SYNC senderId is authoritative "server"');
    assert(
      syncMessage.payload.calibration.referenceBarPixels === calibratedState.referenceBarPixels,
      'Client B received exact referenceBarPixels (no cold-start calibration loss)'
    );
    assert(
      syncMessage.payload.calibration.measuredBarMm === calibratedState.measuredBarMm,
      'Client B received exact measuredBarMm'
    );
    assert(
      syncMessage.payload.calibration.isMirroredRoom === true,
      'Client B received exact isMirroredRoom'
    );
    assert(
      syncMessage.payload.calibration.directDistanceMeters === calibratedState.directDistanceMeters,
      'Client B received exact directDistanceMeters'
    );

    // Client A sends runtime update
    const clientBUpdatePromise = new Promise((resolve) => {
      clientB.once('message', (raw) => resolve(JSON.parse(raw.toString())));
    });

    clientA.send(
      JSON.stringify({
        type: 'CALIBRATION_INIT',
        senderId: 'patient-display-unit',
        payload: { measuredBarMm: 85.6 },
      })
    );

    const broadcastUpdate = await clientBUpdatePromise;
    assert(broadcastUpdate.type === 'STATE_SYNC', 'Client B received broadcast update on runtime calibration change');
    assert(
      broadcastUpdate.payload.calibration.measuredBarMm === 85.6,
      'Client B received updated measuredBarMm (85.6)'
    );
    assert(
      broadcastUpdate.payload.calibration.referenceBarPixels === 512.75,
      'Client B retains referenceBarPixels from prior calibration'
    );

    clientA.close();
    clientB.close();
  } finally {
    await server.stop();
  }
}

async function runPrototypePollutionAttacks() {
  console.log('\n--- [Test 2/4] Adversarial Prototype Pollution Attacks ---');

  // Verify baseline
  const testObj = {};
  assert(testObj.polluted === undefined, 'Baseline: Object.prototype has no "polluted" property');
  assert(testObj.isAdmin === undefined, 'Baseline: Object.prototype has no "isAdmin" property');

  // Attack 1: Direct __proto__ payload via JSON.parse
  const p1 = JSON.parse('{"__proto__": {"polluted": true, "isAdmin": true}}');
  const res1 = sanitizeServerExamState(p1);
  assert(({}).polluted === undefined, 'Attack 1: Object.prototype.polluted remains undefined');
  assert(({}).isAdmin === undefined, 'Attack 1: Object.prototype.isAdmin remains undefined');
  assert(res1.polluted === undefined, 'Attack 1: Result state does not have polluted property');

  // Attack 2: Constructor prototype payload
  const p2 = JSON.parse('{"constructor": {"prototype": {"polluted": true}}}');
  const res2 = sanitizeServerExamState(p2);
  assert(({}).polluted === undefined, 'Attack 2: Object.prototype.polluted remains undefined');
  assert(res2.polluted === undefined, 'Attack 2: Result state does not leak constructor.prototype');

  // Attack 3: Nested __proto__ in refraction and eyes
  const p3 = JSON.parse(
    '{"refraction": {"__proto__": {"polluted": true}, "od": {"__proto__": {"polluted": true}, "sphere": 1.0}}}'
  );
  const res3 = sanitizeServerExamState(p3);
  assert(({}).polluted === undefined, 'Attack 3: Nested refraction __proto__ did not pollute Object.prototype');
  assert(res3.refraction.od.sphere === 1.0, 'Attack 3: Valid field parsed correctly alongside attack');

  // Attack 4: Nested __proto__ in calibration
  const p4 = JSON.parse('{"calibration": {"__proto__": {"polluted": true}, "referenceBarPixels": 400}}');
  const res4 = sanitizeServerExamState(p4);
  assert(({}).polluted === undefined, 'Attack 4: Calibration __proto__ did not pollute Object.prototype');
  assert(res4.calibration.referenceBarPixels === 400, 'Attack 4: Valid calibration field accepted');

  // Attack 5: Nested constructor in wizards
  const p5 = JSON.parse(
    '{"etdrsWizard": {"lineScores": {"constructor": {"prototype": {"polluted": true}}}}, "contrastWizard": {"recordedThresholds": {"__proto__": {"polluted": true}}}}'
  );
  const res5 = sanitizeServerExamState(p5);
  assert(({}).polluted === undefined, 'Attack 5: Wizards lineScores and recordedThresholds did not pollute');

  // Attack 6: Live network attack over WebSocket
  const server = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 100 });
  const { port } = await server.start();

  try {
    const attacker = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const victim = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    await Promise.all([
      new Promise((res) => attacker.once('open', res)),
      new Promise((res) => victim.once('open', res)),
    ]);

    const victimMsgPromise = new Promise((resolve) => {
      victim.once('message', (raw) => resolve(JSON.parse(raw.toString())));
    });

    attacker.send(
      JSON.stringify({
        type: 'STATE_PATCH',
        senderId: 'attacker-client',
        payload: JSON.parse(
          '{"__proto__": {"hacked": true}, "constructor": {"prototype": {"root": true}}, "activeLogMAR": 0.3}'
        ),
      })
    );

    const receivedByVictim = await victimMsgPromise;
    assert(({}).hacked === undefined, 'Attack 6: Server process prototype "hacked" remains undefined');
    assert(({}).root === undefined, 'Attack 6: Server process prototype "root" remains undefined');
    assert(receivedByVictim.payload.activeLogMAR === 0.3, 'Attack 6: Peer received sanitized valid payload');
    assert(receivedByVictim.payload.hacked === undefined, 'Attack 6: Peer payload does not carry "hacked"');
    assert(receivedByVictim.payload.root === undefined, 'Attack 6: Peer payload does not carry "root"');

    attacker.close();
    victim.close();
  } finally {
    await server.stop();
  }
}

async function runInvalidTypesAndDioptersAttacks() {
  console.log('\n--- [Test 3/4] Invalid Types & Out-of-Range Diopters ---');

  // 1. Primitive and Non-object Root inputs
  assert(sanitizeServerExamState(null) === DEFAULT_SERVER_EXAM_STATE, 'null input returns base default');
  assert(sanitizeServerExamState(undefined) === DEFAULT_SERVER_EXAM_STATE, 'undefined input returns base default');
  assert(sanitizeServerExamState(12345) === DEFAULT_SERVER_EXAM_STATE, 'number input returns base default');
  assert(sanitizeServerExamState('string') === DEFAULT_SERVER_EXAM_STATE, 'string input returns base default');
  assert(sanitizeServerExamState(true) === DEFAULT_SERVER_EXAM_STATE, 'boolean input returns base default');
  assert(sanitizeServerExamState([1, 2, 3]) === DEFAULT_SERVER_EXAM_STATE, 'array input returns base default');

  // 2. Out-of-range Diopters & Optical Clamping
  const extremeDiopters = {
    refraction: {
      od: {
        sphere: 999.0, // should clamp to 25.0
        cylinder: -999.0, // should clamp to -15.0
        axis: 999, // should clamp to 180
        pd: 999, // should clamp to 45.0
        prism: 999, // should clamp to 25.0
        prismBase: 'INVALID_BASE', // should fall back to 'IN'
        add: 999, // should clamp to 5.0
        occlusion: 'INVALID_OCCLUSION', // should fall back to 'OPEN'
      },
      os: {
        sphere: -999.0, // should clamp to -25.0
        cylinder: 999.0, // should clamp to 15.0
        axis: -50, // should clamp to 1
        pd: -10, // should clamp to 20.0
        prism: -50, // should clamp to 0.0
        prismBase: 'UP',
        add: -10, // should clamp to 0.0
        occlusion: 'PINHOLE',
      },
      binocularPd: 999, // should clamp to 85.0
      workingDistanceCm: 999, // should clamp to 100
    },
  };

  const clamped = sanitizeServerExamState(extremeDiopters);
  assert(clamped.refraction.od.sphere === 25.0, 'OD sphere clamped at +25.0 max');
  assert(clamped.refraction.od.cylinder === -15.0, 'OD cylinder clamped at -15.0 min');
  assert(clamped.refraction.od.axis === 180, 'OD axis clamped at 180 max');
  assert(clamped.refraction.od.pd === 45.0, 'OD monocular PD clamped at 45.0 mm max');
  assert(clamped.refraction.od.prism === 25.0, 'OD prism clamped at 25.0 diopters max');
  assert(clamped.refraction.od.prismBase === 'IN', 'OD invalid prismBase defaulted to "IN"');
  assert(clamped.refraction.od.add === 5.0, 'OD near add clamped at +5.0 max');
  assert(clamped.refraction.od.occlusion === 'OPEN', 'OD invalid occlusion defaulted to "OPEN"');

  assert(clamped.refraction.os.sphere === -25.0, 'OS sphere clamped at -25.0 min');
  assert(clamped.refraction.os.cylinder === 15.0, 'OS cylinder clamped at +15.0 max');
  assert(clamped.refraction.os.axis === 1, 'OS axis clamped at 1 min');
  assert(clamped.refraction.os.pd === 20.0, 'OS monocular PD clamped at 20.0 mm min');
  assert(clamped.refraction.os.prism === 0.0, 'OS negative prism clamped at 0.0 min');
  assert(clamped.refraction.os.prismBase === 'UP', 'OS valid prismBase "UP" preserved');
  assert(clamped.refraction.os.add === 0.0, 'OS negative add clamped at 0.0 min');
  assert(clamped.refraction.os.occlusion === 'PINHOLE', 'OS valid occlusion "PINHOLE" preserved');

  assert(clamped.refraction.binocularPd === 85.0, 'Binocular PD clamped at 85.0 mm max');
  assert(clamped.refraction.workingDistanceCm === 100, 'Working distance clamped at 100 cm max');

  // 3. Clamping low bounds for binocularPd and workingDistanceCm
  const lowBounds = sanitizeServerExamState({
    refraction: {
      binocularPd: 10,
      workingDistanceCm: 5,
    },
  });
  assert(lowBounds.refraction.binocularPd === 45.0, 'Binocular PD clamped at 45.0 mm min');
  assert(lowBounds.refraction.workingDistanceCm === 20, 'Working distance clamped at 20 cm min');

  // 4. NaN, Infinity, and Invalid Field Types
  const nanPayload = {
    activeCategory: 'NON_EXISTENT_CATEGORY',
    optotypeSet: 'MALICIOUS_SET',
    activeLogMAR: NaN,
    isolationMode: 1234,
    activeLetterIndex: -5,
    invertPolarity: 'YES_PLEASE',
    currentLineScores: 'NOT_AN_ARRAY',
    calibration: {
      referenceBarPixels: -50,
      measuredBarMm: NaN,
      directDistanceMeters: 0,
      isMirroredRoom: 'NOT_A_BOOL',
      distanceUnit: 'LIGHTYEARS',
    },
    jcc: {
      flipPosition: 42,
      refinementMode: 'SUPER_POWER',
      powerStep: 99.9,
    },
  };

  const nanSanitized = sanitizeServerExamState(nanPayload);
  assert(nanSanitized.activeCategory === 'va_chart', 'Invalid category reverted to default');
  assert(nanSanitized.optotypeSet === 'sloan', 'Invalid optotypeSet reverted to default');
  assert(nanSanitized.activeLogMAR === 0.0, 'NaN activeLogMAR reverted to default');
  assert(nanSanitized.isolationMode === 'line', 'Invalid isolationMode reverted to default');
  assert(nanSanitized.activeLetterIndex === 0, 'Negative activeLetterIndex reverted to default');
  assert(nanSanitized.invertPolarity === false, 'Non-boolean invertPolarity reverted to default');
  assert(Array.isArray(nanSanitized.currentLineScores), 'Non-array lineScores maintained array structure');
  assert(nanSanitized.calibration.referenceBarPixels === DEFAULT_SERVER_CALIBRATION.referenceBarPixels, 'Negative referenceBarPixels reverted');
  assert(nanSanitized.calibration.measuredBarMm === DEFAULT_SERVER_CALIBRATION.measuredBarMm, 'NaN measuredBarMm reverted');
  assert(nanSanitized.calibration.directDistanceMeters === DEFAULT_SERVER_CALIBRATION.directDistanceMeters, 'Zero directDistanceMeters reverted');
  assert(nanSanitized.calibration.isMirroredRoom === false, 'Non-boolean isMirroredRoom reverted');
  assert(nanSanitized.calibration.distanceUnit === 'meters', 'Invalid distanceUnit defaulted to meters');
  assert(nanSanitized.jcc.flipPosition === 1, 'Invalid jcc flipPosition defaulted to 1');
  assert(nanSanitized.jcc.refinementMode === 'AXIS', 'Invalid jcc refinementMode defaulted to AXIS');
  assert(nanSanitized.jcc.powerStep === 0.25, 'Invalid jcc powerStep defaulted to 0.25');

  // 5. Line scores length truncation and padding
  const shortScores = sanitizeServerExamState({ currentLineScores: ['correct', 'incorrect'] });
  assert(shortScores.currentLineScores.length === 5, 'Short lineScores array padded to length 5');
  assert(shortScores.currentLineScores[0] === 'correct', 'Padded lineScores preserved index 0');
  assert(shortScores.currentLineScores[1] === 'incorrect', 'Padded lineScores preserved index 1');
  assert(shortScores.currentLineScores[2] === 'untested', 'Padded lineScores padded with untested');

  const longScores = sanitizeServerExamState({
    currentLineScores: ['correct', 'correct', 'correct', 'correct', 'correct', 'extra1', 'extra2'],
  });
  assert(longScores.currentLineScores.length === 5, 'Long lineScores array truncated to length 5');
}

async function runSocketReapingTests() {
  console.log('\n--- [Test 4/4] Zombie Socket Reaping Under Heartbeat Interval ---');

  // Configure server with 100ms heartbeat
  const server = createOptiSuiteServer({ port: 0, serveStatic: false, heartbeatIntervalMs: 100 });
  const { port } = await server.start();

  try {
    // 1. Single Zombie Client Reaping Test
    const zombie1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((res) => zombie1.once('open', res));

    // Suppress automatic pong frame replies
    zombie1.pong = () => {};

    assert(server.wss.clients.size === 1, 'Server recorded 1 connected client initially');

    const connectTime = Date.now();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Zombie client was not terminated within 250ms (elapsed: ${Date.now() - connectTime}ms)`));
      }, 250);

      zombie1.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const elapsed = Date.now() - connectTime;
    assert(elapsed <= 250, `Zombie client socket closed in ${elapsed}ms (<= 250ms requirement)`);

    // Wait 20ms for server wss.clients to purge closed socket
    await new Promise((r) => setTimeout(r, 20));
    assert(server.wss.clients.size === 0, 'Zombie socket removed from server wss.clients set');

    // 2. Co-existence Test: Healthy Client vs Zombie Client
    const healthyClient = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const zombie2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    await Promise.all([
      new Promise((res) => healthyClient.once('open', res)),
      new Promise((res) => zombie2.once('open', res)),
    ]);

    zombie2.pong = () => {}; // suppress pong for zombie only

    assert(server.wss.clients.size === 2, 'Initial clients count is 2 (1 healthy, 1 zombie)');

    const t2 = Date.now();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Zombie2 not terminated within 250ms')), 250);
      zombie2.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const elapsed2 = Date.now() - t2;
    assert(elapsed2 <= 250, `Zombie client terminated in ${elapsed2}ms without affecting healthy peer`);

    await new Promise((r) => setTimeout(r, 20));
    assert(server.wss.clients.size === 1, 'Server client set pruned zombie and retained healthy client');
    assert(healthyClient.readyState === WebSocket.OPEN, 'Healthy client remains connected (readyState === OPEN)');

    // Keep healthy client alive across 3 more heartbeat cycles (300ms)
    await new Promise((r) => setTimeout(r, 300));
    assert(healthyClient.readyState === WebSocket.OPEN, 'Healthy client remains OPEN across multiple heartbeat cycles');
    assert(server.wss.clients.size === 1, 'Server clients size remains 1 for healthy client');

    healthyClient.close();
    await new Promise((r) => setTimeout(r, 20));
    assert(server.wss.clients.size === 0, 'Clients set empty after healthy client close');

    // 3. Multi-Zombie Burst Test (5 simultaneous silent connections)
    const zombieBurst = Array.from({ length: 5 }, () => new WebSocket(`ws://127.0.0.1:${port}/ws`));
    await Promise.all(zombieBurst.map((ws) => new Promise((res) => ws.once('open', res))));

    for (const ws of zombieBurst) {
      ws.pong = () => {};
    }

    assert(server.wss.clients.size === 5, 'Server accepted burst of 5 zombie connections');

    const burstStart = Date.now();
    await Promise.all(
      zombieBurst.map(
        (ws) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Burst zombie not terminated in 250ms')), 250);
            ws.once('close', () => {
              clearTimeout(timeout);
              resolve();
            });
          })
      )
    );

    const burstElapsed = Date.now() - burstStart;
    assert(burstElapsed <= 250, `All 5 burst zombies reaped in ${burstElapsed}ms (<= 250ms requirement)`);

    await new Promise((r) => setTimeout(r, 20));
    assert(server.wss.clients.size === 0, 'All 5 burst sockets successfully purged from wss.clients set');
  } finally {
    await server.stop();
  }
}

async function main() {
  console.log('================================================================');
  console.log(' SIMA Optometry App — Challenger M2 Independent Oracle Harness');
  console.log('================================================================');

  try {
    await runColdStartCalibrationTests();
    await runPrototypePollutionAttacks();
    await runInvalidTypesAndDioptersAttacks();
    await runSocketReapingTests();

    console.log('\n================================================================');
    console.log(` ✅ ALL ADVERSARIAL CHECKS PASSED: ${passedChecks}/${totalChecks}`);
    console.log(' Verdict: APPROVE');
    console.log('================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n================================================================');
    console.error(` ❌ CHALLENGER HARNESS FAILED (${passedChecks}/${totalChecks} passed)`);
    console.error(err);
    console.error(' Verdict: REJECT');
    console.error('================================================================\n');
    process.exit(1);
  }
}

main();
