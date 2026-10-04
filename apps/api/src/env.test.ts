import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

/**
 * These assertions exist because the Render blueprint injects values that a
 * local `.env` never produces: a bare host from `fromService`, and `PORT` from
 * the platform instead of `API_PORT`. Getting either wrong silently breaks the
 * hosted demo (CORS never matches, or the API never binds).
 */
describe('loadEnv', () => {
  it('falls back to PORT when API_PORT is absent so the platform port is used', () => {
    expect(loadEnv({ PORT: '51234' }).port).toBe(51234);
    expect(loadEnv({ API_PORT: '4000', PORT: '51234' }).port).toBe(4000);
    expect(loadEnv({}).port).toBe(4000);
  });

  it('adds a scheme to scheme-less CORS hosts and keeps loopback on http', () => {
    const env = loadEnv({ CORS_ORIGINS: 'trustlane-web.onrender.com,localhost:3100,https://judge.example' });
    expect(env.corsOrigins).toEqual([
      'https://trustlane-web.onrender.com',
      'http://localhost:3100',
      'https://judge.example',
    ]);
  });

  it('normalises a scheme-less WEB_URL into an origin', () => {
    expect(loadEnv({ WEB_URL: 'trustlane-web.onrender.com' }).webUrl).toBe('https://trustlane-web.onrender.com');
  });

  it('treats only an explicit live PAYPAL_ENV as live', () => {
    expect(loadEnv({}).paypal.environment).toBe('sandbox');
    expect(loadEnv({ PAYPAL_ENV: 'mock' }).paypal.environment).toBe('sandbox');
    expect(loadEnv({ PAYPAL_ENV: 'live' }).paypal.environment).toBe('live');
  });

  it('enables the optional LLM only with both a key and a base url', () => {
    expect(loadEnv({ LLM_API_KEY: 'k' }).llm.enabled).toBe(false);
    expect(loadEnv({ LLM_BASE_URL: 'https://api.openai.com/v1' }).llm.enabled).toBe(false);
    expect(loadEnv({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://api.openai.com/v1' }).llm.enabled).toBe(true);
  });

  it('keeps an invalid port on the default instead of NaN', () => {
    expect(loadEnv({ PORT: 'not-a-port' }).port).toBe(4000);
  });
});