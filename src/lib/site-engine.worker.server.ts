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
import type { PageArchitectureOutcome } from "@/lib/builder/ai-page-architecture.server";
import { nextPublishState } from "@/lib/publish-state";
import {
  INTERRUPTED_BUILD_MESSAGE,
  RECOVERING_BUILD_MESSAGE,
  STALLED_LEASE_GRACE_MS,
} from "@/lib/builder/job-liveness";

import type { SupabaseClient } from "@supabase/supabase-js";

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
  const { restoreBackup } = await import("@/lib/backup.server");
  let restore: unknown = null;
  let restoreError: string | null = null;
  try {
    restore = await restoreBackup(db, input.backupId, {
      ...(input.userId ? { userId: input.userId } : {}),
    });
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
  const { error } = await query;
  if (error) console.warn("[site-engine] abandoned job sweep failed", error.message);

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
  const exhaustedResult = await exhausted;
  if (exhaustedResult.error)
    console.warn("[site-engine] exhausted queued job sweep failed", exhaustedResult.error.message);

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
  const orphanFailResult = await orphanFail;
  if (orphanFailResult.error)
    console.warn("[site-engine] lease-less job close failed", orphanFailResult.error.message);
}

/** Claims one runnable job with a lease. Returns null when there is nothing to do. */
export async function claimJob(db: Db, organizationId?: string) {
  const now = new Date();
  let query = db
    .from("generation_jobs")
    .select("id, organization_id, attempts, created_by, status, lease_expires_at")
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
    const friendly = WORKER_STAGE_LABELS[key];
    if (friendly) noteStage(orgId, job.id, friendly);
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
  };

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
    db.from("media").select("id, category, url, alt_text, file_name, source").eq("organization_id", orgId).order("created_at"),
    db.from("social_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    db.from("quote_forms").select("id").eq("organization_id", orgId).eq("is_active", true),
    db.from("services").select("id").eq("organization_id", orgId).eq("bookable", true),
  ]);

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
  const priorGeneration = (priorSettings.data?.generation ?? {}) as Record<string, unknown>;
  const pendingBuild = readPendingBuild(priorGeneration["pendingBuild"], job);
  if ("pendingBuild" in priorGeneration && !pendingBuild) {
    await clearPendingBuild(db, orgId);
    throw new Error("Fresh rebuild metadata was invalid or did not match this build, so nothing was replaced.");
  }
  const freshReplace = pendingBuild?.mode === "fresh_replace";
  const approvedBrief = readBrief(priorGeneration["brief"]);

  // No built-in strategy: an unapproved brief is written by the AI.
  const brief = approvedBrief?.approved ? approvedBrief : await analyzeBusiness(copyFacts, {
    organizationId: orgId,
    userId: job.created_by,
  });
  if (!approvedBrief?.approved) {
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
  const identity = await authorBrandIdentity({
    organizationId: orgId,
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? null,
    description: (p["description"] as string) ?? null,
    city: (p["city"] as string) ?? null,
    services: serviceRows.map((service) => ({ name: service.name })),
    requestedFont: (p["font_preference"] as string) ?? null,
  });
  await touchLease(db, job);
  const direction = identity.direction;
  const ownerColour = (key: string) => {
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
    (typeof p["font_preference"] === "string" && (p["font_preference"] as string).trim()) || direction?.font || null;
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
  const refined = await refineFirstBuildWithCollective({
    organizationId: orgId,
    facts: buildFacts,
    brief,
    copy,
    creative,
    hardGenericityGate: true,
  });
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
  const firstBuild = freshReplace || (existingPages.count ?? 0) === 0 || orphanedBuild !== null;
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
  const retryOwnsPartialBuild = !freshReplace && (existingPages.count ?? 0) > 0 && Number(job.attempts ?? 0) > 1;
  if (orphanedBuild) {
    await clearOrphanedPartialBuild(db, orgId, orphanedBuild);
  } else if (retryOwnsPartialBuild) {
    const partial = await db
      .from("website_settings")
      .select("generation")
      .eq("organization_id", orgId)
      .maybeSingle();
    const partialGeneration = (partial.data?.generation ?? {}) as Record<string, unknown>;
    const report = partialGeneration["report"] as Record<string, unknown> | undefined;
    const ownsPartialBuild =
      report?.["jobId"] === job.id || partialGeneration["jobId"] === job.id;
    if (ownsPartialBuild) {
      // Fence by job: only rows written since this job was created are its own
      // partial output. Anything older belongs to the customer and is kept.
      const jobRow = await db
        .from("generation_jobs")
        .select("created_at")
        .eq("id", job.id)
        .eq("organization_id", orgId)
        .maybeSingle();
      const since = jobRow.data?.created_at as string | undefined;
      if (!since) throw new Error("Couldn't confirm which rows this build attempt owns.");
      const older = await db
        .from("website_pages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .lt("created_at", since);
      if ((older.count ?? 0) > 0) {
        throw new Error("This retry found pages older than the build itself, so it stopped instead of deleting them.");
      }
      const pageIds = await db
        .from("website_pages")
        .select("id")
        .eq("organization_id", orgId)
        .gte("created_at", since);
      const ids = (pageIds.data ?? []).map((row) => row.id as string);
      if (ids.length) {
        const sectionIds = await db.from("website_sections").select("id").eq("organization_id", orgId).in("page_id", ids);
        const sIds = (sectionIds.data ?? []).map((row) => row.id as string);
        if (sIds.length) {
          const componentDelete = await db.from("website_components").delete().eq("organization_id", orgId).in("section_id", sIds);
          if (componentDelete.error) throw new Error(`Couldn't clear the incomplete build components: ${componentDelete.error.message}`);
          const sectionDelete = await db.from("website_sections").delete().eq("organization_id", orgId).in("id", sIds);
          if (sectionDelete.error) throw new Error(`Couldn't clear the incomplete build sections: ${sectionDelete.error.message}`);
        }
        const pageDelete = await db.from("website_pages").delete().eq("organization_id", orgId).in("id", ids);
        if (pageDelete.error) throw new Error(`Couldn't clear the incomplete build pages: ${pageDelete.error.message}`);
      }
    }
  }
  // PARALLEL TEAM: the page architect does not need the pictures, so its plan
  // is authored WHILE the photos are being made instead of after them. Only
  // started when this build will actually write pages (a first build), and its
  // outcome is recorded exactly as before.
  const architectureRef: { current: PageArchitectureOutcome | null } = { current: null };
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
        const outcome = await proposePageArchitecture({
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
              hasQuoteForm: (forms.data ?? []).length > 0,
            },
            primary,
          ),
          description: (p["description"] as string) ?? null,
          services: serviceRows.map((service) => String((service as { name?: unknown }).name ?? "")).filter(Boolean),
          serviceArea: (p["service_area"] as string) ?? null,
        });
        architectureRef.current = outcome;
        return outcome.architecture;
      })()
    : null;
  // Never leave an unhandled rejection if pictures fail first; the error is
  // re-raised where the plan is awaited.
  architecturePlan?.catch(() => undefined);
  noteStage(orgId, job.id, "generating your pictures");
  // A retry of an interrupted build reuses the pictures its earlier attempt
  // already stored (only this job's own generated files, by creation time).
  let reusablePictures: { id: string; url: string; file_name: string | null; alt_text: string | null; attribution: string | null }[] = [];
  if (Number(job.attempts ?? 0) > 1) {
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
  const ownerRows = ((media.data ?? []) as MediaRow[]).filter(
    (row) =>
      row.url &&
      row.source !== "generated" &&
      row.source !== "ai" &&
      // Stock rows ("stock:<library>") are licensed pictures the owner chose
      // in the photo library, so they are placed like the owner's own photos.
      String(row.category ?? "").toLowerCase() !== "logo" &&
      // Video clips are not pictures; an <img> of an .mp4 shows nothing.
      !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(row.url)),
  );
  const ownerHeroRow = ownerRows.find((row) => String(row.category ?? "").toLowerCase() === "hero");
  const bizName = org.data?.name ?? "Business";
  const ownerAssets: typeof starterImages.assets = [
    ...(heroUrl
      ? [{ slot: "owner-hero", label: `${bizName} photo`, altText: `${bizName}`, path: heroUrl, mediaId: null, provider: "owner", model: "owner", prompt: "", placement: ["hero", "home:hero"], aspectRatio: "3:2" }]
      : []),
    ...ownerRows.map((row, i) => {
      const cat = String(row.category ?? "work").toLowerCase();
      const label = row.alt_text || row.file_name || `${bizName} photo ${i + 1}`;
      return {
        slot: `owner-${row.id}`,
        label,
        altText: row.alt_text || label,
        path: row.url as string,
        mediaId: row.id,
        provider: "owner",
        model: "owner",
        prompt: "",
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
  ];
  // Only AI pictures are ever cleaned up on failure; owner photos are never touched.
  generatedAssets = starterImages.assets;
  const siteAssets = [...ownerAssets, ...starterImages.assets];
  const architectBusinessName = org.data.name ?? "";
  const architectIndustry = org.data.industry ?? null;
  const architectGoal = goals[0] ?? org.data.conversion_goal ?? null;
  noteStage(orgId, job.id, "writing the pages");
  // Persist ownership before materialization so a failed attempt leaves a
  // verifiable job marker for safe retry cleanup. The marker is metadata only;
  // it does not publish or replace customer content.
  const { error: buildMarkerError } = await db.from("website_settings").upsert(
    {
      organization_id: orgId,
      generation: {
        ...withoutPendingBuild(priorGeneration),
        jobId: job.id,
        buildState: "materializing",
        buildStartedAt: new Date().toISOString(),
      },
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
    hasQuoteForm: (forms.data ?? []).length > 0,
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
    ...(architecturePlan ? { architecture_: architecturePlan } : {}),
    architect: async (candidate) => {
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
    // Section wording is a refinement of copy that is already AI-authored and
    // fact-checked. It is bounded in time: when Sol/Terra are slow, the abort
    // makes the refinement return no patches (the authored wording stays)
    // instead of holding the worker until it is cut off at 74%.
    const wordingAbort = new AbortController();
    const wordingTimer = setTimeout(() => wordingAbort.abort(), WORDING_BUDGET_MS);
    (wordingTimer as { unref?: () => void }).unref?.();
    type WordingOutcome = Awaited<ReturnType<typeof refineSectionWordingWithCollective>>;
    const keepAuthored: WordingOutcome = { patches: [], passes: [], totalCostMicrocents: 0 };
    // Raced against the abort as well, because not every provider fallback
    // honours the signal; the stage must return on time either way.
    const timedOut = new Promise<WordingOutcome>((resolve) =>
      wordingAbort.signal.addEventListener("abort", () => resolve(keepAuthored), { once: true }),
    );
    const outcome = await Promise.race([
      refineSectionWordingWithCollective({
        organizationId: orgId,
        facts: buildFacts,
        sections: wording,
        directionSummary: [creative.brief.concept, creative.brief.personality].filter(Boolean).join(" · "),
        hardGenericityGate: true,
        signal: wordingAbort.signal,
      }).catch((error: unknown) => {
        if (!wordingAbort.signal.aborted) throw error;
        return keepAuthored;
      }),
      timedOut,
    ]).finally(() => clearTimeout(wordingTimer));
    if (wordingAbort.signal.aborted) {
      console.warn(`[site-engine] job ${job.id}: section wording refinement exceeded its budget; keeping the authored wording.`);
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
  // built-in section layout is used for a new site; if the AI layout fails,
  // the build continues with the default section layout so the customer still
  // gets a complete site.
  if (!built.skipped) {
    const { composeFirstBuildSections } = await import("@/lib/builder/first-build-compositions.server");
    const composed = await composeFirstBuildSections({
      db: db as never,
      organizationId: orgId,
      facts: buildFacts,
      // Optional review/craft rounds stop once this build has used its layout
      // budget; the required AI design and safety checks always complete.
      optionalPassDeadline: Date.now() + LAYOUT_OPTIONAL_BUDGET_MS,
      onPageDone: () => touchLease(db, job),
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
      const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
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
    (p["font_preference"] as string) ||
      (p["secondary_color"] as string) ||
      (p["accent_color"] as string) ||
      (p["primary_color"] as string),
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
    leadForms: (forms.data ?? []).length,
    bookableServices: (bookable.data ?? []).length,
    seoConfigured: Boolean(copy.metaTitle && copy.metaDescription),
    // Truthful: leads only reach the built-in customer record when at least one
    // capture route exists on the site. Never reported as connected otherwise.
    crmConnected: (forms.data ?? []).length > 0 || (bookable.data ?? []).length > 0,
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
      ...qa.blockers.map((c) => c.fix),
      ...((forms.data ?? []).length || (bookable.data ?? []).length
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
  noteStage(orgId, job.id, "finishing up");
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

  const leadCapture = (forms.data ?? []).length > 0 || (bookable.data ?? []).length > 0;
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
    if (generatedAssets.length) {
      const { cleanupFirstBuildImages } = await import("@/lib/builder/first-build-images.server");
      await cleanupFirstBuildImages(db, orgId, generatedAssets).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Generation failed.";
    if (freshReplace && pendingBuild?.backupId) {
      const rollback = await rollbackFreshBuild(db, {
        orgId,
        backupId: pendingBuild.backupId,
        userId: job.created_by,
        message,
      });
      throw new FreshRebuildRollbackError(
        rollback.restored
          ? `${message} The previous website was restored from backup ${pendingBuild.backupId}.`
          : `${message} Rollback also failed: ${rollback.restoreError ?? "unknown error"}.`,
        pendingBuild.backupId,
      );
    }
    throw error;
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
  options: { max?: number; organizationId?: string; probeWhilePaused?: boolean } = {},
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

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < budget; i += 1) {
    const currentState = await readQueueState(db);
    if (currentState.paused && !options.probeWhilePaused) {
      return { processed, failed, paused: true, pauseReason: currentState.pause_reason, idle: processed + failed === 0 };
    }
    const job = await claimJob(db, options.organizationId);
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
      await executeJob(db, job);
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

      if (error instanceof FreshRebuildRollbackError) {
        failed += 1;
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
      const attempts = (current?.attempts as number | undefined) ?? MAX_ATTEMPTS;
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

/** Bounded per-job backoff, including an explicit workspace cooldown. */
export function retryDelayMs(attempt: number, retryAfterSeconds?: number | null): number {
  const requested = typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds)
    ? retryAfterSeconds * 1000
    : 0;
  return Math.min(30 * 60_000, Math.max(15_000 * 2 ** Math.max(0, Math.min(attempt - 1, 6)), requested));
}
