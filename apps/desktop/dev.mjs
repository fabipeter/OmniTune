import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const pnpmBin = isWin ? 'pnpm.cmd' : 'pnpm';

async function isOmniTuneRunning(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('<title>OmniTune</title>');
  } catch {
    return false;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

async function findFreePort(start = 5173) {
  for (let p = start; p < start + 50; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('Could not find a free port for the web dev server');
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.ok) return;
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let viteProc = null;

async function main() {
  let port = 5173;
  const reuse = await isOmniTuneRunning(port);

  if (reuse) {
    console.log(`[desktop] Reusing running OmniTune web server at http://localhost:${port}`);
  } else {
    port = await findFreePort(5173);
    console.log(`[desktop] Starting OmniTune web dev server on http://localhost:${port}...`);
    viteProc = spawn(pnpmBin, ['--filter', '@omnitune/web', 'exec', 'vite', '--host', '--port', String(port), '--strictPort'], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '../..'),
    });
    viteProc.on('exit', (code) => {
      if (code && code !== 0) process.exit(code);
    });
    await waitForHttp(`http://localhost:${port}/`);
  }

  const devUrl = `http://localhost:${port}`;
  console.log(`[desktop] Launching Electron (${devUrl})...`);

  const electronBin = path.resolve(
    __dirname,
    '../../node_modules/.bin',
    isWin ? 'electron.cmd' : 'electron',
  );

  const electronProc = spawn(electronBin, ['.'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, OMNITUNE_DEV_URL: devUrl },
  });

  const cleanup = () => {
    if (viteProc && !viteProc.killed) viteProc.kill('SIGTERM');
  };

  process.on('SIGINT', () => {
    cleanup();
    electronProc.kill('SIGTERM');
  });
  process.on('SIGTERM', () => {
    cleanup();
    electronProc.kill('SIGTERM');
  });

  electronProc.on('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[desktop]', err instanceof Error ? err.message : err);
  if (viteProc && !viteProc.killed) viteProc.kill('SIGTERM');
  process.exit(1);
});
