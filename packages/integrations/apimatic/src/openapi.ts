import { z } from 'zod';
import { ERROR_SCHEMA, OPERATIONS, TAGS, type OperationSpec } from './contract.ts';

export interface OpenApiOptions {
  title?: string;
  version?: string;
  description?: string;
  serverUrl?: string;
}

function jsonSchemaOf(schema: z.ZodType<unknown>): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, {
      target: 'openapi-3.1',
      io: 'output',
      unrepresentable: 'any',
      cycles: 'ref',
      reused: 'inline',
    }) as Record<string, unknown>;
  } catch {
    return { type: 'object', description: 'Schema could not be represented as OpenAPI.' };
  }
}

function errorResponses(spec: OperationSpec): Record<string, unknown> {
  const known: Array<{ status: number; code?: string; description: string }> = [
    { status: 400, description: 'Request validation failed.' },
    { status: 401, description: 'Missing or invalid credentials.' },
    { status: 404, description: 'Resource not found.' },
    { status: 500, description: 'Unexpected server error.' },
  ];
  for (const mode of spec.failureModes ?? []) {
    const existing = known.find((entry) => entry.status === mode.status);
    if (existing) {
      existing.description = mode.description;
      existing.code = mode.code;
    } else {
      known.push({ status: mode.status, code: mode.code, description: mode.description });
    }
  }

  const responses: Record<string, unknown> = {};
  for (const entry of known) {
    responses[String(entry.status)] = {
      description: entry.description,
      content: {
        'application/json': {
          schema: {
            allOf: [
              jsonSchemaOf(ERROR_SCHEMA),
              entry.code
                ? {
                    properties: {
                      error: {
                        properties: { code: { const: entry.code } },
                      },
                    },
                  }
                : {},
            ],
          },
          example: {
            error: {
              code: entry.code ?? errorCodeForStatus(entry.status),
              message: entry.description,
              correlationId: '01JC0EXAMPLE0000000000000',
              details: {},
            },
          },
        },
      },
    };
  }
  return responses;
}

function errorCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'INVALID_INPUT';
    case 401:
      return 'UNAUTHORIZED';
    case 404:
      return 'NOT_FOUND';
    case 402:
      return 'PAYMENT_FAILED';
    case 409:
      return 'CONFLICT';
    case 502:
      return 'PROVIDER_UNAVAILABLE';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

export function buildOpenApiDocument(options: OpenApiOptions = {}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const spec of OPERATIONS) {
    const parameters: Array<Record<string, unknown>> = [];
    for (const param of spec.pathParams ?? []) {
      parameters.push({
        name: param.name,
        in: 'path',
        required: true,
        description: param.description,
        schema: { type: 'string' },
      });
    }
    if (spec.query) {
      parameters.push({
        name: 'query',
        in: 'query',
        required: false,
        description: 'Query parameters defined by the request schema.',
        content: {
          'application/json': { schema: jsonSchemaOf(spec.query) },
        },
        style: 'deepObject',
        explode: true,
      });
    }
    for (const header of spec.headers ?? []) {
      parameters.push({
        name: header.name,
        in: 'header',
        required: header.required,
        description: header.description,
        schema: { type: 'string', example: header.example },
      });
    }

    const body: Record<string, unknown> = {};
    if (spec.request) {
      body.required = spec.request.required;
      body.content = {
        'application/json': { schema: jsonSchemaOf(spec.request.schema) },
      };
    }

    const operation: Record<string, unknown> = {
      operationId: spec.operationId,
      summary: spec.summary,
      description: spec.description ?? spec.summary,
      tags: [spec.tag],
      responses: {
        [String(spec.successStatus)]: {
          description: `${spec.method.toUpperCase()} ${spec.path} succeeded.`,
          content: { 'application/json': { schema: jsonSchemaOf(spec.response) } },
        },
        ...errorResponses(spec),
      },
    };
    if (parameters.length > 0) operation.parameters = parameters;
    if (body.content) operation.requestBody = body;

    paths[spec.path] = { ...(paths[spec.path] ?? {}), [spec.method]: operation };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: options.title ?? 'Autopilot API',
      version: options.version ?? '1.0.0',
      description:
        options.description ??
        'Governed agentic commerce API. Every purchase is decided by a versioned, machine-readable money policy; execution requires an explicit human approval bound to the plan hash; payment state is verified independently of the checkout session; and every step is written to an append-only audit log.',
      license: { name: 'MIT' },
    },
    servers: [{ url: options.serverUrl ?? 'http://localhost:4000', description: 'Local development' }],
    tags: TAGS.map((tag) => ({ name: tag })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Optional API token for protected deployments.' },
      },
    },
  };
}

export function openApiAsJsonString(options?: OpenApiOptions): string {
  return `${JSON.stringify(buildOpenApiDocument(options), null, 2)}\n`;
}