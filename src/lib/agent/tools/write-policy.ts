/**
 * PAI-11 policy: when a run may use model-callable writeInternalTools.
 *
 * Routine-source runs and no_external_actions runs are promised read-only with
 * no outside contact (#829 weekly_digest / site_refresh). Write tools must not
 * appear in those runs — send_external is already gated by PAI-4, but
 * write_internal would otherwise run immediately.
 */
import type { AgentRun } from "@/lib/agent/run-store.server";
import { writeInternalTools } from "./write-internal";

/** Names of the model-callable PAI-11 write tools (not undo helpers). */
export function writeInternalToolNames(): Set<string> {
  return new Set(writeInternalTools().map((tool) => tool.name));
}

function checkpointSendPolicy(checkpoint: Record<string, unknown> | null | undefined): string | null {
  const routine = checkpoint?.["routine"];
  if (!routine || typeof routine !== "object" || Array.isArray(routine)) return null;
  const policy = (routine as Record<string, unknown>)["send_policy"];
  return typeof policy === "string" ? policy : null;
}

/** False for routine-source runs and for no_external_actions (checkpoint.routine.send_policy). */
export function runAllowsWriteInternalTools(
  run: Pick<AgentRun, "source" | "checkpoint">,
): boolean {
  if (run.source === "routine") return false;
  if (checkpointSendPolicy(run.checkpoint) === "no_external_actions") return false;
  return true;
}
