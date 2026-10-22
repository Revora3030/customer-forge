/**
 * Detached worker for Revora Site Engine generation jobs.
 *
 * The database is the queue and the single source of truth:
 *  - jobs are enqueued as `queued` by the authenticated request (which returns immediately)
 *  - a worker claims one job at a time with a lease, so two workers never
 *    process the same job
 *  - progress is written to the job row at every stage, so the client sees
 *    reliable progress even if the browser reloads
 *  - every customer build is written and designed by the AI team; a missing
 *    AI result stops the build, there is no built-in substitute
 */
import { summarizeCapacityPressure, type ProviderRuntime, type WaitProviders } from "@/lib/builder/capacity-wait";
import type { PageArchitectureOutcome } from "@/lib/builder/ai-page-architecture.server";
import { nextPublishState } from "@/lib/publish-state";
import {
  INTERRUPTED_BUILD_MESSAGE,
  RECOVERING_BUILD_MESSAGE,
  STALLED_LEASE_GRACE_MS,
} from "@/lib/builder/job-liveness";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlaceholderPalette } from "@/lib/site-theme";

const QUEUE_ID = "site_engine";
export const LEASE_SECONDS = 300;
/**
 * Time budgets for the two longest AI stages. Section wording is a refinement
 * of copy that is already AI-authored and fact-checked, so when it overruns it
 * is abandoned (the authored wording stays). Layout always designs every
 * section; only its optional review/craft rounds stop at the budget.
 */
const WORDING_BUDGET_MS = 150_000;
const LAYOUT_OPTIONAL_BUDGET_MS = 240_000;
/** Wall-clock bound for the per-section layout rescue rounds of one attempt. */
export const LAYOUT_RESCUE_BUDGET_MS = 420_000;
const MAX_ATTEMPTS = 3;

type Db = SupabaseClient;

type PendingBuild = {
  mode: "fresh_replace";
  backupId: string;
  requestedBy: string | null;
  requestedAt: string | null;
};

class FreshRebuildRollbackError extends Error {
  constructor(
    message: string,
    public readonly backupId: string,
  ) {
    super(message);
    this.name = "FreshRebuildRollbackError";
  }
}

/**
 * A retry found its own unfinished pages but could not prove they are
 * untouched (the owner edited or added rows after the earlier attempt
 * stopped). The rows are kept and the job fails for good: every retry would
 * reach the same answer.
 */
export class PartialBuildKeptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartialBuildKeptError";
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function readPendingBuild(value: unknown, job: { created_by: string | null }): PendingBuild | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw["mode"] !== "fresh_replace") return null;
  if (!isUuid(raw["backupId"])) return null;
  const requestedBy = typeof raw["requestedBy"] === "string" ? raw["requestedBy"] : null;
  if (job.created_by && requestedBy && requestedBy !== job.created_by) return null;
  return {
    mode: "fresh_replace",
    backupId: raw["backupId"],
    requestedBy,
    requestedAt: typeof raw["requestedAt"] === "string" ? raw["requestedAt"] : null,
  };
}

function withoutPendingBuild(generation: Record<string, unknown>): Record<string, unknown> {
  const next = { ...generation };
  delete next["pendingBuild"];
  return next;
}

async function clearPendingBuild(db: Db, orgId: string) {
  const { data } = await db
    .from("website_settings")
    .select("generation")
    .eq("organization_id", orgId)
    .maybeSingle();
  const generation = (data?.generation ?? {}) as Record<string, unknown>;
  if (!("pendingBuild" in generation)) return;
  const { error } = await db
    .from("website_settings")
    .upsert({ organization_id: orgId, generation: withoutPendingBuild(generation) } as never, {
      onConflict: "organization_id",
    });
  if (error) throw new Error(`Couldn't clear the pending build marker: ${error.message}`);
}

async function rollbackFreshBuild(
  db: Db,
  input: { orgId: string; backupId: string; userId: string | null; message: string },
): Promise<{ restored: boolean; restoreError: string | null }> {
  // Website-only: the previous pages, settings and brand come back; leads,
  // bookings, quote requests and uploads that arrived since stay untouched.
  const { restoreWebsiteFromBackup } = await import("@/lib/backup.server");
  let restore: unknown = null;
  let restoreError: string | null = null;
  try {
    const outcome = await restoreWebsiteFromBackup(db, input.backupId, input.orgId);
    restore = outcome;
    if (!outcome.restored) restoreError = outcome.reason ?? "Rollback failed.";
  } catch (error) {
    restoreError = error instanceof Error ? error.message : "Rollback failed.";
  }
  await db.from("ai_generations").insert({
    organization_id: input.orgId,
    kind: "fresh_rebuild_rollback",
    model: "revora-backup",
    instruction: null,
    result: {
      backupId: input.backupId,
      restored: restoreError === null,
      restore,
      error: input.message,
      restoreError,
      at: new Date().toISOString(),
    } as unknown as never,
    created_by: input.userId,
  } as never);
  await clearPendingBuild(db, input.orgId);
  return { restored: restoreError === null, restoreError };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The generation written when a build starts materializing. It keeps
 * everything already there and, for a fresh rebuild, KEEPS the pendingBuild
 * marker (stamped with this job) so a retry of the same job after a crash
 * still runs as fresh_replace and can still find its restore point. The
 * marker is removed only when the build settles: the final save, the
 * rollback, or settleAbandonedFreshRebuild.
 */
export function materializingGeneration(
  prior: Record<string, unknown> | null,
  jobId: string,
  pendingBuild: Record<string, unknown> | null,
  freshReplace: boolean,
  nowIso: string,
): Record<string, unknown> {
  return {
    ...(prior ?? {}),
    jobId,
    buildState: "materializing",
    buildStartedAt: nowIso,
    ...(freshReplace && pendingBuild ? { pendingBuild: { ...pendingBuild, jobId } } : {}),
  };
}

/**
 * Decides how a claimed job builds from the stored generation. A marker
 * tagged with this job (or an untagged legacy marker that passes validation)
 * makes it a fresh_replace. A marker tagged with ANOTHER job is left over from
 * a rebuild that stopped; it is reported so it can be settled, then cleared.
 */
export function resolveBuildMode(
  priorGeneration: Record<string, unknown> | null,
  job: { id: string; created_by?: string | null },
): { freshReplace: boolean; foreignMarkerJobId: string | null } {
  const marker = priorGeneration?.["pendingBuild"];
  const markerJobId = isRecord(marker) ? marker["jobId"] : undefined;
  if (typeof markerJobId === "string" && markerJobId !== job.id) {
    return { freshReplace: false, foreignMarkerJobId: markerJobId };
  }
  const pending = readPendingBuild(marker, { created_by: job.created_by ?? null });
  return { freshReplace: pending?.mode === "fresh_replace", foreignMarkerJobId: null };
}

/** The platform's own default typeface, seeded on every profile; not an owner request. */
export function isPlatformDefaultFont(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "Space Grotesk";
}

export type SiteMediaClass = "owner" | "generated" | "stock" | "skip";

/**
 * Provenance of one media row for placement on the site. Only "owner" rows
 * are the business's own photos. AI pictures saved without a source (older
 * Image Studio rows named ai-… / revora-image…) are generated, never owner.
 */
export function classifySiteMediaRow(row: {
  source?: string | null;
  file_name?: string | null;
  category?: string | null;
  url?: string | null;
}): SiteMediaClass {
  const isPicture =
    Boolean(row.url) &&
    // A logo is the brand mark, shown in the header — never a page photo.
    String(row.category ?? "").toLowerCase() !== "logo" &&
    // Video clips are not pictures; an <img> of an .mp4 shows nothing.
    !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(row.url));
  if (!isPicture) return "skip";
  const source = row.source == null ? "" : String(row.source).trim();
  if (source === "generated" || source === "ai") return "generated";
  if (!source && /^(ai-|revora-image)/i.test(String(row.file_name ?? ""))) return "generated";
  if (source.startsWith("stock")) return "stock";
  return "owner";
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{4,80}$/;

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42703" || code === "PGRST204") return true;
  return typeof message === "string" && /column .* does not exist|could not find the '.*' column/i.test(message);
}

/**
 * The chat request that started this job, so worker progress is recorded
 * under the same run id the chat shows. Null when the job has none, or when
 * the request_id column has not been migrated yet (the job id is used then).
 */
export async function readJobRequestId(db: Db, jobId: string): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("generation_jobs")
      .select("request_id")
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      if (!isMissingColumnError(error))
        console.warn(`[site-engine] request id for job ${jobId} unreadable: ${error.message}`);
      return null;
    }
    const value = (data as { request_id?: unknown } | null)?.request_id;
    return typeof value === "string" && REQUEST_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export type AbandonedJob = {
  id: string;
  organization_id: string;
  created_by: string | null;
  created_at: string;
};

export type SettleOutcome =
  | { skipped: true; reason: string }
  | { skipped: false; restored: boolean; disturbed: boolean; reason: string | null; backupId: string | null };

/** Number of pages the backup holds, or null when it cannot be read. */
async function backupPageCount(db: Db, backupId: string, orgId: string): Promise<number | null> {
  const { data, error } = await db
    .from("data_backups")
    .select("id, pages:snapshot->website->pages")
    .eq("id", backupId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  const pages = (data as { pages?: unknown }).pages;
  return Array.isArray(pages) ? pages.length : null;
}

/**
 * Settles a fresh rebuild whose worker is gone (the job was closed as failed
 * or cancelled without its own cleanup running). Single-flight: the marker is
 * claimed with a compare-and-set update, so two sweeps never both restore.
 *
 * When the website was disturbed (pages written since the job started, or
 * pages missing compared with the backup), ONLY the website is restored from
 * the rebuild's backup; leads, bookings and uploads are never touched. When it
 * was not, only this job's unused generated first-build pictures are removed.
 */
export async function settleAbandonedFreshRebuild(db: Db, job: AbandonedJob): Promise<SettleOutcome> {
  const orgId = job.organization_id;
  const { data: settings, error: readError } = await db
    .from("website_settings")
    .select("generation")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (readError) return { skipped: true, reason: `generation unreadable: ${readError.message}` };
  const generation = isRecord(settings?.generation) ? (settings.generation as Record<string, unknown>) : {};
  const marker = isRecord(generation["pendingBuild"]) ? generation["pendingBuild"] : null;
  // Only a fresh_replace marker tagged with THIS job proves it was a fresh
  // rebuild and names its own restore point. Every build writes the
  // "materializing" state, and guessing a backup by label and time could
  // restore an earlier rebuild's backup over a newer site, so a build without
  // its own marker is left to the orphan cleanup.
  const markerMatches = marker?.["jobId"] === job.id;
  if (!markerMatches) return { skipped: true, reason: "no fresh rebuild marker for this build" };
  const backupId: string | null = isUuid(marker?.["backupId"]) ? (marker?.["backupId"] as string) : null;

  // Claim: remove the marker only if it still names this job.
  const ownsBuildState = generation["jobId"] === job.id;
  const cleared = withoutPendingBuild(generation);
  if (ownsBuildState) {
    delete cleared["buildState"];
    delete cleared["buildStartedAt"];
  }
  const claimBase = db
    .from("website_settings")
    .update({ generation: cleared } as never)
    .eq("organization_id", orgId);
  const claimQuery = claimBase.filter("generation->pendingBuild->>jobId", "eq", job.id);
  const { data: claimed, error: claimError } = await claimQuery.select("organization_id");
  if (claimError || !claimed?.length) return { skipped: true, reason: "already settled" };

  const [newer, older, expected] = await Promise.all([
    db
      .from("website_pages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", job.created_at),
    db
      .from("website_pages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .lt("created_at", job.created_at),
    backupId ? backupPageCount(db, backupId, orgId) : Promise.resolve(null),
  ]);
  // An unreadable count is treated as disturbed: restoring an intact site
  // from its own backup changes nothing, skipping a needed restore loses it.
  const disturbed =
    Boolean(newer.error || older.error) ||
    (newer.count ?? 0) > 0 ||
    (expected !== null && (older.count ?? 0) < expected);

  let ok = true;
  let reason: string | null = null;
  if (disturbed) {
    if (!backupId) {
      ok = false;
      reason = "no backup was recorded for this rebuild";
    } else {
      try {
        const { restoreWebsiteFromBackup } = await import("@/lib/backup.server");
        const outcome = await restoreWebsiteFromBackup(db, backupId, orgId);
        ok = outcome.restored;
        reason = outcome.restored ? null : (outcome.reason ?? "unknown error");
      } catch (error) {
        ok = false;
        reason = error instanceof Error ? error.message : "unknown error";
      }
    }
  } else {
    reason = "the website was not changed; only unused generated pictures were removed";
    const pictures = await db
      .from("media")
      .select("id, url")
      .eq("organization_id", orgId)
      .eq("source", "generated")
      .ilike("file_name", "first-build-%")
      .gte("created_at", job.created_at)
      .limit(200);
    const rows = ((pictures.data ?? []) as { id: string; url: string | null }[]).filter((row) => row.id);
    if (!pictures.error && rows.length) {
      const urls = rows.map((row) => row.url).filter((url): url is string => Boolean(url));
      const refs = urls.length
        ? await db.from("website_components").select("media_url").eq("organization_id", orgId).in("media_url", urls)
        : { data: [] as { media_url: string | null }[], error: null };
      if (!refs.error) {
        const used = new Set(((refs.data ?? []) as { media_url: string | null }[]).map((row) => row.media_url));
        const unused = rows.filter((row) => !row.url || !used.has(row.url));
        if (unused.length) {
          const { cleanupFirstBuildImages } = await import("@/lib/builder/first-build-images.server");
          await cleanupFirstBuildImages(
            db,
            orgId,
            unused.map((row) => ({ path: row.url ?? "", mediaId: row.id })) as unknown as Parameters<
              typeof cleanupFirstBuildImages
            >[2],
          ).catch(() => undefined);
        }
      }
    }
  }

  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "fresh_rebuild_rollback",
    model: "revora-backup",
    instruction: null,
    result: { restored: ok && disturbed, disturbed, reason, backupId, at: new Date().toISOString() } as unknown as never,
    created_by: job.created_by,
  } as never);

  const note = ok
    ? disturbed
      ? `Previous website restored from backup ${backupId}.`
      : `Previous website kept unchanged; backup ${backupId} is in History.`
    : `Rollback failed: ${reason}; restore backup ${backupId ?? "(none recorded)"} from History.`;
  const { data: current } = await db
    .from("generation_jobs")
    .select("error_message")
    .eq("id", job.id)
    .eq("organization_id", orgId)
    .maybeSingle();
  const existing = String((current as { error_message?: unknown } | null)?.error_message ?? "").trim();
  await db
    .from("generation_jobs")
    .update({ error_message: existing ? `${existing} ${note}` : note } as never)
    .eq("id", job.id)
    .eq("organization_id", orgId)
    .in("status", ["failed", "cancelled"]);

  if (!ok) {
    await db.from("notifications").insert({
      organization_id: orgId,
      title: "Your previous website needs restoring",
      body: `A fresh rebuild stopped and Revora couldn't put your previous website back automatically. Restore backup ${backupId ?? "from before the rebuild"} from History. Your leads and bookings were not affected.`,
      kind: "website",
      link: "/app/website",
    } as never);
    const { captureError } = await import("@/lib/monitoring.server");
    await captureError(new Error(`Fresh rebuild rollback failed for job ${job.id}: ${reason}`), {
      organizationId: orgId,
      source: "server",
      context: { jobId: job.id, backupId, userId: job.created_by },
    });
  }
  return { skipped: false, restored: ok && disturbed, disturbed, reason, backupId };
}

