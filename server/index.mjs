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

export function createOptiSuiteServer({
  port = process.env.PORT !== undefined ? Number(process.env.PORT) : 3020,
  serveStatic = true,
} = {}) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let currentExamState = null;
  let boundPort = port;

  // CORS middleware for cross-origin LAN access from tablets / remote browsers
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
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const suite = createOptiSuiteServer({ serveStatic: true });
  suite.start();
}
