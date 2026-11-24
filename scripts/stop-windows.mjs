import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const metaFile = path.join(ROOT_DIR, '.cotafacil-cache', 'server.json');

let stopped = 0;

if (fs.existsSync(metaFile)) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta?.pid) {
      try {
        process.kill(meta.pid);
        stopped++;
        console.log(`Processo do servidor (PID ${meta.pid}) encerrado.`);
      } catch {
        // Already exited
      }
    }
    fs.unlinkSync(metaFile);
  } catch {
    // Ignore parse/unlink errors
  }
}

// Also ensure nothing from this project remains listening on PORT
try {
  const out = execSync(
    `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
    { encoding: 'utf8' }
  );
  const pids = out
    .split(/\r?\n/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid);

  for (const pid of pids) {
    try {
      process.kill(pid);
      stopped++;
      console.log(`Processo na porta ${PORT} (PID ${pid}) encerrado.`);
    } catch {
      // Ignore permission/exit errors
    }
  }
} catch {
  // Ignore lookup error
}

if (stopped === 0) {
  console.log('Nenhum processo em execução encontrado.');
}