async function settleQuietly(db: Db, jobs: AbandonedJob[]) {
  for (const job of jobs.slice(0, 2)) {
    try {
      await settleAbandonedFreshRebuild(db, job);
    } catch (error) {
      console.warn(`[site-engine] settling abandoned fresh rebuild ${job.id} failed`, error);
    }
  }
}

/**
 * A cancelled fresh rebuild whose worker never reached a fence (it was dead)
 * keeps its marker. Once the lease plus the stall grace has passed since the
 * cancel, no live worker can still be settling it, so it is settled here.
 * Only jobs whose marker still names them are read, so settled ones are never
 * re-read.
 */
export async function sweepCancelledFreshRebuilds(db: Db, organizationId?: string) {
  const threshold = new Date(Date.now() - (LEASE_SECONDS * 1000 + STALLED_LEASE_GRACE_MS)).toISOString();
  let pendingMarkers = db
    .from("website_settings")
    .select("organization_id, marker_job:generation->pendingBuild->>jobId")
    .not("generation->pendingBuild->>jobId", "is", null)
    .limit(20);
  if (organizationId) pendingMarkers = pendingMarkers.eq("organization_id", organizationId);
  let materializingMarkers = db
    .from("website_settings")
    .select("organization_id, marker_job:generation->>jobId")
    .filter("generation->>buildState", "eq", "materializing")
    .limit(20);
  if (organizationId) materializingMarkers = materializingMarkers.eq("organization_id", organizationId);
  const [pending, materializing] = await Promise.all([pendingMarkers, materializingMarkers]);
  const jobIds = [
    ...new Set(
      [...((pending.data ?? []) as { marker_job?: unknown }[]), ...((materializing.data ?? []) as { marker_job?: unknown }[])]
        .map((row) => row.marker_job)
        .filter(isUuid),
    ),
  ];
  if (!jobIds.length) return;
  const { data: jobs, error } = await db
    .from("generation_jobs")
    .select("id, organization_id, created_by, created_at")
    .eq("status", "cancelled")
    .lt("cancel_requested_at", threshold)
    .in("id", jobIds)
    .limit(2);
  if (error) {
    console.warn("[site-engine] cancelled fresh rebuild sweep failed", error.message);
    return;
  }
  await settleQuietly(db, (jobs ?? []) as AbandonedJob[]);
}

/** Collaborators of a failed attempt's cleanup, injectable for tests. */
/** Removes this job's fresh-rebuild marker only if it still names this job; true when claimed. */
async function claimFreshMarker(db: Db, orgId: string, jobId: string): Promise<boolean> {
  const { data } = await db.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle();
  const generation = isRecord(data?.generation) ? (data.generation as Record<string, unknown>) : {};
  const marker = isRecord(generation["pendingBuild"]) ? generation["pendingBuild"] : null;
  if (marker?.["jobId"] !== jobId) return false;
  const { data: claimed, error } = await db
    .from("website_settings")
    .update({ generation: withoutPendingBuild(generation) } as never)
    .eq("organization_id", orgId)
    .filter("generation->pendingBuild->>jobId", "eq", jobId)
    .select("organization_id");
  return !error && Boolean(claimed?.length);
}

export type AttemptFailureDeps = {
  cleanupImages: (assets: import("@/lib/builder/first-build-images.types").FirstBuildImageAsset[]) => Promise<unknown>;
  rollback: (backupId: string, message: string) => Promise<{ restored: boolean; restoreError: string | null }>;
  /**
   * Claims the fresh-rebuild marker for this job (compare-and-set). Only the
   * attempt that still owns the marker may restore; a newer build that already
   * took over keeps its pages. Omitted means owned (tests).
   */
  claimMarker?: () => Promise<boolean>;
};

/**
 * What a failed attempt cleans up before the error leaves runJob. A
 * superseded attempt (StaleAttemptError on a job that was NOT cancelled) owns
 * nothing any more: a newer attempt may be reusing its pictures and writing
 * the site, so it rethrows without cleanup or rollback and the drain skips it.
 * A cancelled or genuinely failed attempt removes its AI pictures and, for a
 * fresh rebuild, restores the previous website.
 */
export async function settleFailedAttempt(
  db: Db,
  input: {
    error: unknown;
    jobId: string;
    generatedAssets: import("@/lib/builder/first-build-images.types").FirstBuildImageAsset[];
    freshReplace: boolean;
    backupId: string | null;
  },
  deps: AttemptFailureDeps,
): Promise<never> {
  const { error } = input;
  if (error instanceof StaleAttemptError) {
    const { data: latest } = await db.from("generation_jobs").select("status").eq("id", input.jobId).maybeSingle();
    if ((latest as { status?: string } | null)?.status !== "cancelled") throw error;
  }
  // A capacity park hands the SAME job back to the queue to resume from its
  // checkpoints. Its pictures are kept so the resumed attempt reuses them by
  // file name (and the saved section designs that reference them still
  // match) instead of re-making and re-reviewing every picture. A resumed
  // attempt carries the reused pictures in its own generatedAssets, so a
  // later genuine failure or cancellation still removes them.
  const { AiCapacityParkError } = await import("@/lib/builder/ai-step-error");
  const parked = error instanceof AiCapacityParkError;
  if (input.generatedAssets.length && !parked) await deps.cleanupImages(input.generatedAssets).catch(() => undefined);
  const message = error instanceof Error ? error.message : "Generation failed.";
  if (input.freshReplace && input.backupId) {
    if (deps.claimMarker && !(await deps.claimMarker())) {
      // Another build (or the abandoned-rebuild sweep) already settled this
      // rebuild; restoring now could overwrite the newer site.
      throw error;
    }
    const rollback = await deps.rollback(input.backupId, message);
    throw new FreshRebuildRollbackError(
      rollback.restored
        ? `${message} The previous website was restored from backup ${input.backupId}.`
        : `${message} Rollback also failed: ${rollback.restoreError ?? "unknown error"}.`,
      input.backupId,
    );
  }
  throw error;
}

export type QueueState = {
  paused: boolean;
  pause_reason: string | null;
  pause_kind: string | null;
  consecutive_rate_limits: number;
};

async function readQueueState(db: Db): Promise<QueueState> {
  const { data, error } = await db
    .from("job_queue_state")
    .select("paused, pause_reason, pause_kind, consecutive_rate_limits")
    .eq("id", QUEUE_ID)
    .maybeSingle();
  if (error) throw new Error("The build queue state could not be checked. Please try again.");
  return (
    (data as QueueState | null) ?? {
      paused: false,
      pause_reason: null,
      pause_kind: null,
      consecutive_rate_limits: 0,
    }
  );
}

async function writeQueueState(db: Db, patch: Record<string, unknown>) {
  await db
    .from("job_queue_state")
    .upsert({ id: QUEUE_ID, ...patch, updated_at: new Date().toISOString() } as never, {
      onConflict: "id",
    });
}

export async function resumeQueue(db: Db) {
  await writeQueueState(db, {
    paused: false,
    pause_kind: null,
    pause_reason: null,
    paused_at: null,
    consecutive_rate_limits: 0,
  });
}

/** Thrown when a newer attempt has taken over this job; the stale run must stop. */
export class StaleAttemptError extends Error {
  constructor(jobId: string) {
    super(`Build attempt for job ${jobId} was superseded by a newer attempt.`);
    this.name = "StaleAttemptError";
  }
}

/**
 * Heartbeat cadence: well before half the lease, so one missed beat (a slow
 * database round trip, a GC pause) still leaves a full beat of margin before
 * the lease lapses. Clamped to the safe range in case LEASE_SECONDS changes.
 */
export function heartbeatIntervalMs(leaseSeconds = LEASE_SECONDS): number {
  const lease = leaseSeconds * 1000;
  // At most every 30s during long stages (conversion, layout synthesis,
  // pictures), and always well inside half the lease.
  return Math.max(5_000, Math.min(30_000, Math.floor(lease / 4), Math.floor(lease / 2) - 5_000));
}

export type LeaseHeartbeat = {
  stop: () => void;
  /** True once the attempt fence stopped holding (another attempt owns it). */
  lost: () => boolean;
  /** Consecutive renewal errors (database/network), reset on success. */
  failures: () => number;
};

/**
 * Keeps a claimed job's lease alive while it runs. Renews on
 * `heartbeatIntervalMs()`, fenced on the attempt number so a superseded attempt
 * never extends a lease it no longer owns. Every renewal error is logged; a
 * renewal that matches no row means this attempt lost the job, and the beat
 * stops so the stale run can be detected instead of silently racing.
 */
export function startLeaseHeartbeat(
  db: Db,
  job: { id: string; attempts: number },
  intervalMs = heartbeatIntervalMs(),
): LeaseHeartbeat {
  let stopped = false;
  let lost = false;
  let failures = 0;
  let inFlight = false;
  const beat = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const result = (await db
        .from("generation_jobs")
        .update({
          lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", job.id)
        .eq("attempts", job.attempts)
        .eq("status", "processing")
        .select("id")) as { data: unknown[] | null; error: { message: string } | null };
      if (result.error) {
        failures += 1;
        console.warn(
          `[site-engine] lease heartbeat failed for job ${job.id} (attempt ${job.attempts}, ${failures} in a row): ${result.error.message}`,
        );
        return;
      }
      failures = 0;
      if (Array.isArray(result.data) && result.data.length === 0 && !stopped) {
        lost = true;
        stopped = true;
        clearInterval(timer);
        console.warn(
          `[site-engine] lease for job ${job.id} is no longer held by attempt ${job.attempts}; heartbeat stopped.`,
        );
      }
    } catch (error) {
      failures += 1;
      console.warn(
        `[site-engine] lease heartbeat threw for job ${job.id} (attempt ${job.attempts}, ${failures} in a row):`,
        error,
      );
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => void beat(), intervalMs);
  (timer as { unref?: () => void }).unref?.();
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    lost: () => lost,
    failures: () => failures,
  };
}

/**
 * Renews the lease immediately (in addition to the background heartbeat) at
 * points where a long AI stage has just finished. Fenced on the attempt, so a
 * superseded attempt never extends a lease it no longer owns.
 */
export async function touchLease(db: Db, job: { id: string; attempts: number }): Promise<void> {
  const { data, error } = await db
    .from("generation_jobs")
    .update({
      lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", job.id)
    .eq("attempts", job.attempts)
    .eq("status", "processing")
    .select("id");
  if (error) throw new Error(`Build lease could not be renewed: ${error.message}`);
  if (!data?.length) throw new StaleAttemptError(job.id);
}

/**
 * A job whose LAST allowed attempt died mid-run (the worker was cut off, the
 * platform recycled it) keeps status "processing" with an expired lease. The
 * claimer skips it because its attempts are used up, so without this sweep the
 * owner would watch "building your website" forever and could never start a
 * new build. It is closed as failed with a plain message so they can retry.
 */
export async function closeAbandonedJobs(db: Db, organizationId?: string) {
  const now = new Date().toISOString();
  // 0. A last attempt cut off by the platform is not the build's fault: hand
  //    it one more attempt through the same bounded capacity deferral so it
  //    resumes from its checkpoints instead of telling the owner to start over.
  await deferCutOffJobs(db, now, organizationId);
  // 1. Out of attempts: close as failed with a plain, actionable message.
  let query = db
    .from("generation_jobs")
    .update({
      status: "failed",
      error_message: INTERRUPTED_BUILD_MESSAGE,
      completed_at: now,
      lease_expires_at: null,
      updated_at: now,
    } as never)
    .eq("status", "processing")
    .gte("attempts", MAX_ATTEMPTS)
    .lt("lease_expires_at", now);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data: closedRows, error } = await query.select(ABANDONED_JOB_COLUMNS);
  if (error) console.warn("[site-engine] abandoned job sweep failed", error.message);
  const closed: AbandonedJob[] = [...((closedRows ?? []) as AbandonedJob[])];

  // A retryable provider error can leave the final attempt queued. It is no
  // longer claimable, so close it without waiting for another Build click.
  let exhausted = db
    .from("generation_jobs")
    .update({
      status: "failed",
      error_message: INTERRUPTED_BUILD_MESSAGE,
      completed_at: now,
      lease_expires_at: null,
      updated_at: now,
    } as never)
    .eq("status", "queued")
    .gte("attempts", MAX_ATTEMPTS);
  if (organizationId) exhausted = exhausted.eq("organization_id", organizationId);
  const exhaustedResult = await exhausted.select(ABANDONED_JOB_COLUMNS);
  if (exhaustedResult.error)
    console.warn("[site-engine] exhausted queued job sweep failed", exhaustedResult.error.message);
  closed.push(...((exhaustedResult.data ?? []) as AbandonedJob[]));

  // 2. A processing row with NO lease at all can never be claimed by the
  //    expired-lease check (null is not "< now" in SQL). Re-queue it if it has
  //    attempts left and has been untouched for the grace period, otherwise
  //    fail it, so it can never become an infinite "finishing" spinner.
  const staleBefore = new Date(Date.now() - STALLED_LEASE_GRACE_MS).toISOString();
  let orphanRetry = db
    .from("generation_jobs")
    .update({ status: "queued", error_message: RECOVERING_BUILD_MESSAGE, updated_at: now } as never)
    .eq("status", "processing")
    .is("lease_expires_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .lt("updated_at", staleBefore);
  if (organizationId) orphanRetry = orphanRetry.eq("organization_id", organizationId);
  const orphanRetryResult = await orphanRetry;
  if (orphanRetryResult.error)
    console.warn("[site-engine] lease-less job requeue failed", orphanRetryResult.error.message);

  let orphanFail = db
    .from("generation_jobs")
    .update({
      status: "failed",
      error_message: INTERRUPTED_BUILD_MESSAGE,
      completed_at: now,
      updated_at: now,
    } as never)
    .eq("status", "processing")
    .is("lease_expires_at", null)
    .gte("attempts", MAX_ATTEMPTS)
    .lt("updated_at", staleBefore);
  if (organizationId) orphanFail = orphanFail.eq("organization_id", organizationId);
  const orphanFailResult = await orphanFail.select(ABANDONED_JOB_COLUMNS);
  if (orphanFailResult.error)
    console.warn("[site-engine] lease-less job close failed", orphanFailResult.error.message);
  closed.push(...((orphanFailResult.data ?? []) as AbandonedJob[]));

  // A closed fresh rebuild gets its previous website back (website only).
  // At most two per drain, so one sweep never holds the worker for long; any
  // marker left over is settled when that workspace builds next.
  await settleQuietly(db, closed);
}

const ABANDONED_JOB_COLUMNS = "id, organization_id, created_by, created_at";

type CutOffRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  attempts: number;
  capacity_deferrals?: number | null;
  lease_expires_at: string | null;
  current_step?: string | null;
};

export async function deferCutOffJobs(db: Db, now: string, organizationId?: string) {
  let query = db
    .from("generation_jobs")
    .select("id, organization_id, created_by, attempts, capacity_deferrals, lease_expires_at, current_step")
    .eq("status", "processing")
    .gte("attempts", MAX_ATTEMPTS)
    .lt("lease_expires_at", now)
    .limit(5);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error || !data?.length) return;
  const { tagFailureMessage } = await import("@/lib/builder/build-failure");
  for (const row of data as CutOffRow[]) {
    if (typeof row.capacity_deferrals !== "number") continue;
    const verdict = capacityVerdict([], row.capacity_deferrals, Date.now(), { forced: true });
    if (!verdict) continue;
    const reason = "The build was cut off before it could finish; it will pick up from its last saved step.";
    const { data: moved } = await db
      .from("generation_jobs")
      .update({
        status: "queued",
        attempts: MAX_ATTEMPTS - 1,
        capacity_deferrals: verdict.count,
        error_message: tagFailureMessage("provider", `${reason} Retrying at ${verdict.retryAt.toISOString().slice(11, 16)} UTC.`),
        failure_kind: "provider",
        lease_expires_at: verdict.retryAt.toISOString(),
        resumes_at: verdict.retryAt.toISOString(),
        wait_reason: reason,
        wait_providers: verdict.pressure,
        updated_at: now,
      } as never)
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (!moved) continue;
    // The re-queued job is later claimed as "queued", so claimJob never writes
    // a lost-attempt marker for it. Without one the resume cannot prove when
    // the dead attempt stopped writing and refuses to continue
    // (PartialBuildKeptError). Record it here, once, by the winning update.
    try {
      await db.from("ai_generations").insert({
        organization_id: row.organization_id,
        job_id: row.id,
        kind: "build_attempt_lost",
        model: "none",
        instruction: null,
        result: {
          previousAttempt: Number(row.attempts),
          previousLeaseExpiresAt: row.lease_expires_at,
          current_step: row.current_step ?? null,
          invoker: "cutoff_deferral",
        } as unknown as never,
        created_by: row.created_by ?? null,
      } as never);
    } catch (error) {
      console.warn(`[site-engine] lost-attempt record for cut-off job ${row.id} skipped`, error);
    }
  }
}

