import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCollection } from '@autopilot/postman';

const target = path.resolve(process.cwd(), process.argv[2] ?? 'docs/postman-collection.json');
mkdirSync(path.dirname(target), { recursive: true });
const collection = buildCollection({ baseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000' });
writeFileSync(target, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
process.stdout.write(`Postman collection written to ${target}\n`);