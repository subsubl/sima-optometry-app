import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
// @ts-ignore
import { createOptiSuiteServer } from '../../server/index.mjs';
import { DEFAULT_EXAM_STATE } from './examDefaults';

describe('OptiSuite 2020 — Real-Time WebSocket Sync & QR Pairing Server', () => {
  it('serves /api/network-info with QR code and synchronizes Doctor -> Patient via WebSockets', async () => {
    const port = 34567;
    const suite = createOptiSuiteServer({ port, serveStatic: true });
    await suite.start();

    try {
      // 1. Verify /api/network-info QR code and URLs
      const res = await fetch(`http://127.0.0.1:${port}/api/network-info`);
      expect(res.ok).toBe(true);
      const info = await res.json();
      expect(info.doctorUrl).toContain(`:${port}/#/doctor`);
      expect(info.patientUrl).toContain(`:${port}/#/patient`);
      expect(info.qrDataUrl).toMatch(/^data:image\/png;base64,/);

      // 2. Connect simulated Patient Display & Doctor Controller over WebSockets
      const patientWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const doctorWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);

      await Promise.all([
        new Promise<void>((resolve) => patientWs.once('open', () => resolve())),
        new Promise<void>((resolve) => doctorWs.once('open', () => resolve())),
      ]);

      const receivedByPatient = new Promise<any>((resolve) => {
        patientWs.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      // Doctor switches to Landolt C at 20/40 (0.3 LogMAR) with 0.5x crowding bars
      const nextState = {
        ...DEFAULT_EXAM_STATE,
        optotypeSet: 'landolt_c',
        activeLogMAR: 0.3,
        crowdingMode: 'bars_0.5x',
      };

      doctorWs.send(
        JSON.stringify({
          type: 'STATE_PATCH',
          payload: nextState,
        })
      );

      const syncMsg = await receivedByPatient;
      expect(syncMsg.type).toBe('STATE_SYNC');
      expect(syncMsg.payload.optotypeSet).toBe('landolt_c');
      expect(syncMsg.payload.activeLogMAR).toBe(0.3);
      expect(syncMsg.payload.crowdingMode).toBe('bars_0.5x');

      patientWs.close();
      doctorWs.close();
    } finally {
      suite.server.close();
    }
  });
});
