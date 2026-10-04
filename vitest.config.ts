import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@autopilot/schemas': fileURLToPath(new URL('./packages/schemas/src/index.ts', import.meta.url)),
      '@autopilot/policy-engine': fileURLToPath(new URL('./packages/policy-engine/src/index.ts', import.meta.url)),
      '@autopilot/persistence': fileURLToPath(new URL('./packages/persistence/src/index.ts', import.meta.url)),
      '@autopilot/agent-tools': fileURLToPath(new URL('./packages/agent-tools/src/index.ts', import.meta.url)),
      '@autopilot/paypal': fileURLToPath(new URL('./packages/integrations/paypal/src/index.ts', import.meta.url)),
      '@autopilot/channel3': fileURLToPath(new URL('./packages/integrations/channel3/src/index.ts', import.meta.url)),
      '@autopilot/elastic': fileURLToPath(new URL('./packages/integrations/elastic/src/index.ts', import.meta.url)),
      '@autopilot/zapier': fileURLToPath(new URL('./packages/integrations/zapier/src/index.ts', import.meta.url)),
      '@autopilot/astropods': fileURLToPath(new URL('./packages/integrations/astropods/src/index.ts', import.meta.url)),
      '@autopilot/kernel': fileURLToPath(new URL('./packages/integrations/kernel/src/index.ts', import.meta.url)),
      '@autopilot/ag-grid': fileURLToPath(new URL('./packages/integrations/ag-grid/src/index.ts', import.meta.url)),
      '@autopilot/bryntum': fileURLToPath(new URL('./packages/integrations/bryntum/src/index.ts', import.meta.url)),
      '@autopilot/apimatic': fileURLToPath(new URL('./packages/integrations/apimatic/src/index.ts', import.meta.url)),
      '@autopilot/postman': fileURLToPath(new URL('./packages/integrations/postman/src/index.ts', import.meta.url)),
      '@autopilot/render': fileURLToPath(new URL('./packages/integrations/render/src/index.ts', import.meta.url))
    }
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'apps/web/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    reporters: ['default']
  }
});