import type { ApiErrorT } from '@autopilot/schemas';

/**
 * Every failure leaving the API is machine-readable: a stable code, a message a
 * human can act on, and the correlation id that ties it to the audit trail.
 */
export class ApiHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly correlationId: string | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
  }
}

export function errorBody(input: {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}): ApiErrorT {
  return {
    error: {
      code: input.code,
      message: input.message,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.details ? { details: input.details } : {}),
    },
  };
}

export const errors = {
  notFound: (what: string, correlationId?: string) =>
    new ApiHttpError(404, 'NOT_FOUND', `${what} was not found.`, undefined, correlationId),
  validation: (message: string, details?: Record<string, unknown>) =>
    new ApiHttpError(400, 'INVALID_INPUT', message, details),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new ApiHttpError(409, code, message, details),
  policyBlocked: (message: string, details?: Record<string, unknown>) =>
    new ApiHttpError(409, 'POLICY_BLOCKED', message, details),
  paymentFailed: (message: string, details?: Record<string, unknown>) =>
    new ApiHttpError(402, 'PAYMENT_FAILED', message, details),
  providerUnavailable: (message: string, details?: Record<string, unknown>) =>
    new ApiHttpError(502, 'PROVIDER_UNAVAILABLE', message, details),
  unauthorized: (message = 'A valid API token is required.') =>
    new ApiHttpError(401, 'UNAUTHORIZED', message),
};

export function describeError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof ApiHttpError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.correlationId ? { correlationId: error.correlationId } : {}),
      ...(error.details ? { details: error.details } : {}),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { statusCode: 500, code: 'INTERNAL_ERROR', message };
}