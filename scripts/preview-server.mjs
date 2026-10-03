// Zero-dependency static server for the Trustlane UI preview.
// Works before `npm install` has ever run (uses only Node built-ins).
// Usage: node scripts/preview-server.mjs [port]
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] ?? process.env.PORT ?? 3100);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function resolveFile(urlPath) {
  const pathname = new URL(urlPath, 'http://localhost').pathname;
  const aliases = {
    '/': 'apps/web/public/landing.html',
    '/dashboard': 'apps/web/public/dashboard.html',
    '/dashboard/': 'apps/web/public/dashboard.html',
  };
  const candidate = aliases[pathname] ?? decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!candidate) return undefined;
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  return undefined;
}

const server = http.createServer((request, response) => {
  const file = resolveFile(request.url ?? '/');
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found. Run: node scripts/preview-server.mjs\n');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Trustlane preview  ->  http://localhost:${port}\n`);
  process.stdout.write('Press Ctrl+C to stop.\n');
});