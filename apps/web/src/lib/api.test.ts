import { describe, expect, it } from 'vitest';

import { describeError, normaliseApiBase, relativeTime, statusTone, money } from './api';

/**
 * `normaliseApiBase` is deployment-critical: Render injects
 * `NEXT_PUBLIC_API_BASE_URL` as a bare hostname, and a missing scheme turns every
 * dashboard fetch into a relative request against the web origin.
 */
describe('normaliseApiBase', () => {
  it('restores https for a bare PaaS hostname', () => {
    expect(normaliseApiBase('trustlane-api.onrender.com')).toBe('https://trustlane-api.onrender.com');
  });

  it('strips trailing slashes and keeps an explicit scheme', () => {
    expect(normaliseApiBase('https://api.example.com/')).toBe('https://api.example.com');
    expect(normaliseApiBase('http://localhost:4000//')).toBe('http://localhost:4000');
  });

  it('keeps loopback on http for local development', () => {
    expect(normaliseApiBase('localhost:4000')).toBe('http://localhost:4000');
    expect(normaliseApiBase('127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
  });
});

describe('describeError', () => {
  it('keeps the machine readable code in front of the message', async () => {
    const { ApiError } = await import('./api');
    expect(describeError(new ApiError(409, 'No candidates matched this request.', 'NO_CANDIDATES'))).toBe(
      'NO_CANDIDATES · No candidates matched this request.',
    );
  });

  it('falls back for non-error values', () => {
    expect(describeError('boom', 'fallback')).toBe('fallback');
  });
});

describe('formatters', () => {
  it('formats money as a currency amount', () => {
    expect(money(1234.5, 'USD')).toBe('$1,235');
    expect(money(null, 'USD')).toBe('—');
  });

  it('resolves relative times against a fixed clock', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    expect(relativeTime('2026-01-01T11:59:30.000Z', now)).toBe('30s ago');
    expect(relativeTime('2026-01-01T11:00:00.000Z', now)).toBe('1h ago');
    expect(relativeTime('not-a-date', now)).toBe('—');
  });

  it('maps run status to a tone', () => {
    expect(statusTone('completed')).toBe('ok');
    expect(statusTone('blocked')).toBe('bad');
  });
});