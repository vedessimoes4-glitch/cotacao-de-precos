import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const URL = `http://127.0.0.1:${PORT}`;

function isServerUp() {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function findBrowserCommand() {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function openAppWindow() {
  const browser = findBrowserCommand();
  if (browser) {
    const child = spawn(browser, [`--app=${URL}`], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return;
  }
  spawn('cmd', ['/c', 'start', '', URL], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

async function main() {
  const distIndex = path.join(ROOT_DIR, 'dist', 'index.html');
  const serverBundle = path.join(ROOT_DIR, 'dist-server', 'server.mjs');

  if (!fs.existsSync(distIndex) || !fs.existsSync(serverBundle)) {
    execSync('npm.cmd run build && npm.cmd run build:server', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
  }

  const cacheDir = path.join(ROOT_DIR, '.cotafacil-cache');
  const metaFile = path.join(cacheDir, 'server.json');
  const currentBuildMtime = fs.statSync(serverBundle).mtimeMs;

  let alreadyRunning = await isServerUp();
  if (alreadyRunning && fs.existsSync(metaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (meta?.pid && meta.buildMtimeMs !== currentBuildMtime) {
        process.kill(meta.pid);
        await new Promise((r) => setTimeout(r, 400));
        alreadyRunning = await isServerUp();
      }
    } catch {
      // Ignore stale/missing PID
    }
  }

  if (!alreadyRunning) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const logFd = fs.openSync(path.join(cacheDir, 'server.log'), 'a');

    const child = spawn(process.execPath, [serverBundle], {
      cwd: ROOT_DIR,
      env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
    });
    fs.writeFileSync(
      metaFile,
      JSON.stringify({ pid: child.pid, buildMtimeMs: currentBuildMtime }),
      'utf8'
    );
    child.unref();
    try { fs.closeSync(logFd); } catch {}

    const ready = await waitForServer();
    if (!ready) {
      console.error('Tempo esgotado aguardando o servidor iniciar.');
      process.exit(1);
    }
  }

  openAppWindow();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
