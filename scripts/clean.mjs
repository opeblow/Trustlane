#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'packages',
  'apps',
  'tests',
  'data',
  'coverage',
  '.postman',
];

for (const target of targets) {
  await rm(path.join(root, target, 'dist'), { recursive: true, force: true });
  await rm(path.join(root, target, '.next'), { recursive: true, force: true });
}
await rm(path.join(root, 'data'), { recursive: true, force: true });
await rm(path.join(root, 'coverage'), { recursive: true, force: true });
console.log('clean: removed build output and local data');