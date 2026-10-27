/**
 * Process-wide provider backoff for the PAID lane.
 *
 * The per-call router already skips a provider that answered 402/quota for
 * the rest of that one call. Without memory between calls, every later step
 * of the same build (dozens of section designs) re-tried the unfunded paid
 * provider first and paid its latency each time. This module remembers a
 * provider-wide billing/limit failure across calls with exponential backoff,
 * so the router can place a degraded paid provider BEHIND the free pool until
 * its cooldown ends. It never removes the provider: if the whole free pool
 * fails too, the paid provider is still tried last.
 *
 * Pure and dependency-free so it is unit-testable; state is per worker.
 */

import type { AiErrorCategory } from "@/lib/ai/errors";

const BASE_MS = 2 * 60_000;
const MAX_MS = 30 * 60_000;

type State = { strikes: number; until: number; reason: AiErrorCategory };
const state = new Map<string, State>();

/** Failures that say the provider account itself can't serve right now. */
export function isProviderBillingFailure(category: AiErrorCategory): boolean {
  return category === "quota" || category === "unauthorized" || category === "rate_limited" || category === "not_configured";
}

/** Exponential cooldown: 2m, 4m, 8m, 16m, capped at 30m. */
export function backoffMs(strikes: number): number {
  return Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, strikes - 1));
}

export function noteProviderFailure(provider: string, category: AiErrorCategory, now = Date.now()): void {
  if (!isProviderBillingFailure(category)) return;
  const previous = state.get(provider);
  const strikes = (previous && previous.until > now - MAX_MS ? previous.strikes : 0) + 1;
  // A plain rate limit is short-lived; a money/key problem lasts until fixed.
  const ms = category === "rate_limited" ? Math.min(backoffMs(strikes), 5 * 60_000) : backoffMs(strikes);
  state.set(provider, { strikes, until: now + ms, reason: category });
}

export function noteProviderSuccess(provider: string): void {
  state.delete(provider);
}

export function providerDegraded(provider: string, now = Date.now()): boolean {
  const entry = state.get(provider);
  return !!entry && entry.until > now;
}

export function degradedProviders(now = Date.now()) {
  return [...state.entries()]
    .filter(([, entry]) => entry.until > now)
    .map(([provider, entry]) => ({ provider, until: entry.until, strikes: entry.strikes, reason: entry.reason }));
}

/**
 * Stable reorder: healthy paid → free → degraded paid. When paid credits run
 * out, generation runs 100% on the free team without first waiting on a
 * provider that is known to refuse; when the account is funded again the
 * cooldown lapses and the paid team leads again.
 */
export function demoteDegradedPaid<T extends { free: unknown; config: { name: string } }>(
  entries: T[],
  now = Date.now(),
): T[] {
  const degraded = (entry: T) => entry.free === null && providerDegraded(entry.config.name, now);
  return [...entries.filter((entry) => !degraded(entry)), ...entries.filter(degraded)];
}

/** Test helper. */
export function resetProviderBackoff(): void {
  state.clear();
}

/**
 * Bodies that mean "out of credit" even when the status is not 402
 * (OpenAI 429 insufficient_quota, Anthropic/DeepSeek balance messages).
 */
export const BILLING_EXHAUSTED_TEXT =
  /insufficient[_ ](?:quota|balance|funds|credits?)|credit balance is too low|exceeded your current quota|billing[_ ](?:hard[_ ]limit|not active)|payment required|out of credits?/i;
