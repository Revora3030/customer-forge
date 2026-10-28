/**
 * ONE BUILD'S SPENDING CEILING
 * ============================
 *
 * A build is retried up to three times, and each attempt can spend real credits
 * (pictures are about a quarter of a dollar each). The daily and monthly caps
 * protect the platform, but they say nothing about one build that keeps failing
 * and keeps paying: a failing first build of "Elite mobile detail" spent $2.41
 * across three attempts, against about $1.90 for a healthy one.
 *
 * This is the ceiling for a single build, counted across all of its attempts.
 * Once a build has spent its ceiling the worker stops it with a plain message
 * instead of trying again. Pure, so the rule is tested without a database.
 */

/** About three healthy builds. A normal build is around $2; a failing one with retries $2.40-$4. */
export const DEFAULT_BUILD_SPEND_CAP_USD = 6;

const MICROCENTS_PER_DOLLAR = 100_000_000;

/**
 * The ceiling in microcents. `BUILD_SPEND_CAP_USD` overrides it; `0` (or `off`)
 * turns the guard off; anything unreadable keeps the default, so a typo can
 * never remove the protection.
 */
export function buildSpendCapMicrocents(environment: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = environment["BUILD_SPEND_CAP_USD"]?.trim().toLowerCase() ?? "";
  if (raw === "off" || raw === "false") return 0;
  const parsed = Number(raw);
  const usd = raw !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BUILD_SPEND_CAP_USD;
  return Math.round(usd * MICROCENTS_PER_DOLLAR);
}

/** True once a build has spent its ceiling (a ceiling of 0 means no limit). */
export function overBuildSpendCap(spentMicrocents: number, capMicrocents: number): boolean {
  return capMicrocents > 0 && spentMicrocents >= capMicrocents;
}

const usd = (microcents: number) => `$${(microcents / MICROCENTS_PER_DOLLAR).toFixed(2)}`;

/** Plain words for the owner and the logs. Names the limit, says nothing was published, and what to do. */
export function buildSpendLimitMessage(spentMicrocents: number, capMicrocents: number): string {
  return `This build reached its spending limit (${usd(capMicrocents)}) after using ${usd(spentMicrocents)} of AI credits without finishing, so Revora stopped it instead of trying again. Nothing was published. You can start it again when you are ready.`;
}

/** Raised by the worker before it spends more on a build that has used its ceiling. */
export class BuildSpendLimitError extends Error {
  readonly spentMicrocents: number;
  readonly capMicrocents: number;
  constructor(spentMicrocents: number, capMicrocents: number) {
    super(buildSpendLimitMessage(spentMicrocents, capMicrocents));
    this.name = "BuildSpendLimitError";
    this.spentMicrocents = spentMicrocents;
    this.capMicrocents = capMicrocents;
  }
}

type SpendReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        gte: (column: string, value: string) => {
          order: (column: string) => { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> };
        };
      };
    };
  };
};

/**
 * What the workspace's paid AI has cost since the build was asked for, from the
 * usage ledger every paid call is recorded in (text and pictures alike). A
 * little chat activity in the same window is counted too, which only makes the
 * guard slightly earlier, never later. Returns null when the ledger cannot be
 * read: the guard then does not block (the daily and monthly caps still hold).
 */
export async function readBuildSpendMicrocents(db: SpendReader, organizationId: string, since: string): Promise<number | null> {
  const { readAll } = await import("@/lib/db/read-all");
  const result = await readAll<{ cost_microcents: number | string | null }>(() =>
    db
      .from("luna_usage_events")
      .select("cost_microcents")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .order("created_at") as never,
  );
  if (result.error) return null;
  return result.data.reduce((sum, row) => sum + (Number(row.cost_microcents) || 0), 0);
}
