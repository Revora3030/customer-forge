/**
 * ESTIMATED per-model prices — the one place Revora keeps them.
 *
 * Every number here is an ESTIMATE in US dollars per million tokens, used for
 * two things only:
 *  1. the daily paid cap (paid-budget.server.ts): a paid call reserves an
 *     estimate before it runs and settles the token-priced cost afterwards, so
 *     `AI_PAID_DAILY_CAP_USD` actually binds on the owner's spend;
 *  2. `ai_usage_events.estimated_cost_usd` in admin reporting.
 * They are NOT invoices. Lovable AI Gateway ids (vendor-prefixed) are priced at
 * the vendor's public list price as of 2026-10-22; the gateway bills the
 * owner's Lovable workspace credits, which may differ. Where a list price was
 * not known the estimate is rounded UP so the cap binds early rather than late.
 *
 * Server and client safe (no env, no I/O).
 */

export type ModelPrice = { input: number; output: number };

/** Estimates (USD per 1M tokens). Keep vendor-prefixed Lovable ids exact. */
export const ESTIMATED_PRICE_PER_MTOK: Readonly<Record<string, ModelPrice>> = {
  /* ---- Lovable AI Gateway roster (config.ts DEFAULT_MODELS.lovable) ---- */
  "anthropic/claude-fable-5-1": { input: 10, output: 50 },
  "anthropic/claude-opus-5-5": { input: 4, output: 20 },
  "anthropic/claude-opus-5": { input: 5, output: 25 },
  "anthropic/claude-sonnet-5": { input: 2, output: 10 },
  "anthropic/claude-haiku-4-5": { input: 1, output: 5 },
  // OpenAI flagship ids on the gateway: no confirmed list price, rounded up.
  "openai/gpt-6.1-sol": { input: 2.5, output: 15 },
  "openai/gpt-6-sol": { input: 2.5, output: 15 },
  "openai/gpt-6-astra": { input: 2.5, output: 15 },
  "openai/gpt-6-luna": { input: 2.5, output: 15 },
  // Pro tier: priced high on purpose so it cannot slip under the cap.
  "openai/gpt-5.5-pro": { input: 15, output: 120 },
  "openai/chat-latest": { input: 2.5, output: 15 },
  "openai/gpt-5.6-sol": { input: 1.25, output: 10 },
  "openai/gpt-5.6-terra": { input: 0.5, output: 4 },
  "openai/gpt-5.6-luna": { input: 0.5, output: 4 },
  "openai/gpt-5.5": { input: 1.25, output: 10 },
  "openai/gpt-5.4": { input: 1.25, output: 10 },
  "openai/gpt-5.4-mini": { input: 0.4, output: 1.6 },
  "openai/gpt-transcribe": { input: 2.5, output: 10 },
  "openai/gpt-image-2.5-sunburst": { input: 5, output: 40 },
  "google/gemini-4-argon": { input: 2.5, output: 15 },
  "google/gemini-3.1-pro-preview": { input: 2, output: 12 },
  "google/gemini-3.8-flash": { input: 0.3, output: 2.5 },
  "google/gemini-3-flash-preview": { input: 0.5, output: 3 },
  "google/gemini-3.1-flash-lite": { input: 0.1, output: 0.4 },

  /* ---- Revora's own direct keys (bare ids) ---- */
  "gemini-3.8-flash": { input: 0.3, output: 2.5 },
  "gemini-3.6-flash": { input: 0.3, output: 2.5 },
  "gemini-3.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.1-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.1-flash-image": { input: 0.3, output: 2.5 },
  "gemini-3.5-transcribe": { input: 0.3, output: 2.5 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-image-1": { input: 5, output: 40 },
  "gpt-5.4-mini": { input: 0.4, output: 1.6 },
  "gpt-5.6-terra": { input: 0.5, output: 4 },
  "gpt-5.6-sol": { input: 1.25, output: 10 },
  "gpt-6-sol": { input: 2.5, output: 15 },
  "gpt-6-astra": { input: 2.5, output: 15 },
  "gpt-image-2": { input: 5, output: 40 },
  "gpt-image-2.5-sunburst": { input: 5, output: 40 },
  "gpt-image-2.5-flare": { input: 2, output: 16 },
  // OpenAI shared-traffic free allowance models (zero while in allowance).
  "whisper-1": { input: 0, output: 0 },
  "gpt-5.4-nano": { input: 0, output: 0 },
  "gpt-5-mini": { input: 0, output: 0 },
  "o4-mini": { input: 0, output: 0 },
  "o3-mini": { input: 0, output: 0 },
};

/**
 * Price used for the CAP when a paid model is not in the table: priced like a
 * top-tier model so an unlisted id can never slip under the daily cap.
 */
export const UNKNOWN_PAID_MODEL_PRICE: ModelPrice = { input: 5, output: 25 };

/** The table entry for a model, or null when it is not listed. */
export function knownModelPrice(model: string): ModelPrice | null {
  return ESTIMATED_PRICE_PER_MTOK[model] ?? null;
}

/** The price the paid cap uses: the table entry, else the conservative default. */
export function paidModelPrice(model: string): ModelPrice {
  return knownModelPrice(model) ?? UNKNOWN_PAID_MODEL_PRICE;
}

/** Reporting estimate in dollars; null rather than a guess for an unlisted model. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = knownModelPrice(model);
  if (!price) return null;
  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Spend-ledger unit: one dollar is 100,000,000 microcents (the same unit as
 * luna.server's MICROCENTS_PER_DOLLAR and the paid-budget ledger rows).
 */
export const PRICE_MICROCENTS_PER_DOLLAR = 100_000_000;

/**
 * Microcents for a token count at one model's ESTIMATED price
 * (the table above). An unlisted paid model is priced at the conservative
 * top-tier default, so the cap binds early rather than never.
 */
export function modelCostMicrocents(model: string, inputTokens: number, outputTokens: number): number {
  const price = paidModelPrice(model);
  const dollars =
    (Math.max(inputTokens, 0) / 1_000_000) * price.input + (Math.max(outputTokens, 0) / 1_000_000) * price.output;
  return Math.max(Math.round(dollars * PRICE_MICROCENTS_PER_DOLLAR), 0);
}

/** Pre-call estimate at one model's price: ~4 characters per token, full output allowance. */
export function modelEstimateMicrocents(model: string, promptChars: number, maxOutputTokens: number): number {
  return modelCostMicrocents(model, Math.ceil(Math.max(promptChars, 0) / 4), Math.max(maxOutputTokens, 0));
}

/**
 * Pre-call estimate for a walk that may be answered by any of `models` (the
 * builder's thinker reserves once for the whole paid walk): the most
 * expensive candidate's estimate, so whichever answers fits inside it.
 */
export function rosterEstimateMicrocents(models: readonly string[], promptChars: number, maxOutputTokens: number): number {
  if (!models.length) return modelEstimateMicrocents("", promptChars, maxOutputTokens);
  return Math.max(...models.map((model) => modelEstimateMicrocents(model, promptChars, maxOutputTokens)));
}

