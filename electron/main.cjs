const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;

function resolveDotenvPath() {
  // Check next to executable first (portable mode), then userData, then project root
  const candidates = [
    path.join(path.dirname(process.execPath), '.env'),
    path.join(app.getPath('userData'), '.env'),
    path.join(app.getAppPath(), '.env'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || '';
}

async function startBackend() {
  const appRoot = app.getAppPath();
  process.env.NODE_ENV = 'production';
  process.env.COTAFACIL_NO_AUTOSTART = '1';
  process.env.COTAFACIL_DIST_DIR = path.join(appRoot, 'dist');
  process.env.COTAFACIL_CACHE_DIR = path.join(app.getPath('userData'), 'cache');

  const dotenvPath = resolveDotenvPath();
  if (dotenvPath) {
    process.env.DOTENV_PATH = dotenvPath;
  }

  const serverEntry = path.join(appRoot, 'dist-server', 'server.mjs');
  const mod = await import(pathToFileURL(serverEntry).href);
  const { port } = await mod.startServer(0);
  return port;
}

async function createWindow() {
  try {
    const port = await startBackend();
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 1024,
      minHeight: 680,
      title: 'Cotação de Preços',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (err) {
    dialog.showErrorBox(
      'Erro ao iniciar o sistema',
      `Não foi possível iniciar o servidor interno:\n\n${err && err.stack ? err.stack : err}`
    );
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
