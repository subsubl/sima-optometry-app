import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Finds the primary non-internal IPv4 address of the clinic lane machine.
 */
export function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name] || [];
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

export function createOptiSuiteServer({ port = Number(process.env.PORT) || 3020, serveStatic = true } = {}) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Authoritative Ephemeral Exam State (in-memory only, zero PHI retention)
  let currentExamState = null;

  app.use(express.json());

  // Network & QR Pairing Endpoint for Remote Controller
  app.get('/api/network-info', async (_req, res) => {
    const lanIp = getLocalLanIp();
    const uiPort = process.env.VITE_PORT ? Number(process.env.VITE_PORT) : port;
    const doctorUrl = `http://${lanIp}:${uiPort}/#/doctor`;
    const patientUrl = `http://${lanIp}:${uiPort}/#/patient`;

    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(doctorUrl, {
        margin: 1,
        width: 240,
        color: {
          dark: '#090B0E',
          light: '#ffffff',
        },
      });
    } catch {
      qrDataUrl = '';
    }

    res.json({
      lanIp,
      port: uiPort,
      doctorUrl,
      patientUrl,
      qrDataUrl,
      connectedClients: wss.clients.size,
    });
  });

  // Serve built static frontend in production
  if (serveStatic) {
    const distPath = path.resolve(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Real-time WebSocket Synchronization Hub
  wss.on('connection', (ws) => {
    if (currentExamState) {
      ws.send(
        JSON.stringify({
          type: 'STATE_SYNC',
          payload: currentExamState,
        })
      );
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'CALIBRATION_INIT' && msg.payload) {
          if (currentExamState) {
            currentExamState = {
              ...currentExamState,
              calibration: msg.payload,
            };
          }
          return;
        }

        if (msg.type === 'STATE_PATCH' && msg.payload) {
          currentExamState = msg.payload;
          const outbound = JSON.stringify({
            type: 'STATE_SYNC',
            payload: currentExamState,
          });

          for (const client of wss.clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(outbound);
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  return {
    app,
    server,
    wss,
    start: () =>
      new Promise((resolve) => {
        server.listen(port, '0.0.0.0', () => {
          const lanIp = getLocalLanIp();
          console.log(`\n=============================================================`);
          console.log(`  SIMA Optometry App — Clinical Server Active`);
          console.log(`  • Patient Display   : http://${lanIp}:${port}/#/patient`);
          console.log(`  • Doctor Console    : http://${lanIp}:${port}/#/doctor`);
          console.log(`=============================================================\n`);
          resolve({ port, lanIp });
        });
      }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const suite = createOptiSuiteServer({ serveStatic: true });
  suite.start();
}
