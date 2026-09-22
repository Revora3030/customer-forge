import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Revora Site Engine server functions.
 *
 * All reads and writes go through the caller's authenticated client, so tenant
 * isolation is enforced by row level security — a client can only ever generate
 * or edit their own website.
 */

export type RunMode = "safe" | "fresh_replace";
export type RunResult = {
  jobId: string;
  status: string;
  progress: number;
  queued: boolean;
  mode: RunMode;
  backupId?: string;
};

export const runSiteGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; mode?: RunMode; confirmation?: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    const mode: RunMode = input?.mode === "fresh_replace" ? "fresh_replace" : "safe";
    const confirmation = String(input?.confirmation ?? "").trim();
    return { organizationId, mode, confirmation };
  })
  .handler(async ({ data, context }): Promise<RunResult> => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;
    // Server-side paywall: the UI gate is cosmetic, this is authoritative.
    {
      const { assertOrgEntitled } = await import("@/lib/entitlement.server");
      await assertOrgEntitled(supabase, orgId);
    }

    // Generation is gated on real readiness: the blanks Revora asked about must
    // be filled, and the owner must have approved the brief the build reads from.
    {
      const { readBrief } = await import("@/lib/site-brief");
      const { requiredFactGaps } = await import("@/lib/launch-qa");
      const { gatherBriefFacts } = await import("@/lib/site-brief.server");

      const settings = await supabase
        .from("website_settings")
        .select("generation")
        .eq("organization_id", orgId)
        .maybeSingle();
      const brief = readBrief(
        (settings.data?.generation as Record<string, unknown> | null)?.["brief"],
      );
      const facts = await gatherBriefFacts(supabase, orgId, brief?.missingFacts ?? []);
      const missing = requiredFactGaps(facts.factInput);
      if (missing.length)
        throw new Error(
          `Revora still needs: ${missing.map((g) => g.label.toLowerCase()).join(", ")}.`,
        );
      if (!brief) throw new Error("Review Revora's understanding of your business first.");
      if (!brief.approved) throw new Error("Approve the brief and Revora will build from it.");
    }

    // RLS enforces that the caller belongs to this workspace.
    const { data: existing } = await supabase
      .from("generation_jobs")
      .select("id, status, progress")
      .eq("organization_id", orgId)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && data.mode === "fresh_replace")
      throw new Error("A build is already running. Wait for it to finish before starting a fresh rebuild.");
    if (existing)
      return {
        jobId: existing.id,
        status: existing.status,
        progress: existing.progress,
        queued: true,
        mode: "safe",
      };

    let backupId: string | undefined;
    if (data.mode === "fresh_replace") {
      if (data.confirmation !== "FRESH REBUILD")
        throw new Error("Type FRESH REBUILD to replace the current draft.");
      const { requireOrgRole } = await import("@/lib/org-authz.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { createBackup } = await import("@/lib/backup.server");
      await requireOrgRole(supabase, orgId, userId, "admin");
      const backup = await createBackup(supabaseAdmin as never, orgId, {
        kind: "pre_restore",
        label: `Before fresh AI rebuild ${new Date().toISOString()}`,
        userId,
      });
      backupId = backup.id;
    }

    const cleanupFreshQueue = async () => {
      if (!backupId) return;
      const { data: settings } = await supabase
        .from("website_settings")
        .select("generation")
        .eq("organization_id", orgId)
        .maybeSingle();
      const generation = (settings?.generation ?? {}) as Record<string, unknown>;
      if ("pendingBuild" in generation) {
        const next = { ...generation };
        delete next["pendingBuild"];
        await supabase
          .from("website_settings")
          .upsert({ organization_id: orgId, generation: next } as never, { onConflict: "organization_id" });
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("data_backups").delete().eq("id", backupId).eq("organization_id", orgId);
    };

    if (data.mode === "fresh_replace") {
      const { data: settings } = await supabase
        .from("website_settings")
        .select("generation")
        .eq("organization_id", orgId)
        .maybeSingle();
      const generation = (settings?.generation ?? {}) as Record<string, unknown>;
      const { error: pendingError } = await supabase.from("website_settings").upsert(
        {
          organization_id: orgId,
          generation: {
            ...generation,
            pendingBuild: {
              mode: "fresh_replace",
              backupId,
              requestedBy: userId,
              requestedAt: new Date().toISOString(),
            },
          },
        } as never,
        { onConflict: "organization_id" },
      );
      if (pendingError) {
        await cleanupFreshQueue();
        throw new Error(pendingError.message);
      }
    }

    const { data: job, error } = await supabase
      .from("generation_jobs")
      .insert({
        organization_id: orgId,
        status: "queued",
        progress: 0,
        current_step: null,
        created_by: userId,
        steps: [],
      })
      .select("id")
      .single();
    if (error || !job) {
      await cleanupFreshQueue();
      throw new Error(error?.message ?? "Couldn't queue the build.");
    }

    // Non-blocking kick so the worker usually starts immediately; the scheduled
    // run and the client's pump call are the fallbacks.
    void kickWorker(new URL(getRequest().url).origin);

    return {
      jobId: job.id,
      status: "queued",
      progress: 0,
      queued: true,
      mode: data.mode,
      ...(backupId ? { backupId } : {}),
    };
  });

