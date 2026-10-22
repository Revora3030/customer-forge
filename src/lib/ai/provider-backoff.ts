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

/**
 * Key a failure is remembered under. A rate limit from a multi-model gateway
 * (Lovable routes Claude, GPT and Gemini through one key) is about the model
 * that answered it, not the account: one busy model must not push every other
 * gateway model behind the free pool. Money/key problems stay account-wide.
 */
function backoffKey(provider: string, category: AiErrorCategory, model?: string): string {
  return category === "rate_limited" && model ? `${provider}\u001f${model}` : provider;
}

export function noteProviderFailure(
  provider: string,
  category: AiErrorCategory,
  now = Date.now(),
  /** The model that answered; scopes a rate limit to that model only. */
  model?: string,
): void {
  if (!isProviderBillingFailure(category)) return;
  const key = backoffKey(provider, category, model);
  const previous = state.get(key);
  const strikes = (previous && previous.until > now - MAX_MS ? previous.strikes : 0) + 1;
  // A plain rate limit is short-lived; a money/key problem lasts until fixed.
  const ms = category === "rate_limited" ? Math.min(backoffMs(strikes), 5 * 60_000) : backoffMs(strikes);
  state.set(key, { strikes, until: now + ms, reason: category });
}

export function noteProviderSuccess(provider: string, model?: string): void {
  state.delete(provider);
  if (model) state.delete(`${provider}\u001f${model}`);
}

export function providerDegraded(provider: string, now = Date.now(), model?: string): boolean {
  const active = (key: string) => {
    const entry = state.get(key);
    return !!entry && entry.until > now;
  };
  return active(provider) || (model !== undefined && active(`${provider}\u001f${model}`));
}

export function degradedProviders(now = Date.now()) {
  return [...state.entries()]
    .filter(([, entry]) => entry.until > now)
    .map(([key, entry]) => {
      const [provider, model] = key.split("\u001f");
      return { provider: provider!, ...(model ? { model } : {}), until: entry.until, strikes: entry.strikes, reason: entry.reason };
    });
}

/**
 * Stable reorder: healthy paid → free → degraded paid. When paid credits run
 * out, generation runs 100% on the free team without first waiting on a
 * provider that is known to refuse; when the account is funded again the
 * cooldown lapses and the paid team leads again.
 */
export function demoteDegradedPaid<T extends { free: unknown; config: { name: string }; model?: string }>(
  entries: T[],
  now = Date.now(),
  /**
   * The shared (cross-worker) degraded state. A fresh worker has no local
   * memory, so without it every new worker paid an unfunded account's refusal
   * before reaching the free team.
   */
  sharedDegraded: (provider: string) => boolean = () => false,
): T[] {
  const degraded = (entry: T) =>
    entry.free === null && (providerDegraded(entry.config.name, now, entry.model) || sharedDegraded(entry.config.name));
  return [...entries.filter((entry) => !degraded(entry)), ...entries.filter(degraded)];
}

/** Test helper. */
export function resetProviderBackoff(): void {
  state.clear();
}

/**
 * Bodies that mean "out of credit" even when the status is not 402
 * (OpenAI 429 insufficient_quota, Anthropic/DeepSeek balance messages,
 * Cloudflare Workers AI 429 error 4006 "used up your daily free allocation",
 * which lasts until the allocation resets at UTC midnight).
 */
export const BILLING_EXHAUSTED_TEXT =
  /insufficient[_ ](?:quota|balance|funds|credits?)|credit balance is too low|exceeded your current quota|billing[_ ](?:hard[_ ]limit|not active)|payment required|out of credits?|daily free allocation|"code"\s*:\s*4006\b/i;
