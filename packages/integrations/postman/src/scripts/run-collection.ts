import { formatSummary, runCollection } from '../runner.ts';

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000';
const onlyGoldenPath = process.argv.includes('--golden');

async function main(): Promise<void> {
  const summary = await runCollection({
    baseUrl,
    onlyGoldenPath,
    onResult: (result) => {
      const mark = result.ok ? 'PASS' : 'FAIL';
      process.stdout.write(`${mark} ${result.operationId} ${result.status}/${result.expected} (${result.durationMs}ms)\n`);
    },
  });
  process.stdout.write(`\n${formatSummary(summary)}\n`);
  if (summary.failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(`Collection run failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});