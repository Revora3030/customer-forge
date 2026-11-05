/**
 * PAI-11 run-level undo: replay recorded inverses newest-first.
 *
 * Runs through a private tool registry (audit rows + PAI-5 limits, same as
 * normal writes) that also holds the undo-only helpers; those helpers are
 * never listed to the model via agentTools. Stops on the first failure and
 * reports how many steps were restored.
 */
import type { LimitsDeps } from "@/lib/agent/limits.server";
import {
  createToolRegistryV2,
  type ToolContextV2,
  type ToolInverse,
  type ToolResultV2,
  type ToolRunDeps,
} from "@/lib/ai/tool-registry-v2.server";
import { withAgentLimits } from "./guard";
import { writeInternalAllTools } from "./write-internal";

export type UndoRunResult = {
  restored: number;
  attempted: number;
  results: ToolResultV2[];
  stoppedAt: number | null;
  ok: boolean;
};

export type UndoRunDeps = {
  /** Audit sink, approvals, etc. for the undo registry (defaults to the real audit table). */
  registry?: ToolRunDeps;
  /** PAI-5 limits; undo writes are wrapped exactly like the forward writes. */
  limits?: LimitsDeps;
};

/**
 * A private registry for undo: public writes plus the undo-only helpers, with
 * the same audit sink and limits as normal writes. It is built per call and
 * never returned, so the helpers stay out of agentTools / writeInternalTools()
 * and are never listed to the model.
 */
function undoRegistry(deps: UndoRunDeps) {
  return createToolRegistryV2(
    withAgentLimits(writeInternalAllTools(), deps.limits),
    deps.registry ?? {},
  );
}

/**
 * @param inverses Chronological list of inverses from the run (oldest first).
 *                 Replayed in reverse so the last write is undone first.
 */
export async function undoRunWrites(
  context: ToolContextV2,
  inverses: ToolInverse[],
  deps: UndoRunDeps = {},
): Promise<UndoRunResult> {
  const registry = undoRegistry(deps);
  const results: ToolResultV2[] = [];
  let restored = 0;
  const ordered = [...inverses].reverse();
  for (let i = 0; i < ordered.length; i += 1) {
    const step = ordered[i]!;
    const result = await registry.run(context, {
      name: step.tool,
      arguments: step.arguments,
      requestId: `undo-${i}-${step.tool}`,
      // Distinct key so an undo is never deduped against the forward write.
      idempotencyKey: `undo:${context.runId ?? "run"}:${i}:${step.tool}`,
    });
    results.push(result);
    if (!result.ok) {
      return { restored, attempted: ordered.length, results, stoppedAt: i, ok: false };
    }
    restored += 1;
  }
  return { restored, attempted: ordered.length, results, stoppedAt: null, ok: true };
}