async function kickWorker(origin: string) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  const base = process.env["APP_URL"] ?? origin;
  if (!secret || !base) return;
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/public/jobs/site-engine`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
  } catch {
    // The scheduled worker run and the client pump still pick the job up.
  }
}

/**
 * Advances the queue for the caller's own workspace. The client polling hook
 * calls this, so generation always progresses even without a scheduler — the
 * database lease guarantees a job is never processed twice.
 */
export const pumpSiteEngineQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }) => {
    // Verify membership with the caller's RLS-scoped client before using admin.
    const { data: member } = await context.supabase
      .from("memberships")
      .select("organization_id")
      .eq("organization_id", data.organizationId)
      .limit(1)
      .maybeSingle();
    if (!member) throw new Error("You don't have access to that workspace.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { drainSiteEngineQueue } = await import("@/lib/site-engine.worker.server");
    return drainSiteEngineQueue(supabaseAdmin as never, {
      max: 1,
      organizationId: data.organizationId,
      probeWhilePaused: true,
    });
  });

/** AI edit assistant: rewrites only the requested fields. */
export const aiEditSiteCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { organizationId: string; instruction: string; fields: Record<string, string> }) => {
      const organizationId = String(input?.organizationId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
      const instruction = String(input?.instruction ?? "")
        .trim()
        .slice(0, 400);
      if (instruction.length < 4) throw new Error("Tell Revora what to change.");
      const raw = input?.fields ?? {};
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw).slice(0, 10)) {
        if (typeof value === "string" && value.trim()) fields[key] = value.slice(0, 4000);
      }
      if (!Object.keys(fields).length) throw new Error("There's no copy to rewrite yet.");
      return { organizationId, instruction, fields };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;
    // Server-side paywall: the UI gate is cosmetic, this is authoritative.
    {
      const { assertOrgEntitled } = await import("@/lib/entitlement.server");
      await assertOrgEntitled(supabase, orgId);
    }
    const { rewriteCopyFields, COPY_ROLE } = await import("@/lib/site-engine.server");

    const [org, profile, services] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, industry, conversion_goal")
        .eq("id", orgId)
        .maybeSingle(),
      supabase.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
      supabase
        .from("services")
        .select("name, description, price, starting_price")
        .eq("organization_id", orgId)
        .eq("is_active", true),
    ]);
    if (!org.data) throw new Error("Workspace not found.");
    const p = (profile.data ?? {}) as Record<string, unknown>;

    const result = await rewriteCopyFields(
      {
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
        goals: ((p["website_goals"] as string[]) ?? []).slice(0, 6),
        ctaLabel: "Get in touch",
        services: services.data ?? [],
      },
      data.fields,
      data.instruction,
    );

    await supabase.from("ai_generations").insert({
      organization_id: orgId,
      kind: "copy_edit",
      model: COPY_ROLE,
      instruction: data.instruction,
      result: result as unknown as never,
      created_by: userId,
    });

    return result;
  });

/** AI section assistant: proposes edits; the client confirms before anything is written. */
export const aiEditSiteSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; instruction: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    const instruction = String(input?.instruction ?? "")
      .trim()
      .slice(0, 400);
    if (instruction.length < 4) throw new Error("Tell Revora what to change.");
    return { organizationId, instruction };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;
    // Server-side paywall: the UI gate is cosmetic, this is authoritative.
    {
      const { assertOrgEntitled } = await import("@/lib/entitlement.server");
      await assertOrgEntitled(supabase, orgId);
    }
    const { proposeSectionEdits, COPY_ROLE } = await import("@/lib/site-engine.server");

    const [org, profile, services, sections] = await Promise.all([
      supabase.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
      supabase.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
      supabase
        .from("services")
        .select("name, description, price, starting_price")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("website_sections")
        .select("id, kind, heading, subheading, body, page_id")
        .eq("organization_id", orgId)
        .order("sort_order")
        .limit(40),
    ]);
    if (!org.data) throw new Error("Workspace not found.");
    if (!sections.data?.length)
      throw new Error("Build your website structure first, then ask for changes.");
    const p = (profile.data ?? {}) as Record<string, unknown>;

    const result = await proposeSectionEdits(
      {
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
        goals: ((p["website_goals"] as string[]) ?? []).slice(0, 6),
        ctaLabel: "Get in touch",
        services: services.data ?? [],
      },
      sections.data.map((s) => ({
        id: s.id,
        label: s.kind,
        heading: s.heading,
        subheading: s.subheading,
        body: s.body,
      })),
      data.instruction,
    );

    await supabase.from("ai_generations").insert({
      organization_id: orgId,
      kind: "section_edit",
      model: COPY_ROLE,
      instruction: data.instruction,
      result: result as unknown as never,
      created_by: userId,
    });

    // Send back current values so the client can show a before/after preview.
    const current = new Map(sections.data.map((s) => [s.id, s]));
    return {
      reply: result.reply,
      edits: result.edits.map((edit) => {
        const row = current.get(edit.sectionId);
        return {
          sectionId: edit.sectionId,
          sectionLabel: row?.kind ?? "section",
          field: edit.field,
          before: String((row as Record<string, unknown> | undefined)?.[edit.field] ?? ""),
          after: edit.after,
        };
      }),
    };
  });

/* --------------------- brief review, facts and self-test --------------------- */

const orgIdOf = (input: { organizationId?: unknown }) => {
  const organizationId = String(input?.organizationId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
  return organizationId;
};

const MAX_REFERENCE_SCREENSHOT_BYTES = 4_000_000;

const referenceDataUrlOf = (value: unknown) => {
  const dataUrl = String(value ?? "");
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("A PNG, JPEG or WEBP screenshot is required.");
  }
  const payload = match[2] ?? "";
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;
  if (bytes > MAX_REFERENCE_SCREENSHOT_BYTES) {
    throw new Error("That screenshot is too large to read.");
  }
  return dataUrl;
};

const boundedList = (value: unknown, max = 8) => {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return list
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 140))
    .slice(0, max);
};

function observationInputOf(input: Record<string, unknown>) {
  const raw = (input["observations"] ?? {}) as Record<string, unknown>;
  return {
    layout: boundedList(raw["layout"]),
    hierarchy: boundedList(raw["hierarchy"]),
    typography: boundedList(raw["typography"]),
    spacing: boundedList(raw["spacing"]),
    color: boundedList(raw["color"]),
    interactions: boundedList(raw["interactions"]),
    components: boundedList(raw["components"]),
  };
}

async function referenceBaseFingerprint(
  supabase: SupabaseClient<Database>,
  organizationId: string,
) {
  const [{ data: settings }, { data: org }, { data: profile }] = await Promise.all([
    supabase.from("website_settings").select("generation").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("organizations").select("name, industry").eq("id", organizationId).maybeSingle(),
    supabase.from("business_profiles").select("city, service_area").eq("organization_id", organizationId).maybeSingle(),
  ]);
  const generation = (settings?.generation ?? {}) as Record<string, unknown>;
  const { readDesignFingerprint, createDesignFingerprint } = await import("@/lib/builder/design-fingerprint");
  const stored = readDesignFingerprint(generation);
  if (stored) return { generation, fingerprint: stored, businessName: org?.name ?? null };
  return {
    generation,
    fingerprint: createDesignFingerprint({
      businessName: org?.name ?? null,
      industry: org?.industry ?? null,
      city: (profile?.city as string | null | undefined) ?? (profile?.service_area as string | null | undefined) ?? null,
      photoCount: 0,
    }),
    businessName: org?.name ?? null,
  };
}

async function persistScreenshotReference(
  supabase: SupabaseClient<Database>,
  input: {
    organizationId: string;
    userId: string;
    observations: unknown;
    source: "manual" | "free_vision";
    provider?: string;
    model?: string;
  },
) {
  const { normalizeScreenshotReferenceObservations, deriveScreenshotReferenceFingerprint } = await import(
    "@/lib/builder/screenshot-reference"
  );
  const base = await referenceBaseFingerprint(supabase, input.organizationId);
  const observations = normalizeScreenshotReferenceObservations(input.observations, {
    businessName: base.businessName,
    blockedNames: [base.businessName ?? ""],
    maxPerField: 8,
  });
  const hasAny = Object.values(observations).some((list) => list.length > 0);
  if (!hasAny) throw new Error("No reusable design patterns were found. Add layout, spacing, type or colour notes.");
  const reference = deriveScreenshotReferenceFingerprint({
    observations,
    base: base.fingerprint,
    businessName: base.businessName,
    blockedNames: [base.businessName ?? ""],
  });
  const generation = {
    ...base.generation,
    screenshotReferenceObservations: observations,
    screenshotReference: {
      ...reference,
      source: input.source,
      provider: input.provider ?? null,
      model: input.model ?? null,
      updatedAt: new Date().toISOString(),
    },
  };
  const { error } = await supabase.from("website_settings").upsert(
    { organization_id: input.organizationId, generation } as never,
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(error.message);
  await supabase.from("ai_generations").insert({
    organization_id: input.organizationId,
    kind: input.source === "free_vision" ? "screenshot_reference_extraction" : "screenshot_reference_saved",
    model: input.model ?? (input.source === "manual" ? "owner-supplied" : "free-vision"),
    instruction: null,
    result: { observations, reference, provider: input.provider ?? null } as unknown as never,
    created_by: input.userId,
  } as never);
  return { observations, reference, source: input.source, provider: input.provider ?? null, model: input.model ?? null };
}

/**
 * Runs only the analysis pass and stores the result as an unapproved brief, so
 * the owner can read and edit Revora's understanding before any copy, design or
 * pages are generated.
 */
export const analyzeSiteBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => ({ organizationId: orgIdOf(input) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;
    const { gatherBriefFacts } = await import("@/lib/site-brief.server");
    const { analyzeBusiness, fallbackBrief, RevoraAiError } =
      await import("@/lib/site-engine.server");
    const { readBrief } = await import("@/lib/site-brief");

    const facts = await gatherBriefFacts(supabase, orgId);
    const settings = await supabase
      .from("website_settings")
      .select("generation")
      .eq("organization_id", orgId)
      .maybeSingle();
    const generation = (settings.data?.generation ?? {}) as Record<string, unknown>;
    const previous = readBrief(generation["brief"]);

    let brief = fallbackBrief(facts.copyFacts);
    let aiError: string | null = null;
    try {
      brief = await analyzeBusiness(facts.copyFacts);
    } catch (error) {
      // Credit/policy denials never block analysis — the deterministic brief
      // built from the owner's own answers is used instead.
      if (error instanceof RevoraAiError && error.status === 429) throw error;
      aiError = error instanceof Error ? error.message : "Analysis unavailable";
    }

    // A new analysis always needs re-approval, but the owner's answers stay.
    brief = { ...brief, approved: false, factAnswers: previous?.factAnswers ?? {} };

    const { error } = await supabase
      .from("website_settings")
      .upsert({ organization_id: orgId, generation: { ...generation, brief } } as never, {
        onConflict: "organization_id",
      });
    if (error) throw new Error(error.message);

    await supabase.from("ai_generations").insert({
      organization_id: orgId,
      kind: "business_brief",
      model: brief.source,
      instruction: null,
      result: brief as unknown as never,
      created_by: userId,
    });

    return { brief, aiError };
  });

/** Saves the owner's edits to the brief, and their approval to build from it. */
export const saveSiteBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; brief: unknown; approved?: boolean }) => ({
    organizationId: orgIdOf(input),
    brief: input?.brief,
    approved: input?.approved === true,
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { readBrief } = await import("@/lib/site-brief");
    const parsed = readBrief(data.brief);
    if (!parsed) throw new Error("That brief isn't complete enough to save.");

    const settings = await supabase
      .from("website_settings")
      .select("generation")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const generation = (settings.data?.generation ?? {}) as Record<string, unknown>;
    const brief = { ...parsed, approved: data.approved, source: parsed.source };

    const { error } = await supabase
      .from("website_settings")
      .upsert(
        { organization_id: data.organizationId, generation: { ...generation, brief } } as never,
        { onConflict: "organization_id" },
      );
    if (error) throw new Error(error.message);
    return { brief };
  });

/**
 * Saves answers to the blanks Revora asked about. Answers that map to a business
 * profile column are written there so every later stage uses them; the rest are
 * kept with the brief as context.
 */
export const saveMissingFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; answers: Record<string, string> }) => {
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(input?.answers ?? {}).slice(0, 20)) {
      if (typeof value === "string" && value.trim())
        answers[key.slice(0, 60)] = value.trim().slice(0, 600);
    }
    if (!Object.keys(answers).length) throw new Error("Fill in at least one answer.");
    return { organizationId: orgIdOf(input), answers };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const orgId = data.organizationId;
    const { readBrief } = await import("@/lib/site-brief");
    const { factGaps } = await import("@/lib/launch-qa");
    const { gatherBriefFacts } = await import("@/lib/site-brief.server");

    const facts = await gatherBriefFacts(supabase, orgId);
    const fieldByKey = new Map(
      factGaps(facts.factInput)
        .filter((g) => g.field)
        .map((g) => [g.key, g.field!] as const),
    );

    const profilePatch: Record<string, string> = {};
    const context_answers: Record<string, string> = {};
    const serviceNames: string[] = [];
    for (const [key, raw] of Object.entries(data.answers)) {
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) continue; // an untouched box is not an answer, and never overwrites saved data
      const field = fieldByKey.get(key);
      if (field === "services_list") {
        for (const line of value
          .split(/[\n,]/)
          .map((l) => l.trim())
          .filter(Boolean))
          serviceNames.push(line);
      } else if (field) profilePatch[field] = value;
      else context_answers[key] = value;
    }

    if (Object.keys(profilePatch).length) {
      const { error } = await supabase
        .from("business_profiles")
        .upsert({ organization_id: orgId, ...profilePatch } as never, {
          onConflict: "organization_id",
        });
      if (error) throw new Error(error.message);
    }

    if (serviceNames.length) {
      const { error } = await supabase.from("services").insert(
        serviceNames.slice(0, 20).map((name, index) => ({
          organization_id: orgId,
          name: name.slice(0, 120),
          is_active: true,
          sort_order: index,
        })) as never,
      );
      if (error) throw new Error(error.message);
    }

    const settings = await supabase
      .from("website_settings")
      .select("generation")
      .eq("organization_id", orgId)
      .maybeSingle();
    const generation = (settings.data?.generation ?? {}) as Record<string, unknown>;
    const brief = readBrief(generation["brief"]);
    if (brief) {
      const { error } = await supabase.from("website_settings").upsert(
        {
          organization_id: orgId,
          generation: {
            ...generation,
            brief: { ...brief, factAnswers: { ...brief.factAnswers, ...context_answers } },
          },
        } as never,
        { onConflict: "organization_id" },
      );
      if (error) throw new Error(error.message);
    }

    const after = await gatherBriefFacts(supabase, orgId, brief?.missingFacts ?? []);
    return { gaps: factGaps(after.factInput) };
  });

/** Saves bounded, anti-cloning design observations from an inspiration screenshot. */
export const saveScreenshotReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; observations: unknown }) => ({
    organizationId: orgIdOf(input),
    observations: observationInputOf((input ?? {}) as Record<string, unknown>),
  }))
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    return persistScreenshotReference(context.supabase, {
      organizationId: data.organizationId,
      userId: context.userId,
      observations: data.observations,
      source: "manual",
    });
  });

/** Extracts design observations from a screenshot using only free vision models. */
export const extractScreenshotReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; screenshotDataUrl: string; notes?: string }) => ({
    organizationId: orgIdOf(input),
    screenshotDataUrl: referenceDataUrlOf(input?.screenshotDataUrl),
    notes: String(input?.notes ?? "").trim().slice(0, 600),
  }))
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");

    // Quality first: any connected picture-reading model may answer this call.
    const { builderAiAvailable } = await import("@/lib/ai/availability");
    if (!builderAiAvailable("vision")) {
      return {
        ok: false,
        code: "VISION_UNAVAILABLE",
        reason:
          "No picture-reading model is reachable right now. Nothing was changed.",
      } as const;
    }



    const mimeType = data.screenshotDataUrl.slice(5, data.screenshotDataUrl.indexOf(";"));
    const { generateStructuredOutput } = await import("@/lib/ai/router.server");
    try {
      const outcome = await generateStructuredOutput(
        { organizationId: data.organizationId, userId: context.userId, task: "site.screenshot_reference" },
        {
          role: "vision",
          json: true,
          maxOutputTokens: 900,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    "Extract a website design fingerprint from this screenshot for inspiration only.",
                    "Do NOT copy logos, brand names, exact wording, exact colours, URLs, people, claims, coordinates or proprietary assets.",
                    "Return JSON only with arrays named layout, hierarchy, typography, spacing, color, interactions, components.",
                    "Each array should contain short reusable patterns, not facts from the screenshot.",
                    data.notes ? `Owner notes: ${data.notes}` : "",
                  ].filter(Boolean).join("\n"),
                },
                { type: "image", dataUrl: data.screenshotDataUrl, mimeType },
              ],
            },
          ],
        },
      );
      const saved = await persistScreenshotReference(context.supabase, {
        organizationId: data.organizationId,
        userId: context.userId,
        observations: outcome.data,
        source: "free_vision",
        provider: outcome.provider,
        model: outcome.model,
      });
      return { ok: true, ...saved, provider: outcome.provider, model: outcome.model } as const;
    } catch (error) {
      return {
        ok: false,
        code: "REFERENCE_EXTRACTION_FAILED",
        reason:
          error instanceof Error
            ? `The free vision model could not extract a usable design brief: ${error.message}`
            : "The free vision model could not extract a usable design brief.",
      } as const;
    }
  });

/** The blanks and QA state for the builder UI, computed from real rows. */
export const getBuildReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => ({ organizationId: orgIdOf(input) }))
  .handler(async ({ data, context }) => {
    const { readBrief } = await import("@/lib/site-brief");
    const { captureQa, factGaps } = await import("@/lib/launch-qa");
    const { gatherBriefFacts } = await import("@/lib/site-brief.server");

    const settings = await context.supabase
      .from("website_settings")
      .select("generation")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const brief = readBrief(
      (settings.data?.generation as Record<string, unknown> | null)?.["brief"],
    );
    const facts = await gatherBriefFacts(
      context.supabase,
      data.organizationId,
      brief?.missingFacts ?? [],
    );
    const gaps = factGaps(facts.factInput);
    const qa = captureQa(facts.qaInput);
    // Website quality gate: malformed contact details, unfinished copy, stored
    // data printed as words or unsupported claims block a publish outright.
    const { auditWorkspaceWebsite } = await import("@/lib/builder/quality.server");
    const quality = await auditWorkspaceWebsite(context.supabase as never, data.organizationId);
    return {
      gaps,
      requiredGaps: gaps.filter((g) => g.required),
      briefApproved: brief?.approved === true,
      hasBrief: !!brief,
      capture: qa,
      quality,
    };
  });

/**
 * Signed-in end-to-end check. Every step does the real thing — a live AI
 * analysis call, a real QA pass over the workspace's rows, and a real fetch of
 * the public preview — and reports exactly what happened. Nothing is simulated.
 */
export const runSiteEngineCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => ({ organizationId: orgIdOf(input) }))
  .handler(async ({ data, context }) => {
    const orgId = data.organizationId;
    const steps: { key: string; label: string; ok: boolean; detail: string }[] = [];
    const { gatherBriefFacts } = await import("@/lib/site-brief.server");
    const { analyzeBusiness } = await import("@/lib/site-engine.server");
    const { captureQa } = await import("@/lib/launch-qa");
    const { readBrief, readReport } = await import("@/lib/site-brief");

    let facts: Awaited<ReturnType<typeof gatherBriefFacts>> | null = null;
    try {
      facts = await gatherBriefFacts(context.supabase, orgId);
      steps.push({
        key: "facts",
        label: "Business information readable",
        ok: true,
        detail: `${facts.serviceRows.length} services, ${facts.photoCount} photos, ${facts.socialLinks} social links.`,
      });
    } catch (error) {
      steps.push({
        key: "facts",
        label: "Business information readable",
        ok: false,
        detail: error instanceof Error ? error.message : "Couldn't read your workspace.",
      });
    }

    if (facts) {
      try {
        const brief = await analyzeBusiness(facts.copyFacts);
        steps.push({
          key: "ai",
          label: "Live AI analysis call",
          ok: brief.source !== "rules",
          detail:
            brief.source === "rules"
              ? "AI analysis returned nothing usable; the deterministic brief would be used."
              : `${brief.source} answered: “${brief.positioning.slice(0, 120)}”`,
        });
      } catch (error) {
        steps.push({
          key: "ai",
          label: "Live AI analysis call",
          ok: false,
          detail: error instanceof Error ? error.message : "The AI call failed.",
        });
      }

      const qa = captureQa(facts.qaInput);
      steps.push({
        key: "capture",
        label: "Lead capture and booking QA",
        ok: qa.passed,
        detail: qa.passed
          ? "Every lead-capture and booking check passed."
          : `${qa.blockers.length} blocking issue${qa.blockers.length === 1 ? "" : "s"}: ${qa.blockers.map((b) => b.label).join(", ")}.`,
      });
    }

    const settings = await context.supabase
      .from("website_settings")
      .select("generation, publish_state")
      .eq("organization_id", orgId)
      .maybeSingle();
    const generation = (settings.data?.generation ?? {}) as Record<string, unknown>;
    const brief = readBrief(generation["brief"]);
    const report = readReport(generation["report"]);
    steps.push({
      key: "report",
      label: "Build report written",
      ok: !!report,
      detail: report
        ? `Last build ${report.builtAt}: ${report.pages} pages, ${report.sections} sections, ${report.checks.length} QA checks.`
        : "No build report yet — run a build first.",
    });
    steps.push({
      key: "brief",
      label: "Brief stored and reviewable",
      ok: !!brief,
      detail: brief
        ? `${brief.source}${brief.approved ? ", approved by you" : ", awaiting your approval"}.`
        : "No brief stored yet.",
    });

    if (facts?.slug) {
      try {
        const origin = new URL(getRequest().url).origin;
        const response = await fetch(`${origin}/s/${facts.slug}`, {
          headers: { accept: "text/html" },
        });
        const html = await response.text();
        const headline = brief ? null : null;
        steps.push({
          key: "preview",
          label: "Public preview renders",
          ok: response.ok && html.includes("<html"),
          detail: response.ok
            ? `/s/${facts.slug} returned ${response.status} and ${html.length.toLocaleString()} bytes of HTML.${headline ?? ""}`
            : `/s/${facts.slug} returned ${response.status}.`,
        });
      } catch (error) {
        steps.push({
          key: "preview",
          label: "Public preview renders",
          ok: false,
          detail: error instanceof Error ? error.message : "Couldn't load the preview.",
        });
      }
    }

    return { ranAt: new Date().toISOString(), steps, passed: steps.every((s) => s.ok) };
  });
