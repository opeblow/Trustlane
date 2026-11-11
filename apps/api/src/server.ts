import { createHash, timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { loadEnv, type ApiEnv } from './env.ts';
import { createServices, type Services } from './services/container.ts';
import { errorHandler, registerRoutes } from './routes.ts';

export interface BuiltServer {
  app: FastifyInstance;
  services: Services;
  env: ApiEnv;
}

export async function buildServer(env: ApiEnv = loadEnv()): Promise<BuiltServer> {
  const services = createServices(env);
  const app = Fastify({
    logger: { level: env.logLevel },
    disableRequestLogging: false,
    bodyLimit: 2 * 1024 * 1024,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No route matches ${request.method} ${request.url}. See /api/openapi.json for the contract.`,
      },
    });
  });

  await app.register(cors, {
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.addHook('onRequest', async (request, reply) => {
    // Propagate the caller's correlation id so browser errors map to audit events.
    const header = request.headers['x-correlation-id'];
    const value = Array.isArray(header) ? header[0] : header;
    if (value && value.length >= 8) {
      void reply.header('x-correlation-id', value);
    }
    if (env.apiToken && request.url.startsWith('/api/') && !request.url.startsWith('/api/health')) {
      const auth = request.headers.authorization;
      const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
      if (!token || !sameSecret(token, env.apiToken)) {
        // SECURITY: must return after sending reply to stop further processing.
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'A valid API token is required.' },
        });
      }
    }
  });

  await registerRoutes(app, { services });
  return { app, services, env };
}

/** Constant-time comparison so the token cannot be recovered by timing requests. */
function sameSecret(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function startServer(env: ApiEnv = loadEnv()): Promise<BuiltServer> {
  const server = await buildServer(env);
  await server.app.listen({ host: env.host, port: env.port });
  server.app.log.info(
    {
      url: `http://${env.host}:${env.port}`,
      paymentMode: server.services.gateway.mode,
      catalog: server.services.catalog.description,
      database: server.services.store.path,
    },
    'Trustlane API ready',
  );

  // Finish in-flight requests and close SQLite cleanly when the platform stops
  // the process (Render sends SIGTERM on every deploy and restart).
  let stopping = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    server.app.log.info({ signal }, 'Shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.app
      .close()
      .catch(() => undefined)
      .finally(() => {
        try {
          server.services.close();
        } catch {
          /* already closed */
        }
        process.exit(0);
      });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

/** True only when this file is the process entry point (not when imported). */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const normalise = (value: string) => {
      const real = realpathSync(value);
      return process.platform === 'win32' ? real.toLowerCase() : real;
    };
    return normalise(entry) === normalise(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  startServer().catch((error: unknown) => {
    process.stderr.write(`Failed to start Trustlane API: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}