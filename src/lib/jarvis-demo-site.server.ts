import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/admin.server";
import {
  DEMO_PREVIEW_DAYS,
  readProspectDemoMarker,
  type ProspectDemoInput,
  type ProspectDemoMarker,
} from "@/lib/jarvis-demo-site";

/**
 * Creates a private prospect demo workspace and queues its first AI build.
 *
 * The workspace is `is_demo` (excluded from customer funnel numbers, never
 * billed) and owned by the super-admin who asked for it. The build runs through
 * the normal site-engine worker, so the free model pool, fact gates, creative
 * authority and safety reviews are exactly the ones customer builds get. The
 * draft is never published; the operator shares the private /p/ preview link.
 */
export async function provisionProspectDemo(
  admin: SupabaseClient,
  input: ProspectDemoInput,
  actorId: string,
): Promise<{ organizationId: string; jobId: string; previewToken: string; expiresAt: string }> {
  const base = slugify(`${input.businessName} ${input.city}`) || "prospect";
  let slug = base;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const { data: taken } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${base}-${attempt + 2}`;
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: input.businessName,
      slug,
      industry: input.industry,
      is_demo: true,
      onboarding_step: 4,
      onboarding_completed: true,
      created_by: actorId,
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(orgError?.message ?? "Couldn't create the demo workspace.");
  const organizationId = (org as { id: string }).id;

  // A half-created demo is removed (its rows cascade) so the operator can retry.
  const must = async (step: string, run: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run;
    if (!error) return;
    await admin.from("organizations").delete().eq("id", organizationId);
    throw new Error(`Couldn't finish the demo workspace (${step}): ${error.message}`);
  };

  const previewToken = newPreviewToken();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DEMO_PREVIEW_DAYS * 86_400_000).toISOString();
  const marker: ProspectDemoMarker = { kind: "prospect_demo", createdBy: actorId, createdAt, previewToken };

  await must(
    "membership",
    admin.from("memberships").insert({ organization_id: organizationId, user_id: actorId, role: "owner" }),
  );
  await must(
    "business_profiles",
    admin.from("business_profiles").insert({
      organization_id: organizationId,
      description: input.description,
      phone: input.phone,
      email: input.email,
      city: input.city,
      state: input.state,
      service_area: input.city,
      hours: {},
    }),
  );
  await must(
    "website_settings",
    admin.from("website_settings").insert({
      organization_id: organizationId,
      template: "ai-authored",
      pages: {},
      publish_state: "draft",
      published: false,
      generation: { prospectDemo: marker },
    } as never),
  );
  await must("social_profiles", admin.from("social_profiles").insert({ organization_id: organizationId }));
  if (input.services.length) {
    await must(
      "services",
      admin.from("services").insert(
        input.services.map((name, index) => ({
          organization_id: organizationId,
          name,
          sort_order: index,
          is_active: true,
        })),
      ),
    );
  }
  await must(
    "preview_link",
    admin.from("website_preview_links").insert({
      organization_id: organizationId,
      token: previewToken,
      label: `Prospect demo · ${input.businessName}`.slice(0, 120),
      expires_at: expiresAt,
      created_by: actorId,
    }),
  );

  const { data: job, error: jobError } = await admin
    .from("generation_jobs")
    .insert({
      organization_id: organizationId,
      status: "queued",
      progress: 0,
      current_step: null,
      created_by: actorId,
      steps: [],
    })
    .select("id")
    .single();
  if (jobError || !job) {
    await admin.from("organizations").delete().eq("id", organizationId);
    throw new Error(`Couldn't queue the demo build: ${jobError?.message ?? "no job returned"}`);
  }

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action: "jarvis.prospect_demo.created",
    entity: "organization",
    entity_id: organizationId,
    metadata: { business_name: input.businessName, industry: input.industry, city: input.city },
  });

  return { organizationId, jobId: (job as { id: string }).id, previewToken, expiresAt };
}

export type ProspectDemoSummary = {
  organizationId: string;
  name: string;
  industry: string | null;
  createdAt: string;
  previewToken: string;
  build: { status: string; progress: number; step: string | null; error: string | null } | null;
};

/** Lists prospect demos newest first, with the latest build state of each. */
export async function listProspectDemos(admin: SupabaseClient, limit = 20): Promise<ProspectDemoSummary[]> {
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, industry, created_at")
    .eq("is_demo", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const ids = (orgs ?? []).map((org) => org.id as string);
  if (!ids.length) return [];

  const [settings, jobs] = await Promise.all([
    admin.from("website_settings").select("organization_id, generation").in("organization_id", ids),
    admin
      .from("generation_jobs")
      .select("organization_id, status, progress, current_step, error_message, created_at")
      .in("organization_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  const markers = new Map<string, ProspectDemoMarker>();
  for (const row of settings.data ?? []) {
    const marker = readProspectDemoMarker((row.generation as Record<string, unknown> | null)?.["prospectDemo"]);
    if (marker) markers.set(row.organization_id as string, marker);
  }
  const latestJob = new Map<string, NonNullable<typeof jobs.data>[number]>();
  for (const job of jobs.data ?? []) {
    if (!latestJob.has(job.organization_id as string)) latestJob.set(job.organization_id as string, job);
  }

  const out: ProspectDemoSummary[] = [];
  for (const org of orgs ?? []) {
    const marker = markers.get(org.id as string);
    if (!marker) continue; // Other demo workspaces (the public product demo) are not prospects.
    const job = latestJob.get(org.id as string);
    out.push({
      organizationId: org.id as string,
      name: org.name as string,
      industry: (org.industry as string | null) ?? null,
      createdAt: marker.createdAt,
      previewToken: marker.previewToken,
      build: job
        ? {
            status: job.status as string,
            progress: Number(job.progress ?? 0),
            step: (job.current_step as string | null) ?? null,
            error: (job.error_message as string | null) ?? null,
          }
        : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function newPreviewToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}
