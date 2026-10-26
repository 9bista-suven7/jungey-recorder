// Starts the Vite dev server, then opens the Electron window pointed at it.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
server.printUrls();

// Ubuntu 24.04+ blocks Chromium's sandbox for unpackaged Electron; the packaged .deb sets it up properly.
const args = process.platform === 'linux' ? ['--no-sandbox', '.'] : ['.'];
const child = spawn(electronPath, args, { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });

const shutdown = async (code = 0) => {
  await server.close();
  process.exit(code);
};
child.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
