#!/usr/bin/env node
/**
 * Starts the Next.js production server on the port the platform provides.
 *
 * `next start` alone falls back to 3000 and ignores `PORT`, which breaks on
 * Render (and every other PaaS that injects `PORT` and expects the app to bind
 * it). A shell expression like `--port ${PORT:-3100}` is not portable to the
 * Windows shells npm uses, so the resolution happens here instead:
 *
 *   PORT=<injected by Render>  -> listen there
 *   PORT unset (local)         -> 3100, matching `npm run dev`
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '..');
const require = createRequire(import.meta.url);

const resolveNextBin = () => {
  try {
    // `next` is not a direct dependency path; resolve through the package export.
    return require.resolve('next/dist/bin/next', { paths: [workspace] });
  } catch {
    return path.join(workspace, 'node_modules', 'next', 'dist', 'bin', 'next');
  }
};

const port = process.env.PORT && /^\d+$/.test(process.env.PORT) ? process.env.PORT : '3100';
const host = process.env.HOST && process.env.HOST.length > 0 ? process.env.HOST : '0.0.0.0';

const child = spawn(process.execPath, [resolveNextBin(), 'start', '--port', port, '--hostname', host], {
  cwd: workspace,
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
});

const forward = (signal) => {
  child.on('exit', (code, signalName) => {
    process.exit(signalName ? 1 : (code ?? 0));
  });
  process.on(signal, () => child.kill(signal));
};

forward('SIGINT');
forward('SIGTERM');