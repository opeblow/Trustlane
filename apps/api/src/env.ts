export interface ApiEnv {
  nodeEnv: string;
  host: string;
  port: number;
  apiPublicUrl: string;
  databasePath: string;
  corsOrigins: string[];
  logLevel: string;
  apiToken?: string;
  defaultCurrency: 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';
  paypal: {
    clientId?: string;
    clientSecret?: string;
    environment: 'sandbox' | 'live';
  };
  channel3: { baseUrl?: string; apiKey?: string };
  elastic: { node?: string; apiKey?: string; index?: string };
  kernel: { baseUrl?: string; apiKey?: string };
  zapier: { hookUrl?: string };
  astropods: { endpoint?: string; apiKey?: string };
  llm: {
    provider: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    timeoutMs?: string;
    enabled: boolean;
  };
  /** Public URL of the web app, used for PayPal return/cancel redirects. */
  webUrl: string;
}

type RawEnv = Record<string, string | undefined>;

export function loadEnv(raw: RawEnv = process.env): ApiEnv {
  const nodeEnv = raw.NODE_ENV ?? 'development';
  const port = Number.parseInt(raw.API_PORT ?? raw.PORT ?? '4000', 10);
  const webUrl = normaliseOrigin(raw.WEB_URL ?? 'http://localhost:3100');
  const host = raw.API_HOST ?? raw.HOST ?? '127.0.0.1';

  const origins = (raw.CORS_ORIGINS ?? `${webUrl},http://localhost:3100,http://127.0.0.1:3100`)
    .split(',')
    .map((value) => normaliseOrigin(value))
    .filter(Boolean);

  return {
    nodeEnv,
    host,
    port: Number.isFinite(port) ? port : 4000,
    apiPublicUrl: normaliseOrigin(raw.API_PUBLIC_URL ?? `http://localhost:${port}`),
    databasePath: raw.DATABASE_PATH ?? './data/autopilot.sqlite',
    corsOrigins: origins,
    logLevel: raw.LOG_LEVEL ?? (nodeEnv === 'production' ? 'info' : 'info'),
    ...(raw.API_TOKEN ? { apiToken: raw.API_TOKEN } : {}),
    defaultCurrency: normaliseCurrency(raw.DEFAULT_CURRENCY),
    paypal: {
      ...(raw.PAYPAL_CLIENT_ID ? { clientId: raw.PAYPAL_CLIENT_ID } : {}),
      ...(raw.PAYPAL_CLIENT_SECRET ? { clientSecret: raw.PAYPAL_CLIENT_SECRET } : {}),
      environment: raw.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
    },
    channel3: {
      ...(raw.CHANNEL3_BASE_URL ? { baseUrl: raw.CHANNEL3_BASE_URL } : {}),
      ...(raw.CHANNEL3_API_KEY ? { apiKey: raw.CHANNEL3_API_KEY } : {}),
    },
    elastic: {
      ...(raw.ELASTIC_NODE ? { node: raw.ELASTIC_NODE } : {}),
      ...(raw.ELASTIC_API_KEY ? { apiKey: raw.ELASTIC_API_KEY } : {}),
      ...(raw.ELASTIC_INDEX ? { index: raw.ELASTIC_INDEX } : {}),
    },
    kernel: {
      ...(raw.KERNEL_BASE_URL ? { baseUrl: raw.KERNEL_BASE_URL } : {}),
      ...(raw.KERNEL_API_KEY ? { apiKey: raw.KERNEL_API_KEY } : {}),
    },
    zapier: {
      ...(raw.ZAPIER_HOOK_URL ? { hookUrl: raw.ZAPIER_HOOK_URL } : {}),
    },
    astropods: {
      ...(raw.ASTROPODS_ENDPOINT ? { endpoint: raw.ASTROPODS_ENDPOINT } : {}),
      ...(raw.ASTROPODS_API_KEY ? { apiKey: raw.ASTROPODS_API_KEY } : {}),
    },
    llm: {
      provider: raw.LLM_PROVIDER ?? 'none',
      ...(raw.LLM_BASE_URL ? { baseUrl: raw.LLM_BASE_URL } : {}),
      ...(raw.LLM_API_KEY ? { apiKey: raw.LLM_API_KEY } : {}),
      ...(raw.LLM_MODEL ? { model: raw.LLM_MODEL } : {}),
      ...(raw.LLM_TIMEOUT_MS ? { timeoutMs: raw.LLM_TIMEOUT_MS } : {}),
      enabled: Boolean(raw.LLM_API_KEY && raw.LLM_BASE_URL),
    },
    webUrl,
  };
}

/**
 * CORS origins are compared literally by the browser, so they need a scheme.
 * PaaS blueprints hand us a bare host (`trustlane-web.onrender.com` from
 * Render's `fromService` property), which would silently never match. Local
 * hosts default to http; everything else is assumed to be https.
 */
function normaliseOrigin(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}`;
}

function normaliseCurrency(value: string | undefined): ApiEnv['defaultCurrency'] {
  const upper = (value ?? 'USD').toUpperCase();
  const supported: ApiEnv['defaultCurrency'][] = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
  return supported.find((code) => code === upper) ?? 'USD';
}