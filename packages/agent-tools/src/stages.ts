import type { RunStageT, RunStatusT } from '@autopilot/schemas';

export interface StageDefinition {
  stage: RunStageT;
  label: string;
  /** Progress weight used for the run progress bar. */
  weight: number;
  /** Human-readable description surfaced in the UI timeline. */
  description: string;
  /** Whether the run must stop here and wait for a human. */
  humanGate: boolean;
}

export const STAGES: StageDefinition[] = [
  { stage: 'intent', label: 'Interpret intent', weight: 1, description: 'Turn the request into structured constraints.', humanGate: false },
  { stage: 'discover', label: 'Discover candidates', weight: 2, description: 'Query the catalog provider and normalise results.', humanGate: false },
  { stage: 'evaluate', label: 'Evaluate evidence', weight: 2, description: 'Compare attributes and record evidence gaps.', humanGate: false },
  { stage: 'decide', label: 'Build shortlist', weight: 1, description: 'Rank candidates with an explicit, deterministic score.', humanGate: false },
  { stage: 'policy', label: 'Check policy', weight: 1, description: 'Evaluate money rules deterministically.', humanGate: false },
  { stage: 'prepare', label: 'Prepare purchase plan', weight: 1, description: 'Assemble line items, totals and risk flags.', humanGate: false },
  { stage: 'approve', label: 'Await approval', weight: 1, description: 'Explicit human authorisation is required.', humanGate: true },
  { stage: 'pay', label: 'Execute payment', weight: 1, description: 'Create and capture the PayPal order.', humanGate: false },
  { stage: 'verify', label: 'Verify transaction', weight: 1, description: 'Confirm final order/payment state independently.', humanGate: false },
  { stage: 'automate', label: 'Trigger automation', weight: 1, description: 'Fire post-purchase webhook on verified state.', humanGate: false },
  { stage: 'audit', label: 'Record audit trail', weight: 1, description: 'Finalise the decision/audit chain.', humanGate: false },
  { stage: 'done', label: 'Complete', weight: 0, description: 'Run finished.', humanGate: false },
];

const TOTAL_WEIGHT = STAGES.filter((s) => s.stage !== 'done').reduce((acc, s) => acc + s.weight, 0);

export function stageLabel(stage: RunStageT): string {
  return STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

export function stageDescription(stage: RunStageT): string {
  return STAGES.find((s) => s.stage === stage)?.description ?? '';
}

export function stageProgress(stage: RunStageT): number {
  let consumed = 0;
  for (const definition of STAGES) {
    if (definition.stage === 'done') break;
    if (definition.stage === stage) {
      return Math.min(1, consumed / TOTAL_WEIGHT);
    }
    consumed += definition.weight;
  }
  return 1;
}

export function nextStage(stage: RunStageT): RunStageT {
  const index = STAGES.findIndex((s) => s.stage === stage);
  return STAGES[Math.min(STAGES.length - 1, index + 1)]?.stage ?? 'done';
}

export function isTerminal(status: RunStatusT): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function isMoneyStage(stage: RunStageT): boolean {
  return stage === 'pay' || stage === 'verify' || stage === 'automate';
}

/**
 * Legal stage transitions — used to reject out-of-order money movement.
 * A blocked or failed run moves to `done`; the reason lives on the run's
 * status and blockedReason, not in the stage graph.
 */
export const ALLOWED_TRANSITIONS: Record<RunStageT, RunStageT[]> = {
  intent: ['discover', 'done'],
  discover: ['evaluate', 'done'],
  evaluate: ['decide', 'done'],
  decide: ['policy', 'done'],
  policy: ['prepare', 'done'],
  prepare: ['approve', 'policy', 'done'],
  approve: ['pay', 'prepare', 'done'],
  pay: ['verify', 'done'],
  verify: ['automate', 'audit', 'done'],
  automate: ['audit', 'done'],
  audit: ['done'],
  done: [],
};

export function canTransition(from: RunStageT, to: RunStageT): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}