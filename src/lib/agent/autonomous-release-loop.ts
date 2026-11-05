export type ReleasePhase = "plan" | "build" | "inspect" | "verify" | "repair" | "reinspect" | "publish";
export type EvidenceLevel = "deterministic" | "runtime" | "human";
export interface ReleaseObservation { phase: ReleasePhase; passed: boolean; evidence: EvidenceLevel; failures: string[]; repairable: string[]; }
export interface ReleaseLoopInput {
  requestedActions: number;
  destructive: boolean;
  runtimeAvailable: boolean;
  browserAvailable: boolean;
  productionTarget: boolean;
  maxRepairCycles?: number;
  /** Billing, account-level or legal actions — always need a human. */
  accountOrBilling?: boolean;
}
export interface ReleaseLoopDecision { phases: ReleasePhase[]; maxRepairCycles: number; requiresApproval: boolean; blockedReasons: string[]; }

/**
 * Approval is a safety gate, never a creative gate: ordinary creative work
 * (restyle, restructure, recompose, reorder) runs without owner sign-off.
 * Only destructive, billing or account-level actions need a human.
 */
export function planAutonomousReleaseLoop(input: ReleaseLoopInput): ReleaseLoopDecision {
  const maxRepairCycles = Math.max(0, Math.min(input.maxRepairCycles ?? 3, 5));
  const blockedReasons: string[] = [];
  if (input.requestedActions > 100) blockedReasons.push("plan exceeds bounded action budget");
  if (input.destructive && input.productionTarget) blockedReasons.push("destructive production changes require explicit approval");
  if (!input.runtimeAvailable) blockedReasons.push("runtime evidence unavailable");
  if (!input.browserAvailable) blockedReasons.push("browser evidence unavailable");
  return {
    phases: ["plan", "build", "inspect", "verify", "repair", "reinspect", "publish"],
    maxRepairCycles,
    requiresApproval: input.destructive || input.accountOrBilling === true,
    blockedReasons,
  };
}
export function shouldRepair(observation: ReleaseObservation): boolean {
  return !observation.passed && observation.repairable.length > 0;
}
