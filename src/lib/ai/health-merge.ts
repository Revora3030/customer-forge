/**
 * Accurate admin AI health.
 *
 * The router's breaker, daily budget and "last request" live in the memory of
 * whichever server worker made the calls. The admin page is served by a
 * different, usually idle worker, so on its own it would report every provider
 * healthy with a full allowance. This merges the shared database record
 * (ai_provider_runtime) and the recorded calls (ai_usage_events) on top, so the
 * page shows what actually happened across all workers.
 */

export type ProviderHealthInput = {
  name: string;
  healthy: boolean;
  openFailures: number;
  cooldownUntil: number | null;
  remainingToday: number | null;
};

export type SharedRuntime = { provider: string; day: string; used: number; failures: number; openUntil: number | null };
export type UsageRow = {
  created_at: string;
  provider: string;
  model: string;
  task: string;
  ok: boolean;
  error_category: string | null;
  fallback_used: boolean;
};

export function mergeProviderHealth<T extends ProviderHealthInput>(
  providers: T[],
  shared: SharedRuntime[],
  caps: Record<string, number | null>,
  recent: UsageRow[],
  now = Date.now(),
): (T & { calls24h: number; failures24h: number })[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const dayAgo = now - 86_400_000;
  const byName = new Map(shared.map((row) => [row.provider, row]));
  return providers.map((entry) => {
    const row = byName.get(entry.name);
    const sharedOpen = row?.openUntil && row.openUntil > now ? row.openUntil : null;
    const cooldownUntil = Math.max(entry.cooldownUntil ?? 0, sharedOpen ?? 0) || null;
    const cap = caps[entry.name] ?? null;
    const sharedRemaining = cap !== null && row && row.day === today ? Math.max(0, cap - row.used) : null;
    const remainingToday =
      entry.remainingToday === null ? sharedRemaining : sharedRemaining === null ? entry.remainingToday : Math.min(entry.remainingToday, sharedRemaining);
    const mine = recent.filter((call) => call.provider === entry.name && Date.parse(call.created_at) >= dayAgo);
    return {
      ...entry,
      cooldownUntil,
      healthy: cooldownUntil === null && remainingToday !== 0,
      openFailures: Math.max(entry.openFailures, row && row.day === today ? row.failures : 0),
      remainingToday,
      calls24h: mine.length,
      failures24h: mine.filter((call) => !call.ok).length,
    };
  });
}

/** The most recent recorded call across every worker. Rows are newest first. */
export function lastRecordedOutcome(recent: UsageRow[], freeNames: Set<string>) {
  const row = recent[0];
  if (!row) return null;
  return {
    at: Date.parse(row.created_at),
    provider: row.provider,
    model: row.model,
    task: row.task,
    ok: row.ok,
    category: row.error_category,
    fallbackUsed: row.fallback_used,
    free: freeNames.has(row.provider),
  };
}
