/**
 * B13-1: note on the build job that a backup AI model answered.
 *
 * "fallbackUsed" is a fact the router already records per call
 * (ai_usage_events.fallback_used). A successful call with it set means the
 * first-choice model failed (429, 5xx, timeout) and the next model answered
 * the SAME request. The worker copies that onto the job after each attempt so
 * the owner-facing and admin views can say so honestly. failure_kind stays the
 * job's existing column (classifyBuildFailure: 402 is "credits").
 *
 * Additive and best effort: with the column missing (migration not applied),
 * or on any storage error, nothing is written and the build is unaffected.
 */
type Db = { from: (table: string) => any };

/** Whether a backup model answered for this workspace since the attempt began. */
export async function backupModelAnswered(db: Db, organizationId: string, since: string): Promise<boolean> {
  try {
    const { count, error } = await db
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("ok", true)
      .eq("fallback_used", true)
      .gte("created_at", since);
    return !error && (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Set generation_jobs.fallback_used once a backup model answered during this attempt. Never throws. */
export async function recordJobFallback(
  db: Db,
  job: { id: string; organization_id: string },
  attemptStartedAt: string,
): Promise<boolean> {
  try {
    if (!(await backupModelAnswered(db, String(job.organization_id), attemptStartedAt))) return false;
    const { error } = await db.from("generation_jobs").update({ fallback_used: true }).eq("id", job.id);
    return !error;
  } catch {
    return false;
  }
}
