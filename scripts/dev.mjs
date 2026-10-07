import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  }
}

for (const args of [
  ['--env-file-if-exists=.env', 'server/proxy-server.js'],
  ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)],
]) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  children.push(child);
  child.on('error', () => {
    console.error('Could not start a development process. Run npm ci first.');
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) stop(signal ? 1 : (code ?? 1));
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
