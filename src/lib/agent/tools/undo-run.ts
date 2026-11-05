/**
 * PAI-11 run-level undo: replay recorded inverses newest-first.
 *
 * Uses writeInternalAllTools (public writes + undo-only helpers) so helpers like
 * leads.restore_notes and leads.delete_task stay internal here and are never
 * listed to the model via agentTools. Stops on the first failure and reports
 * how many steps were restored.
 */
import type { z } from "zod";
import type {
  ToolContextV2,
  ToolDefinitionV2,
  ToolInverse,
  ToolResultV2,
} from "@/lib/ai/tool-registry-v2.server";
import type { createToolRegistryV2 } from "@/lib/ai/tool-registry-v2.server";
import { writeInternalAllTools } from "./write-internal";

type Registry = ReturnType<typeof createToolRegistryV2>;

export type UndoRunResult = {
  restored: number;
  attempted: number;
  results: ToolResultV2[];
  stoppedAt: number | null;
  ok: boolean;
};

function fail(
  tool: string,
  reason: "unknown_tool" | "invalid_input" | "failed",
  error: string,
  risk: "read" | "write_internal" | "send_external" | null,
  durationMs: number,
): ToolResultV2 {
  return { ok: false, tool, risk, reason, error, durationMs };
}

async function runInverseTool(
  tool: ToolDefinitionV2<z.ZodType>,
  context: ToolContextV2,
  args: unknown,
  requestId: string,
): Promise<ToolResultV2> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  void requestId;
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first && first.path.length > 0 ? `"${first.path.join(".")}": ` : "";
    return fail(
      tool.name,
      "invalid_input",
      `${where}${first?.message ?? "Invalid arguments."}`,
      tool.risk,
      elapsed(),
    );
  }
  try {
    const data = await tool.run(parsed.data, context);
    return {
      ok: true,
      tool: tool.name,
      risk: tool.risk,
      data,
      durationMs: elapsed(),
      idempotencyKey: null,
      replayed: false,
      inverse: null,
    };
  } catch (error) {
    return fail(
      tool.name,
      "failed",
      (error as Error)?.message || "That step failed.",
      tool.risk,
      elapsed(),
    );
  }
}

/**
 * @param registry Kept for call-site compatibility; undo resolves tools from
 *                 writeInternalAllTools so helpers need not be agent-registered.
 * @param inverses Chronological list of inverses from the run (oldest first).
 *                 Replayed in reverse so the last write is undone first.
 */
export async function undoRunWrites(
  registry: Registry,
  context: ToolContextV2,
  inverses: ToolInverse[],
): Promise<UndoRunResult> {
  void registry;
  const byName = new Map(writeInternalAllTools().map((tool) => [tool.name, tool]));
  const results: ToolResultV2[] = [];
  let restored = 0;
  const ordered = [...inverses].reverse();
  for (let i = 0; i < ordered.length; i += 1) {
    const step = ordered[i]!;
    const tool = byName.get(step.tool);
    const result = tool
      ? await runInverseTool(tool, context, step.arguments, `undo-${i}-${step.tool}`)
      : fail(step.tool, "unknown_tool", "That tool isn't available to Revora AI.", null, 0);
    results.push(result);
    if (!result.ok) {
      return { restored, attempted: ordered.length, results, stoppedAt: i, ok: false };
    }
    restored += 1;
  }
  return { restored, attempted: ordered.length, results, stoppedAt: null, ok: true };
}
