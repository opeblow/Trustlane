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
export declare const STAGES: StageDefinition[];
export declare function stageLabel(stage: RunStageT): string;
export declare function stageDescription(stage: RunStageT): string;
export declare function stageProgress(stage: RunStageT): number;
export declare function nextStage(stage: RunStageT): RunStageT;
export declare function isTerminal(status: RunStatusT): boolean;
export declare function isMoneyStage(stage: RunStageT): boolean;
/**
 * Legal stage transitions — used to reject out-of-order money movement.
 * A blocked or failed run moves to `done`; the reason lives on the run's
 * status and blockedReason, not in the stage graph.
 */
export declare const ALLOWED_TRANSITIONS: Record<RunStageT, RunStageT[]>;
export declare function canTransition(from: RunStageT, to: RunStageT): boolean;
//# sourceMappingURL=stages.d.ts.map