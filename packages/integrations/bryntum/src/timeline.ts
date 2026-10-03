import {
  ageInMinutes,
  type AuditEventT,
  type RunStageT,
} from '@autopilot/schemas';

export type TimelinePhase = 'discover' | 'decide' | 'policy' | 'approval' | 'payment' | 'verification' | 'automation';

export interface TimelineTask {
  id: string;
  name: string;
  phase: TimelinePhase;
  start: string;
  end: string;
  /** Fraction of the visible window, for the scheduler. */
  percentStart: number;
  percentEnd: number;
  durationLabel: string;
  status: 'complete' | 'in_progress' | 'failed' | 'blocked';
  eventIds: string[];
  actor: string;
  source: string;
  severity: 'info' | 'warn' | 'error';
  /** Milestones sit at zero duration on the timeline. */
  milestone: boolean;
}

export interface TimelineResource {
  id: string;
  name: string;
}

export interface TimelineModel {
  tasks: TimelineTask[];
  resources: TimelineResource[];
  start: string;
  end: string;
}

const PHASE_BY_EVENT: Record<string, TimelinePhase> = {
  'run.created': 'discover',
  'intent.created': 'discover',
  'catalog.search.started': 'discover',
  'catalog.search.completed': 'discover',
  'product.retrieved': 'discover',
  'product.evaluated': 'decide',
  'evidence.gap.detected': 'decide',
  'shortlist.created': 'decide',
  'policy.checked': 'policy',
  'policy.updated': 'policy',
  'plan.created': 'approval',
  'plan.invalidated': 'approval',
  'approval.requested': 'approval',
  'approval.granted': 'approval',
  'approval.denied': 'approval',
  'approval.expired': 'approval',
  'paypal.order.created': 'payment',
  'paypal.approval.completed': 'payment',
  'payment.captured': 'payment',
  'payment.failed': 'payment',
  'order.verified': 'verification',
  'automation.triggered': 'automation',
  'automation.failed': 'automation',
};

const PHASE_LABEL: Record<TimelinePhase, string> = {
  discover: 'Discovery',
  decide: 'Decision',
  policy: 'Policy',
  approval: 'Approval',
  payment: 'Payment',
  verification: 'Verification',
  automation: 'Automation',
};

export function phaseForEvent(type: string): TimelinePhase | null {
  return PHASE_BY_EVENT[type] ?? null;
}

/**
 * Build a Bryntum-Scheduler-shaped task model straight from audit events.
 *
 * The timeline is populated from real execution data (never hard-coded), and
 * the same model drives the built-in timeline component and the Bryntum
 * Scheduler when a license is configured.
 */
export function buildTimelineModel(events: AuditEventT[]): TimelineModel {
  const relevant = [...events]
    .filter((event) => phaseForEvent(event.type) !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sequence - b.sequence);

  if (relevant.length === 0) {
    return { tasks: [], resources: [], start: new Date().toISOString(), end: new Date(Date.now() + 60_000).toISOString() };
  }

  const timestamps = relevant.map((event) => Date.parse(event.timestamp)).filter((t) => !Number.isNaN(t));
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const span = Math.max(max - min, 1000);
  const pad = span * 0.05;
  const start = new Date(min - pad).toISOString();
  const end = new Date(max + pad).toISOString();
  const total = Math.max(1, Date.parse(end) - Date.parse(start));

  const tasks: TimelineTask[] = relevant.map((event) => {
    const phase = phaseForEvent(event.type)!;
    const t = Date.parse(event.timestamp);
    const milestone = event.type.endsWith('.completed') || event.type.includes('.requested');
    const duration = milestone ? 0 : Math.max(span * 0.02, 60_000);
    const percentStart = ((t - Date.parse(start)) / total) * 100;
    const percentEnd = Math.min(100, ((t + duration - Date.parse(start)) / total) * 100);
    return {
      id: event.id,
      name: labelForEvent(event.type),
      phase,
      start: event.timestamp,
      end: new Date(t + duration).toISOString(),
      percentStart: round2(Math.max(0, percentStart)),
      percentEnd: round2(Math.max(percentStart + 0.5, percentEnd)),
      durationLabel: durationLabel(event.timestamp, duration, milestone),
      status:
        event.severity === 'error'
          ? 'failed'
          : event.type.includes('denied')
            ? 'blocked'
            : event.severity === 'warn'
              ? 'in_progress'
              : 'complete',
      eventIds: [event.id],
      actor: event.actor,
      source: event.source,
      severity: event.severity,
      milestone,
    };
  });

  const resources: TimelineResource[] = [...new Set(relevant.map((event) => event.source))].map((source) => ({
    id: source,
    name: source,
  }));

  return { tasks, resources, start, end };
}

export function phaseSummary(model: TimelineModel): Array<{ phase: TimelinePhase; label: string; count: number; failed: number }> {
  const phases: TimelinePhase[] = ['discover', 'decide', 'policy', 'approval', 'payment', 'verification', 'automation'];
  return phases.map((phase) => {
    const tasks = model.tasks.filter((task) => task.phase === phase);
    return {
      phase,
      label: PHASE_LABEL[phase],
      count: tasks.length,
      failed: tasks.filter((task) => task.status === 'failed').length,
    };
  });
}

export function stageToPhase(stage: RunStageT): TimelinePhase {
  switch (stage) {
    case 'intent':
    case 'discover':
      return 'discover';
    case 'evaluate':
    case 'decide':
      return 'decide';
    case 'policy':
    case 'prepare':
    case 'approve':
      return 'approval';
    case 'pay':
      return 'payment';
    case 'verify':
      return 'verification';
    case 'automate':
      return 'automation';
    default:
      return 'discover';
  }
}

export function timeSinceLabel(iso: string, now = new Date()): string {
  const minutes = ageInMinutes(iso, now);
  if (!Number.isFinite(minutes)) return 'unknown';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function labelForEvent(type: string): string {
  const map: Record<string, string> = {
    'run.created': 'Run started',
    'intent.created': 'Intent interpreted',
    'catalog.search.started': 'Catalog search started',
    'catalog.search.completed': 'Catalog search finished',
    'product.retrieved': 'Candidates retrieved',
    'product.evaluated': 'Candidates evaluated',
    'evidence.gap.detected': 'Evidence gap detected',
    'shortlist.created': 'Shortlist created',
    'policy.checked': 'Policy evaluated',
    'policy.updated': 'Policy updated',
    'plan.created': 'Purchase plan created',
    'plan.invalidated': 'Plan invalidated',
    'approval.requested': 'Approval requested',
    'approval.granted': 'Approval granted',
    'approval.denied': 'Approval denied',
    'approval.expired': 'Approval expired',
    'paypal.order.created': 'PayPal order created',
    'paypal.approval.completed': 'PayPal approval completed',
    'payment.captured': 'Payment captured',
    'payment.failed': 'Payment failed',
    'order.verified': 'Order verified',
    'automation.triggered': 'Automation triggered',
    'automation.failed': 'Automation failed',
  };
  return map[type] ?? type;
}

function durationLabel(startIso: string, durationMs: number, milestone: boolean): string {
  if (milestone) return 'milestone';
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.round(durationMs / 60_000)}m`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}