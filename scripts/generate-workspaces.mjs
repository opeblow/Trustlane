#!/usr/bin/env node
/**
 * One-shot scaffolding helper: writes the workspace package.json + tsconfig.json
 * files for every Autopilot package/app so they stay consistent with each other.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const workspaces = [
  {
    dir: 'packages/schemas',
    name: '@autopilot/schemas',
    description: 'Shared zod contracts, data model and OpenAPI generation.',
    deps: { zod: '^4.6.5' },
    extra: { type: 'module' },
  },
  {
    dir: 'packages/persistence',
    name: '@autopilot/persistence',
    description: 'SQLite-backed repositories + append-only audit event log.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/policy-engine',
    name: '@autopilot/policy-engine',
    description: 'Deterministic money-policy evaluation engine.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/agent-tools',
    name: '@autopilot/agent-tools',
    description: 'Typed tool registry, agent state machine, intent parsing and scoring.',
    deps: {
      '@autopilot/schemas': '*',
      '@autopilot/policy-engine': '*',
    },
  },
  {
    dir: 'packages/integrations/paypal',
    name: '@autopilot/paypal',
    description: 'PayPal sandbox order/approval/capture/verify adapter.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/channel3',
    name: '@autopilot/channel3',
    description: 'Channel3 product-discovery adapter + local catalog source.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/elastic',
    name: '@autopilot/elastic',
    description: 'Elastic audit-search adapter with a local index fallback.',
    deps: { '@autopilot/schemas': '*', '@elastic/elasticsearch': '^9.5.1' },
  },
  {
    dir: 'packages/integrations/zapier',
    name: '@autopilot/zapier',
    description: 'Post-purchase webhook automation adapter.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/astropods',
    name: '@autopilot/astropods',
    description: 'Agent execution tracing + optional Astropods span export.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/kernel',
    name: '@autopilot/kernel',
    description: 'Optional KERNEL intelligence/security capability adapter.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/apimatic',
    name: '@autopilot/apimatic',
    description: 'OpenAPI contract export + APIMatic integration tooling.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/postman',
    name: '@autopilot/postman',
    description: 'Postman collection generation + newman runner.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/render',
    name: '@autopilot/render',
    description: 'Render blueprint + container health-check tooling.',
    deps: {},
  },
  {
    dir: 'packages/integrations/bryntum',
    name: '@autopilot/bryntum',
    description: 'Bryntum Scheduler/Gantt lifecycle event mapping.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'packages/integrations/ag-grid',
    name: '@autopilot/ag-grid',
    description: 'Framework-agnostic AG Grid column/filter/AI-operation adapter.',
    deps: { '@autopilot/schemas': '*' },
  },
  {
    dir: 'apps/api',
    name: '@autopilot/api',
    description: 'Autopilot orchestration API (Fastify).',
    deps: {
      '@autopilot/schemas': '*',
      '@autopilot/persistence': '*',
      '@autopilot/policy-engine': '*',
      '@autopilot/agent-tools': '*',
      '@autopilot/paypal': '*',
      '@autopilot/channel3': '*',
      '@autopilot/elastic': '*',
      '@autopilot/zapier': '*',
      '@autopilot/astropods': '*',
      '@autopilot/kernel': '*',
      '@autopilot/bryntum': '*',
      '@autopilot/apimatic': '*',
      '@autopilot/postman': '*',
      zod: '^4.6.5',
      fastify: '^5.12.5',
      '@fastify/cors': '^11.1.0',
    },
    devDeps: { newman: '^6.2.2' },
    extra: {
      scripts: {
        start: 'node dist/server.js',
        postman: 'npm run postman -w @autopilot/postman',
      },
    },
  },
  {
    dir: 'apps/web',
    name: '@autopilot/web',
    description: 'Autopilot premium web experience (Next.js).',
    deps: {
      '@autopilot/schemas': '*',
      '@autopilot/ag-grid': '*',
      '@autopilot/bryntum': '*',
      'next': '15.5.27',
      react: '^19.3.0',
      'react-dom': '^19.3.0',
      'ag-grid-community': '^36.2.0',
      'ag-grid-react': '^36.2.0',
    },
    devDeps: {
      tailwindcss: '^3.4.19',
      postcss: '^8.5.6',
      autoprefixer: '^10.4.21',
    },
    extra: { scripts: {} },
  },
];

const tsconfig = (name) => ({
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    rootDir: 'src',
    outDir: 'dist',
    tsBuildInfoFile: 'dist/.tsbuildinfo',
  },
  include: ['src/**/*'],
  exclude: ['dist', 'node_modules', '**/*.test.ts'],
  name,
});

for (const ws of workspaces) {
  const abs = path.join(root, ws.dir);
  mkdirSync(path.join(abs, 'src'), { recursive: true });

  const pkg = {
    name: ws.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    description: ws.description,
    license: 'MIT',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
      './package.json': './package.json',
    },
    files: ['dist'],
    scripts: {
      build: 'tsc -p tsconfig.json',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      clean: 'node -e "require(\'node:fs\').rmSync(\'dist\',{recursive:true,force:true})"',
    },
    dependencies: ws.deps,
    ...(ws.devDeps ? { devDependencies: ws.devDeps } : {}),
    ...(ws.extra ?? {}),
  };

  writeFileSync(path.join(abs, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(
    path.join(abs, 'tsconfig.json'),
    JSON.stringify(tsconfig(ws.name), null, 2) + '\n',
  );
  console.log('scaffolded', ws.name);
}

const srcIndex = `export {};\n`;
for (const ws of workspaces) {
  writeFileSync(path.join(root, ws.dir, 'src', 'index.ts'), srcIndex);
}
console.log('done');