/** Claims one runnable job with a lease. Returns null when there is nothing to do. */
export type WorkerInvoker = "pg_net" | "kick" | "pump" | "runner" | "unknown";

export async function claimJob(db: Db, organizationId?: string, invoker: WorkerInvoker = "unknown") {
  const now = new Date();
  let query = db
    .from("generation_jobs")
    .select("id, organization_id, attempts, created_by, status, lease_expires_at, current_step")
    .in("status", ["queued", "processing"])
    .lt("attempts", MAX_ATTEMPTS)
    // Filter BEFORE limit, otherwise five live/backing-off jobs starve every
    // runnable job behind them. A queued lease is its retry-not-before time.
    .or(`lease_expires_at.is.null,lease_expires_at.lte.${now.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(5);
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data: candidates, error: candidateError } = await query;
  if (candidateError) console.warn("[site-engine] claim query failed", candidateError.message);
  for (const job of candidates ?? []) {
    const leaseFree = !job.lease_expires_at || new Date(job.lease_expires_at as string) <= now;
    if (!leaseFree) continue;
    // Reclaiming a processing job means its previous worker died mid-run.
    // Say so in the logs and on the row, so the owner sees a recovery message
    // instead of a frozen "finishing" state.
    const recovering = job.status === "processing";
    if (recovering)
      console.warn(
        `[site-engine] reclaiming job ${String(job.id)} after its lease expired (attempt ${Number(job.attempts) + 1}/${MAX_ATTEMPTS}).`,
      );

    // Conditional update = single-flight lock: only one worker wins the row.
    const { data: claimed } = await db
      .from("generation_jobs")
      .update({
        status: "processing",
        attempts: (job.attempts as number) + 1,
        started_at: job.status === "queued" ? now.toISOString() : undefined,
        lease_expires_at: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString(),
        updated_at: now.toISOString(),
        ...(recovering ? { error_message: RECOVERING_BUILD_MESSAGE } : {}),
      } as never)
      .eq("id", job.id)
      .eq("attempts", job.attempts as number)
      .eq("status", job.status)
      .or(`lease_expires_at.is.null,lease_expires_at.lte.${now.toISOString()}`)
      .select("id, organization_id, created_by, attempts")
      .maybeSingle();
    if (claimed && recovering) {
      // Attribution for the attempt that died: the values are the ones read
      // before this claim overwrote them. Recorded once, by the winning claim.
      const previousLeaseExpiresAt = (job.lease_expires_at as string | null) ?? null;
      const leaseAt = previousLeaseExpiresAt ? Date.parse(previousLeaseExpiresAt) : Number.NaN;
      try {
        await db.from("ai_generations").insert({
          organization_id: job.organization_id,
          job_id: job.id,
          kind: "build_attempt_lost",
          model: "none",
          instruction: null,
          result: {
            previousAttempt: Number(job.attempts),
            previousLeaseExpiresAt,
            approxDeathAt: Number.isFinite(leaseAt) ? new Date(leaseAt - LEASE_SECONDS * 1000).toISOString() : null,
            current_step: (job as { current_step?: string | null }).current_step ?? null,
            invoker,
          } as unknown as never,
          created_by: (job.created_by as string | null) ?? null,
        } as never);
      } catch (error) {
        console.warn(`[site-engine] lost-attempt record for job ${String(job.id)} skipped`, error);
      }
    }
    if (claimed)
      return claimed as { id: string; organization_id: string; created_by: string | null; attempts: number };
  }
  return null;
}

/** Runs the generation stages (GENERATION_STEPS) for one claimed job using the privileged client. */
async function runJob(
  db: Db,
  job: { id: string; organization_id: string; created_by: string | null; attempts: number },
) {
  const orgId = job.organization_id;
  const { GENERATION_STEPS } = await import("@/lib/site-engine");
  const { readBrief } = await import("@/lib/site-brief");
  const { captureQa } = await import("@/lib/launch-qa");
  const { gatherBriefFacts } = await import("@/lib/site-brief.server");
  const {
    analyzeBusiness,
    blankCopy,
    missingAiCopy,
  } = await import("@/lib/site-engine.server");

  const done: string[] = [];
  // Import progress recorder so the owner's live progress card shows the
  // real worker stages ("reading your business", "writing the pages", …)
  // instead of only seeing stages from chat retries.
  const { noteStage } = await import("@/lib/builder/progress.server");
  // One run id from the chat request through the build: a build started from
  // the chat records its stages under that request id; otherwise the job id.
  const requestId = await readJobRequestId(db, job.id);
  const runId = requestId ?? job.id;
  const WORKER_STAGE_LABELS: Record<string, string> = {
    business: "reading your business",
    services: "reading your services",
    brand: "designing your brand identity",
    analysis: "planning the change",
    structure: "planning the page layout",
    copy: "writing the pages",
    conversion: "checking conversion paths",
    pictures: "generating your pictures",
    pages: "assembling your pages",
    wording: "reviewing every section's wording",
    layout: "composing each section's layout",
    checks: "checking links, mobile and quality",
    leads: "connecting lead capture",
    ready: "preparing your preview",
  };
  // Per-stage wall-clock timings, stored on the job for operator metrics.
  const stageTimings: Record<string, number> = {};
  let stageStartedAt = Date.now();
  const step = async (key: string) => {
    done.push(key);
    stageTimings[key] = Date.now() - stageStartedAt;
    stageStartedAt = Date.now();
    const meta = GENERATION_STEPS.find((s) => s.key === key);
    const { data: fenced } = await db
      .from("generation_jobs")
      .update({
        current_step: key,
        progress: meta?.progress ?? 0,
        steps: done,
        stage_timings: stageTimings,
        lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", job.id)
      // Cancellation fence: an owner-cancelled job is no longer "processing",
      // so the worker stops at the next stage boundary.
      .eq("status", "processing")
      // Attempt fence: a stale worker whose lease was taken over stops here
      // instead of writing over the newer attempt.
      .eq("attempts", job.attempts)
      .select("id");
    if (!fenced || fenced.length === 0) throw new StaleAttemptError(job.id);
    // Progress names the stage that is STARTING now ("generating your
    // pictures" while they are made), never the one that just finished.
    const nextKey = GENERATION_STEPS[GENERATION_STEPS.findIndex((s) => s.key === key) + 1]?.key;
    const starting = nextKey ? WORKER_STAGE_LABELS[nextKey] : undefined;
    if (starting) noteStage(orgId, runId, starting);
  };
  noteStage(orgId, runId, WORKER_STAGE_LABELS["business"] ?? "reading your business");

  const [org, profile, services, media, socials, forms, bookable] = await Promise.all([
    db
      .from("organizations")
      .select("name, industry, conversion_goal")
      .eq("id", orgId)
      .maybeSingle(),
    db.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    db
      .from("services")
      .select("name, description, price, starting_price")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("sort_order"),
    db.from("media").select("id, category, url, alt_text, file_name, source, license, attribution").eq("organization_id", orgId).order("created_at"),
    db.from("social_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    // Only a calculator a visitor can actually answer counts as a quote form,
    // so the AI never plans a quote section around an empty one.
    import("@/lib/quote-usable.server").then(({ usableQuoteFormIds }) => usableQuoteFormIds(db, orgId)),
    db.from("services").select("id").eq("organization_id", orgId).eq("bookable", true),
  ]);
  const usableQuoteForms = forms;

  if (!org.data) throw new Error("Workspace not found.");
  await step("business");

  const p = (profile.data ?? {}) as Record<string, unknown>;
  const realMediaCount = (media.data ?? []).filter((item) =>
    ["hero", "work", "gallery", "team", "premises"].includes(String(item.category ?? "").toLowerCase()),
  ).length + ((p["hero_image_url"] as string) ? 1 : 0);
  // Platform UI wording ("Build my site", "All") saved as a service by an
  // earlier intake bug is never a real business service, so it is dropped
  // before anything is written about it. Nothing is invented in its place.
  const { sanitizeServices, customerBusinessEmail } = await import("@/lib/builder/intake-sanitize");
  const serviceRows = sanitizeServices(
    (services.data ?? []) as {
      name: string;
      description?: string | null;
      price?: number | null;
      starting_price?: number | null;
    }[],
  );
  // Revora's own inbox is never a customer's business email (except on
  // Revora's internal workspace). Treated as "not supplied", never replaced.
  const businessEmail = customerBusinessEmail(p["email"], orgId);
  await step("services");

  const social = (socials.data ?? {}) as Record<string, unknown>;
  const socialLinks = [
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "google_business",
    "linkedin",
  ].filter((k) => typeof social[k] === "string" && String(social[k]).trim()).length;
  await step("brand");

  const testimonials = Array.isArray(p["testimonials"]) ? (p["testimonials"] as unknown[]) : [];
  const goalsRaw = (p["website_goals"] as string[] | undefined) ?? [];
  const goals = (goalsRaw.length ? goalsRaw : org.data.conversion_goal ? [org.data.conversion_goal] : []) as string[];

  /** Supplied facts held back from the site because they failed the integrity check. */
  const withheldFacts: string[] = [];
  const copyFacts = {
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? "",
    description: (p["description"] as string) ?? null,
    city: (p["city"] as string) ?? null,
    state: (p["state"] as string) ?? null,
    serviceArea: (p["service_area"] as string) ?? null,
    phone: (p["phone"] as string | null) ?? null,
    email: businessEmail,
    yearsInBusiness: (p["years_in_business"] as number) ?? null,
    hasHours: Boolean(p["hours"] && Object.keys(p["hours"] as object).length),
    style: (p["font_preference"] as string) ?? null,
    goals,
    ctaLabel: "",
    services: serviceRows,
  };

  // HARD GATE: placeholder, gibberish or fixture business details never reach a
  // built site. Nothing is invented in their place — the build stops and asks
  // for the real information.
  {
    const { assertContentIntegrity, inspectContentIntegrity } = await import("@/lib/builder/content-integrity");
    // A placeholder phone number is not a reason to refuse the whole build.
    // It is withheld from the site (never shown, never replaced by an invented
    // number) and the owner is told to add the real one. Every other field
    // keeps the hard gate.
    const phoneProblems = inspectContentIntegrity([{ field: "phone", value: copyFacts.phone }]);
    if (phoneProblems.length) {
      console.warn(
        `[site-engine] job ${job.id}: phone withheld from the site (${phoneProblems.map((v) => v.detail).join("; ")})`,
      );
      copyFacts.phone = null;
      withheldFacts.push("phone");
    }
    assertContentIntegrity([
      { field: "business name", value: copyFacts.businessName, heading: true },
      { field: "description", value: copyFacts.description },
      { field: "city", value: copyFacts.city },
      { field: "service area", value: copyFacts.serviceArea },
      { field: "phone", value: copyFacts.phone },
      { field: "email", value: copyFacts.email },
      ...serviceRows.map((service, index) => ({
        field: `service ${index + 1} name`,
        value: service.name,
        heading: true,
      })),
      ...serviceRows.map((service, index) => ({
        field: `service ${index + 1} description`,
        value: service.description ?? null,
      })),
    ]);
  }

  // Orchestrator pass: business intelligence, customer intent and conversion
  // strategy. If the owner already reviewed and approved a brief, that exact
  // brief is used — the build never silently replaces their edits.
  const priorSettings = await db
    .from("website_settings")
    .select("generation")
    .eq("organization_id", orgId)
    .maybeSingle();
  let priorGeneration = (priorSettings.data?.generation ?? {}) as Record<string, unknown>;
  // A marker tagged with another build's id is left over from a fresh rebuild
  // that was cancelled or failed: it must never turn this build into a full
  // replace of the draft. That rebuild is settled first (its previous website
  // comes back if it was disturbed), the marker is cleared, and this build
  // runs as requested.
  const buildMode = resolveBuildMode(priorGeneration, job);
  if (buildMode.foreignMarkerJobId) {
    const { data: foreign } = await db
      .from("generation_jobs")
      .select("id, organization_id, created_by, created_at, status, cancel_requested_at")
      .eq("id", buildMode.foreignMarkerJobId)
      .eq("organization_id", orgId)
      .maybeSingle();
    const foreignJob = foreign as (AbandonedJob & { status?: string; cancel_requested_at?: string | null }) | null;
    // A just-cancelled rebuild's worker may still be running and will settle
    // itself; only one that has certainly stopped (past its lease and grace,
    // the same threshold the sweep uses) is settled from here.
    const settledAfter = Date.now() - (LEASE_SECONDS * 1000 + STALLED_LEASE_GRACE_MS);
    const cancelledLongAgo =
      foreignJob?.status === "cancelled" &&
      Date.parse(String(foreignJob.cancel_requested_at ?? "")) < settledAfter;
    if (foreignJob && (foreignJob.status === "failed" || cancelledLongAgo)) {
      await settleQuietly(db, [foreignJob]);
    }
    await clearPendingBuild(db, orgId);
    // Re-read: settling may have restored the previous website's settings.
    const reread = await db
      .from("website_settings")
      .select("generation")
      .eq("organization_id", orgId)
      .maybeSingle();
    priorGeneration = (reread.data?.generation ?? {}) as Record<string, unknown>;
    delete priorGeneration["pendingBuild"];
  }
  const pendingBuild = readPendingBuild(priorGeneration["pendingBuild"], job);
  if ("pendingBuild" in priorGeneration && !pendingBuild) {
    await clearPendingBuild(db, orgId);
    throw new Error("Fresh rebuild metadata was invalid or did not match this build, so nothing was replaced.");
  }
  const freshReplace =
    !buildMode.foreignMarkerJobId && buildMode.freshReplace && pendingBuild?.mode === "fresh_replace";
  const pendingMarker = isRecord(priorGeneration["pendingBuild"]) ? priorGeneration["pendingBuild"] : null;
  const approvedBrief = readBrief(priorGeneration["brief"]);

  // No built-in strategy: an unapproved brief is written by the AI.
  // Early-stage checkpoints: an interrupted attempt of this same job reuses the
  // AI team's finished work instead of asking for it again.
  const stageStore = (await import("@/lib/builder/job-stage-checkpoints")).jobStageCheckpointStore(db as never, {
    jobId: job.id,
    organizationId: orgId,
    attempts: job.attempts,
  });
  const resumedBrief = approvedBrief?.approved ? null : await stageStore.get<Awaited<ReturnType<typeof analyzeBusiness>>>("brief", copyFacts);
  const brief = approvedBrief?.approved
    ? approvedBrief
    : resumedBrief ?? await analyzeBusiness(copyFacts, { organizationId: orgId, userId: job.created_by });
  if (!approvedBrief?.approved && !resumedBrief) await stageStore.put("brief", copyFacts, brief);
  if (!approvedBrief?.approved && !resumedBrief) {
    await db.from("ai_generations").insert({
      organization_id: orgId,
      job_id: job.id,
      kind: "business_brief",
      model: brief.source ?? "ai",
      instruction: null,
      result: brief as unknown as never,
      created_by: job.created_by,
    } as never);
  }
  await step("analysis");

  await step("structure");

  let copy = blankCopy(copyFacts);
  let copyModel = "pending-ai";
  await step("copy");

  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "website_copy",
    model: copyModel,
    instruction: null,
    result: copy as unknown as never,
    created_by: job.created_by,
  } as never);
  await step("conversion");

  const qaFacts = await gatherBriefFacts(db, orgId, brief.missingFacts);
  const qa = captureQa({
    ...qaFacts.qaInput,
    primaryCtaLabel: copy.primaryCta,
    secondaryCtaLabel: copy.secondaryCta || qaFacts.qaInput.secondaryCtaLabel,
  });

  // Materialize the plan into real pages/sections/components so the owner has
  // something to edit and publish. Skipped when the workspace already has pages.
  const [
    { materializeSiteContent },
    { authorBrandIdentity },
    { blankFirstBuildDirection },
    { checkFirstBuildSafety },
    { generateFirstBuildImages },
    { imageRepairPlan },
    { applyScreenshotReferenceToCreative },
  ] =
    await Promise.all([
      import("@/lib/site-materialize.server"),
      import("@/lib/builder/ai-brand-identity.server"),
      import("@/lib/builder/first-build-contract"),
      import("@/lib/builder/first-build-safety"),
      import("@/lib/builder/first-build-images.server"),
      import("@/lib/builder/first-build-image-qa"),
      import("@/lib/builder/screenshot-reference"),
    ]);
  // The visual identity — palette, typefaces, surface treatments — is authored
  // for this business by the design team. A failure stops the build (it is
  // retried); no stock identity is ever substituted.
  await touchLease(db, job);
  const identityInputs = {
    organizationId: orgId,
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? null,
    description: (p["description"] as string) ?? null,
    city: (p["city"] as string) ?? null,
    services: serviceRows.map((service) => ({ name: service.name })),
    // The platform's seeded default typeface is not an owner request; the AI
    // chooses the pairing unless the owner really picked a font.
    requestedFont: isPlatformDefaultFont(p["font_preference"]) ? null : ((p["font_preference"] as string) ?? null),
    ownerInstruction: brief.factAnswers["build_request"] ?? null,
  };
  type BrandIdentity = Awaited<ReturnType<typeof authorBrandIdentity>>;
  const resumedIdentity = await stageStore.get<BrandIdentity>("identity", identityInputs);
  const identity = resumedIdentity ?? await authorBrandIdentity(identityInputs);
  if (!resumedIdentity && identity.direction) await stageStore.put("identity", identityInputs, identity);
  await touchLease(db, job);
  const direction = identity.direction;
  // Pure black/white saved colours are an old neutral placeholder, not an
  // owner brand: the AI team authors the whole palette instead.
  const placeholderPalette = isPlaceholderPalette({
    primaryColor: p["primary_color"] as string | null,
    secondaryColor: p["secondary_color"] as string | null,
  });
  const ownerColour = (key: string) => {
    if (placeholderPalette) return null;
    const value = p[key];
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
  };
  const effectivePalette =
    ownerColour("primary_color") || ownerColour("secondary_color") || ownerColour("accent_color")
      ? {
          primary: ownerColour("primary_color") ?? direction?.primary ?? null,
          secondary: ownerColour("secondary_color") ?? direction?.secondary ?? null,
          accent: ownerColour("accent_color") ?? ownerColour("primary_color") ?? direction?.accent ?? null,
        }
      : direction
        ? { primary: direction.primary, secondary: direction.secondary, accent: direction.accent }
        : null;
  const effectiveFont =
    (typeof p["font_preference"] === "string" &&
      !isPlatformDefaultFont(p["font_preference"]) &&
      (p["font_preference"] as string).trim()) ||
    direction?.font ||
    null;
  const { isLight: isLightSurface } = await import("@/lib/site-theme");
  let creative = blankFirstBuildDirection({
    organizationId: orgId,
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? null,
    description: (p["description"] as string) ?? null,
    city: (p["city"] as string) ?? null,
    state: (p["state"] as string) ?? null,
    serviceArea: (p["service_area"] as string) ?? null,
    phone: copyFacts.phone,
    email: businessEmail,
    yearsInBusiness: (p["years_in_business"] as number) ?? null,
    services: serviceRows,
    goals,
    conversionGoal: goals[0] ?? org.data.conversion_goal ?? null,
    photoCount: realMediaCount,
    hasHeroImage: Boolean(p["hero_image_url"]),
    testimonialCount: testimonials.length,
    bookableServices: (bookable.data ?? []).length,
    hasHours: Boolean(p["hours"] && Object.keys(p["hours"] as object).length),
  });
  const storedReferenceObservations = priorGeneration["screenshotReferenceObservations"];
  let screenshotReference: unknown = priorGeneration["screenshotReference"] ?? null;
  if (storedReferenceObservations) {
    const applied = applyScreenshotReferenceToCreative({
      creative,
      observations: storedReferenceObservations,
      businessName: org.data.name ?? null,
      blockedNames: [org.data.name ?? ""],
    });
    creative = applied.creative;
    screenshotReference = applied.reference;
    await db.from("ai_generations").insert({
      organization_id: orgId,
      job_id: job.id,
      kind: "screenshot_reference_applied",
      model: "none",
      instruction: null,
      result: applied.reference as unknown as never,
      created_by: job.created_by,
    } as never);
  }


  const buildFacts = {
    businessName: copyFacts.businessName,
    industry: copyFacts.industry,
    services: copyFacts.services.map((service) => service.name),
    description: copyFacts.description,
    city: copyFacts.city,
    region: copyFacts.state,
    serviceArea: copyFacts.serviceArea,
    phone: copyFacts.phone,
    email: copyFacts.email,
    yearsInBusiness: copyFacts.yearsInBusiness,
    testimonialCount: testimonials.length,
    hasPrices: copyFacts.services.some(
      (service) => service.price != null || service.starting_price != null,
    ),
    goals: copyFacts.goals,
    hasHours: copyFacts.hasHours,
  };

  // The design team owns the creative direction and the wording. The facts
  // assembled above are only the material it works from: they carry no design
  // authority, and a build never ships wording no model authored or reviewed.
  const { refineFirstBuildWithCollective } = await import(
    "@/lib/builder/collective-first-build.server"
  );
  await touchLease(db, job);
  const refineInputs = { organizationId: orgId, facts: buildFacts, brief, copy, creative, hardGenericityGate: true as const };
  type Refined = Awaited<ReturnType<typeof refineFirstBuildWithCollective>>;
  const resumedRefined = await stageStore.get<Refined>("refined", refineInputs);
  const refined = resumedRefined ?? await refineFirstBuildWithCollective(refineInputs);
  if (!resumedRefined && refined.creativeChanged && refined.changed && missingAiCopy(refined.copy).length === 0)
    await stageStore.put("refined", refineInputs, refined);
  await touchLease(db, job);
  if (refined.creativeChanged) creative = refined.creative;
  if (refined.changed) {
    copy = refined.copy;
    copyModel = refined.passes
      .filter((pass) => pass.used && pass.model)
      .map((pass) => pass.model)
      .join("+") || copyModel;
  }
  // No fact-scaffold fallback: when not one model could author or review this
  // build's wording, the build stops (and is retried) instead of shipping a
  // generic site.
  const existingPages = await db
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  // A previous build that died mid-write (interrupted, failed or cancelled)
  // leaves its "materializing" marker behind. Its half-written pages are not a
  // customer site: pressing Build again starts a NEW job, which used to treat
  // those orphaned rows as the owner's site, skip materialization, and so skip
  // every AI layout pass — freezing the site in a half-built skeleton. Those
  // rows are now identified (fenced by the dead job's start time) and cleared
  // below, so the new build runs every pass from scratch.
  const orphanedBuild = !freshReplace && (existingPages.count ?? 0) > 0
    ? await findOrphanedPartialBuild(db, orgId, priorGeneration, job.id)
    : null;
  // A retry of this same job (a capacity deferral or an ordinary retry) may
  // find the partial pages its earlier attempt wrote. Ownership is settled
  // HERE, before firstBuild: those rows are not a customer site, so the retry
  // still has to pass every AI-authorship check below instead of rebuilding
  // them from scaffold copy after the cleanup.
  const ownPartialBuild = !freshReplace && !orphanedBuild && (existingPages.count ?? 0) > 0
    ? await findOwnPartialBuild(db, orgId, job.id)
    : null;
  const firstBuild =
    freshReplace || (existingPages.count ?? 0) === 0 || orphanedBuild !== null || ownPartialBuild !== null;
  const missingCopy = missingAiCopy(copy);
  if (firstBuild && !refined.creativeChanged) {
    const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
    const solPass = refined.passes.find((pass) => pass.purpose === "creative_direction");
    throw new AiStepUnavailableError("creative direction", solPass?.skipped ?? null);
  }
  if (firstBuild && (!refined.passes.some((pass) => pass.used) || !refined.changed || missingCopy.length)) {
    const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
    throw new AiStepUnavailableError(
      "website wording",
      missingCopy.length ? `missing: ${missingCopy.join(", ")}` : "no model returned usable wording",
    );
  }

  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "collective_first_build",
    model: copyModel,
    instruction: null,
    result: {
      changed: refined.changed,
      creativeChanged: refined.creativeChanged,
      copyChanged: refined.copyChanged,
      creativeBrief: refined.creative.brief.concept || null,
      totalCostMicrocents: refined.totalCostMicrocents,
      passes: refined.passes,
    } as unknown as never,
    created_by: job.created_by,
  } as never);
  // The same adversarial gate runs AFTER any model wording, so a refined page
  // can never reach the site with an unsupported claim.
  const safetyProblems = checkFirstBuildSafety({ facts: buildFacts, copy });
  if (safetyProblems.length) {
    throw new Error(safetyProblems[0]!.detail);
  }
  let generatedAssets: import("@/lib/builder/first-build-images.types").FirstBuildImageAsset[] = [];
  try {
  // A retry of the same first build may find the partial pages written by its
  // previous attempt. They are not an existing customer site and must never
  // make the retry silently skip architecture, composition, chrome, or media.
  // Only rows tagged with this job are cleared; fresh rebuilds remain protected
  // by their restore point and unrelated customer content is untouched.
  // Not gated on the attempt number: a capacity deferral hands its attempt
  // back, so its rerun is attempt 1 again yet still owns these rows. The job
  // marker check in findOwnPartialBuild is what proves ownership.
  if (orphanedBuild) {
    await clearOrphanedPartialBuild(db, orgId, orphanedBuild);
  } else if (ownPartialBuild) {
    await clearOwnPartialBuild(db, orgId, ownPartialBuild);
  }
  // PARALLEL TEAM: the page architect does not need the pictures, so its plan
  // is authored WHILE the photos are being made instead of after them. Only
  // started when this build will actually write pages (a first build), and its
  // outcome is recorded exactly as before.
  const architectureRef: { current: PageArchitectureOutcome | null } = { current: null };
  const earlyOwnerWorkPhotos = ((media.data ?? []) as { category: string | null; alt_text: string | null; url: string | null; file_name: string | null; source: string | null; id: string }[]).filter(
    (row) =>
      classifySiteMediaRow(row) === "owner" &&
      Boolean(row.alt_text?.trim()) &&
      ["work", "premises", "team", "before", "after"].includes(String(row.category ?? "").trim().toLowerCase()),
  ).length;
  const earlyName = org.data?.name ?? "";
  const earlyIndustry = org.data?.industry ?? null;
  const earlyGoal = goals[0] ?? org.data?.conversion_goal ?? null;
  const architecturePlan: Promise<import("@/lib/builder/creative-authority").PageArchitecture[] | null> | null = firstBuild
    ? (async () => {
        const [{ proposePageArchitecture }, { candidatePageInventory }] = await Promise.all([
          import("@/lib/builder/ai-page-architecture.server"),
          import("@/lib/site-materialize.server"),
        ]);
        const primary = String(copy.primaryCta ?? "").trim();
        if (!primary) return null;
        const architectureInputs = {
          organizationId: orgId,
          businessName: earlyName,
          industry: earlyIndustry,
          conversionGoal: earlyGoal,
          candidate: candidatePageInventory(
            {
              businessName: earlyName,
              copy,
              services: serviceRows,
              hasBooking: (bookable.data ?? []).length > 0,
              hasQuoteForm: usableQuoteForms.length > 0,
              // Only the owner's own described work photos can unlock a gallery.
              ownerWorkPhotoCount: earlyOwnerWorkPhotos,
            },
            primary,
          ),
          description: (p["description"] as string) ?? null,
          services: serviceRows.map((service) => String((service as { name?: unknown }).name ?? "")).filter(Boolean),
          serviceArea: (p["service_area"] as string) ?? null,
          contact: { phone: Boolean(String(p["phone"] ?? "").trim()), email: Boolean(String(p["email"] ?? "").trim()) },
        };
        const resumedPlan = await stageStore.get<PageArchitectureOutcome>("architecture", architectureInputs);
        const outcome = resumedPlan ?? await proposePageArchitecture(architectureInputs);
        if (!resumedPlan && outcome.architecture?.length) await stageStore.put("architecture", architectureInputs, outcome);
        architectureRef.current = outcome;
        if (!outcome.architecture?.length) {
          // Carry the real reason (provider, shape, or review refusal) so the
          // job record says why, instead of a generic "no usable plan".
          const { AiStepUnavailableError, AiCapacityParkError } = await import("@/lib/builder/ai-step-error");
          // Busy/unusable AI output waits through the capacity deferral; a reviewer refusal on merits still counts as a failed attempt.
          const ErrorType = outcome.capacity || !outcome.skipped ? AiCapacityParkError : AiStepUnavailableError;
          throw new ErrorType("page plan", outcome.skipped ?? "the architect returned no usable plan");
        }
        return outcome.architecture;
      })()
    : null;
  // Never leave an unhandled rejection if pictures fail first; the error is
  // re-raised where the plan is awaited.
  architecturePlan?.catch(() => undefined);
  noteStage(orgId, runId, "generating your pictures");
  // A retry of an interrupted build reuses the pictures its earlier attempt
  // already stored (only this job's own generated files, by creation time).
  // Checked on every attempt: a capacity-deferred rerun is attempt 1 again.
  let reusablePictures: { id: string; url: string; file_name: string | null; alt_text: string | null; attribution: string | null }[] = [];
  {
    const jobRow = await db.from("generation_jobs").select("created_at").eq("id", job.id).maybeSingle();
    const since = (jobRow.data as { created_at?: string } | null)?.created_at;
    if (since) {
      const earlier = await db
        .from("media")
        .select("id, url, file_name, alt_text, attribution")
        .eq("organization_id", orgId)
        .eq("source", "generated")
        .like("file_name", "first-build-%")
        .gte("created_at", since)
        .limit(60);
      if (!earlier.error) reusablePictures = (earlier.data ?? []) as typeof reusablePictures;
    }
  }
  await touchLease(db, job);
  const starterImages = await generateFirstBuildImages(db, {
    organizationId: orgId,
    userId: job.created_by,
    businessName: org.data.name ?? "",
    city: (p["city"] as string) ?? null,
    photoCount: realMediaCount,
    // Only a deliberately assigned hero fills that role. A generic upload or
    // one work photo no longer blocks the complete supporting image campaign.
    occupiedSlots: new Set([
      ...((p["hero_image_url"] as string) ||
      ((media.data ?? []) as { category: string | null; source: string | null }[]).some(
        (row) => String(row.category ?? "").toLowerCase() === "hero" && row.source === "owner",
      )
        ? (["hero"] as const)
        : []),
    ]),
    creative,
    // The picture stage has a fixed time budget so a slow or rate-limited
    // picture service can never stop the build before pages, menus and buttons
    // are written. Unfilled slots go to the picture repair afterwards.
    onShotDone: () => touchLease(db, job),
    reusable: reusablePictures,
  });
  await touchLease(db, job);
  await step("pictures");
  // Picture records (spec D): one per generated slot with its art direction,
  // pending owner approval. Cosmetic bookkeeping — never blocks the build.
  if (starterImages.assets.length) {
    const { normaliseSlot } = await import("@/lib/builder/image-records");
    const rows = starterImages.assets
      .map((asset) => ({
        organization_id: orgId,
        slot: normaliseSlot(asset.slot),
        direction: String(asset.prompt ?? "").slice(0, 4000),
        alt_text: asset.altText ? String(asset.altText).slice(0, 200) : null,
        source: "generated",
        status: "pending",
        media_id: asset.mediaId,
        rendered_url: asset.path,
        provider: asset.provider || null,
        model: asset.model || null,
      }))
      .filter((row) => row.slot);
    if (rows.length) {
      const { error: recordError } = await db.from("image_records").upsert(rows as never, { onConflict: "organization_id,slot" });
      if (recordError) console.warn("[site-engine] picture records skipped", recordError.message);
    }
  }
  // The customer's own photos always go on the site first, in the places
  // their category suggests; AI pictures only fill whatever is left.
  type MediaRow = { id: string; category: string | null; url: string | null; alt_text: string | null; file_name: string | null; source: string | null };
  const heroUrl = (p["hero_image_url"] as string) || "";
  // A logo is the brand mark, shown in the header — never a page photo.
  // Provenance decides placement: only the business's own photos are shown
  // as their work. AI pictures saved without a source are generated, and
  // licensed stock never goes in gallery/work/process/proof slots.
  const mediaRows = (media.data ?? []) as MediaRow[];
  const describedOnly = (rows: MediaRow[]) => rows.filter((row) => Boolean(row.alt_text?.trim()));
  const ownerCandidates = mediaRows.filter((row) => classifySiteMediaRow(row) === "owner");
  const stockCandidates = mediaRows.filter((row) => classifySiteMediaRow(row) === "stock");
  // A photo without a description is not placed: a file name is never shown
  // as its label or alt text. The owner is told how many need one.
  const ownerRows = describedOnly(ownerCandidates);
  const stockRows = describedOnly(stockCandidates);
  const undescribedPhotos = ownerCandidates.length - ownerRows.length;
  const photoDescriptionNote =
    undescribedPhotos > 0
      ? `${undescribedPhotos} of your photos need a short description before they can go on your site (Media Library)`
      : null;
  if (photoDescriptionNote) withheldFacts.push("photo descriptions");
  const ownerHeroRow = ownerRows.find((row) => String(row.category ?? "").toLowerCase() === "hero");
  const bizName = org.data?.name ?? "Business";
  const ownerAssets: typeof starterImages.assets = [
    ...(heroUrl
      ? [{ slot: "owner-hero", label: `${bizName} photo`, altText: `${bizName}`, path: heroUrl, mediaId: null, provider: "owner", model: "owner", prompt: "", placement: ["hero", "home:hero"], aspectRatio: "3:2" }]
      : []),
    ...ownerRows.map((row) => {
      const cat = String(row.category ?? "work").toLowerCase();
      const label = (row.alt_text ?? "").trim();
      return {
        slot: `owner-${row.id}`,
        label,
        altText: label,
        path: row.url as string,
        mediaId: row.id,
        provider: "owner",
        model: "owner",
        prompt: "",
        assetSource: "owner" as const,
        category: cat,
        placement:
          cat === "hero" && !heroUrl && row.id === ownerHeroRow?.id
            ? ["hero", "home:hero"]
            : cat === "team"
              ? ["about", "story", "team"]
              : cat === "premises"
                ? ["about", "story", "service_area", "contact"]
                : ["gallery", "work", "services", "process", "about", "story"],
        aspectRatio: "3:2",
      };
    }),
    // Licensed stock pictures illustrate; they are never presented as the
    // business's own work, gallery, process or proof.
    ...stockRows.map((row) => {
      const label = (row.alt_text ?? "").trim();
      return {
        slot: `stock-${row.id}`,
        label,
        altText: label,
        path: row.url as string,
        mediaId: row.id,
        provider: "stock",
        model: "stock",
        prompt: "",
        assetSource: "stock" as const,
        category: "other",
        license: (row as { license?: string | null }).license ?? null,
        attribution: (row as { attribution?: string | null }).attribution ?? null,
        placement: ["services", "about", "story"],
        aspectRatio: "3:2",
      };
    }),
  ];
  // Only AI pictures are ever cleaned up on failure; owner photos are never touched.
  generatedAssets = starterImages.assets;
  const siteAssets = [...ownerAssets, ...starterImages.assets];
  const architectBusinessName = org.data.name ?? "";
  const architectIndustry = org.data.industry ?? null;
  const architectGoal = goals[0] ?? org.data.conversion_goal ?? null;
  noteStage(orgId, runId, "writing the pages");
  // Persist ownership before materialization so a failed attempt leaves a
  // verifiable job marker for safe retry cleanup. The marker is metadata only;
  // it does not publish or replace customer content.
  const { error: buildMarkerError } = await db.from("website_settings").upsert(
    {
      organization_id: orgId,
      // Keeps a fresh rebuild's pendingBuild (stamped with this job), so a
      // retry after a crash still replaces and still has its restore point.
      generation: materializingGeneration(
        priorGeneration,
        job.id,
        pendingMarker,
        freshReplace,
        new Date().toISOString(),
      ),
    } as never,
    { onConflict: "organization_id" },
  );
  if (buildMarkerError) throw new Error(buildMarkerError.message);

  const built: Awaited<ReturnType<typeof materializeSiteContent>> = await materializeSiteContent(db, orgId, {
    businessName: org.data.name ?? "",
    copy,
    services: serviceRows,
    city: (p["city"] as string) ?? null,
    state: (p["state"] as string) ?? null,
    serviceArea: (p["service_area"] as string) ?? null,
    phone: copyFacts.phone,
    email: businessEmail,
    yearsInBusiness: (p["years_in_business"] as number) ?? null,
    photoCount: realMediaCount,
    hasQuoteForm: usableQuoteForms.length > 0,
    hasBooking: (bookable.data ?? []).length > 0,
    direction,
    creativeBrief: creative.brief,
    generatedAssets: siteAssets,
    directedBy:
      refined.passes.find((pass) => pass.used && pass.model)?.model ?? "revora-collective",
    reviewedBy:
      refined.passes.filter((pass) => pass.used && pass.model)[1]?.model ?? null,
    conversionGoal: goals[0] ?? org.data.conversion_goal ?? null,
    replaceExisting: freshReplace,
    facts: buildFacts,
    ...(architecturePlan ? { architecture_: architecturePlan } : {}),
    architect: async (candidate, revisionNotes) => {
      const { proposePageArchitecture } = await import(
        "@/lib/builder/ai-page-architecture.server"
      );
      const outcome = await proposePageArchitecture({
        organizationId: orgId,
        businessName: architectBusinessName,
        industry: architectIndustry,
        conversionGoal: architectGoal,
        candidate,
        description: (p["description"] as string) ?? null,
        services: serviceRows.map((service) => String((service as { name?: unknown }).name ?? "")).filter(Boolean),
        serviceArea: (p["service_area"] as string) ?? null,
        ...(revisionNotes ? { revisionNotes } : {}),
      });
      architectureRef.current = outcome;
      return outcome.architecture;
    },
  });
  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "ai_page_architecture",
    model: architectureRef.current?.models.join("+") || "none",
    instruction: null,
    result: (architectureRef.current
      ? {
          authored: architectureRef.current.architecture !== null,
          skipped: architectureRef.current.skipped,
          rejected: architectureRef.current.rejected,
          pages: architectureRef.current.architecture ?? null,
          costMicrocents: architectureRef.current.costMicrocents,
        }
      : { authored: false, skipped: "the page plan was not requested for this build" }) as unknown as never,
    created_by: job.created_by,
  } as never);
  await step("pages");
  // The page set and section order are the AI architect's. Without its plan
  // the build stops (and is retried); a fact inventory is never shipped.
  if (!built.skipped) {
    const outcome = architectureRef.current;
    if (!outcome || !outcome.architecture) {
      const detail = outcome?.rejected.length
        ? outcome.rejected.map((rejection) => JSON.stringify(rejection)).join("; ")
        : outcome?.skipped ?? "the design team was unavailable";
      const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
      throw new AiStepUnavailableError("page plan", detail);
    }
  }
  const attachedPaths = new Set<string>();
  if (!built.skipped && starterImages.assets.length) {
    const componentMedia = await db
      .from("website_components")
      .select("media_url")
      .eq("organization_id", orgId)
      .in("media_url", starterImages.assets.map((asset) => asset.path));
    for (const row of componentMedia.data ?? [])
      if (row.media_url) attachedPaths.add(row.media_url);
  }
  const attachedEvidence = {
    ...starterImages.evidence,
    attached: attachedPaths.size,
  };
  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "first_build_images",
    model: starterImages.evidence.models.join("+") || starterImages.evidence.provider || "none",
    instruction: null,
    result: attachedEvidence as unknown as never,
    created_by: job.created_by,
  } as never);

  // Section-by-section wording authority. Sol reviews every authored section,
  // Terra approves it individually and the same fact gate blocks invention.
  if (!built.skipped) {
    const { refineSectionWordingWithCollective } = await import(
      "@/lib/builder/collective-sections.server"
    );
    const pageRows = await db
      .from("website_pages")
      .select("id, slug")
      .eq("organization_id", orgId);
    const slugById = new Map((pageRows.data ?? []).map((page) => [page.id, page.slug]));
    const sectionRows = await db
      .from("website_sections")
      .select("id, page_id, kind, heading, subheading, body")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true });
    const wording = (sectionRows.data ?? []).map((section) => ({
      id: section.id,
      page: slugById.get(section.page_id) ?? "",
      kind: section.kind,
      heading: section.heading,
      subheading: section.subheading,
      body: section.body,
    }));
    // A privacy or terms page is written from what the site really collects,
    // so it never ships as "a policy has not been supplied".
    const { isLegalPage } = await import("@/lib/builder/page-depth");
    const { legalPageFacts } = await import("@/lib/builder/content-completeness");
    const legalFacts = legalPageFacts({
      businessName: copyFacts.businessName,
      email: copyFacts.email ?? null,
      goals: copyFacts.goals ?? [],
    });
    const pageFacts = Object.fromEntries(
      [...new Set(wording.map((section) => section.page))]
        .filter((slug) => slug && isLegalPage({ slug, kind: null }))
        .map((slug) => [slug, legalFacts]),
    );
    // Section wording is a refinement of copy that is already AI-authored and
    // fact-checked. It is bounded in time: when Sol/Terra are slow, the abort
    // makes the refinement return no patches (the authored wording stays)
    // instead of holding the worker until it is cut off at 74%.
    const wordingAbort = new AbortController();
    type WordingOutcome = Awaited<ReturnType<typeof refineSectionWordingWithCollective>>;
    const keepAuthored: WordingOutcome = { patches: [], passes: [], totalCostMicrocents: 0 };
    const directionSummary = [creative.brief.concept, creative.brief.personality].filter(Boolean).join(" · ");
    const depthNotes = built.depth
      ? Object.fromEntries(Object.entries(built.depth).map(([slug, page]) => [slug, page.notes]).filter(([, notes]) => (notes as string[]).length))
      : undefined;
    // A resumed attempt of this job reapplies the wording the AI team already
    // accepted (same job, same starting copy) instead of rewriting it again.
    const wordingCheckpoint = await import("@/lib/builder/wording-checkpoint");
    const wordingInputs = wordingCheckpoint.wordingCheckpointInputs(wording, {
      facts: buildFacts,
      directionSummary,
      pageFacts,
      depthNotes: depthNotes ?? null,
    });
    const resumedWording = wordingCheckpoint.fromStoredWordingPatches(
      wording,
      await stageStore.get<unknown>("wording", wordingInputs),
    );
    const wordingTimer = setTimeout(() => wordingAbort.abort(), WORDING_BUDGET_MS);
    (wordingTimer as { unref?: () => void }).unref?.();
    // Raced against the abort as well, because not every provider fallback
    // honours the signal; the stage must return on time either way.
    const timedOut = new Promise<WordingOutcome>((resolve) =>
      wordingAbort.signal.addEventListener("abort", () => resolve(keepAuthored), { once: true }),
    );
    const outcome: WordingOutcome = resumedWording
      ? { patches: resumedWording, passes: [], totalCostMicrocents: 0 }
      : await Promise.race([
          refineSectionWordingWithCollective({
            organizationId: orgId,
            facts: buildFacts,
            sections: wording,
            directionSummary,
            hardGenericityGate: true,
            signal: wordingAbort.signal,
            ...(Object.keys(pageFacts).length ? { pageFacts } : {}),
            ...(depthNotes ? { depthNotes } : {}),
          }).catch((error: unknown) => {
            if (!wordingAbort.signal.aborted) throw error;
            return keepAuthored;
          }),
          timedOut,
        ]);
    clearTimeout(wordingTimer);
    if (resumedWording) {
      console.info(`[site-engine] job ${job.id}: reused ${resumedWording.length} saved section wording change(s) from this job's earlier attempt.`);
    } else {
      if (wordingAbort.signal.aborted) {
        console.warn(`[site-engine] job ${job.id}: section wording refinement exceeded its budget; keeping the authored wording.`);
      }
      // Saved either way (an overrun saves "no changes"), so a resumed attempt
      // keeps exactly the wording its saved section designs were made from.
      await stageStore.put("wording", wordingInputs, wordingCheckpoint.toStoredWordingPatches(wording, outcome.patches as never));
    }
    await touchLease(db, job);
    for (const patch of outcome.patches) {
      const update: Record<string, string> = {};
      if (patch.heading !== undefined) update["heading"] = patch.heading;
      if (patch.subheading !== undefined) update["subheading"] = patch.subheading;
      if (patch.body !== undefined) update["body"] = patch.body;
      if (!Object.keys(update).length) continue;
      const wordingWrite = await db
        .from("website_sections")
        .update(update as never)
        .eq("id", patch.id)
        .eq("organization_id", orgId);
      if (wordingWrite.error) {
        throw new Error(`Couldn't save the refined section wording: ${wordingWrite.error.message}`);
      }
    }
    await db.from("ai_generations").insert({
      organization_id: orgId,
      job_id: job.id,
      kind: "collective_section_wording",
      model:
        outcome.passes
          .filter((pass) => pass.used && pass.model)
          .map((pass) => pass.model)
          .join("+") || "none",
      instruction: null,
      result: {
        sections: wording.length,
        rewritten: outcome.patches.length,
        totalCostMicrocents: outcome.totalCostMicrocents,
        passes: outcome.passes,
      } as unknown as never,
      created_by: job.created_by,
    } as never);
  }

  await step("wording");
  // Every content section is laid out by Sol as its own composition. No
  // built-in section layout is used for a new site; missing layouts stop or
  // park the existing job until the AI team can finish them.
  if (!built.skipped) {
    const { composeFirstBuildSections } = await import("@/lib/builder/first-build-compositions.server");
    const composed = await composeFirstBuildSections({
      db: db as never,
      organizationId: orgId,
      facts: buildFacts,
      // Optional review/craft rounds stop once this build has used its layout
      // budget; the required AI design and safety checks always complete.
      optionalPassDeadline: Date.now() + LAYOUT_OPTIONAL_BUDGET_MS,
      rescueDeadline: Date.now() + LAYOUT_RESCUE_BUDGET_MS,
      onPageDone: () => touchLease(db, job),
      // Accepted section designs are checkpointed on the job after every
      // chunk; a retry of this job restores the ones whose inputs still match.
      checkpoint: {
        jobId: job.id,
        store: (await import("@/lib/builder/first-build-section-checkpoints")).jobSectionCheckpointStore(db as never, {
          jobId: job.id,
          organizationId: orgId,
          attempts: job.attempts,
        }),
      },
      lookSummary: JSON.stringify({
        concept: creative.brief.concept,
        personality: creative.brief.personality,
        typography: creative.brief.typography,
        color: creative.brief.color,
        heroComposition: creative.brief.heroComposition,
        sectionRhythm: creative.brief.sectionRhythm,
        cardLanguage: creative.brief.cardLanguage,
        ctaLanguage: creative.brief.ctaLanguage,
        backgroundTreatment: creative.brief.backgroundTreatment,
        shapeLanguage: creative.brief.shapeLanguage,
        motion: creative.brief.motion,
        photography: creative.brief.photography,
        // The palette the site will actually wear: the owner's own colours
        // when set (they are never overwritten), else the AI identity. Sections
        // composed against a different palette than the theme clashed with it.
        ownerPalette: effectivePalette,
        ownerFont: effectiveFont,
        surfaceIs: effectivePalette?.secondary ? (isLightSurface(effectivePalette.secondary) ? "light" : "dark") : null,
      }),
    });
    // Every section is designed by the AI team. A section left without its
    // layout stops the build (it is retried) instead of shipping a default.
    if ((composed.fallback ?? 0) > 0) {
      const { AiStepUnavailableError, AiCapacityParkError } = await import("@/lib/builder/ai-step-error");
      if (composed.capacityParked)
        throw new AiCapacityParkError(
          "section layouts",
          `${composed.fallback} section${composed.fallback === 1 ? "" : "s"} still need a layout and the AI team is at capacity`,
        );
      throw new AiStepUnavailableError(
        "section layouts",
        `${composed.fallback} section${composed.fallback === 1 ? "" : "s"} could not be designed`,
      );
    }
    await db.from("ai_generations").insert({
      organization_id: orgId,
      job_id: job.id,
      kind: "first_build_compositions",
      model: composed.models.join("+") || "none",
      instruction: null,
      result: composed as unknown as never,
      created_by: job.created_by,
    } as never);
    // Sol also designs the menu bar and footer. Its failure stops the build
    // (it is retried); no generic menu is substituted.
    const { composeSiteChrome } = await import("@/lib/builder/first-build-chrome.server");
    const chrome = await composeSiteChrome({
      db: db as never,
      organizationId: orgId,
      businessName: org.data.name ?? "",
      facts: buildFacts,
      primaryCta: copy.primaryCta ?? null,
      // The menu and footer follow the SAME creative direction as the page
      // sections; colours and font alone produced a header that clashed with
      // the rest of the site's typography, shapes and buttons.
      lookSummary: JSON.stringify({
        colors: effectivePalette,
        font: effectiveFont,
        concept: creative.brief.concept,
        personality: creative.brief.personality,
        typography: creative.brief.typography,
        ctaLanguage: creative.brief.ctaLanguage,
        shapeLanguage: creative.brief.shapeLanguage,
        surfaceIs: effectivePalette?.secondary ? (isLightSurface(effectivePalette.secondary) ? "light" : "dark") : null,
      }),
    });
    await db.from("ai_generations").insert({
      organization_id: orgId,
      job_id: job.id,
      kind: "first_build_chrome",
      model: chrome.models.join("+") || "none",
      instruction: null,
      result: chrome as unknown as never,
      created_by: job.created_by,
    } as never);
  } else {
    // The site already had pages (an older workspace or a rebuild), so page
    // writing was skipped — but a site without a menu bar or footer is not
    // finished. Sol designs them now; the rest of the site is untouched.
    const { readSiteChrome } = await import("@/lib/builder/site-chrome");
    const current = await db.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle();
    const existing = readSiteChrome(current.data?.generation ?? null);
    if (!existing.header || !existing.footer) {
      const { composeSiteChrome } = await import("@/lib/builder/first-build-chrome.server");
      const chrome = await composeSiteChrome({
        db: db as never,
        organizationId: orgId,
        businessName: org.data.name ?? "",
        facts: buildFacts,
        primaryCta: copy.primaryCta ?? null,
        lookSummary: JSON.stringify({
          colors: effectivePalette,
          font: effectiveFont,
          concept: creative.brief.concept,
          personality: creative.brief.personality,
          typography: creative.brief.typography,
          ctaLanguage: creative.brief.ctaLanguage,
          shapeLanguage: creative.brief.shapeLanguage,
          surfaceIs: effectivePalette?.secondary ? (isLightSurface(effectivePalette.secondary) ? "light" : "dark") : null,
        }),
      });
      await db.from("ai_generations").insert({
        organization_id: orgId,
        job_id: job.id,
        kind: "existing_site_chrome",
        model: chrome.models.join("+") || "none",
        instruction: null,
        result: chrome as unknown as never,
        created_by: job.created_by,
      } as never);
    }
  }

  await step("layout");
  // A brand chosen by the owner wins. Only replace the untouched generated
  // defaults during a first build, so onboarding produces a distinctive site
  // without overwriting deliberate colours on an existing workspace.
  const hasOwnerBrand = Boolean(
    ((p["font_preference"] as string) && !isPlatformDefaultFont(p["font_preference"])) ||
      (!placeholderPalette &&
        ((p["secondary_color"] as string) ||
          (p["accent_color"] as string) ||
          (p["primary_color"] as string))),
  );
  if (!built.skipped && direction && !hasOwnerBrand) {
    const { error: themeError } = await db
      .from("business_profiles")
      .update({
        primary_color: direction.primary,
        secondary_color: direction.secondary,
        accent_color: direction.accent,
        font_preference: direction.font,
      } as never)
      .eq("organization_id", orgId);
    if (themeError) {
      // Theme update failed (RLS or DB error). Don't stop the build — the
      // site is already created; the theme can be applied later.
      console.warn(`[site-engine] Theme update failed for ${orgId}: ${themeError.message}`);
    }
  }

  const report = {
    jobId: job.id,
    builtAt: new Date().toISOString(),
    pages: built.pages,
    sections: built.sections,
    services: serviceRows.length,

    faqs: copy.faqs.length,
    photos: realMediaCount,
    leadForms: usableQuoteForms.length,
    bookableServices: (bookable.data ?? []).length,
    seoConfigured: Boolean(copy.metaTitle && copy.metaDescription),
    // Truthful: leads only reach the built-in customer record when at least one
    // capture route exists on the site. Never reported as connected otherwise.
    crmConnected: usableQuoteForms.length > 0 || (bookable.data ?? []).length > 0,
    analyticsConfigured: true,
    imagery: {
      status: creative.imagery.status,
      generatedStatus: starterImages.evidence.status,
      generated: starterImages.evidence.generated,
      attached: attachedPaths.size,
      source: starterImages.evidence.source ?? "none",
      rejected: starterImages.evidence.rejected ?? [],
      paidNote: starterImages.evidence.paidNote ?? null,
      paidCostMicrocents: starterImages.evidence.paidCostMicrocents ?? 0,
      repairPlan: imageRepairPlan({
        rejected: starterImages.evidence.rejected ?? [],
        skipped: starterImages.evidence.skipped ?? [],
      }),
      provider: starterImages.evidence.provider,
      models: starterImages.evidence.models,
      message: starterImages.evidence.message,
      readiness: starterImages.evidence.status === "generated" || starterImages.evidence.status === "owner_photos" ? 100 : 0,
      missingRequired: starterImages.evidence.skipped,
    },
    firstPreviewGate: {
      content: qa.blockers.length === 0 ? "PASS" : "FAIL",
      browser: "NOT_VERIFIED",
      visual: "NOT_VERIFIED",
      images:
        starterImages.evidence.status === "owner_photos"
          ? "OWNER_PHOTOS"
          : starterImages.assets.length > 0
            ? "STARTER_PICTURES"
            : "OWN_ARTWORK",
      mobile: "NOT_VERIFIED",
      performance: "NOT_VERIFIED",
      ready: false,
      evidenceSource: "website_visual_reports",
      reason:
        "Draft materialization finished. Readiness remains false until fresh owner-browser measurements are server-graded for every visible page.",
    },
    briefSource: brief.source,
    copyModel,
    checks: qa.checks,
    attention: [
      ...(photoDescriptionNote ? [photoDescriptionNote] : []),
      ...qa.blockers.map((c) => c.fix),
      ...(usableQuoteForms.length || (bookable.data ?? []).length
        ? []
        : ["Turn on the quote calculator or make a service bookable so visitors can enquire."]),
      ...((media.data ?? []).length >= 5 ? [] : ["Add at least five photos of your own work."]),
      // Picture problems feed the same attention list the repair loop reads, so a
      // blocked or rejected starter picture is fixed rather than quietly ignored.
      ...(starterImages.evidence.status === "owner_photos" || starterImages.assets.length > 0
        ? []
        : [`Pictures: ${starterImages.evidence.message}`]),
      ...(starterImages.evidence.rejected ?? []).map(
        (item) => `Picture check: the ${item.label} picture was not used because ${item.reason}.`,
      ),
      ...brief.missingFacts,
    ].slice(0, 8),
  };

  const keepState = await nextPublishState(db, orgId);

  if (!built.skipped) {
    const { assertFirstBuildSavedCoverage } = await import("@/lib/builder/first-build-saved-coverage.server");
    await assertFirstBuildSavedCoverage(db, orgId, { pages: built.pages, sections: built.sections });
  }

  // Re-read generation right before the final save. Stages above (the AI
  // header/footer, the build marker) wrote into it after `priorGeneration`
  // was read; merging from the stale copy erased the authored menu and footer.
  const latestSettings = await db
    .from("website_settings")
    .select("generation")
    .eq("organization_id", orgId)
    .maybeSingle();
  const latestGeneration = (latestSettings.data?.generation ?? priorGeneration) as Record<string, unknown>;
  const { buildState: _buildState, buildStartedAt: _buildStartedAt, ...settledGeneration } =
    withoutPendingBuild(latestGeneration);
  void _buildState;
  void _buildStartedAt;

  const { error: saveError } = await db.from("website_settings").upsert(
    {
      organization_id: orgId,
      // Legacy non-null database compatibility marker only. No renderer or
      // creative path reads this value; the authored composition is above.
      template: "ai-authored",
      generation: {
        ...settledGeneration,
        copy,
        brief,
        report: {
          ...report,
          buildMode: freshReplace ? "fresh_replace" : "safe",
          backupId: pendingBuild?.backupId ?? null,
          screenshotReferenceApplied:
            !!screenshotReference &&
            typeof screenshotReference === "object" &&
            (screenshotReference as { applied?: unknown }).applied === true,
        },
        firstBuildCreative: creative,
        screenshotReference,
        screenshotReferenceObservations: storedReferenceObservations ?? null,
        ...(!built.skipped && direction ? { effects: { backdrop: direction.backdrop, ...(direction.backdropSpec ? { spec: direction.backdropSpec } : {}) } } : {}),
        // The design team's component treatments (questions, cards, buttons)
        // ride with the site design so the renderer never invents its own.
        ...(!built.skipped && direction?.tokens ? { designTokens: direction.tokens } : {}),
      } as unknown as Record<string, unknown>,
      generated_at: new Date().toISOString(),
      review_state: "ready_for_review",
      publish_state: keepState,
      seo: {
        title: copy.metaTitle,
        headline: copy.heroHeadline,
        subheadline: copy.heroSubheadline,
        meta_description: copy.metaDescription,
        primary_cta_label: copy.primaryCta,
        og_title: copy.ogTitle,
        og_description: copy.ogDescription,
      },
    } as never,
    { onConflict: "organization_id" },
  );
  if (saveError) throw new Error(saveError.message);
  noteStage(orgId, runId, "finishing up");
  // Final check before the owner sees the draft: the same safe automatic
  // repairs the builder runs after every chat edit (broken internal links,
  // missing page titles/descriptions). They only correct facts the site
  // already has, never the design, and a failure here never blocks the build.
  if (!built.skipped) {
    try {
      // Every button and menu link must lead to a real page of this site.
      const { ensureLinkIntegrity } = await import("@/lib/builder/link-integrity.server");
      await ensureLinkIntegrity(db as never, orgId);
    } catch (error) {
      console.warn("[site-engine] first-build link check skipped", (error as Error)?.message);
    }
    try {
      const { runQaRepairLoop } = await import("@/lib/builder/qa-loop.server");
      await runQaRepairLoop(db as never, orgId, "first build", 12);
    } catch (error) {
      console.warn("[site-engine] first-build QA repair skipped", (error as Error)?.message);
    }
  }
  await step("checks");
  await step("leads");

  const completion = await db
    .from("generation_jobs")
    .update({
      status: "completed",
      progress: 100,
      current_step: "ready",
      steps: [...done, "ready"],
      error_message: null,
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      stage_timings: stageTimings,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", job.id)
    .eq("attempts", job.attempts)
    .eq("status", "processing")
    .select("id");
  const completedRows = (completion.data ?? []) as unknown[];
  if (completion.error || completedRows.length === 0) {
    // The job was cancelled, taken over by another worker, or the write failed:
    // never tell the owner a draft is ready when this run no longer owns the job.
    console.warn(
      `[site-engine] job ${job.id}: completion not recorded (${completion.error?.message ?? "job no longer owned by this run"}); skipping the ready notification.`,
    );
    return;
  }
  // The build is done: its section checkpoint has served its purpose.
  {
    const { jobSectionCheckpointStore } = await import("@/lib/builder/first-build-section-checkpoints");
    await jobSectionCheckpointStore(db as never, { jobId: job.id, organizationId: orgId, attempts: job.attempts }).clear();
    await stageStore.clear();
  }

  const leadCapture = usableQuoteForms.length > 0 || (bookable.data ?? []).length > 0;
  await db.from("notifications").insert({
    organization_id: orgId,
    title: freshReplace ? "Your fresh website rebuild is ready" : "Your website draft is ready to review",
    body:
      (leadCapture
        ? "Revora built your site from your information and connected lead capture."
        : "Revora built your site. Turn on the quote calculator or online booking to capture leads.") +
      (withheldFacts.includes("phone")
        ? " Your phone number looked like a placeholder, so it was left off the site — add your real number in Business details to show call buttons."
        : ""),
    kind: "website",
    link: "/app/website",
  } as never);
  } catch (error) {
    // A superseded attempt rethrows its StaleAttemptError untouched (no picture
    // cleanup, no rollback); a cancelled or failed one cleans up as before.
    await settleFailedAttempt(
      db,
      {
        error,
        jobId: job.id,
        generatedAssets,
        freshReplace,
        backupId: pendingBuild?.backupId ?? null,
      },
      {
        cleanupImages: async (assets) => {
          const { cleanupFirstBuildImages } = await import("@/lib/builder/first-build-images.server");
          await cleanupFirstBuildImages(db, orgId, assets);
        },
        rollback: (backupId, message) =>
          rollbackFreshBuild(db, { orgId, backupId, userId: job.created_by, message }),
        claimMarker: () => claimFreshMarker(db, orgId, job.id),
      },
    );
  }
}

