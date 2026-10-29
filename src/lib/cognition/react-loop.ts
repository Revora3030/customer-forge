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

/**
 * The same reflexion rule for a round that ran several tools at once (Jarvis batches its read actions).
 * Failures go back with an instruction to change approach; a second all-failed round in a row ends the
 * loop so a broken tool cannot burn model calls.
 */
/**
 * Said to the model with the results before its last round. The last round runs
 * no actions, so a model that asks for more there leaves no answer at all: the
 * owner then got "the model roster returned an empty answer" after four rounds of
 * lookups (seen in Jarvis on 10-29).
 */
export const FINAL_ROUND_NOTE =
  "This is your last turn: no more actions will run. Answer the owner now in plain text from the results above, and say plainly what you could not check. Do not request actions.";

/** True when the round after `step` is the last one the loop runs (or the loop gave up). */
export function nextRoundIsFinal(step: number, maxSteps: number, giveUp: boolean): boolean {
  return giveUp || step + 1 >= maxSteps;
}

export function reflectOnRound(
  results: readonly { label: string; ok: boolean; result: string }[],
  consecutiveFailedRounds: number,
  maxConsecutiveFailedRounds: number = DEFAULT_LOOP_LIMITS.maxConsecutiveErrors,
): { note: string | null; failedRounds: number; giveUp: boolean } {
  const failed = results.filter((item) => !item.ok);
  const allFailed = results.length > 0 && failed.length === results.length;
  const failedRounds = allFailed ? consecutiveFailedRounds + 1 : 0;
  if (failed.length === 0) return { note: null, failedRounds, giveUp: false };
  const giveUp = failedRounds >= maxConsecutiveFailedRounds;
  const names = failed.map((item) => item.label).join(", ");
  const note = giveUp
    ? `Every check failed again (${names}). Stop calling tools: answer with what you already know and say plainly what could not be checked.`
    : `Failed: ${names}. Do not repeat the same call. Try a different tool or arguments, or answer and say what could not be checked.`;
  return { note, failedRounds, giveUp };
}
