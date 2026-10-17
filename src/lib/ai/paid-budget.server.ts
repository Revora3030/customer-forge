import { MICROCENTS_PER_DOLLAR, costMicrocents, estimateMicrocents } from "@/lib/ai/luna.server";
import type { CollectiveTier } from "@/lib/ai/collective";

/**
 * One daily dollar cap for every paid AI call (owner's choice: paid models
 * for the hardest steps up to a daily cap, then the free pool). A call
 * reserves an over-estimate before it runs and settles the real cost after.
 * If the ledger can't be reached, paid is refused: the cap fails closed.
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

export type PaidReservation = { day: string; estimate: number };

type Client = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

/**
 * The service-role client, or null where no database is configured (unit
 * tests, local tooling). Wrapped in an object so `await` never touches the
 * lazy client's own properties.
 */
async function ledger(): Promise<{ db: Client } | null> {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] && !process.env["SUPABASE_SECRET_KEY"]) return null;
  try {
    const mod = await import("@/integrations/supabase/client.server");
    return { db: mod.supabaseAdmin as unknown as Client };
  } catch {
    return null;
  }
}

/** A reservation made where no database exists to meter against (tests, local tools). */
const UNMETERED = "unmetered";

/**
 * Reserves `estimate` microcents for today. Returns null when the cap is 0,
 * today's spend would exceed it, or the configured ledger can't be read —
 * the cap fails closed wherever a database exists.
 */
export async function reservePaidSpend(estimate: number): Promise<PaidReservation | null> {
  const cap = paidDailyCapMicrocents();
  if (cap <= 0) return null;
  const amount = Math.max(0, Math.round(estimate));
  const handle = await ledger();
  if (!handle) return { day: UNMETERED, estimate: amount };
  try {
    const { data, error } = await handle.db.rpc("ai_paid_budget_reserve", {
      _estimate_microcents: amount,
      _cap_microcents: cap,
    });
    if (error || !Array.isArray(data) || !data.length) return null;
    const row = data[0] as { allowed?: boolean; day?: string };
    return row.allowed && row.day ? { day: String(row.day), estimate: amount } : null;
  } catch {
    return null;
  }
}

/** Replaces a reservation with the real cost (0 when the call failed). */
export async function settlePaidSpend(reservation: PaidReservation, actual: number): Promise<void> {
  if (reservation.day === UNMETERED) return;
  const handle = await ledger();
  if (!handle) return;
  try {
    await handle.db.rpc("ai_paid_budget_settle", {
      _day: reservation.day,
      _estimate_microcents: reservation.estimate,
      _actual_microcents: Math.max(0, Math.round(actual)),
    });
  } catch {
    /* the reservation stays counted: the cap errs on the side of spending less */
  }
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