/** A dead earlier build whose partial rows can be safely cleared. */
type OrphanedBuild = { jobId: string; since: string };

/**
 * Finds the partial output of an earlier build that never finished. Only
 * returns a match when ALL of these hold, so a real customer site is never
 * treated as disposable:
 *  - website_settings.generation still carries buildState "materializing"
 *    (it is removed when a build settles successfully);
 *  - the marker names a different job, and that job is failed or cancelled;
 *  - no page in the workspace is older than that job (anything older belongs
 *    to the owner and blocks the cleanup).
 */
export async function findOrphanedPartialBuild(
  db: Db,
  orgId: string,
  generation: Record<string, unknown>,
  currentJobId: string,
): Promise<OrphanedBuild | null> {
  if (generation["buildState"] !== "materializing") return null;
  const deadJobId = typeof generation["jobId"] === "string" ? generation["jobId"] : null;
  if (!deadJobId || deadJobId === currentJobId) return null;
  const { data: dead } = await db
    .from("generation_jobs")
    .select("id, status, created_at")
    .eq("id", deadJobId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const row = dead as { status?: string; created_at?: string } | null;
  if (!row?.created_at || (row.status !== "failed" && row.status !== "cancelled")) return null;
  const older = await db
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .lt("created_at", row.created_at);
  if ((older.count ?? 0) > 0) {
    console.warn(
      `[site-engine] earlier build ${deadJobId} left partial rows, but older owner pages exist; they are kept untouched.`,
    );
    return null;
  }
  return { jobId: deadJobId, since: row.created_at };
}

/** Deletes only the rows written since the dead build started (components → sections → pages). */
async function clearOrphanedPartialBuild(db: Db, orgId: string, orphan: OrphanedBuild) {
  const pageIds = await db
    .from("website_pages")
    .select("id")
    .eq("organization_id", orgId)
    .gte("created_at", orphan.since);
  const ids = (pageIds.data ?? []).map((row) => row.id as string);
  if (!ids.length) return;
  const sectionIds = await db.from("website_sections").select("id").eq("organization_id", orgId).in("page_id", ids);
  const sIds = (sectionIds.data ?? []).map((row) => row.id as string);
  if (sIds.length) {
    const componentDelete = await db.from("website_components").delete().eq("organization_id", orgId).in("section_id", sIds);
    if (componentDelete.error) throw new Error(`Couldn't clear the interrupted build's components: ${componentDelete.error.message}`);
    const sectionDelete = await db.from("website_sections").delete().eq("organization_id", orgId).in("id", sIds);
    if (sectionDelete.error) throw new Error(`Couldn't clear the interrupted build's sections: ${sectionDelete.error.message}`);
  }
  const pageDelete = await db.from("website_pages").delete().eq("organization_id", orgId).in("id", ids);
  if (pageDelete.error) throw new Error(`Couldn't clear the interrupted build's pages: ${pageDelete.error.message}`);
  console.warn(`[site-engine] cleared ${ids.length} page(s) left by interrupted build ${orphan.jobId}.`);
}

/**
 * This job's own unfinished output from an earlier attempt: the rows written
 * since the job was created, and when the attempt that wrote them stopped
 * writing (null when that can't be proven).
 */
export type OwnPartialBuild = { since: string; writtenUntil: string | null };

/**
 * Finds the partial pages an earlier attempt of THIS job left behind. Only a
 * marker naming this job counts, and any page older than the job means a real
 * customer site is present: the retry stops instead of treating it as its own.
 */
export async function findOwnPartialBuild(db: Db, orgId: string, jobId: string): Promise<OwnPartialBuild | null> {
  const partial = await db
    .from("website_settings")
    .select("generation")
    .eq("organization_id", orgId)
    .maybeSingle();
  // A failed read must not look like "no partial build": that would skip the AI-authorship checks.
  if (partial.error) throw new Error(`Couldn't read this build's progress marker: ${partial.error.message}`);
  const generation = (partial.data?.generation ?? {}) as Record<string, unknown>;
  const report = generation["report"] as Record<string, unknown> | undefined;
  if (report?.["jobId"] !== jobId && generation["jobId"] !== jobId) return null;
  // Fence by job: only rows written since this job was created are its own
  // partial output. Anything older belongs to the customer and is kept.
  const jobRow = await db
    .from("generation_jobs")
    .select("created_at")
    .eq("id", jobId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const since = jobRow.data?.created_at as string | undefined;
  if (!since) throw new Error("Couldn't confirm which rows this build attempt owns.");
  const older = await db
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .lt("created_at", since);
  if (older.error) throw new Error(`Couldn't check for pages older than this build: ${older.error.message}`);
  if ((older.count ?? 0) > 0) {
    throw new Error("This retry found pages older than the build itself, so it stopped instead of deleting them.");
  }
  // The attempt that wrote the rows started at the marker's buildStartedAt;
  // the first attempt end recorded after that (a failed attempt's
  // build_attempt_ended row, or a dead one's lease expiry) bounds its writes.
  const startedAt = generation["jobId"] === jobId ? Date.parse(String(generation["buildStartedAt"] ?? "")) : Number.NaN;
  const anchor = Number.isFinite(startedAt) ? startedAt : Date.parse(since);
  const { data: ends, error: endsError } = await db
    .from("ai_generations")
    .select("kind, result, created_at")
    .eq("organization_id", orgId)
    .eq("job_id", jobId)
    .in("kind", ["build_attempt_ended", "build_attempt_lost"]);
  if (endsError) throw new Error(`Couldn't read when this build's earlier attempt stopped: ${endsError.message}`);
  const bounds = ((ends ?? []) as { kind: string; result: unknown; created_at: string | null }[])
    .map((row) =>
      // An ended attempt is stamped by the database clock, the same clock as
      // the rows' updated_at; a lost one by its last lease.
      Date.parse(
        row.kind === "build_attempt_ended"
          ? String(row.created_at ?? "")
          : String((isRecord(row.result) ? row.result["previousLeaseExpiresAt"] : null) ?? ""),
      ),
    )
    .filter((at) => Number.isFinite(at) && at >= anchor)
    .sort((a, b) => a - b);
  return { since, writtenUntil: bounds.length ? new Date(bounds[0]!).toISOString() : null };
}

/**
 * Deletes this job's own partial rows (components → sections → pages), but
 * only when none was created or changed after the earlier attempt stopped. A
 * deferral can wait hours; anything the owner touched in that window is kept
 * and the job fails instead.
 */
export async function clearOwnPartialBuild(db: Db, orgId: string, own: OwnPartialBuild) {
  const keep = "so they were kept instead of deleted. Press Build again once you're done editing.";
  if (!own.writtenUntil) {
    throw new PartialBuildKeptError(`Couldn't confirm when this build's earlier attempt stopped writing its unfinished pages, ${keep}`);
  }
  const until = Date.parse(own.writtenUntil);
  type Stamped = { id: string; created_at: string | null; updated_at: string | null };
  const touchedLater = (rows: Stamped[]) =>
    rows.some((row) => Math.max(Date.parse(String(row.created_at ?? "")) || 0, Date.parse(String(row.updated_at ?? "")) || 0) > until);
  const pageRows = await db
    .from("website_pages")
    .select("id, created_at, updated_at")
    .eq("organization_id", orgId)
    .gte("created_at", own.since);
  // Every read must succeed: a failed one would hide edited rows (deletes cascade to sections and components).
  if (pageRows.error) throw new Error(`Couldn't read the incomplete build pages: ${pageRows.error.message}`);
  const pages = (pageRows.data ?? []) as Stamped[];
  const ids = pages.map((row) => row.id);
  if (!ids.length) return;
  const sectionRows = await db
    .from("website_sections")
    .select("id, created_at, updated_at")
    .eq("organization_id", orgId)
    .in("page_id", ids);
  if (sectionRows.error) throw new Error(`Couldn't read the incomplete build sections: ${sectionRows.error.message}`);
  const sections = (sectionRows.data ?? []) as Stamped[];
  const sIds = sections.map((row) => row.id);
  const componentRows = sIds.length
    ? await db
        .from("website_components")
        .select("id, created_at, updated_at")
        .eq("organization_id", orgId)
        .in("section_id", sIds)
    : { data: [], error: null };
  if (componentRows.error) throw new Error(`Couldn't read the incomplete build components: ${componentRows.error.message}`);
  const components = (componentRows.data ?? []) as Stamped[];
  if (touchedLater(pages) || touchedLater(sections) || touchedLater(components)) {
    throw new PartialBuildKeptError(`This build's unfinished pages were edited after its earlier attempt stopped, ${keep}`);
  }
  if (sIds.length) {
    const componentDelete = await db.from("website_components").delete().eq("organization_id", orgId).in("section_id", sIds);
    if (componentDelete.error) throw new Error(`Couldn't clear the incomplete build components: ${componentDelete.error.message}`);
    const sectionDelete = await db.from("website_sections").delete().eq("organization_id", orgId).in("id", sIds);
    if (sectionDelete.error) throw new Error(`Couldn't clear the incomplete build sections: ${sectionDelete.error.message}`);
  }
  const pageDelete = await db.from("website_pages").delete().eq("organization_id", orgId).in("id", ids);
  if (pageDelete.error) throw new Error(`Couldn't clear the incomplete build pages: ${pageDelete.error.message}`);
}

export type DrainResult = {
  processed: number;
  failed: number;
  paused: boolean;
  pauseReason: string | null;
  idle: boolean;
};

/**
 * Processes a bounded batch of jobs. Safe to call from cron, from a kick after
 * enqueue, or from the client's polling hook — the lease keeps it single-flight.
 */
export async function drainSiteEngineQueue(
  db: Db,
  options: { max?: number; organizationId?: string; probeWhilePaused?: boolean; invoker?: WorkerInvoker } = {},
  executeJob: typeof runJob = runJob,
): Promise<DrainResult> {
  const max = Math.min(Math.max(options.max ?? 2, 1), 5);
  let state = await readQueueState(db);

  // Recover legacy automatic pauses. A tenant's quota/policy/provider failure
  // must never disable other tenants. Fence recovery so a new operator block
  // cannot be cleared between this read and the update.
  if (state.paused && (state.pause_kind === "rate_limit" || state.pause_kind === "credits")) {
    const { error } = await db.from("job_queue_state")
      .update({
        paused: false,
        pause_kind: null,
        pause_reason: null,
        paused_at: null,
        consecutive_rate_limits: 0,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", QUEUE_ID)
      .eq("paused", true)
      .in("pause_kind", ["rate_limit", "credits"]);
    if (error) throw new Error("The automatic queue pause could not be cleared. Please try again.");
    state = await readQueueState(db);
  }
  // Explicit operator blocks still apply; only an explicit probe may bypass one.
  let budget = max;
  if (state.paused) {
    if (options.probeWhilePaused) {
      budget = 1;
    } else {
      return { processed: 0, failed: 0, paused: true, pauseReason: state.pause_reason, idle: true };
    }
  }

  await writeQueueState(db, { last_run_at: new Date().toISOString() });
  await closeAbandonedJobs(db, options.organizationId);
  try {
    await sweepCancelledFreshRebuilds(db, options.organizationId);
  } catch (error) {
    console.warn("[site-engine] cancelled fresh rebuild sweep threw", error);
  }

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < budget; i += 1) {
    const currentState = await readQueueState(db);
    if (currentState.paused && !options.probeWhilePaused) {
      return { processed, failed, paused: true, pauseReason: currentState.pause_reason, idle: processed + failed === 0 };
    }
    const job = await claimJob(db, options.organizationId, options.invoker ?? "unknown");
    const attemptStartedAt = new Date().toISOString();
    if (!job)
      return {
        processed,
        failed,
        paused: false,
        pauseReason: null,
        idle: processed + failed === 0,
      };

    // Lease heartbeat: a build spends minutes inside single stages (pictures,
    // page writing, AI layout). Renewing only between stages let the lease
    // expire mid-stage, so the client pump claimed the same job again and two
    // attempts wrote the site at once. The heartbeat keeps the lease alive for
    // the whole run and stops renewing once the attempt fence no longer holds.
    const heartbeat = startLeaseHeartbeat(db, job);
    try {
      // Demo (is_demo) workspaces build on the free pool only. The scope is
      // per job (AsyncLocalStorage), so a concurrent customer build in this
      // process keeps its own paid allowance.
      const { buildSpendScope, withAiSpendScope } = await import("@/lib/ai/spend-scope.server");
      const spendScope = await buildSpendScope(db as never, job.organization_id);
      await withAiSpendScope(spendScope, () => executeJob(db, job));
      heartbeat.stop();
      processed += 1;
    } catch (error) {
      heartbeat.stop();
      // A superseded attempt must not requeue, fail or restore anything —
      // the newer attempt owns the job and the site now.
      if (error instanceof StaleAttemptError) continue;
      // An owner-cancelled build stays cancelled: never requeue or relabel it.
      {
        const { data: latest } = await db
          .from("generation_jobs")
          .select("status")
          .eq("id", job.id)
          .maybeSingle();
        if ((latest as { status?: string } | null)?.status === "cancelled") continue;
      }
      if (heartbeat.lost()) {
        console.warn(`[site-engine] job ${job.id} attempt ${job.attempts} failed after losing its lease; leaving it to the newer attempt.`);
        continue;
      }
      const { RevoraAiError } = await import("@/lib/site-engine.server");
      const isGateway = error instanceof RevoraAiError;
      const status = isGateway ? (error as InstanceType<typeof RevoraAiError>).status : 0;
      const message = error instanceof Error ? error.message : "Generation failed.";

      if (error instanceof FreshRebuildRollbackError || error instanceof PartialBuildKeptError) {
        failed += 1;
        // This path fails the job for good WITHOUT the ordinary-failure
        // bookkeeping below — but the attempt still stopped writing, so it
        // needs the same end marker. Without it a retry's cleanup cannot
        // bound the attempt's rows (findOwnPartialBuild) and throws
        // PartialBuildKeptError again: the job is stuck "kept" forever.
        try {
          await db.from("ai_generations").insert({
            organization_id: job.organization_id,
            job_id: job.id,
            kind: "build_attempt_ended",
            model: "none",
            instruction: null,
            result: { attempt: Number(job.attempts), outcome: "kept" } as unknown as never,
            created_by: job.created_by ?? null,
          } as never);
        } catch (endError) {
          console.warn(`[site-engine] attempt-end record for job ${job.id} skipped`, endError);
        }
        await db
          .from("generation_jobs")
          .update({
            status: "failed",
            error_message: message,
            failure_kind: "rendering",
            completed_at: new Date().toISOString(),
            lease_expires_at: null,
          } as never)
          .eq("id", job.id)
          .eq("attempts", job.attempts)
          .eq("status", "processing");
        await writeQueueState(db, { last_error: message });
        continue;
      }

      // Ordinary failure: retry until MAX_ATTEMPTS, then mark it failed for good.
      // The stored message carries a stable failure kind ([content], [image],
      // [infrastructure]...) so the owner and operators see what failed.
      failed += 1;
      const { classifyBuildFailure, tagFailureMessage } = await import("@/lib/builder/build-failure");
      const failure = classifyBuildFailure(error, status);
      const taggedMessage = tagFailureMessage(failure.kind, message);
      console.warn(`[site-engine] job ${job.id} attempt ${job.attempts} failed (${failure.kind}): ${message}`);
      const { data: current } = await db
        .from("generation_jobs")
        .select("attempts, current_step")
        .eq("id", job.id)
        .eq("attempts", job.attempts)
        .eq("status", "processing")
        .maybeSingle();
      if (!current) continue;
      // The attempt has stopped writing: its database-stamped end bounds the
      // rows it left, so a retry's cleanup can tell them from owner edits made
      // while the job waited (see findOwnPartialBuild).
      try {
        await db.from("ai_generations").insert({
          organization_id: job.organization_id,
          job_id: job.id,
          kind: "build_attempt_ended",
          model: "none",
          instruction: null,
          result: { attempt: Number(job.attempts) } as unknown as never,
          created_by: job.created_by ?? null,
        } as never);
      } catch (endError) {
        console.warn(`[site-engine] attempt-end record for job ${job.id} skipped`, endError);
      }
      const attempts = (current?.attempts as number | undefined) ?? MAX_ATTEMPTS;
      // The free AI pool ran out of capacity (rate limits, quotas, timeouts):
      // that is not the build's fault and won't clear in seconds, so the
      // attempt is handed back and the job waits 15 min .. 3 h instead of
      // burning its three attempts in two minutes.
      const { AiCapacityParkError } = await import("@/lib/builder/ai-step-error");
      const deferral = await capacityDeferral(db, String(job.organization_id), attemptStartedAt, job.id, {
        forced: error instanceof AiCapacityParkError,
      });
      if (deferral) {
        await db
          .from("generation_jobs")
          .update({
            status: "queued",
            attempts: Math.max(0, Number(job.attempts) - 1),
            capacity_deferrals: deferral.count,
            error_message: tagFailureMessage(
              "provider",
              `The free AI team is at capacity right now (${deferral.summary}). The build will retry automatically at ${deferral.retryAt.toISOString().slice(11, 16)} UTC.`,
            ),
            failure_kind: "provider",
            lease_expires_at: deferral.retryAt.toISOString(),
            // Owner-visible mirror of the same deferral (no second mechanism).
            resumes_at: deferral.retryAt.toISOString(),
            wait_reason: `The free AI team is at capacity right now (${deferral.summary}).`,
            wait_providers: deferral.pressure,
          } as never)
          .eq("id", job.id)
          .eq("attempts", job.attempts)
          .eq("status", "processing");
        await writeQueueState(db, { last_error: message });
        continue;
      }
      // The stage the attempt was working on when it failed: the one after the
      // last completed step. Stored for the owner's message and operator metrics.
      const { GENERATION_STEPS: STAGES } = await import("@/lib/site-engine");
      const lastDone = (current as { current_step?: string | null } | null)?.current_step ?? null;
      const failedStage = STAGES[lastDone ? STAGES.findIndex((s) => s.key === lastDone) + 1 : 0]?.key ?? null;
      await db
        .from("generation_jobs")
        .update(
          (attempts >= MAX_ATTEMPTS || !failure.retryable
            ? {
                status: "failed",
                error_message: taggedMessage,
                failure_kind: failure.kind,
                failed_stage: failedStage,
                completed_at: new Date().toISOString(),
                lease_expires_at: null,
              }
            : {
                status: "queued",
                error_message: taggedMessage,
                failure_kind: failure.kind,
                failed_stage: failedStage,
                // Back off this job only; another workspace can run now.
                lease_expires_at: new Date(Date.now() + retryDelayMs(
                  job.attempts,
                  isGateway ? error.retryAfterSeconds : null,
                )).toISOString(),
              }) as never,
        )
        .eq("id", job.id)
        // Only the attempt that failed may requeue/fail the job, and an
        // owner-cancelled job is never brought back.
        .eq("attempts", job.attempts)
        .eq("status", "processing");
      await writeQueueState(db, { last_error: message });
    }
  }

  return { processed, failed, paused: false, pauseReason: null, idle: processed + failed === 0 };
}

/** How many times one build may wait out an exhausted free AI pool. */
export const MAX_CAPACITY_DEFERRALS = 6;

/** 15 min, 30 min, 1 h, 2 h, then 3 h. */
export function capacityDelayMs(deferral: number): number {
  return Math.min(3 * 3_600_000, 15 * 60_000 * 2 ** Math.max(0, deferral - 1));
}

/**
 * True capacity pressure: during this attempt at least 5 of the workspace's
 * AI calls failed with a rate limit, quota or timeout, and those were at
 * least 40% of its calls. Returns the next deferral, or null when the
 * failure was something else or the job already waited the maximum.
 */
export function capacityVerdict(
  calls: { ok: boolean | null; error_category: string | null; provider?: string | null }[],
  deferrals: number,
  now = Date.now(),
  options: { forced?: boolean; runtime?: ProviderRuntime[] } = {},
): { count: number; retryAt: Date; summary: string; pressure: WaitProviders } | null {
  if (deferrals >= MAX_CAPACITY_DEFERRALS) return null;
  const pressured = calls.filter((call) => call.ok === false && ["rate_limited", "quota", "timeout"].includes(call.error_category ?? ""));
  // A forced park (an AI step reported it ran out of capacity, e.g. the layout
  // rescue deadline) skips the call-ratio threshold but still honours the cap.
  if (!options.forced && (!calls.length || pressured.length < 5 || pressured.length / calls.length < 0.4)) return null;
  const count = deferrals + 1;
  const pressure = summarizeCapacityPressure(calls, options.runtime ?? [], now);
  let retryAt = now + capacityDelayMs(count);
  // When every pressured provider has a known reset, don't wait longer than needed (min 5 min).
  if (pressure.earliestResetAt) retryAt = Math.min(retryAt, Math.max(now + 5 * 60_000, Date.parse(pressure.earliestResetAt)));
  return {
    count,
    retryAt: new Date(retryAt),
    summary: pressured.length
      ? `${pressured.length} of ${calls.length} AI calls were rate-limited or timed out`
      : "the AI team ran out of time to finish this step",
    pressure,
  };
}

async function capacityDeferral(db: Db, organizationId: string, since: string, jobId: string, options: { forced?: boolean } = {}) {
  const [{ data: calls }, { data: row }, { data: runtime }] = await Promise.all([
    db
      .from("ai_usage_events")
      .select("ok, error_category, provider")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .limit(1000),
    db.from("generation_jobs").select("capacity_deferrals").eq("id", jobId).maybeSingle(),
    db.from("ai_provider_runtime").select("provider, open_until").then(
      (r: { data: unknown }) => r,
      () => ({ data: [] }),
    ),
  ]);
  // Without the column (migration not applied yet) the old retry path runs.
  if (!row || typeof (row as { capacity_deferrals?: unknown }).capacity_deferrals !== "number") return null;
  return capacityVerdict(
    (calls ?? []) as { ok: boolean | null; error_category: string | null; provider?: string | null }[],
    (row as { capacity_deferrals: number }).capacity_deferrals,
    Date.now(),
    { forced: options.forced === true, runtime: ((runtime ?? []) as ProviderRuntime[]) },
  );
}

/** Bounded per-job backoff, including an explicit workspace cooldown. */
export function retryDelayMs(
  attempt: number,
  retryAfterSeconds?: number | null,
  random = Math.random(),
): number {
  const requested = typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : 0;
  const exponential = 15_000 * 2 ** Math.max(0, Math.min(attempt - 1, 6));
  // Spread concurrent failed builds across a 50% jitter band so they don't
  // all hit a recovering free provider at the same instant. Retry-After is
  // a minimum, never shortened by jitter, and the maximum wait stays bounded.
  const normalizedRandom = Number.isFinite(random) ? Math.max(0, Math.min(1, random)) : 0.5;
  const jittered = exponential * (0.75 + normalizedRandom * 0.5);
  return Math.min(30 * 60_000, Math.max(jittered, requested));
}
