/** The most recent recorded AI call, read from shared usage rows (every worker). */
export type UsageRow = {
  created_at: string;
  provider: string;
  model: string;
  task: string;
  ok: boolean;
  error_category: string | null;
  fallback_used: boolean;
};

export function lastRecordedOutcome(recent: UsageRow[]) {
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
  };
}
