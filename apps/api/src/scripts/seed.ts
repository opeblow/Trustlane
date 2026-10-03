import { loadEnv } from '../env.ts';
import { createServices } from '../services/container.ts';
import { LocalCatalogProvider } from '@autopilot/channel3';
import { defaultPolicy } from '@autopilot/policy-engine';
import { nowIso } from '@autopilot/schemas';

/**
 * Seeds the default money policy and the bundled reference catalog so a fresh
 * checkout is immediately usable. Nothing here invents live data: the catalog is
 * explicitly labelled reference data and the policy is shown as version 1.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const services = createServices(env);
  const local = new LocalCatalogProvider();
  for (const product of local.all()) {
    services.store.saveProduct(product);
  }
  const policy = services.store.getActivePolicy() ?? defaultPolicy({ id: 'policy_default', name: 'Default policy' });
  services.store.savePolicy(policy);
  services.store.appendEvent({
    correlationId: `corr_seed_${Date.now()}`,
    type: 'policy.updated',
    actor: 'system',
    source: 'seed',
    payload: { policyId: policy.id, version: policy.version, products: local.all().length },
    timestamp: nowIso(),
  });
  process.stdout.write(
    `Seeded ${local.all().length} reference products and policy ${policy.name} v${policy.version} (${services.store.path}).\n`,
  );
  services.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});