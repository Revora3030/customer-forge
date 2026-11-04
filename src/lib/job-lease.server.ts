import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Named single-flight leases for scheduled jobs (public.job_leases,
 * claim_job_lease from migration 20261105000000). A job that can be called by
 * both pg_cron and the GitHub Actions backstop claims its lease first and
 * skips the pass when another run holds it.
 *
 * - "claimed": this run holds the lease; release it when done.
 * - "busy": another run holds an unexpired lease; skip this pass.
 * - "unlocked": the migration is not applied yet; run without the lock, as before.
 * - "error": the claim itself failed; skip rather than risk a double run.
 */
export type JobLease = "claimed" | "busy" | "unlocked" | "error";

type Db = Pick<SupabaseClient, "rpc" | "from">;

function isMissingLeaseFunction(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") return true;
  return /could not find the function|function .*claim_job_lease.* does not exist|relation .*job_leases.* does not exist/i.test(
    error.message ?? "",
  );
}

export async function claimJobLease(db: Db, job: string, owner: string, seconds: number): Promise<JobLease> {
  try {
    const { data, error } = await db.rpc("claim_job_lease" as never, { p_job: job, p_owner: owner, p_seconds: seconds } as never);
    if (error) {
      if (isMissingLeaseFunction(error)) {
        console.warn(`[job-lease] claim_job_lease is missing (migration 20261105000000 not applied); ${job} runs without the single-flight lock`);
        return "unlocked";
      }
      console.error(`[job-lease] couldn't claim the ${job} lease:`, error.message);
      return "error";
    }
    return data === true ? "claimed" : "busy";
  } catch (error) {
    console.error(`[job-lease] couldn't claim the ${job} lease:`, error instanceof Error ? error.message : error);
    return "error";
  }
}

/** Frees the lease, only while this run still holds it (an expired lease another run took is left alone). */
export async function releaseJobLease(db: Db, job: string, owner: string): Promise<void> {
  try {
    const { error } = await db
      .from("job_leases" as never)
      .update({ lease_owner: null, leased_until: null, updated_at: new Date().toISOString() } as never)
      .eq("job", job)
      .eq("lease_owner", owner);
    if (error) console.error(`[job-lease] couldn't release the ${job} lease:`, error.message);
  } catch (error) {
    console.error(`[job-lease] couldn't release the ${job} lease:`, error instanceof Error ? error.message : error);
  }
}
