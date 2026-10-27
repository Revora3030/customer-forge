import { MICROCENTS_PER_DOLLAR, costMicrocents, estimateMicrocents } from "@/lib/ai/luna.server";
import type { CollectiveTier } from "@/lib/ai/collective";
import { scopedFreeOnly } from "@/lib/ai/spend-scope.server";

/**
 * One daily dollar cap for every paid AI call (owner's choice: paid models
 * for the hardest steps up to a daily cap, then the free pool). A call
 * reserves an over-estimate before it runs and settles the real cost after.
 * If the ledger can't be reached, paid is refused: the cap fails closed.
 *
 * Each reservation is its own row (ai_paid_spend_reservations), settled once
 * in a `finally` on every call path: to the real cost on success, 0 only for a
 * definite unbilled rejection or a failure before the request left, and the
 * estimate when the outcome is unknown (timeout, abort, network error, 5xx). One
 * left open by a worker that died stops counting after the stale window, so a
 * leaked reservation can no longer hold the day's budget.
 *
 * AI_PAID_DAILY_CAP_USD sets the cap (default $5); 0 turns paid off.
 */
export const DEFAULT_PAID_DAILY_CAP_USD = 5;

export function paidDailyCapMicrocents(): number {
  const text = process.env["AI_PAID_DAILY_CAP_USD"]?.trim() ?? "";
  const parsed = Number(text);
  const dollars = text && Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PAID_DAILY_CAP_USD;
  return Math.round(dollars * MICROCENTS_PER_DOLLAR);
}

/** The collective tier whose (deliberately high) prices a paid model is billed at. */
export function tierForModel(model: string): CollectiveTier {
  const name = model.toLowerCase();
  if (name.includes("terra")) return "terra";
  if (name.includes("luna") || name.includes("mini") || name.includes("nano") || name.includes("flash")) return "luna";
  // Unknown models are priced as the most expensive tier so the cap binds early.
  return "sol";
}

/**
 * One paid reservation. `id` names its row in ai_paid_spend_reservations so it
 * is settled exactly once; it is null only for an unmetered reservation.
 */
export type PaidReservation = { id: string | null; day: string; estimate: number };

type Client = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

/**
 * The service-role client, or null where no database is configured (unit
 * tests, local tooling). Wrapped in an object so `await` never touches the
 * lazy client's own properties.
 */
let clientModule: Promise<{ supabaseAdmin: unknown }> | null = null;

async function ledger(): Promise<{ db: Client } | null> {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] && !process.env["SUPABASE_SECRET_KEY"]) return null;
  try {
    // One shared import for concurrent callers (the reserve and settle of
    // parallel paid calls); a failed import is retried on the next call.
    clientModule ??= import("@/integrations/supabase/client.server").catch((error: unknown) => {
      clientModule = null;
      throw error;
    });
    const mod = await clientModule;
    return { db: mod.supabaseAdmin as unknown as Client };
  } catch {
    return null;
  }
}

/** A reservation made where no database exists to meter against (tests, local tools). */
const UNMETERED = "unmetered";

/**
 * How long an unsettled reservation keeps counting toward today's cap. Every
 * call path settles or releases its reservation in a `finally`, so one still
 * open after this window belongs to a worker that died or was cut off
 * mid-call. The floor stays above the longest paid call (the 8-minute video
 * wait, the 6-minute router chain) so a live call never loses its hold.
 */
export const DEFAULT_PAID_RESERVATION_STALE_MINUTES = 15;
const MIN_PAID_RESERVATION_STALE_MINUTES = 10;

export function paidReservationStaleSeconds(): number {
  const parsed = Number(process.env["AI_PAID_RESERVATION_STALE_MINUTES"]?.trim() ?? "");
  const minutes =
    Number.isFinite(parsed) && parsed > 0
      ? Math.max(parsed, MIN_PAID_RESERVATION_STALE_MINUTES)
      : DEFAULT_PAID_RESERVATION_STALE_MINUTES;
  return Math.round(minutes * 60);
}

/**
 * Reserves `estimate` microcents for today. Returns null when the cap is 0,
 * today's spend would exceed it, the call runs in a free-only spending scope,
 * or the configured ledger can't be read — the cap fails closed wherever a
 * database exists.
 *
 * Today's committed spend is the settled real cost plus the reservations
 * still open and younger than the stale window; the database takes the day
 * row lock first, so concurrent reservations cannot overshoot the cap.
 */
export async function reservePaidSpend(estimate: number): Promise<PaidReservation | null> {
  // A free-only spending scope (demo workspace builds) never spends.
  if (scopedFreeOnly()) return null;
  const cap = paidDailyCapMicrocents();
  if (cap <= 0) return null;
  const amount = Math.max(0, Math.round(estimate));
  const handle = await ledger();
  if (!handle) return { id: null, day: UNMETERED, estimate: amount };
  try {
    const { data, error } = await handle.db.rpc("ai_paid_budget_reserve_tracked", {
      _estimate_microcents: amount,
      _cap_microcents: cap,
      _stale_after_seconds: paidReservationStaleSeconds(),
    });
    if (error || !Array.isArray(data) || !data.length) return null;
    const row = data[0] as { allowed?: boolean; reservation_id?: string | null; day?: string | null };
    if (row.allowed !== true || !row.reservation_id || !row.day) return null;
    return { id: String(row.reservation_id), day: String(row.day), estimate: amount };
  } catch {
    return null;
  }
}

const SETTLE_ATTEMPTS = 3;

/**
 * Settles a reservation to the real cost, or releases it with 0 when the call
 * failed. A reservation settles once on the database side, so a storage error
 * is retried safely. Never throws: a settle that still fails leaves the row
 * open, and the stale window stops it counting. True once the ledger confirmed.
 */
export async function settlePaidSpend(reservation: PaidReservation, actual: number): Promise<boolean> {
  if (reservation.day === UNMETERED || !reservation.id) return true;
  const handle = await ledger();
  if (!handle) return false;
  // An unknown cost is billed at the estimate, never as free.
  const amount = Math.max(0, Math.round(Number.isFinite(actual) ? actual : reservation.estimate));
  for (let attempt = 1; attempt <= SETTLE_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await handle.db.rpc("ai_paid_budget_settle_tracked", {
        _reservation_id: reservation.id,
        _actual_microcents: amount,
      });
      if (!error) return true;
    } catch {
      /* retried below */
    }
    if (attempt < SETTLE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
  }
  return false;
}

/** Pre-call estimate for a router call whose prompt size isn't known here. */
export function routerEstimate(model: string, maxOutputTokens: number, promptChars = 24_000): number {
  return estimateMicrocents(promptChars, maxOutputTokens, tierForModel(model));
}

export function routerActual(model: string, inputTokens: number | null, outputTokens: number | null, fallback: number): number {
  if (inputTokens === null && outputTokens === null) return fallback;
  return costMicrocents(
    { inputTokens: inputTokens ?? 0, cachedInputTokens: 0, outputTokens: outputTokens ?? 0 },
    tierForModel(model),
  );
}
