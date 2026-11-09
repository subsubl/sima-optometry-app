import { createServer as createViteServer } from 'vite';
import { createOptiSuiteServer, getLocalLanIp } from './index.mjs';

async function startDev() {
  const apiPort = 3020;
  const vitePort = 5173;
  process.env.VITE_PORT = String(vitePort);

  const api = createOptiSuiteServer({ port: apiPort, serveStatic: false });
  await api.start();

  const vite = await createViteServer({
    server: {
      host: '0.0.0.0',
      port: vitePort,
    },
  });

  await vite.listen();
  const lanIp = getLocalLanIp();
  console.log(`  [Vite Dev Ready]`);
  console.log(`  • Doctor Controller (LAN/iPad) : http://${lanIp}:${vitePort}/#/doctor`);
  console.log(`  • Patient Display (Monitor)    : http://${lanIp}:${vitePort}/#/patient\n`);
}

startDev().catch((err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
