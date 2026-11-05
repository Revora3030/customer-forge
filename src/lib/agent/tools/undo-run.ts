/**
 * PAI-11 run-level undo: replay recorded inverses newest-first through the
 * same tool registry so audits and scopes still apply. Stops on the first
 * failure and reports how many steps were restored.
 */
import type { ToolContextV2, ToolInverse, ToolResultV2 } from "@/lib/ai/tool-registry-v2.server";
import type { createToolRegistryV2 } from "@/lib/ai/tool-registry-v2.server";

type Registry = ReturnType<typeof createToolRegistryV2>;

export type UndoRunResult = {
  restored: number;
  attempted: number;
  results: ToolResultV2[];
  stoppedAt: number | null;
  ok: boolean;
};

/**
 * @param inverses Chronological list of inverses from the run (oldest first).
 *                 Replayed in reverse so the last write is undone first.
 */
export async function undoRunWrites(
  registry: Registry,
  context: ToolContextV2,
  inverses: ToolInverse[],
): Promise<UndoRunResult> {
  const results: ToolResultV2[] = [];
  let restored = 0;
  const ordered = [...inverses].reverse();
  for (let i = 0; i < ordered.length; i += 1) {
    const step = ordered[i]!;
    const result = await registry.run(context, {
      name: step.tool,
      arguments: step.arguments,
      requestId: `undo-${i}-${step.tool}`,
    });
    results.push(result);
    if (!result.ok) {
      return { restored, attempted: ordered.length, results, stoppedAt: i, ok: false };
    }
    restored += 1;
  }
  return { restored, attempted: ordered.length, results, stoppedAt: null, ok: true };
}
