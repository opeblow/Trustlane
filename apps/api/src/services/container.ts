import { createStore, type AutopilotStore } from '@autopilot/persistence';
import { createPayPalGateway, type PaymentGateway } from '@autopilot/paypal';
import { createCatalogStack, type CatalogStack } from '@autopilot/channel3';
import { createAuditIndex, type AuditIndex } from '@autopilot/elastic';
import { createTraceExporter, type TraceExporter } from '@autopilot/astropods';
import { createKernelAdapter, type KernelAdapter } from '@autopilot/kernel';
import { createAutomationAdapter, type AutomationAdapter } from '@autopilot/zapier';
import { defaultPolicy } from '@autopilot/policy-engine';
import { llmConfigFrom, type LlmConfig } from '@autopilot/agent-tools';
import { nowIso, type ProviderHealthT, type UserPolicyT } from '@autopilot/schemas';
import type { ApiEnv } from '../env.ts';

export interface Services {
  env: ApiEnv;
  store: AutopilotStore;
  startedAt: number;
  gateway: PaymentGateway;
  catalog: CatalogStack;
  auditIndex: AuditIndex;
  tracer: TraceExporter;
  kernel: KernelAdapter;
  automation: AutomationAdapter;
  llmConfig: LlmConfig | null;
  activePolicy(): UserPolicyT;
  providerHealth(): Promise<ProviderHealthT[]>;
  close(): void;
}

export function createServices(env: ApiEnv): Services {
  const store = createStore({ databasePath: env.databasePath });
  const gateway = createPayPalGateway({
    ...(env.paypal.clientId ? { clientId: env.paypal.clientId } : {}),
    ...(env.paypal.clientSecret ? { clientSecret: env.paypal.clientSecret } : {}),
    environment: env.paypal.environment,
  });
  const catalog = createCatalogStack({
    ...(env.channel3.baseUrl ? { baseUrl: env.channel3.baseUrl } : {}),
    ...(env.channel3.apiKey ? { apiKey: env.channel3.apiKey } : {}),
  });
  const auditIndex = createAuditIndex({
    ...(env.elastic.node ? { node: env.elastic.node } : {}),
    ...(env.elastic.apiKey ? { apiKey: env.elastic.apiKey } : {}),
    ...(env.elastic.index ? { index: env.elastic.index } : {}),
  });
  const tracer = createTraceExporter({
    ...(env.astropods.endpoint ? { endpoint: env.astropods.endpoint } : {}),
    ...(env.astropods.apiKey ? { apiKey: env.astropods.apiKey } : {}),
  });
  const kernel = createKernelAdapter({
    ...(env.kernel.baseUrl ? { baseUrl: env.kernel.baseUrl } : {}),
    ...(env.kernel.apiKey ? { apiKey: env.kernel.apiKey } : {}),
  });
  const automation = createAutomationAdapter({
    ...(env.zapier.hookUrl ? { hookUrl: env.zapier.hookUrl } : {}),
  });

  // Every persisted event is mirrored into the audit index (Elastic when
  // configured) without ever blocking the write path.
  store.bus.on('event', (event: unknown) => {
    void Promise.resolve()
      .then(() => auditIndex.index(event as Parameters<AuditIndex['index']>[0]))
      .catch(() => undefined);
  });

  if (!store.getActivePolicy()) {
    store.savePolicy(
      defaultPolicy({
        id: 'policy_default',
        name: 'Default policy',
        currency: env.defaultCurrency,
      }),
    );
  }

  return {
    env,
    store,
    startedAt: Date.now(),
    gateway,
    catalog,
    auditIndex,
    tracer,
    kernel,
    automation,
    llmConfig: llmConfigFrom(env.llm),
    activePolicy() {
      const policy = store.getActivePolicy();
      if (!policy) {
        const created = defaultPolicy({ id: 'policy_default', name: 'Default policy', currency: env.defaultCurrency });
        store.savePolicy(created);
        return created;
      }
      return policy;
    },
    async providerHealth() {
      const [payment, catalogProvider, audit, traces, risk, automationHealth] = await Promise.all([
        gateway.health(),
        catalog.primary.health().catch(
          (error: unknown): ProviderHealthT => ({
            provider: 'channel3',
            status: 'degraded',
            detail: `Catalog provider health check failed: ${error instanceof Error ? error.message : String(error)}`,
            checkedAt: nowIso(),
            requiresCredentials: true,
          }),
        ),
        auditIndex.health().catch(
          (error: unknown): ProviderHealthT => ({
            provider: 'elastic',
            status: 'degraded',
            detail: `Audit index health check failed: ${error instanceof Error ? error.message : String(error)}`,
            checkedAt: nowIso(),
            requiresCredentials: false,
          }),
        ),
        tracer.health(),
        kernel.health(),
        automation.health(),
      ]);

      const agGrid: ProviderHealthT = {
        provider: 'ag-grid',
        status: 'not_applicable',
        detail: 'AG Grid Enterprise runs client-side in the browser; no server credential is involved.',
        checkedAt: nowIso(),
        requiresCredentials: false,
      };
      const bryntum: ProviderHealthT = {
        provider: 'bryntum',
        status: 'not_applicable',
        detail: 'Bryntum Scheduler runs client-side with the bundled trial build; no server credential is involved.',
        checkedAt: nowIso(),
        requiresCredentials: false,
      };
      const apimatic: ProviderHealthT = {
        provider: 'apimatic',
        status: 'configured',
        detail: 'OpenAPI 3.1 document is generated from the same contract the routes are implemented from.',
        checkedAt: nowIso(),
        requiresCredentials: false,
      };
      const postman: ProviderHealthT = {
        provider: 'postman',
        status: 'configured',
        detail: 'Postman collection and runner are generated from the shared contract.',
        checkedAt: nowIso(),
        requiresCredentials: false,
      };
      const internal: ProviderHealthT = {
        provider: 'internal',
        status: 'live',
        detail: `SQLite audit log at ${store.path}`,
        checkedAt: nowIso(),
        requiresCredentials: false,
      };

      return [
        payment,
        catalogProvider,
        audit,
        traces,
        risk,
        automationHealth,
        agGrid,
        bryntum,
        apimatic,
        postman,
        internal,
      ];
    },
    close() {
      store.close();
    },
  };
}