import { newId, nowIso, toMinorUnits, } from '@autopilot/schemas';
import { fromJson, openDatabase, toJson } from "./database.js";
import { EventEmitter } from 'node:events';
/**
 * Single store used by the API. Everything is persisted in SQLite (node:sqlite),
 * so the audit trail survives restarts and the product behaves like a real
 * service rather than an in-memory demo.
 */
export class AutopilotStore {
    database;
    /** Emits `event` (AuditEvent) and `run` (Run) for SSE streaming. */
    bus = new EventEmitter();
    constructor(options) {
        this.database = openDatabase({ path: options.databasePath });
    }
    get path() {
        return this.database.path;
    }
    close() {
        this.database.close();
    }
    exec(sql, ...params) {
        return this.database.db.prepare(sql).run(...params);
    }
    all(sql, ...params) {
        return this.database.db.prepare(sql).all(...params);
    }
    get(sql, ...params) {
        return this.database.db.prepare(sql).get(...params);
    }
    // ---------------------------------------------------------------- policies
    savePolicy(policy) {
        this.exec(`INSERT INTO policies (id, version, is_active, updated_at, body)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET version = excluded.version,
         is_active = 1, updated_at = excluded.updated_at, body = excluded.body`, policy.id, policy.version, policy.updatedAt, toJson(policy));
        return policy;
    }
    getPolicy(id) {
        const row = this.get('SELECT body FROM policies WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    getActivePolicy() {
        const row = this.get('SELECT body FROM policies WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1');
        return row ? fromJson(row.body, undefined) : undefined;
    }
    listPolicies() {
        return this.all('SELECT body FROM policies ORDER BY updated_at DESC').map((r) => fromJson(r.body, {}));
    }
    deactivatePolicies() {
        this.exec('UPDATE policies SET is_active = 0');
    }
    // ----------------------------------------------------------------- intents
    saveIntent(intent) {
        this.exec(`INSERT INTO intents (id, run_id, status, created_at, body)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, body = excluded.body`, intent.id, intent.runId ?? null, intent.status, intent.createdAt, toJson(intent));
        return intent;
    }
    getIntent(id) {
        const row = this.get('SELECT body FROM intents WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    // -------------------------------------------------------------------- runs
    saveRun(run) {
        this.exec(`INSERT INTO runs (id, correlation_id, intent_id, status, stage, created_at, updated_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, stage = excluded.stage,
         updated_at = excluded.updated_at, body = excluded.body`, run.id, run.correlationId, run.intentId, run.status, run.stage, run.createdAt, run.updatedAt, toJson(run));
        this.bus.emit('run', run);
        return run;
    }
    getRun(id) {
        const row = this.get('SELECT body FROM runs WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    listRuns(limit = 20) {
        return this.all('SELECT body FROM runs ORDER BY created_at DESC LIMIT ?', limit).map((r) => fromJson(r.body, {}));
    }
    // ---------------------------------------------------------------- products
    saveProduct(product, context = {}) {
        this.exec(`INSERT INTO products (id, run_id, intent_id, provider, price_minor, currency, retrieved_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET run_id = excluded.run_id, intent_id = excluded.intent_id,
         price_minor = excluded.price_minor, currency = excluded.currency,
         retrieved_at = excluded.retrieved_at, body = excluded.body`, product.id, context.runId ?? null, context.intentId ?? null, product.provider, toMinorUnits(product.price.amount), product.price.currency, product.retrievedAt, toJson(product));
        return product;
    }
    getProduct(id) {
        const row = this.get('SELECT body FROM products WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    listProductsByRun(runId) {
        return this.all('SELECT body FROM products WHERE run_id = ? ORDER BY retrieved_at ASC', runId).map((r) => fromJson(r.body, {}));
    }
    // ------------------------------------------------------------- evaluations
    saveEvaluation(evaluation, runId) {
        this.exec(`INSERT INTO evaluations (id, run_id, intent_id, product_id, score, created_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET score = excluded.score, body = excluded.body`, evaluation.id, runId ?? null, evaluation.intentId, evaluation.productId, evaluation.score, evaluation.createdAt, toJson(evaluation));
        return evaluation;
    }
    listEvaluationsByRun(runId) {
        return this.all('SELECT body FROM evaluations WHERE run_id = ? ORDER BY score DESC', runId).map((r) => fromJson(r.body, {}));
    }
    // -------------------------------------------------------------- shortlists
    saveShortlist(shortlist) {
        this.exec(`INSERT INTO shortlists (id, run_id, intent_id, created_at, body)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET body = excluded.body`, shortlist.id, shortlist.runId, shortlist.intentId, shortlist.createdAt, toJson(shortlist));
        return shortlist;
    }
    getShortlistByRun(runId) {
        const row = this.get('SELECT body FROM shortlists WHERE run_id = ? ORDER BY created_at DESC LIMIT 1', runId);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    // ------------------------------------------------------------------- plans
    savePlan(plan) {
        this.exec(`INSERT INTO plans (id, run_id, intent_id, status, total_minor, currency, plan_hash, created_at, updated_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, total_minor = excluded.total_minor,
         plan_hash = excluded.plan_hash, updated_at = excluded.updated_at, body = excluded.body`, plan.id, plan.runId, plan.intentId, plan.status, toMinorUnits(plan.total.amount), plan.total.currency, plan.planHash, plan.createdAt, plan.updatedAt, toJson(plan));
        return plan;
    }
    getPlan(id) {
        const row = this.get('SELECT body FROM plans WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    listPlansByRun(runId) {
        return this.all('SELECT body FROM plans WHERE run_id = ? ORDER BY created_at DESC', runId).map((r) => fromJson(r.body, {}));
    }
    // --------------------------------------------------------------- approvals
    saveApproval(approval) {
        this.exec(`INSERT INTO approvals (id, plan_id, run_id, status, plan_hash, created_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, body = excluded.body`, approval.id, approval.purchasePlanId, approval.runId, approval.status, approval.authorizationScope.planHash, approval.requestedAt, toJson(approval));
        return approval;
    }
    getApproval(id) {
        const row = this.get('SELECT body FROM approvals WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    getApprovalByPlan(planId) {
        const row = this.get('SELECT body FROM approvals WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1', planId);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    // ---------------------------------------------------------------- payments
    savePayment(payment) {
        this.exec(`INSERT INTO payments (id, plan_id, run_id, paypal_order_id, status, amount_minor, currency, captured_at, created_at, updated_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, captured_at = excluded.captured_at,
         updated_at = excluded.updated_at, body = excluded.body`, payment.id, payment.purchasePlanId, payment.runId, payment.paypalOrderId, payment.status, toMinorUnits(payment.amount.amount), payment.currency, payment.capturedAt ?? null, payment.createdAt, payment.updatedAt, toJson(payment));
        return payment;
    }
    getPayment(id) {
        const row = this.get('SELECT body FROM payments WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    getPaymentByPlan(planId) {
        const row = this.get('SELECT body FROM payments WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1', planId);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    listPaymentsByRun(runId) {
        return this.all('SELECT body FROM payments WHERE run_id = ? ORDER BY created_at DESC', runId).map((r) => fromJson(r.body, {}));
    }
    /** Sum of captured amounts inside the rolling window — used by the daily limit. */
    spentSince(sinceIso, currency) {
        const row = this.get(`SELECT SUM(amount_minor) AS total FROM payments
       WHERE captured_at IS NOT NULL AND captured_at >= ? AND currency = ?`, sinceIso, currency);
        return (row?.total ?? 0) / 100;
    }
    // ------------------------------------------------------------------ events
    nextSequence(correlationId) {
        this.exec(`INSERT INTO run_counters (correlation_id, sequence) VALUES (?, 1)
       ON CONFLICT(correlation_id) DO UPDATE SET sequence = sequence + 1`, correlationId);
        const row = this.get('SELECT sequence FROM run_counters WHERE correlation_id = ?', correlationId);
        return row?.sequence ?? 1;
    }
    appendEvent(input) {
        const sequence = this.nextSequence(input.correlationId);
        const event = {
            id: newId('evt'),
            correlationId: input.correlationId,
            runId: input.runId ?? null,
            type: input.type,
            actor: input.actor,
            source: input.source,
            payload: input.payload ?? {},
            timestamp: input.timestamp ?? nowIso(),
            severity: input.severity ?? 'info',
            sequence,
        };
        this.exec(`INSERT INTO events (id, correlation_id, run_id, type, severity, actor, source, timestamp, sequence, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, event.id, event.correlationId, event.runId, event.type, event.severity, event.actor, event.source, event.timestamp, event.sequence, toJson(event));
        this.bus.emit('event', event);
        return event;
    }
    queryEvents(filters = {}) {
        const where = [];
        const params = [];
        if (filters.correlationId) {
            where.push('correlation_id = ?');
            params.push(filters.correlationId);
        }
        if (filters.runId) {
            where.push('run_id = ?');
            params.push(filters.runId);
        }
        if (filters.types?.length) {
            where.push(`type IN (${filters.types.map(() => '?').join(',')})`);
            params.push(...filters.types);
        }
        if (filters.severities?.length) {
            where.push(`severity IN (${filters.severities.map(() => '?').join(',')})`);
            params.push(...filters.severities);
        }
        if (filters.since) {
            where.push('timestamp >= ?');
            params.push(filters.since);
        }
        if (filters.until) {
            where.push('timestamp <= ?');
            params.push(filters.until);
        }
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const total = this.get(`SELECT COUNT(*) AS c FROM events ${clause}`, ...params)?.c ?? 0;
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        const rows = this.all(`SELECT body FROM events ${clause} ORDER BY timestamp DESC, sequence DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
        return { total, events: rows.map((r) => fromJson(r.body, {})) };
    }
    getEvent(id) {
        const row = this.get('SELECT body FROM events WHERE id = ?', id);
        return row ? fromJson(row.body, undefined) : undefined;
    }
    // -------------------------------------------------------------- tool calls
    saveToolCall(record) {
        this.exec(`INSERT INTO tool_calls (id, run_id, correlation_id, tool, status, started_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, body = excluded.body`, record.id, record.runId, record.correlationId, record.tool, record.status, record.startedAt, toJson(record));
        return record;
    }
    listToolCalls(runId) {
        return this.all('SELECT body FROM tool_calls WHERE run_id = ? ORDER BY started_at ASC', runId).map((r) => fromJson(r.body, {}));
    }
    // ------------------------------------------------------------- automations
    saveAutomation(automation) {
        this.exec(`INSERT INTO automations (id, trigger_event_id, run_id, plan_id, status, executed_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, body = excluded.body`, automation.id, automation.triggerEventId, automation.runId ?? null, automation.purchasePlanId ?? null, automation.status, automation.executedAt, toJson(automation));
        return automation;
    }
    listAutomationsByRun(runId) {
        return this.all('SELECT body FROM automations WHERE run_id = ? ORDER BY executed_at ASC', runId).map((r) => fromJson(r.body, {}));
    }
    listAutomations(limit = 50) {
        return this.all('SELECT body FROM automations ORDER BY executed_at DESC LIMIT ?', limit).map((r) => fromJson(r.body, {}));
    }
    // ------------------------------------------------------------ idempotency
    findIdempotent(key, endpoint) {
        const row = this.get('SELECT status_code, response FROM idempotency WHERE key = ? AND endpoint = ?', key, endpoint);
        if (!row)
            return undefined;
        return { statusCode: row.status_code, response: fromJson(row.response, null) };
    }
    saveIdempotent(key, endpoint, statusCode, response) {
        this.exec(`INSERT INTO idempotency (key, endpoint, status_code, response, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key, endpoint) DO NOTHING`, key, endpoint, statusCode, toJson(response), nowIso());
    }
    // ------------------------------------------------------------------ health
    healthCheck() {
        try {
            this.get('SELECT 1 AS ok');
            return true;
        }
        catch {
            return false;
        }
    }
}
export function createStore(options) {
    return new AutopilotStore(options);
}
//# sourceMappingURL=store.js.map