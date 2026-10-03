import { describe, expect, it } from 'vitest';
import { ApiHttpError, describeError, errorBody, errors } from './errors.ts';

describe('API errors', () => {
  it('preserves not-found correlation ids in the described error', () => {
    const result = describeError(errors.notFound('Purchase plan', 'corr_request_123'));

    expect(result).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Purchase plan was not found.',
      correlationId: 'corr_request_123',
    });
  });

  it('omits optional fields when they are not supplied', () => {
    expect(errorBody({ code: 'NOT_FOUND', message: 'Missing.' })).toEqual({
      error: { code: 'NOT_FOUND', message: 'Missing.' },
    });
  });

  it('includes correlation id and details in the machine-readable body', () => {
    expect(
      errorBody({
        code: 'INVALID_INPUT',
        message: 'Bad input.',
        correlationId: 'corr_request_123',
        details: { field: 'amount' },
      }),
    ).toEqual({
      error: {
        code: 'INVALID_INPUT',
        message: 'Bad input.',
        correlationId: 'corr_request_123',
        details: { field: 'amount' },
      },
    });
  });

  it('maps known API errors and keeps their details', () => {
    const error = errors.conflict('PLAN_CHANGED', 'Review the purchase again.', { planId: 'plan_1' });

    expect(error).toBeInstanceOf(ApiHttpError);
    expect(describeError(error)).toEqual({
      statusCode: 409,
      code: 'PLAN_CHANGED',
      message: 'Review the purchase again.',
      details: { planId: 'plan_1' },
    });
  });

  it('converts unknown errors to internal errors', () => {
    expect(describeError(new Error('Unexpected failure'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected failure',
    });
    expect(describeError('Unexpected failure')).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected failure',
    });
  });
});
