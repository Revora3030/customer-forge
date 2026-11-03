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
  const dollars =
    text && Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PAID_DAILY_CAP_USD;
  return Math.round(dollars * MICROCENTS_PER_DOLLAR);
}

/** The collective tier whose (deliberately high) prices a paid model is billed at. */
export function tierForModel(model: string): CollectiveTier {
  const name = model.toLowerCase();
  if (name.includes("terra")) return "terra";
  if (
    name.includes("luna") ||
    name.includes("mini") ||
    name.includes("nano") ||
    name.includes("flash")
  )
    return "luna";
  // Unknown models are priced as the most expensive tier so the cap binds early.
  return "sol";
}

/**
 * One paid reservation. `id` names its row in ai_paid_spend_reservations so it
 * is settled exactly once; it is null only for an unmetered reservation.
 */
export type PaidReservation = { id: string | null; day: string; estimate: number };

type Client = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

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
  return (await reservePaidSpendDetailed(estimate)).reservation;
}

/**
 * Why a paid reservation was refused, so a caller can tell the owner the
 * truth: the day's cap is used up (resets at midnight UTC), paid AI is off,
 * the call runs in a free-only scope, or the ledger could not be read.
 */
export type PaidRefusal = "free_only" | "cap_zero" | "cap_reached" | "ledger_unavailable";

export type PaidReservationResult =
  { reservation: PaidReservation; refusal: null } | { reservation: null; refusal: PaidRefusal };

/** `reservePaidSpend`, plus the reason a refused reservation was refused. Never throws. */
export async function reservePaidSpendDetailed(estimate: number): Promise<PaidReservationResult> {
  // A free-only spending scope (demo workspace builds) never spends.
  if (scopedFreeOnly()) return { reservation: null, refusal: "free_only" };
  const cap = paidDailyCapMicrocents();
  if (cap <= 0) return { reservation: null, refusal: "cap_zero" };
  const amount = Math.max(0, Math.round(estimate));
  const handle = await ledger();
  if (!handle)
    return { reservation: { id: null, day: UNMETERED, estimate: amount }, refusal: null };
  const args = {
    _estimate_microcents: amount,
    _cap_microcents: cap,
    _stale_after_seconds: paidReservationStaleSeconds(),
  };
  // A transient ledger error is retried once before paid AI fails closed. If
  // the first call did commit, its orphan row stops counting after the stale
  // window, so a retry can never overshoot the cap for long.
  for (let attempt = 1; attempt <= RESERVE_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await handle.db.rpc("ai_paid_budget_reserve_tracked", args);
      if (!error && Array.isArray(data) && data.length) {
        const row = data[0] as {
          allowed?: boolean;
          reservation_id?: string | null;
          day?: string | null;
        };
        if (row.allowed !== true) {
          noteDailyCapReached(cap);
          return { reservation: null, refusal: "cap_reached" };
        }
        if (row.reservation_id && row.day)
          return {
            reservation: { id: String(row.reservation_id), day: String(row.day), estimate: amount },
            refusal: null,
          };
      }
    } catch {
      /* retried below */
    }
    if (attempt < RESERVE_ATTEMPTS)
      await new Promise((resolve) => setTimeout(resolve, RESERVE_RETRY_DELAY_MS));
  }
  noteLedgerUnavailable();
  return { reservation: null, refusal: "ledger_unavailable" };
}

const RESERVE_ATTEMPTS = 2;
const RESERVE_RETRY_DELAY_MS = 250;

let ledgerAlertHour: string | null = null;

/**
 * Paid AI fails closed while the ledger can't be read, so the first failure
 * of each UTC hour emails the founder (the marker dedupes across workers).
 * Fire-and-forget: alerting never changes the refusal.
 */
function noteLedgerUnavailable(now = Date.now()) {
  const hour = new Date(now).toISOString().slice(0, 13);
  if (ledgerAlertHour === hour) return;
  ledgerAlertHour = hour;
  void (async () => {
    try {
      const handle = await ledger();
      if (!handle) return;
      const { sendFounderAlert } = await import("@/lib/founder-alerts.server");
      await sendFounderAlert(handle.db as never, {
        kind: "ai_budget_ledger_unavailable",
        marker: `ai-budget-ledger:${hour}`,
        organizationId: null,
        title: "Paid AI is paused: the budget ledger could not be read",
        summary:
          "The paid AI budget ledger (ai_paid_budget_reserve_tracked) failed twice in a row, so paid AI calls are refused until it answers again. Free lanes are unaffected.",
        rows: [["Hour (UTC)", `${hour.replace("T", " ")}:00`]],
        link: "https://revoragrowthsystems.com/admin/ai",
      });
    } catch {
      /* alerting is best-effort */
    }
  })();
}

/** Seconds until the daily cap resets (midnight UTC, 8 PM New York in summer). */
export function secondsUntilPaidCapReset(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((next.getTime() - now) / 1000));
}

/** The configured daily cap in dollars, for messages. */
export function paidDailyCapUsd(): number {
  return paidDailyCapMicrocents() / MICROCENTS_PER_DOLLAR;
}

let capAlertDay: string | null = null;

/**
 * The first refusal of a UTC day emails the founder once (the founder-alert
 * marker makes it once per day across workers too). Fire-and-forget: an
 * alert failure never touches the AI call that was refused.
 */
function noteDailyCapReached(cap: number, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (capAlertDay === day) return;
  capAlertDay = day;
  void (async () => {
    try {
      const handle = await ledger();
      if (!handle) return;
      const { sendFounderAlert } = await import("@/lib/founder-alerts.server");
      await sendFounderAlert(handle.db as never, {
        kind: "ai_budget_reached",
        marker: `ai-budget:${day}`,
        organizationId: null,
        title: "Today's paid AI budget is used up",
        summary: `Paid AI calls reached today's $${(cap / MICROCENTS_PER_DOLLAR).toFixed(2)} cap (AI_PAID_DAILY_CAP_USD). New AI work waits until the cap resets at midnight UTC (8 PM New York time in summer).`,
        rows: [
          ["Day (UTC)", day],
          ["Daily cap", `$${(cap / MICROCENTS_PER_DOLLAR).toFixed(2)}`],
        ],
        link: "https://revoragrowthsystems.com/admin/ai",
      });
    } catch {
      /* alerting is best-effort */
    }
  })();
}

/** Test hook: forget which day already alerted. */
export function resetPaidCapAlertForTests() {
  capAlertDay = null;
  ledgerAlertHour = null;
}

const SETTLE_ATTEMPTS = 3;

/**
 * Settles a reservation to the real cost, or releases it with 0 when the call
 * failed. A reservation settles once on the database side, so a storage error
 * is retried safely. Never throws: a settle that still fails leaves the row
 * open, and the stale window stops it counting. True once the ledger confirmed.
 */
export async function settlePaidSpend(
  reservation: PaidReservation,
  actual: number,
): Promise<boolean> {
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
    if (attempt < SETTLE_ATTEMPTS)
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
  }
  return false;
}

/** Pre-call estimate for a router call whose prompt size isn't known here. */
export function routerEstimate(
  model: string,
  maxOutputTokens: number,
  promptChars = 24_000,
): number {
  return estimateMicrocents(promptChars, maxOutputTokens, tierForModel(model));
}

export function routerActual(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
  fallback: number,
): number {
  if (inputTokens === null && outputTokens === null) return fallback;
  return costMicrocents(
    { inputTokens: inputTokens ?? 0, cachedInputTokens: 0, outputTokens: outputTokens ?? 0 },
    tierForModel(model),
  );
}
