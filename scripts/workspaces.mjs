#!/usr/bin/env node
/**
 * Runs a package script across every npm workspace in dependency order.
 *
 * Usage: node scripts/workspaces.mjs <task>
 *
 * Workspaces import each other through package `exports` that point at `dist`,
 * so `npm run --workspaces` (which walks the workspaces in directory order)
 * cannot type-check or build anything that depends on another workspace: the
 * declaration files it needs have not been produced yet. This runner resolves
 * the workspace graph from the manifests, sorts it topologically, and for every
 * workspace builds its workspace dependencies before running the task on it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const task = process.argv[2] ?? 'build';
const npmExecPath = process.env.npm_execpath;

const runNpm = (args, cwd) => {
  if (npmExecPath && path.isAbsolute(npmExecPath)) {
    execFileSync(process.execPath, [npmExecPath, ...args], { cwd, stdio: 'inherit' });
    return;
  }
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
};

const readManifest = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

const expandWorkspace = (pattern) => {
  const target = path.join(root, pattern);
  if (!pattern.includes('*')) {
    return existsSync(path.join(target, 'package.json')) ? [target] : [];
  }
  const base = target.replace(/[\\/]\*+$/, '');
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .filter((dir) => existsSync(path.join(dir, 'package.json')))
    .sort();
};

const workspaces = readManifest(root).workspaces.flatMap(expandWorkspace);

const packages = workspaces
  .map((dir) => {
    const manifest = readManifest(dir);
    return {
      name: manifest.name,
      dir,
      manifest,
      scripts: manifest.scripts ?? {},
      dependencies: new Set(),
    };
  })
  .filter((pkg) => typeof pkg.name === 'string')
  .sort((a, b) => a.name.localeCompare(b.name));

const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));

for (const pkg of packages) {
  const { manifest } = pkg;
  const groups = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ];
  for (const group of groups) {
    for (const name of Object.keys(group ?? {})) {
      const dependency = byName.get(name);
      if (dependency) pkg.dependencies.add(dependency);
    }
  }
}

const sortedDependencies = (pkg) => [...pkg.dependencies].sort((a, b) => a.name.localeCompare(b.name));

const ordered = [];
const visited = new Set();
const visiting = new Set();

const visit = (pkg, trail) => {
  if (visited.has(pkg.name)) return;
  if (visiting.has(pkg.name)) {
    throw new Error(`Workspace dependency cycle detected: ${[...trail, pkg.name].join(' -> ')}`);
  }
  visiting.add(pkg.name);
  for (const dependency of sortedDependencies(pkg)) visit(dependency, [...trail, pkg.name]);
  visiting.delete(pkg.name);
  visited.add(pkg.name);
  ordered.push(pkg);
};

for (const pkg of packages) visit(pkg, []);

const runTask = (pkg, name) => {
  if (!pkg.scripts[name]) return false;
  process.stdout.write(`\n> ${pkg.name}: npm run ${name}\n`);
  runNpm(['run', name], pkg.dir);
  return true;
};

const built = new Set();

const buildOnce = (pkg) => {
  if (built.has(pkg.name)) return;
  built.add(pkg.name);
  for (const dependency of sortedDependencies(pkg)) buildOnce(dependency);
  runTask(pkg, 'build');
};

for (const pkg of ordered) {
  if (task === 'build') {
    buildOnce(pkg);
    continue;
  }
  for (const dependency of sortedDependencies(pkg)) buildOnce(dependency);
  runTask(pkg, task);
}
