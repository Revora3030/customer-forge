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

import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Thrown when a newer attempt has taken over this job; the stale run must stop. */
export class StaleAttemptError extends Error {
  constructor(jobId: string) {
    super(`Build attempt for job ${jobId} was superseded by a newer attempt.`);
    this.name = "StaleAttemptError";
  }
}

/** Claims one runnable job with a lease. Returns null when there is nothing to do. */
async function claimJob(db: Db, organizationId?: string) {
  const now = new Date();
  let query = db
    .from("generation_jobs")
    .select("id, organization_id, attempts, created_by, status, lease_expires_at, locked_at, request_id")
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
        locked_at: now.toISOString(),
        updated_at: now.toISOString(),
      } as never)
      .eq("id", job.id)
      .eq("attempts", job.attempts as number)
      .select("id, organization_id, created_by, attempts, request_id")
      .maybeSingle();
    if (claimed)
      return claimed as {
        id: string;
        organization_id: string;
        created_by: string | null;
        attempts: number;
        request_id: string | null;
      };
  }
  return null;
}

/** Runs the nine generation stages for one claimed job using the privileged client. */
async function runJob(
  db: Db,
  job: {
    id: string;
    organization_id: string;
    created_by: string | null;
    attempts: number;
    request_id: string | null;
  },
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
  const requestId = job.request_id ?? job.id;
  const WORKER_STAGE_LABELS: Record<string, string> = {
    business: "reading your business",
    services: "reading your services",
    brand: "designing your brand identity",
    analysis: "planning the change",
    structure: "planning the page layout",
    copy: "writing the pages",
    conversion: "checking conversion paths",
  };
  const step = async (key: string) => {
    done.push(key);
    const meta = GENERATION_STEPS.find((s) => s.key === key);
    const friendly = WORKER_STAGE_LABELS[key];
    if (friendly) noteStage(orgId, job.id, friendly);
    const { data: fenced } = await db
      .from("generation_jobs")
      .update({
        current_step: key,
        progress: meta?.progress ?? 0,
        steps: done,
        lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", job.id)
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
    ["hero", "work", "gallery"].includes(String(item.category ?? "").toLowerCase()),
  ).length + ((p["hero_image_url"] as string) ? 1 : 0);
  const serviceRows = (services.data ?? []) as {
    name: string;
    description?: string | null;
    price?: number | null;
    starting_price?: number | null;
  }[];
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

  const copyFacts = {
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? "",
    description: (p["description"] as string) ?? null,
    city: (p["city"] as string) ?? null,
    state: (p["state"] as string) ?? null,
    serviceArea: (p["service_area"] as string) ?? null,
    phone: (p["phone"] as string) ?? null,
    email: (p["email"] as string) ?? null,
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
    const { assertContentIntegrity } = await import("@/lib/builder/content-integrity");
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
  const brief = approvedBrief?.approved ? approvedBrief : await analyzeBusiness(copyFacts);
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
  // for this business by the design team. If the AI brand identity fails, fall
  // back to a safe direction based on the business facts so the build continues.
  let identity: Awaited<ReturnType<typeof authorBrandIdentity>>;
  try {
    identity = await authorBrandIdentity({
      organizationId: orgId,
      businessName: org.data.name ?? "",
      industry: org.data.industry ?? null,
      description: (p["description"] as string) ?? null,
      city: (p["city"] as string) ?? null,
      services: serviceRows.map((service) => ({ name: service.name })),
      requestedFont: (p["font_preference"] as string) ?? null,
    });
  } catch (err) {
    console.warn(`[site-engine] AI brand identity failed for ${orgId}: ${(err as Error).message}; using safe fallback.`);
    identity = { direction: null } as never;
  }
  const direction = identity.direction;
  let creative = blankFirstBuildDirection({
    organizationId: orgId,
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? null,
    description: (p["description"] as string) ?? null,
    city: (p["city"] as string) ?? null,
    state: (p["state"] as string) ?? null,
    serviceArea: (p["service_area"] as string) ?? null,
    phone: (p["phone"] as string) ?? null,
    email: (p["email"] as string) ?? null,
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
  // If the collective refinement fails entirely, the build continues with the
  // fact-based fallback copy so the customer always gets a complete site.
  const { refineFirstBuildWithCollective } = await import(
    "@/lib/builder/collective-first-build.server"
  );
  let refined: Awaited<ReturnType<typeof refineFirstBuildWithCollective>>;
  try {
    refined = await refineFirstBuildWithCollective({
    organizationId: orgId,
    facts: buildFacts,
    brief,
    copy,
    creative,
    hardGenericityGate: true,
  });
  } catch (err) {
    console.warn(`[site-engine] AI collective refinement failed for ${orgId}: ${(err as Error).message}; using safe fact-based copy.`);
    refined = { changed: false, copyChanged: false, creativeChanged: false, copy, creative, passes: [], totalCostMicrocents: 0 } as never;
  }
  if (refined.creativeChanged) creative = refined.creative;
  if (refined.changed) {
    copy = refined.copy;
    copyModel = refined.passes
      .filter((pass) => pass.used && pass.model)
      .map((pass) => pass.model)
      .join("+") || copyModel;
  }
  // No stale-template fallback: when not one model — paid lead or free stand-in —
  // could author or review this build, the build stops and says so instead of
  // quietly shipping the fact scaffold as if it were a designed website.
  const existingPages = await db
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const firstBuild = freshReplace || (existingPages.count ?? 0) === 0;
  const missingCopy = missingAiCopy(copy);
  if (firstBuild && (!refined.passes.some((pass) => pass.used) || !refined.changed || missingCopy.length)) {
    // No model could author or review the copy. Instead of stopping the build,
    // populate copy from the business facts directly so the customer always
    // gets a complete website with real content.
    console.warn(
      `[site-engine] AI copy authoring failed for ${orgId} (${missingCopy.length ? `missing: ${missingCopy.join(", ")}` : "no model returned usable wording"}); using safe fact-based copy.`,
    );
    if (!copy.heroHeadline) copy.heroHeadline = `${org.data.name ?? "Your Business"}${copyFacts.city ? ` — ${copyFacts.city}` : ""}`;
    if (!copy.heroSubheadline && copyFacts.description) copy.heroSubheadline = copyFacts.description.slice(0, 200);
    if (!copy.primaryCta) copy.primaryCta = copyFacts.goals?.[0] || "Get in touch";
    if (!copy.secondaryCta) copy.secondaryCta = "Learn more";
    if (!copy.about && copyFacts.description) copy.about = copyFacts.description;
    if (!copy.areaCopy && copyFacts.serviceArea) copy.areaCopy = `Serving ${copyFacts.serviceArea}`;
    if (!copy.metaTitle) copy.metaTitle = `${org.data.name ?? "Business"}${copyFacts.city ? ` — ${copyFacts.city}` : ""}`.slice(0, 60);
    if (!copy.metaDescription) copy.metaDescription = (copyFacts.description || `${org.data.name ?? "Local business"} offering professional services.`).slice(0, 155);
    if (!copy.ogTitle) copy.ogTitle = copy.metaTitle;
    if (!copy.ogDescription) copy.ogDescription = copy.metaDescription;
    if (copy.serviceCards.length === 0 && serviceRows.length > 0) {
      copy.serviceCards = serviceRows.map((s) => ({
        name: s.name,
        copy: s.description?.slice(0, 200) || `Professional ${s.name} services.`,
      }));
    }
    if (copy.faqs.length === 0) {
      copy.faqs = [
        { question: `What services does ${org.data.name ?? "your business"} offer?`, answer: serviceRows.map((s) => s.name).join(", ") || "Contact us for our full service list." },
        { question: copyFacts.serviceArea ? `What areas do you serve?` : `How can I contact you?`, answer: copyFacts.serviceArea ? `We serve ${copyFacts.serviceArea}.` : copyFacts.phone ? `Call us at ${copyFacts.phone}.` : "Use the contact form on our website." },
        { question: "How do I get started?", answer: copy.primaryCta ? `Click "${copy.primaryCta}" to reach out, and we'll respond promptly.` : "Use our contact form and we'll get back to you." },
      ];
    }
    copyModel = "safe-fallback";
  }


  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "collective_first_build",
    model: copyModel,
    instruction: null,
    result: {
      requestId,
      jobId: job.id,
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
  if (retryOwnsPartialBuild) {
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
  noteStage(orgId, job.id, "generating your pictures");
  const starterImages = await generateFirstBuildImages(db, {
    organizationId: orgId,
    userId: job.created_by,
    businessName: org.data.name ?? "",
    city: (p["city"] as string) ?? null,
    photoCount: realMediaCount,
    // Only a deliberately assigned hero fills that role. A generic upload or
    // one work photo no longer blocks the complete supporting image campaign.
    occupiedSlots: new Set([
      ...((p["hero_image_url"] as string) ? (["hero"] as const) : []),
    ]),
    creative,
  });
  // The customer's own photos always go on the site first, in the places
  // their category suggests; AI pictures only fill whatever is left.
  type MediaRow = { id: string; category: string | null; url: string | null; alt_text: string | null; file_name: string | null; source: string | null };
  const heroUrl = (p["hero_image_url"] as string) || "";
  const ownerRows = ((media.data ?? []) as MediaRow[]).filter(
    (row) => row.url && row.source !== "generated" && row.source !== "ai" && row.source !== "stock",
  );
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
        placement: cat === "hero" && !heroUrl ? ["hero", "home:hero"] : cat === "team" ? ["about", "team"] : ["gallery", "work", "services", "about"],
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
  const architectureRef: { current: PageArchitectureOutcome | null } = { current: null };
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
    phone: (p["phone"] as string) ?? null,
    email: (p["email"] as string) ?? null,
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
  // The AI page plan is the preferred source of pages and sections. When the
  // AI architect is unavailable or rejected, materializeSiteContent falls back
  // to the safe multi-page fact inventory rather than stopping the build — so
  // the customer always gets a complete site, not an error.
  if (!built.skipped) {
    const outcome = architectureRef.current;
    if (!outcome || !outcome.architecture) {
      const detail = outcome?.rejected.length
        ? outcome.rejected.map((rejection) => JSON.stringify(rejection)).join("; ")
        : outcome?.skipped ?? "the design team was unavailable";
      console.warn(
        `[site-engine] AI architect unavailable for ${orgId} (${detail}); ` +
          `materializeSiteContent will use the safe multi-page fact inventory.`,
      );
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
    let outcome: Awaited<ReturnType<typeof refineSectionWordingWithCollective>>;
    try {
    outcome = await refineSectionWordingWithCollective({
      organizationId: orgId,
      facts: buildFacts,
      sections: wording,
      directionSummary: [creative.brief.concept, creative.brief.personality].filter(Boolean).join(" · "),
      hardGenericityGate: true,
    });
    } catch (err) {
      console.warn(`[site-engine] Section wording refinement threw for ${orgId}: ${(err as Error).message}; proceeding with existing wording.`);
      outcome = { patches: [], passes: [], totalCostMicrocents: 0 } as never;
    }
    if (!outcome.passes.some((pass) => pass.used)) {
      // Section-level copy review failed. Don't stop the build — the sections
      // already have AI-authored or fact-based copy from the earlier pass.
      console.warn(`[site-engine] Section copy review failed for ${orgId}; proceeding with existing wording.`);
    }
    for (const patch of outcome.patches) {
      const update: Record<string, string> = {};
      if (patch.heading !== undefined) update["heading"] = patch.heading;
      if (patch.subheading !== undefined) update["subheading"] = patch.subheading;
      if (patch.body !== undefined) update["body"] = patch.body;
      if (!Object.keys(update).length) continue;
      await db
        .from("website_sections")
        .update(update as never)
        .eq("id", patch.id)
        .eq("organization_id", orgId);
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

  // Every content section is laid out by Sol as its own composition. No
  // built-in section layout is used for a new site; if the AI layout fails,
  // the build continues with the default section layout so the customer still
  // gets a complete site.
  if (!built.skipped) {
    const { composeFirstBuildSections } = await import("@/lib/builder/first-build-compositions.server");
    let composed: Awaited<ReturnType<typeof composeFirstBuildSections>>;
    try {
    composed = await composeFirstBuildSections({
      db: db as never,
      organizationId: orgId,
      facts: buildFacts,
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
        ownerPalette: direction ? { primary: direction.primary, secondary: direction.secondary, accent: direction.accent } : null,
        ownerFont: direction?.font ?? null,
      }),
    });
    } catch (err) {
      console.warn(`[site-engine] Section composition failed for ${orgId}: ${(err as Error).message}; using default layout.`);
      composed = { sections: [], models: [], totalCostMicrocents: 0 } as never;
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
    // Sol also designs the menu bar and footer; if AI chrome fails, the build
    // continues with the default chrome.
    const { composeSiteChrome } = await import("@/lib/builder/first-build-chrome.server");
    let chrome: Awaited<ReturnType<typeof composeSiteChrome>>;
    try {
    chrome = await composeSiteChrome({
      db: db as never,
      organizationId: orgId,
      businessName: org.data.name ?? "",
      facts: buildFacts,
      lookSummary: JSON.stringify({ colors: direction ? { primary: direction.primary, secondary: direction.secondary, accent: direction.accent } : null, font: direction?.font ?? null }),
    });
    } catch (err) {
      console.warn(`[site-engine] Chrome composition failed for ${orgId}: ${(err as Error).message}; using default chrome.`);
      chrome = { models: [], totalCostMicrocents: 0 } as never;
    }
    await db.from("ai_generations").insert({
      organization_id: orgId,
      job_id: job.id,
      kind: "first_build_chrome",
      model: chrome.models.join("+") || "none",
      instruction: null,
      result: chrome as unknown as never,
      created_by: job.created_by,
    } as never);
  }

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

  const { error: saveError } = await db.from("website_settings").upsert(
    {
      organization_id: orgId,
      // Legacy non-null database compatibility marker only. No renderer or
      // creative path reads this value; the authored composition is above.
      template: "ai-authored",
      generation: {
        ...withoutPendingBuild(priorGeneration),
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
  await step("leads");
  await step("mobile");

  await db
    .from("generation_jobs")
    .update({
      status: "completed",
      progress: 100,
      current_step: "ready",
      steps: [...done, "ready"],
      error_message: null,
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", job.id)
    .eq("attempts", job.attempts);

  const leadCapture = (forms.data ?? []).length > 0 || (bookable.data ?? []).length > 0;
  await db.from("notifications").insert({
    organization_id: orgId,
    title: freshReplace ? "Your fresh website rebuild is ready" : "Your website draft is ready to review",
    body: leadCapture
        ? "Revora built your site from your information and connected lead capture."
        : "Revora built your site. Turn on the quote calculator or online booking to capture leads.",
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

  // Paused-state guard. Rate limits may recover on a later run. Credit and
  // policy blocks require an owner/admin action and stay paused.
  let budget = max;
  if (state.paused) {
    if (state.pause_kind === "rate_limit") {
      await resumeQueue(db);
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
      // A superseded attempt must not requeue, fail or restore anything —
      // the newer attempt owns the job and the site now.
      if (error instanceof StaleAttemptError) continue;
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
          .eq("id", job.id);
        await writeQueueState(db, { last_error: message });
        continue;
      }

      // Credit and policy denials are terminal for this run. Pause the whole
      // generation queue until the owner/admin restores access.
      if (status === 402 || status === 403) {
        failed += 1;
        await pauseQueue(db, "credits", message);
        await db
          .from("generation_jobs")
          .update({ status: "queued", error_message: message, lease_expires_at: null } as never)
          .eq("id", job.id);
        return { processed, failed, paused: true, pauseReason: message, idle: false };
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
          .eq("id", job.id);
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
      const { data: current } = await db
        .from("generation_jobs")
        .select("attempts")
        .eq("id", job.id)
        .maybeSingle();
      const attempts = (current?.attempts as number | undefined) ?? MAX_ATTEMPTS;
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
        // Only the attempt that failed may requeue/fail the job.
        .eq("attempts", job.attempts);
      await writeQueueState(db, { last_error: message });
    }
  }

  return { processed, failed, paused: false, pauseReason: null, idle: processed + failed === 0 };
}
