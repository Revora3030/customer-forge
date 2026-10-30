/**
 * When every Lovable model fails, Jarvis still answers from the checks that
 * already ran. No new provider, no invented figures, no second spend.
 */
export function executiveFallback(input: { ran: readonly string[]; reason: string }): string {
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 280) || "The model roster did not finish.";
  const checks = input.ran.length
    ? `Checks that finished: ${input.ran.slice(0, 8).join(", ")}.`
    : "No tool round finished before the model roster stopped.";
  return [
    "The live Lovable roster could not finish this turn. This is the operational brief from the checks already in hand.",
    checks,
    `What stopped the model: ${reason}`,
    "Next, in order: retry this message (Auto walks GPT 6.1 Sol, Claude Sonnet 5, Gemini 3.8 Flash, then Gemini 3.1 Flash Lite), open AI City and run the health sweep, and approve only the cards that name a real action. I have not invented counts, prices, or a result.",
  ].join("\n\n");
}
