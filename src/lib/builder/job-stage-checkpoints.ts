/**
 * EARLY-STAGE BUILD CHECKPOINTS.
 *
 * The AI team's finished work from the early build stages (business brief,
 * brand identity, wording/creative direction, page plan) is stored on the job
 * row (generation_jobs.stage_checkpoints) as soon as each stage succeeds. A
 * retry of the SAME job reuses it instead of asking the AI team again, so an
 * interrupted build resumes rather than restarting from zero.
 *
 * Nothing here makes a creative choice: every stored value was authored by the
 * AI team and passed that stage's own checks. A value is only reused when the
 * digest of that stage's inputs matches exactly; otherwise it is regenerated.
 */
import { inputDigest } from "./first-build-section-checkpoints";
import { noteProgress } from "./no-progress";

export const STAGE_CHECKPOINT_VERSION = 1;

type Entry = { digest: string; value: unknown; at: string };
export type StageCheckpoints = { version: typeof STAGE_CHECKPOINT_VERSION; jobId: string; stages: Record<string, Entry> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Returns a stored stage value only when it belongs to this job and inputs. */
export function readStage<T>(raw: unknown, jobId: string, key: string, inputs: unknown): T | null {
  if (!isRecord(raw) || raw["version"] !== STAGE_CHECKPOINT_VERSION || raw["jobId"] !== jobId) return null;
  const stages = raw["stages"];
  if (!isRecord(stages)) return null;
  const entry = stages[key];
  if (!isRecord(entry) || entry["digest"] !== inputDigest(inputs) || entry["value"] == null) return null;
  return entry["value"] as T;
}

/** Adds one stage to the stored checkpoints (pure; returns a new value). */
export function writeStage(raw: unknown, jobId: string, key: string, inputs: unknown, value: unknown, now = new Date()): StageCheckpoints {
  const base: StageCheckpoints =
    isRecord(raw) && raw["version"] === STAGE_CHECKPOINT_VERSION && raw["jobId"] === jobId && isRecord(raw["stages"])
      ? { version: STAGE_CHECKPOINT_VERSION, jobId, stages: { ...(raw["stages"] as Record<string, Entry>) } }
      : { version: STAGE_CHECKPOINT_VERSION, jobId, stages: {} };
  base.stages[key] = { digest: inputDigest(inputs), value: JSON.parse(JSON.stringify(value)), at: now.toISOString() };
  return base;
}

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Job-bound store. Every call is best-effort and never throws: a storage
 * problem only means the stage is regenerated, never that the build fails.
 */
export function jobStageCheckpointStore(db: Db, job: { jobId: string; organizationId: string; attempts: number }) {
  let cache: unknown = undefined;
  const load = async () => {
    if (cache !== undefined) return cache;
    try {
      const { data, error } = await db
        .from("generation_jobs")
        .select("stage_checkpoints")
        .eq("id", job.jobId)
        .eq("organization_id", job.organizationId)
        .maybeSingle();
      cache = error ? null : ((data as { stage_checkpoints?: unknown } | null)?.stage_checkpoints ?? null);
    } catch {
      cache = null;
    }
    return cache;
  };
  return {
    async get<T>(key: string, inputs: unknown): Promise<T | null> {
      return readStage<T>(await load(), job.jobId, key, inputs);
    },
    /**
     * True when the save was accepted (no storage error), so a resumed run can
     * reuse the stage. A fenced-out attempt also reads true; its next stage
     * fence stops it.
     */
    async put(key: string, inputs: unknown, value: unknown): Promise<boolean> {
      try {
        const next = writeStage(await load(), job.jobId, key, inputs, value);
        const { error } = await db
          .from("generation_jobs")
          .update({ stage_checkpoints: next } as never)
          .eq("id", job.jobId)
          .eq("organization_id", job.organizationId)
          .eq("attempts", job.attempts)
          .eq("status", "processing");
        if (!error) {
          noteProgress(job.jobId);
          cache = next;
          return true;
        }
        console.warn(`[stage-checkpoints] job ${job.jobId}: save of ${key} skipped (${error.message ?? error})`);
      } catch (error) {
        console.warn(`[stage-checkpoints] job ${job.jobId}: save of ${key} skipped (${error instanceof Error ? error.message : "unknown"})`);
      }
      return false;
    },
    async clear(): Promise<void> {
      try {
        await db.from("generation_jobs").update({ stage_checkpoints: null } as never).eq("id", job.jobId).eq("organization_id", job.organizationId);
      } catch {
        /* best-effort */
      }
    },
  };
}
