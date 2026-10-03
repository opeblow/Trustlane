import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export interface DatabaseOptions {
  /** Absolute path, relative path, or ':memory:' for tests. */
  path: string;
}

export interface AutopilotDatabase {
  db: DatabaseSync;
  path: string;
  close(): void;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS policies (
  id            TEXT PRIMARY KEY,
  version       INTEGER NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL,
  body          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intents (
  id            TEXT PRIMARY KEY,
  run_id        TEXT,
  status        TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  body          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intents_run ON intents(run_id);

CREATE TABLE IF NOT EXISTS runs (
  id              TEXT PRIMARY KEY,
  correlation_id  TEXT NOT NULL,
  intent_id       TEXT NOT NULL,
  status          TEXT NOT NULL,
  stage           TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  body            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_corr ON runs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  run_id        TEXT,
  intent_id     TEXT,
  provider      TEXT NOT NULL,
  price_minor   INTEGER NOT NULL,
  currency      TEXT NOT NULL,
  retrieved_at  TEXT NOT NULL,
  body          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_run ON products(run_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price_minor);

CREATE TABLE IF NOT EXISTS evaluations (
  id            TEXT PRIMARY KEY,
  run_id        TEXT,
  intent_id     TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  score         REAL NOT NULL,
  created_at    TEXT NOT NULL,
  body          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evaluations_run ON evaluations(run_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_product ON evaluations(product_id);

CREATE TABLE IF NOT EXISTS shortlists (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  intent_id     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  body          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shortlists_run ON shortlists(run_id);

CREATE TABLE IF NOT EXISTS plans (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  intent_id       TEXT NOT NULL,
  status          TEXT NOT NULL,
  total_minor     INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  plan_hash       TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  body            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_run ON plans(run_id);
CREATE INDEX IF NOT EXISTS idx_plans_hash ON plans(plan_hash);

CREATE TABLE IF NOT EXISTS approvals (
  id                TEXT PRIMARY KEY,
  plan_id           TEXT NOT NULL,
  run_id            TEXT NOT NULL,
  status            TEXT NOT NULL,
  plan_hash         TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  body              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_plan ON approvals(plan_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  plan_id           TEXT NOT NULL,
  run_id            TEXT NOT NULL,
  paypal_order_id   TEXT NOT NULL,
  status            TEXT NOT NULL,
  amount_minor      INTEGER NOT NULL,
  currency          TEXT NOT NULL,
  captured_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  body              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_plan ON payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_run ON payments(run_id);
CREATE INDEX IF NOT EXISTS idx_paypal_order ON payments(paypal_order_id);

CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  correlation_id  TEXT NOT NULL,
  run_id          TEXT,
  type            TEXT NOT NULL,
  severity        TEXT NOT NULL,
  actor           TEXT NOT NULL,
  source          TEXT NOT NULL,
  timestamp       TEXT NOT NULL,
  sequence        INTEGER NOT NULL,
  body            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_corr ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_seq ON events(correlation_id, sequence);

CREATE TABLE IF NOT EXISTS tool_calls (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  correlation_id  TEXT NOT NULL,
  tool            TEXT NOT NULL,
  status          TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  body            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id);

CREATE TABLE IF NOT EXISTS automations (
  id                TEXT PRIMARY KEY,
  trigger_event_id  TEXT NOT NULL,
  run_id            TEXT,
  plan_id           TEXT,
  status            TEXT NOT NULL,
  executed_at       TEXT NOT NULL,
  body              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automations_run ON automations(run_id);
CREATE INDEX IF NOT EXISTS idx_automations_plan ON automations(plan_id);

CREATE TABLE IF NOT EXISTS idempotency (
  key           TEXT NOT NULL,
  endpoint      TEXT NOT NULL,
  status_code   INTEGER NOT NULL,
  response      TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (key, endpoint)
);

CREATE TABLE IF NOT EXISTS run_counters (
  correlation_id  TEXT PRIMARY KEY,
  sequence        INTEGER NOT NULL
);
`;

export function openDatabase(options: DatabaseOptions): AutopilotDatabase {
  const { path: dbPath } = options;
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return {
    db,
    path: dbPath,
    close() {
      db.close();
    },
  };
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}