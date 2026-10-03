import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from '@autopilot/apimatic';
import { loadEnv } from '../env.ts';

const target = path.resolve(process.cwd(), process.argv[2] ?? 'docs/openapi.json');
mkdirSync(path.dirname(target), { recursive: true });
const document = buildOpenApiDocument({ serverUrl: loadEnv().apiPublicUrl });
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`OpenAPI 3.1 document written to ${target}\n`);