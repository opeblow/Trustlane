import { OPERATIONS, type OperationSpec } from '@autopilot/apimatic';
import { EXAMPLES } from './examples.ts';

export interface CollectionOptions {
  baseUrl?: string;
  name?: string;
}

/** Order the Golden Path executes in; everything else follows per tag. */
export const GOLDEN_PATH = [
  'createIntent',
  'createRun',
  'getRun',
  'preparePurchase',
  'approvePurchase',
  'capturePurchase',
  'getPayment',
  'searchEvents',
  'getHealth',
];

function pointerGet(value: unknown, pointer: string): unknown {
  return pointer.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

export function pointerGetExport(pointer: string): string {
  return `JSON.stringify(${pointer.split('.').reduce((acc, key) => `${acc}?.${key}`, 'pm.response.json()')})`;
}

function substitute(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

function resolveUrl(operation: OperationSpec, vars: Record<string, string>, baseUrl: string): string {
  let path = operation.path;
  for (const param of operation.pathParams ?? []) {
    path = path.replace(`{${param.name}}`, `{{${param.name}}}`);
  }
  const url = substitute(path, vars);
  const query = EXAMPLES[operation.operationId]?.query;
  const queryString = query
    ? `?${Object.entries(query)
        .map(([key, raw]) => `${encodeURIComponent(key)}=${encodeURIComponent(substitute(String(raw), vars))}`)
        .join('&')}`
    : '';
  return `${baseUrl}${url}${queryString}`;
}

export function buildCollection(options: CollectionOptions = {}): Record<string, unknown> {
  const baseUrl = options.baseUrl ?? '{{baseUrl}}';

  const items = [...OPERATIONS]
    .sort((a, b) => {
      const aIndex = GOLDEN_PATH.indexOf(a.operationId);
      const bIndex = GOLDEN_PATH.indexOf(b.operationId);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path);
    })
    .map((operation) => {
      const example = EXAMPLES[operation.operationId] ?? {};
      const headers: Array<{ key: string; value: string; type: string }> = [
        { key: 'accept', value: 'application/json', type: 'text' },
      ];
      if (example.body !== undefined) {
        headers.push({ key: 'content-type', value: 'application/json', type: 'text' });
      }
      const exampleHeaders = (operation.headers ?? []).map((header) => ({
        key: header.name.toLowerCase(),
        value: example.headers?.[header.name] ?? substitute(header.example ?? `<${header.name.toLowerCase()}>`, {}),
        type: 'text',
      }));

      const tests: string[] = [];
      if (example.expectStatus !== undefined) {
        tests.push(
          `pm.test("status ${example.expectStatus}", () => pm.expect(pm.response.code).to.be.within(${typeof example.expectStatus === 'number' ? example.expectStatus : 200}, 299));`,
        );
      }
      tests.push('pm.test("content type is json", () => pm.expect(pm.response.headers.get("content-type")).to.include("application/json"));');
      tests.push('pm.test("responses carry a correlation id", () => pm.expect(JSON.stringify(pm.response.json())).to.include("correlationId"));');
      for (const capture of example.capture ?? []) {
        tests.push(`pm.collectionVariables.set("${capture.variable}", ${pointerGetExport(capture.pointer)});`);
      }

      return {
        name: `${operation.method.toUpperCase()} ${operation.path}`,
        request: {
          method: operation.method.toUpperCase(),
          header: [...headers, ...exampleHeaders],
          ...(example.body !== undefined
            ? { body: { mode: 'raw', raw: JSON.stringify(example.body, null, 2), options: { raw: { language: 'json' } } } }
            : {}),
          url: {
            raw: resolveUrl(operation, {}, baseUrl),
            host: [substitute(baseUrl, {}).replace(/^https?:\/\//, '').split('/')[0]],
            path: operation.path.replace(/\{(\w+)\}/g, ':$1').split('/').filter(Boolean),
          },
          description: `${operation.summary}\n\n${operation.description}`,
        },
        event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }],
        response: [],
        'x-autopilot': {
          operationId: operation.operationId,
          goldenPath: GOLDEN_PATH.includes(operation.operationId),
          expectStatus: example.expectStatus ?? 200,
          ...(example.body !== undefined ? { body: example.body } : {}),
          ...(example.headers !== undefined ? { headers: example.headers } : {}),
        },
      };
    });

  return {
    info: {
      name: options.name ?? 'Autopilot — governed agentic commerce API',
      _postman_id: '00000000-0000-4000-8000-0000000000ap',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description:
        'Generated from the same contract that produces /api/openapi.json. The first nine requests form the Golden Path: intent to run to policy-gated plan to explicit approval to captured and independently verified payment, then audit and health.',
    },
    item: items,
    variable: [
      { key: 'baseUrl', value: 'http://localhost:4000', type: 'string' },
      { key: 'intentId', value: '', type: 'string' },
      { key: 'runId', value: '', type: 'string' },
      { key: 'planId', value: '', type: 'string' },
      { key: 'planHash', value: '', type: 'string' },
      { key: 'paymentId', value: '', type: 'string' },
    ],
  };
}

export function resolvePointer(value: unknown, pointer: string): unknown {
  return pointerGet(value, pointer);
}