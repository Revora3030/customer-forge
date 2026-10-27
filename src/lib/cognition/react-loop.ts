/**
 * Pillar 1 (Brain): a bounded Reason -> Act -> Observe loop with reflexion.
 * The model call and the tools are injected, so the loop itself spends nothing
 * and every limit is enforced here rather than trusted to a prompt.
 */
export type LoopAction =
  | { type: "tool"; tool: string; input: unknown; thought?: string }
  | { type: "final"; answer: string; thought?: string };

export type LoopStep =
  | { kind: "action"; step: number; action: LoopAction }
  | { kind: "observation"; step: number; tool: string; ok: boolean; output: string }
  | { kind: "reflection"; step: number; note: string };

export type LoopTool = (input: unknown) => Promise<string>;

export type LoopLimits = {
  /** Reasoning turns, including the final one. */
  maxSteps: number;
  /** Consecutive failing tool calls before the loop gives up instead of flailing. */
  maxConsecutiveErrors: number;
  /** Observation text kept per step, so one tool cannot flood the context. */
  maxObservationChars: number;
};

export const DEFAULT_LOOP_LIMITS: LoopLimits = { maxSteps: 8, maxConsecutiveErrors: 2, maxObservationChars: 2000 };

export type LoopResult =
  | { status: "answered"; answer: string; trace: LoopStep[] }
  | { status: "stopped"; reason: "max_steps" | "repeated_errors" | "aborted" | "unknown_tool_limit"; trace: LoopStep[] };

export async function runReActLoop(input: {
  think: (trace: readonly LoopStep[]) => Promise<LoopAction>;
  tools: Readonly<Record<string, LoopTool>>;
  limits?: Partial<LoopLimits>;
  signal?: AbortSignal;
}): Promise<LoopResult> {
  const limits = { ...DEFAULT_LOOP_LIMITS, ...input.limits };
  const trace: LoopStep[] = [];
  let consecutiveErrors = 0;
  let unknownTools = 0;

  for (let step = 1; step <= limits.maxSteps; step += 1) {
    if (input.signal?.aborted) return { status: "stopped", reason: "aborted", trace };
    const action = await input.think(trace);
    trace.push({ kind: "action", step, action });
    if (action.type === "final") return { status: "answered", answer: action.answer, trace };

    const tool = Object.hasOwn(input.tools, action.tool) ? input.tools[action.tool] : undefined;
    if (!tool) {
      unknownTools += 1;
      trace.push({ kind: "observation", step, tool: action.tool, ok: false, output: `Unknown tool "${action.tool}". Available: ${Object.keys(input.tools).join(", ") || "none"}.` });
      trace.push({ kind: "reflection", step, note: "That tool does not exist; choose one that is listed or answer without it." });
      if (unknownTools > 1) return { status: "stopped", reason: "unknown_tool_limit", trace };
      continue;
    }
    try {
      const output = String(await tool(action.input)).slice(0, limits.maxObservationChars);
      consecutiveErrors = 0;
      trace.push({ kind: "observation", step, tool: action.tool, ok: true, output });
    } catch (error) {
      consecutiveErrors += 1;
      const message = (error instanceof Error ? error.message : "tool failed").slice(0, limits.maxObservationChars);
      trace.push({ kind: "observation", step, tool: action.tool, ok: false, output: message });
      // Reflexion: the exact error goes back so the next turn can change approach instead of repeating it.
      trace.push({ kind: "reflection", step, note: `"${action.tool}" failed with: ${message}. Form a different approach before retrying.` });
      if (consecutiveErrors >= limits.maxConsecutiveErrors) return { status: "stopped", reason: "repeated_errors", trace };
    }
  }
  return { status: "stopped", reason: "max_steps", trace };
}
