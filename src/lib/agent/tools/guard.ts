/**
 * Routes agent tools through the PAI-5 guards (#559): the global and workspace
 * kill switches and the per-minute tool-call limit. A paused or switched-off
 * workspace gets the plain refusal message instead of data. Fail-closed: if the
 * limits can't be read, checkToolCall refuses.
 */
import type { z } from "zod";
import type { ToolDefinitionV2 } from "@/lib/ai/tool-registry-v2.server";
import { checkToolCall, supabaseLimitsDeps, type LimitsDeps } from "@/lib/agent/limits.server";

export function withAgentLimits(
  tools: ToolDefinitionV2<z.ZodType>[],
  limits?: LimitsDeps,
): ToolDefinitionV2<z.ZodType>[] {
  let deps = limits;
  return tools.map((tool) => ({
    ...tool,
    run: async (input, context) => {
      deps ??= supabaseLimitsDeps();
      const gate = await checkToolCall(context.organizationId, deps);
      if (!gate.ok) throw new Error(gate.message);
      return tool.run(input, context);
    },
  }));
}
