const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

let patientWindow = null;
let doctorWindow = null;

async function startEmbeddedServer() {
  const serverModulePath = path.join(__dirname, '../server/index.mjs');
  const { createOptiSuiteServer } = await import(`file://${serverModulePath}`);
  const suite = createOptiSuiteServer({ port: 3020, serveStatic: true });
  return suite.start();
}

function createClinicalWindows(port) {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.find((d) => d.id !== primaryDisplay.id);

  if (secondaryDisplay) {
    patientWindow = new BrowserWindow({
      x: secondaryDisplay.bounds.x,
      y: secondaryDisplay.bounds.y,
      width: secondaryDisplay.bounds.width,
      height: secondaryDisplay.bounds.height,
      fullscreen: true,
      autoHideMenuBar: true,
      title: 'SIMA Optometry App — Patient Display',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    patientWindow.loadURL(`http://127.0.0.1:${port}/#/patient`);

    doctorWindow = new BrowserWindow({
      width: 1400,
      height: 880,
      autoHideMenuBar: true,
      title: 'SIMA Optometry App — Console',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    doctorWindow.loadURL(`http://127.0.0.1:${port}/#/doctor`);
  } else {
    doctorWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      autoHideMenuBar: true,
      title: 'SIMA Optometry App',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    doctorWindow.loadURL(`http://127.0.0.1:${port}/#/doctor`);
  }
}

app.whenReady().then(async () => {
  const { port } = await startEmbeddedServer();
  createClinicalWindows(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createClinicalWindows(port);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
