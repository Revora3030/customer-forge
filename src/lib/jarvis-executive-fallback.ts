import type { AiErrorCategory } from "@/lib/ai/errors";

/** The category of a thrown Revora AI error when Jarvis has a dedicated next step for it, otherwise null. */
export function aiErrorCategoryOf(error: unknown): AiErrorCategory | null {
  const category = (error as { category?: unknown } | null | undefined)?.category;
  return typeof category === "string" && Object.prototype.hasOwnProperty.call(NEXT_STEP, category) ? (category as AiErrorCategory) : null;
}

/**
 * What the owner should do next for the failures that have one clear answer.
 * Out of credits never says "retry": sending again only collects another 402.
 */
const NEXT_STEP: Partial<Record<AiErrorCategory, string>> = {
  quota: "Revora AI is out of credits; replies resume once credits are topped up. Top up the AI credits for this workspace, then send the message again. Re-sending before then won't help.",
  rate_limited: "Revora AI is busy right now. Try again in a moment.",
  not_configured: "Revora AI isn't set up yet. An admin needs to add Revora's AI provider in the platform settings before Jarvis can answer.",
  timeout: "Revora AI took too long to answer. Try again; a shorter question usually finishes faster.",
};

const DEFAULT_NEXT_STEP =
  "Next, in order: retry this message (Auto walks GPT 6.1 Sol, Claude Sonnet 5, Gemini 3.8 Flash, then Gemini 3.1 Flash Lite), open AI City and run the health sweep, and approve only the cards that name a real action.";

/** Never echo something that looks like a credential, even from an error string. */
function redact(text: string): string {
  return text
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

/**
 * When every Lovable model fails, Jarvis still answers from the checks that
 * already ran. No new provider, no invented figures, no second spend.
 * When the failure has a known category (credits, rate limit, not configured,
 * timeout), the next step says exactly that instead of a generic "retry".
 */
export function executiveFallback(input: { ran: readonly string[]; reason: string; category?: AiErrorCategory | null; error?: unknown }): string {
  const category = input.category ?? aiErrorCategoryOf(input.error);
  const reason = redact(input.reason.replace(/\s+/g, " ").trim()).slice(0, 280) || "The model roster did not finish.";
  const checks = input.ran.length
    ? `Checks that finished: ${input.ran.slice(0, 8).join(", ")}.`
    : "No tool round finished before the model roster stopped.";
  const next = (category && NEXT_STEP[category]) || DEFAULT_NEXT_STEP;
  return [
    "The live Lovable roster could not finish this turn. This is the operational brief from the checks already in hand.",
    checks,
    `What stopped the model: ${reason}`,
    `${next} I have not invented counts, prices, or a result.`,
  ].join("\n\n");
}
