/**
 * Detached worker for Revora Site Engine generation jobs.
 *
 * The database is the queue and the single source of truth:
 *  - jobs are enqueued as `queued` by the authenticated request (which returns immediately)
 *  - a worker claims one job at a time with a lease, so two workers never
 *    process the same job
 *  - progress is written to the job row at every stage, so the client sees
 *    reliable progress even if the browser reloads
 *  - customer builds use Revora's native engine and never dispatch content to
 *    an outside model
 */
import { nextPublishState } from "@/lib/publish-state";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.types";

const QUEUE_ID = "site_engine";
const LEASE_SECONDS = 180;
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_TRIP = 3;

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
  await db
    .from("website_settings")
    .upsert({ organization_id: orgId, generation: withoutPendingBuild(generation) } as never, {
      onConflict: "organization_id",
    });
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
  const { data } = await db
    .from("job_queue_state")
    .select("paused, pause_reason, pause_kind, consecutive_rate_limits")
    .eq("id", QUEUE_ID)
    .maybeSingle();
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

async function pauseQueue(db: Db, kind: "credits" | "blocked" | "rate_limit", reason: string) {
  await writeQueueState(db, {
    paused: true,
    pause_kind: kind,
    pause_reason: reason,
    paused_at: new Date().toISOString(),
    last_error: reason,
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

/** Claims one runnable job with a lease. Returns null when there is nothing to do. */
async function claimJob(db: Db, organizationId?: string) {
  const now = new Date();
  let query = db
    .from("generation_jobs")
    .select("id, organization_id, attempts, created_by, status, lease_expires_at")
    .in("status", ["queued", "processing"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(5);
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data: candidates } = await query;
  for (const job of candidates ?? []) {
    const leaseFree = !job.lease_expires_at || new Date(job.lease_expires_at as string) < now;
    if (!leaseFree) continue;

    // Conditional update = single-flight lock: only one worker wins the row.
    const { data: claimed } = await db
      .from("generation_jobs")
      .update({
        status: "processing",
        attempts: (job.attempts as number) + 1,
        started_at: job.status === "queued" ? now.toISOString() : undefined,
        lease_expires_at: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString(),
        updated_at: now.toISOString(),
      } as never)
      .eq("id", job.id)
      .eq("attempts", job.attempts as number)
      .select("id, organization_id, attempts, created_by")
      .maybeSingle();
    if (claimed)
      return claimed as { id: string; organization_id: string; attempts: number; created_by: string | null };
  }
  return null;
}

async function runCanonicalFirstBuild(input: {
  db: Db;
  job: { id: string; organization_id: string; attempts: number; created_by: string | null };
  business: {
    name: string;
    industry: string | null;
    conversion_goal: string | null;
  };
  profile: Record<string, unknown>;
  services: Array<{ name: string; description?: string | null; price?: number | null; starting_price?: number | null }>;
  formsCount: number;
  bookingCount: number;
  goals: string[];
  freshReplace: boolean;
  pendingBuild: PendingBuild | null;
  language: string;
}): Promise<void> {
  const { db, job, business, profile, services, formsCount, bookingCount, goals, freshReplace, pendingBuild } = input;
  let materialized = false;
  const renewLease = async () => {
    const expires = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();
    await db
      .from("generation_jobs")
      .update({ lease_expires_at: expires, updated_at: new Date().toISOString() } as never)
      .eq("id", job.id)
      .eq("status", "processing")
      .eq("attempts", job.attempts);
  };
  const leaseHeartbeat = setInterval(() => {
    void renewLease().catch((error) => console.warn("[site-engine] lease renewal failed", error));
  }, Math.max(30_000, Math.floor((LEASE_SECONDS * 1000) / 3)));

  try {
    const { authorCreativeSiteContract } = await import("@/lib/builder/creative-site-contract.server");
    const { materializeSiteContent } = await import("@/lib/site-materialize.server");

    // Resolve tenant-owned media before Sol authors the contract. The model only
    // receives verified IDs/paths, so required media references can be materialized
    // deterministically without inventing assets.
    const { data: ownerMediaRows } = await db
      .from("media")
      .select("id, url, alt_text, file_name, category")
      .eq("organization_id", job.organization_id)
      .order("created_at", { ascending: false })
      .limit(100);
    const ownerMedia: FirstBuildImageAsset[] = (ownerMediaRows ?? []).map((row) => ({
      slot: typeof row.category === "string" ? row.category : "image",
      label: typeof row.file_name === "string" && row.file_name.trim() ? row.file_name : "Owner image",
      altText: typeof row.alt_text === "string" ? row.alt_text : "Owner-provided image",
      path: String(row.url),
      mediaId: String(row.id),
      provider: "owner",
      model: "owner-media",
      prompt: "",
      placement: [],
      aspectRatio: "16:9",
    }));

    const heroUrl = typeof profile["hero_image_url"] === "string" ? profile["hero_image_url"].trim() : "";
    if (heroUrl && !ownerMedia.some((asset) => asset.path === heroUrl || asset.mediaId === heroUrl)) {
      ownerMedia.push({
        slot: "hero",
        label: "Owner hero image",
        altText: "Owner-provided hero image",
        path: heroUrl,
        mediaId: heroUrl,
        provider: "owner",
        model: "owner-profile-media",
        prompt: "",
        placement: ["hero"],
        aspectRatio: "16:9",
      });
    }

    const outcome = await authorCreativeSiteContract({
      organizationId: job.organization_id,
      businessName: business.name,
      industry: business.industry,
      description: typeof profile["description"] === "string" ? profile["description"] : null,
      services,
      location:
        [profile["city"], profile["state"]]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join(", ") || null,
      serviceArea: typeof profile["service_area"] === "string" ? profile["service_area"] : null,
      phone: typeof profile["phone"] === "string" ? profile["phone"] : null,
      email: typeof profile["email"] === "string" ? profile["email"] : null,
      goals,
      conversionGoal: business.conversion_goal ?? "enquiries",
      hasQuoteForm: formsCount > 0,
      hasBooking: bookingCount > 0,
      language: input.language,
      hasOwnerMedia: ownerMedia.length > 0,
      ownerMedia: ownerMedia.map((asset) => ({ id: asset.mediaId ?? asset.path, path: asset.path, label: asset.label })),
    });

    await db.from("ai_generations").insert({
      organization_id: job.organization_id,
      job_id: job.id,
      kind: "creative_site_contract",
      model: outcome.models.join("+") || "revora-collective",
      instruction: null,
      result: {
        version: outcome.contract?.version ?? 1,
        complete: Boolean(outcome.contract),
        reviewed: outcome.reviewed,
        skipped: outcome.skipped,
        pages: outcome.contract?.pages.map((page) => ({
          id: page.id,
          slug: page.slug,
          sections: page.sections.map((section) => section.role),
        })) ?? null,
        costMicrocents: outcome.costMicrocents,
      } as unknown as never,
      created_by: job.created_by,
    } as never);

    if (!outcome.contract) {
      throw new Error(
        `The AI could not produce a complete website contract, so nothing was published (${outcome.skipped ?? "no valid contract"}).`,
      );
    }

    const emptyCopy = {
      heroHeadline: "",
      heroSubheadline: "",
      primaryCta: "",
      secondaryCta: "",
      intro: "",
      about: "",
      benefits: [],
      serviceCards: [],
      faqs: [],
      areaCopy: "",
      metaTitle: "",
      metaDescription: "",
      ogTitle: "",
      ogDescription: "",
    };

    const built = await materializeSiteContent(db, job.organization_id, {
      businessName: business.name,
      copy: emptyCopy,
      services,
      city: typeof profile["city"] === "string" ? profile["city"] : null,
      state: typeof profile["state"] === "string" ? profile["state"] : null,
      serviceArea: typeof profile["service_area"] === "string" ? profile["service_area"] : null,
      phone: typeof profile["phone"] === "string" ? profile["phone"] : null,
      email: typeof profile["email"] === "string" ? profile["email"] : null,
      yearsInBusiness: typeof profile["years_in_business"] === "number" ? profile["years_in_business"] : null,
      photoCount: 0,
      hasQuoteForm: formsCount > 0,
      hasBooking: bookingCount > 0,
      replaceExisting: freshReplace,
      generatedAssets: ownerMedia,
      creativeSiteContract: outcome.contract,
    });
    materialized = !built.skipped;

    if (!built.skipped && built.pages === 0) throw new Error("The AI contract contained no materializable pages.");

    const home = outcome.contract.pages.find((page) => page.slug === "home") ?? outcome.contract.pages[0];
    const firstSection = home?.sections[0];
    const report = {
      builtAt: new Date().toISOString(),
      buildMode: freshReplace ? "fresh_replace" : "safe",
      pages: built.pages,
      sections: built.sections,
      components: built.components,
      services: services.length,
      leadForms: formsCount,
      bookableServices: bookingCount,
      contractVersion: outcome.contract.version,
      contractRevision: outcome.contract.revision,
      directedBy: outcome.contract.directedBy,
      reviewedBy: outcome.contract.reviewedBy,
      ready: false,
      reason: "AI-authored draft requires browser/visual verification before publish.",
    };

    const prior = await db
      .from("website_settings")
      .select("generation")
      .eq("organization_id", job.organization_id)
      .maybeSingle();
    const generation = (prior.data?.generation ?? {}) as Record<string, unknown>;
    const keepState = await nextPublishState(db, job.organization_id);
    const { error: saveError } = await db.from("website_settings").upsert(
      {
        organization_id: job.organization_id,
        template: "ai-authored",
        generation: {
          ...withoutPendingBuild(generation),
          creativeSiteContract: outcome.contract,
          report,
          canonicalBuilder: {
            version: outcome.contract.version,
            authority: outcome.contract.authority,
            pages: outcome.contract.pages.length,
          },
        },
        generated_at: new Date().toISOString(),
        review_state: "ready_for_review",
        publish_state: keepState,
        seo: {
          title: home?.seo?.title ?? business.name,
          headline: firstSection?.content?.heading ?? business.name,
          subheadline: firstSection?.content?.subheading ?? "",
          meta_description: home?.seo?.description ?? "",
          primary_cta_label: home?.primaryAction ?? "Get in touch",
          og_title: home?.seo?.title ?? business.name,
          og_description: home?.seo?.description ?? "",
        },
      } as never,
      { onConflict: "organization_id" },
    );
    if (saveError) throw new Error(saveError.message);

    await db
      .from("generation_jobs")
      .update({
        status: "completed",
        progress: 100,
        current_step: "ready",
        steps: ["business", "services", "analysis", "creative_contract", "materialize", "ready"],
        completed_at: new Date().toISOString(),
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", job.id)
      .eq("attempts", job.attempts);

    await db.from("notifications").insert({
      organization_id: job.organization_id,
      title: freshReplace ? "Your fresh AI website rebuild is ready" : "Your AI website draft is ready to review",
      body: "Sol authored the site architecture and creative contract; Terra reviewed it. Publish remains gated until verification.",
      kind: "website",
      link: "/app/website",
    } as never);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Canonical AI build failed.";
    if (freshReplace && pendingBuild?.backupId) {
      const rollback = await rollbackFreshBuild(db, {
        orgId: job.organization_id,
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
  } finally {
    clearInterval(leaseHeartbeat);
  }
}

/**
 * Processes one build job through the canonical AI-authored contract path.
 *
 * New/fresh builds never execute the legacy deterministic website planner. If an
 * existing site is present without an explicit fresh-rebuild confirmation, this
 * worker fails honestly and leaves the site untouched; existing sites are edited
 * through the AI edit path instead of being regenerated by legacy rules.
 */
async function runJob(
  db: Db,
  job: { id: string; organization_id: string; attempts: number; created_by: string | null },
) {
  const orgId = job.organization_id;
  const { data: settings } = await db
    .from("website_settings")
    .select("generation")
    .eq("organization_id", orgId)
    .maybeSingle();
  const generation = (settings?.generation ?? {}) as Record<string, unknown>;
  const pendingBuild = readPendingBuild(generation["pendingBuild"], job);
  if ("pendingBuild" in generation && !pendingBuild) {
    await clearPendingBuild(db, orgId);
    throw new Error("Fresh rebuild metadata was invalid or did not match this build, so nothing was replaced.");
  }

  const [org, profile, services, forms, bookable, existingPages] = await Promise.all([
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
    db.from("quote_forms").select("id").eq("organization_id", orgId).eq("is_active", true),
    db.from("services").select("id").eq("organization_id", orgId).eq("bookable", true),
    db
      .from("website_pages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);

  if (!org.data) throw new Error("Workspace not found.");

  const freshReplace = pendingBuild?.mode === "fresh_replace";
  const canonicalFirstBuild = freshReplace || (existingPages.count ?? 0) === 0;
  if (!canonicalFirstBuild) {
    throw new Error(
      "This workspace already has a website. Existing sites are updated through Revora's AI editor; no legacy regeneration path is used.",
    );
  }

  const p = (profile.data ?? {}) as Record<string, unknown>;
  const serviceRows = (services.data ?? []) as Array<{
    name: string;
    description?: string | null;
    price?: number | null;
    starting_price?: number | null;
  }>;
  const goals = Array.isArray(p["website_goals"]) && (p["website_goals"] as unknown[]).length
    ? (p["website_goals"] as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 8)
    : [org.data.conversion_goal ?? "quote"];

  await db
    .from("generation_jobs")
    .update({
      current_step: "creative_contract",
      progress: 60,
      lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", job.id)
    .eq("attempts", job.attempts);

  await runCanonicalFirstBuild({
    db,
    job,
    business: {
      name: org.data.name ?? "",
      industry: org.data.industry ?? null,
      conversion_goal: org.data.conversion_goal ?? null,
    },
    profile: p,
    services: serviceRows,
    formsCount: (forms.data ?? []).length,
    bookingCount: (bookable.data ?? []).length,
    goals,
    freshReplace,
    pendingBuild,
    language: typeof p["language"] === "string" ? p["language"] : "English",
  });
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
): Promise<DrainResult> {
  const max = Math.min(Math.max(options.max ?? 2, 1), 5);
  const state = await readQueueState(db);

  // Paused-state guard. Rate limits remain retryable, but AI availability or
  // policy/entitlement failures are surfaced as honest generation failures rather
  // than silently switching to deterministic website authoring.
  let budget = max;
  if (state.paused) {
    if (state.pause_kind === "rate_limit" || state.pause_kind === "credits") {
      await resumeQueue(db); // transient or fallback-covered — retry immediately
    } else if (options.probeWhilePaused) {
      budget = 1;
    } else {
      return { processed: 0, failed: 0, paused: true, pauseReason: state.pause_reason, idle: true };
    }
  }

  await writeQueueState(db, { last_run_at: new Date().toISOString() });

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < budget; i += 1) {
    const job = await claimJob(db, options.organizationId);
    if (!job)
      return {
        processed,
        failed,
        paused: false,
        pauseReason: null,
        idle: processed + failed === 0,
      };

    try {
      await runJob(db, job);
      processed += 1;
      if (state.paused || state.consecutive_rate_limits > 0) await resumeQueue(db);
    } catch (error) {
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
            completed_at: new Date().toISOString(),
            lease_expires_at: null,
          } as never)
          .eq("id", job.id)
          .eq("attempts", job.attempts);
        await writeQueueState(db, { last_error: message });
        continue;
      }

      // A model availability, entitlement, or policy denial must never cause
      // a hidden rules-only build. Fail the job transparently and leave the site
      // untouched; the caller can retry after the underlying issue is resolved.
      if (status === 402 || status === 403 || (isGateway && ["not_configured", "free_unavailable", "unauthorized", "policy"].includes(error.category))) {
        failed += 1;
        await db
          .from("generation_jobs")
          .update({
            status: "failed",
            error_message: message,
            completed_at: new Date().toISOString(),
            lease_expires_at: null,
          } as never)
          .eq("id", job.id)
          .eq("attempts", job.attempts);
        await db.from("notifications").insert({
          organization_id: job.organization_id,
          title: "AI website generation needs attention",
          body: message,
          kind: "website",
          link: "/app/website",
        } as never);
        await writeQueueState(db, { last_error: message });
        continue;
      }

      if (status === 429) {
        failed += 1;
        const rl = state.consecutive_rate_limits + 1;
        await writeQueueState(db, { consecutive_rate_limits: rl, last_error: message });
        if (rl >= RATE_LIMIT_TRIP) await pauseQueue(db, "rate_limit", message);
        // leave the job retryable — the lease expires and a later run picks it up
        await db
          .from("generation_jobs")
          .update({ status: "queued", error_message: message, lease_expires_at: null } as never)
          .eq("id", job.id)
          .eq("attempts", job.attempts);
        return {
          processed,
          failed,
          paused: rl >= RATE_LIMIT_TRIP,
          pauseReason: message,
          idle: false,
        };
      }

      // Ordinary failure: retry until MAX_ATTEMPTS, then mark it failed for good.
      failed += 1;
      const attempts = job.attempts;
      await db
        .from("generation_jobs")
        .update(
          attempts >= MAX_ATTEMPTS
            ? {
                status: "failed",
                error_message: message,
                completed_at: new Date().toISOString(),
                lease_expires_at: null,
              }
            : { status: "queued", error_message: message, lease_expires_at: null },
        )
        .eq("id", job.id)
        .eq("attempts", job.attempts);
      await writeQueueState(db, { last_error: message });
    }
  }

  return { processed, failed, paused: false, pauseReason: null, idle: processed + failed === 0 };
}
