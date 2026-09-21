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
      .select("id, organization_id, created_by")
      .maybeSingle();
    if (claimed)
      return claimed as { id: string; organization_id: string; created_by: string | null };
  }
  return null;
}

/** Runs the nine generation stages for one claimed job using the privileged client. */
async function runJob(
  db: Db,
  job: { id: string; organization_id: string; created_by: string | null },
) {
  const orgId = job.organization_id;
  const { GENERATION_STEPS } = await import("@/lib/site-engine");
  const { generateWebsitePlan } = await import("@/lib/website-plan");
  const { readBrief } = await import("@/lib/site-brief");
  const { captureQa } = await import("@/lib/launch-qa");
  const { gatherBriefFacts } = await import("@/lib/site-brief.server");
  const {
    fallbackBrief,
    fallbackCopy,
  } = await import("@/lib/site-engine.server");

  const done: string[] = [];
  const step = async (key: string) => {
    done.push(key);
    const meta = GENERATION_STEPS.find((s) => s.key === key);
    await db
      .from("generation_jobs")
      .update({
        current_step: key,
        progress: meta?.progress ?? 0,
        steps: done,
        lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", job.id);
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
    db.from("media").select("id").eq("organization_id", orgId),
    db.from("social_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
    db.from("quote_forms").select("id").eq("organization_id", orgId).eq("is_active", true),
    db.from("services").select("id").eq("organization_id", orgId).eq("bookable", true),
  ]);

  if (!org.data) throw new Error("Workspace not found.");
  await step("business");

  const p = (profile.data ?? {}) as Record<string, unknown>;
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
  const goals = (goalsRaw.length ? goalsRaw : [org.data.conversion_goal ?? "quote"]) as string[];

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
    ctaLabel: "Get in touch",
    services: serviceRows,
  };

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

  const brief = approvedBrief?.approved ? approvedBrief : fallbackBrief(copyFacts);
  if (!approvedBrief?.approved) {
    await db.from("ai_generations").insert({
      organization_id: orgId,
      job_id: job.id,
      kind: "business_brief",
      model: "revora-native",
      instruction: null,
      result: brief as unknown as never,
      created_by: job.created_by,
    } as never);
  }
  await step("analysis");

  const plan = generateWebsitePlan({
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? "",
    description: (p["description"] as string) ?? null,
    city: (p["city"] as string) ?? null,
    state: (p["state"] as string) ?? null,
    serviceArea: (p["service_area"] as string) ?? null,
    phone: (p["phone"] as string) ?? null,
    email: (p["email"] as string) ?? null,
    goals: goals as never,
    services: serviceRows,
    photoCount: (media.data ?? []).length + ((p["hero_image_url"] as string) ? 1 : 0),
    testimonialCount: testimonials.length,
    hasCredentials: Boolean(p["certifications"] || p["awards"] || p["years_in_business"]),
    hasHours: Boolean(p["hours"] && Object.keys(p["hours"] as object).length),
    socialLinks,
  });
  await step("structure");

  const copyFactsForWrite = { ...copyFacts, ctaLabel: plan.primaryCtaLabel };
  let copy = fallbackCopy(copyFactsForWrite, brief);
  let copyModel = "revora-native";
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
    primaryCtaLabel: copy.primaryCta || plan.primaryCtaLabel,
    secondaryCtaLabel: copy.secondaryCta || qaFacts.qaInput.secondaryCtaLabel,
  });

  // Materialize the plan into real pages/sections/components so the owner has
  // something to edit and publish. Skipped when the workspace already has pages.
  const [
    { materializeSiteContent },
    { recommendDirections },
    { classifyArchetype },
    { compileFirstBuildCreativeDirection },
    { synthesizeNativeFirstBuild },
    { playbookFor },
    { generateFirstBuildImages },
    { imageRepairPlan },
    { applyScreenshotReferenceToCreative },
  ] =
    await Promise.all([
      import("@/lib/site-materialize.server"),
      import("@/lib/design-directions"),
      import("@/lib/site-archetypes"),
      import("@/lib/builder/first-build-creative"),
      import("@/lib/builder/native-first-build"),
      import("@/lib/builder/industry"),
      import("@/lib/builder/first-build-images.server"),
      import("@/lib/builder/first-build-image-qa"),
      import("@/lib/builder/screenshot-reference"),
    ]);
  // Decide what kind of website this business needs (restaurant, clinic, shop,
  // studio, venue …) so the structure fits the industry, not one template.
  const archetype = classifyArchetype({
    industry: org.data.industry ?? null,
    businessName: org.data.name ?? null,
    description: (p["description"] as string) ?? null,
    services: serviceRows.map((service) => ({ name: service.name })),
  });
  const direction = recommendDirections({
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? null,
    services: serviceRows.map((service) => ({ name: service.name })),
    city: (p["city"] as string) ?? null,
    currentFont: (p["font_preference"] as string) ?? null,
    count: 1,
  })[0] ?? null;
  let creative = compileFirstBuildCreativeDirection({
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
    conversionGoal: org.data.conversion_goal ?? null,
    photoCount: (media.data ?? []).length + ((p["hero_image_url"] as string) ? 1 : 0),
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
      model: "revora-native",
      instruction: null,
      result: applied.reference as unknown as never,
      created_by: job.created_by,
    } as never);
  }

  const industryPlaybook = playbookFor(
    org.data.industry ?? null,
    (p["description"] as string) ?? null,
    serviceRows.map((service) => service.name).join(" "),
  );

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

  // The premium thinking tiers may only *improve wording that already describes
  // supplied facts*. Every field they return passes the fact gate first, and the
  // deterministic copy survives untouched when the paid lane is off, out of
  // budget, unavailable or refused.
  const { refineFirstBuildWithCollective } = await import(
    "@/lib/builder/collective-first-build.server"
  );
  const refined = await refineFirstBuildWithCollective({
    organizationId: orgId,
    facts: buildFacts,
    brief,
    copy,
    creative,
  });
  if (refined.creativeChanged) creative = refined.creative;
  if (refined.changed) {
    copy = refined.copy;
    copyModel = refined.passes
      .filter((pass) => pass.used && pass.model)
      .map((pass) => pass.model)
      .join("+") || copyModel;
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
      fingerprintId: refined.creative.fingerprint.id,
      totalCostMicrocents: refined.totalCostMicrocents,
      passes: refined.passes,
    } as unknown as never,
    created_by: job.created_by,
  } as never);
  // The same adversarial gate runs AFTER any model wording, so a refined page
  // can never reach the site with an unsupported claim.
  const synthesis = synthesizeNativeFirstBuild({
    facts: buildFacts,
    language: typeof p["language"] === "string" ? (p["language"] as string) : "English",
    brief,
    plan,
    copy,
    creative,
  });
  if (!synthesis.valid) {
    throw new Error(
      synthesis.findings.find((finding) => finding.severity === "blocker")?.detail ??
        "The native quality review blocked unsafe website content.",
    );
  }
  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "native_first_build_synthesis",
    model: "revora-native",
    instruction: null,
    result: synthesis as unknown as never,
    created_by: job.created_by,
  } as never);
  try {
  const starterImages = await generateFirstBuildImages(db, {
    organizationId: orgId,
    userId: job.created_by,
    businessName: org.data.name ?? "",
    city: (p["city"] as string) ?? null,
    photoCount: (media.data ?? []).length + ((p["hero_image_url"] as string) ? 1 : 0),
    creative,
  });
  await db.from("ai_generations").insert({
    organization_id: orgId,
    job_id: job.id,
    kind: "first_build_images",
    model: starterImages.evidence.models.join("+") || starterImages.evidence.provider || "revora-artwork",
    instruction: null,
    result: starterImages.evidence as unknown as never,
    created_by: job.created_by,
  } as never);
  const built = await materializeSiteContent(db, orgId, {
    businessName: org.data.name ?? "",
    copy,
    services: serviceRows,
    city: (p["city"] as string) ?? null,
    state: (p["state"] as string) ?? null,
    serviceArea: (p["service_area"] as string) ?? null,
    phone: (p["phone"] as string) ?? null,
    email: (p["email"] as string) ?? null,
    yearsInBusiness: (p["years_in_business"] as number) ?? null,
    photoCount: (media.data ?? []).length,
    hasQuoteForm: (forms.data ?? []).length > 0,
    hasBooking: (bookable.data ?? []).length > 0,
    direction,
    archetype,
    fingerprint: creative.fingerprint,
    industryPlaybook,
    generatedAssets: starterImages.assets,
    replaceExisting: freshReplace,
  });

  // A brand chosen by the owner wins. Only replace the untouched generated
  // defaults during a first build, so onboarding produces a distinctive site
  // without overwriting deliberate colours on an existing workspace.
  const hasOwnerBrand = Boolean(
    (p["font_preference"] as string) ||
      (p["secondary_color"] as string) ||
      (p["accent_color"] as string) ||
      ((p["primary_color"] as string) && (p["primary_color"] as string).toLowerCase() !== "#34d399"),
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
    if (themeError) throw new Error(themeError.message);
  }

  const report = {
    builtAt: new Date().toISOString(),
    pages: built.skipped ? plan.pages.length : built.pages,
    sections: built.skipped ? plan.sections.length : built.sections,
    services: serviceRows.length,

    faqs: copy.faqs.length,
    photos: (media.data ?? []).length + ((p["hero_image_url"] as string) ? 1 : 0),
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
      attached: !built.skipped ? starterImages.assets.length : 0,
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
      readiness: creative.imagery.assetPlan.readiness,
      missingRequired: creative.imagery.assetPlan.missingRequired.map((slot) => ({
        id: slot.id,
        section: slot.section,
        count: slot.count,
        policy: slot.policy,
      })),
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
      template: plan.template,
      generation: {
        ...withoutPendingBuild(priorGeneration),
        ...plan,
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
        nativeSynthesis: synthesis,
        screenshotReference,
        screenshotReferenceObservations: storedReferenceObservations ?? null,
        designFingerprint: { ...creative.fingerprint, updatedAt: new Date().toISOString() },
        ...(!built.skipped && direction ? { effects: { backdrop: direction.backdrop } } : {}),
      } as unknown as Record<string, unknown>,
      generated_at: new Date().toISOString(),
      review_state: "ready_for_review",
      publish_state: keepState,
      seo: {
        title: copy.metaTitle || plan.seoTitle,
        headline: copy.heroHeadline,
        subheadline: copy.heroSubheadline,
        meta_description: copy.metaDescription || plan.metaDescription,
        primary_cta_label: copy.primaryCta || plan.primaryCtaLabel,
        og_title: copy.ogTitle,
        og_description: copy.ogDescription,
      },
    } as never,
    { onConflict: "organization_id" },
  );
  if (saveError) throw new Error(saveError.message);
  await step("leads");
  await step("mobile");

  await db
    .from("generation_jobs")
    .update({
      status: "completed",
      progress: 100,
      current_step: "ready",
      steps: [...done, "ready"],
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", job.id);

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

  // Paused-state guard. Rate limits and credit/policy denials are both
  // self-healing: every generation stage has a deterministic Revora fallback, so
  // the builder keeps running at full speed with rules-only writing instead of
  // parking the queue. Only an explicit hard block keeps the probe-only budget.
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
          .eq("id", job.id);
        await writeQueueState(db, { last_error: message });
        continue;
      }

      // Credit/policy denials must never stop the builder. Every generation
      // stage has a deterministic Revora fallback, so a denial is retried
      // immediately in rules-only mode instead of pausing the queue.
      if (status === 402 || status === 403) {
        await db
          .from("generation_jobs")
          .update({ status: "queued", error_message: null, lease_expires_at: null } as never)
          .eq("id", job.id);
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
        .eq("id", job.id);
      await writeQueueState(db, { last_error: message });
    }
  }

  return { processed, failed, paused: false, pauseReason: null, idle: processed + failed === 0 };
}
