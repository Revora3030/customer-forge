import { websiteSuggestions, type WebsiteSuggestion } from "@/lib/jarvis-demo-site";
import { capacityWaitState, type CapacityWaitState } from "@/lib/builder/capacity-wait";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/admin.server";
import {
  DEMO_PREVIEW_DAYS,
  hoursRecord,
  readProspectDemoMarker,
  type ProspectDemoInput,
  type ProspectDemoMarker,
} from "@/lib/jarvis-demo-site";
import type { ProspectEnrichment } from "@/lib/prospect-enrichment";

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
  /** Autopilot demos record where they came from, so they are never built twice. */
  origin: { source: "autopilot"; placeId: string | null; enrichment?: ProspectEnrichment; pitchFirst?: boolean } | null = null,
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
  const marker: ProspectDemoMarker & { source?: "autopilot"; placeId?: string | null; enrichment?: ProspectEnrichment; siteGaps?: string[] } = {
    kind: "prospect_demo",
    createdBy: actorId,
    createdAt,
    previewToken,
    ...(origin ? { source: origin.source } : {}),
    // Pitch-first: only the workspace shell exists; the site is built when the owner replies.
    ...(origin?.pitchFirst ? { pitchFirst: true } : {}),
    ...(origin?.placeId ?? input.placeId ? { placeId: origin?.placeId ?? input.placeId ?? null } : {}),
    // Where the email came from and whether it was verified; autopilot's send gate reads it.
    ...(origin?.enrichment ? { enrichment: origin.enrichment } : {}),
    // Verified gaps on their current site, so outreach pitches an upgrade honestly.
    ...(input.siteGaps?.length ? { siteGaps: input.siteGaps } : {}),
  };

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
      address: input.address ?? null,
      hours: hoursRecord(input.hours),
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

  // The listing's own Google Maps photos go on the site first; AI fills the rest.
  const placeId = origin?.placeId ?? input.placeId ?? null;
  if (origin?.pitchFirst) {
    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: actorId,
      action: "jarvis.prospect_pitch.created",
      entity: "organization",
      entity_id: organizationId,
      metadata: { business_name: input.businessName, industry: input.industry, city: input.city, source: origin.source, place_id: origin.placeId },
    });
    return { organizationId, jobId: "", previewToken, expiresAt };
  }
  if (placeId && !placeId.startsWith("osm:")) {
    const { attachMapsPhotos } = await import("@/lib/maps-photos.server");
    await attachMapsPhotos(admin, organizationId, input.businessName, placeId);
  }

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
    metadata: {
      business_name: input.businessName,
      industry: input.industry,
      city: input.city,
      ...(origin ? { source: origin.source, place_id: origin.placeId } : {}),
    },
  });

  return { organizationId, jobId: (job as { id: string }).id, previewToken, expiresAt };
}

/**
 * Starts the build for a pitch-first prospect who answered. Safe to call twice:
 * it does nothing unless the workspace is still an unbuilt pitch shell. Returns
 * the queued job id, or null when there was nothing to start.
 */
export async function startDeferredDemoBuild(admin: SupabaseClient, organizationId: string): Promise<string | null> {
  const { data: settings, error: settingsError } = await admin.from("website_settings").select("generation").eq("organization_id", organizationId).maybeSingle();
  if (settingsError) throw new Error(`Couldn't read the demo: ${settingsError.message}`);
  const generation = (settings?.generation ?? null) as Record<string, unknown> | null;
  const raw = generation?.["prospectDemo"] as Record<string, unknown> | undefined;
  if (!raw || raw["pitchFirst"] !== true || raw["claimedAt"]) return null;
  const { data: existing, error: existingError } = await admin.from("generation_jobs").select("id").eq("organization_id", organizationId).in("status", ["queued", "processing", "running", "completed"]).limit(1);
  if (existingError) throw new Error(`Couldn't check the demo build: ${existingError.message}`);
  if ((existing ?? []).length) return null;

  const actorId = typeof raw["createdBy"] === "string" ? raw["createdBy"] : null;
  const placeId = typeof raw["placeId"] === "string" ? raw["placeId"] : null;
  const { data: org } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  if (placeId && !placeId.startsWith("osm:") && org?.name) {
    const { attachMapsPhotos } = await import("@/lib/maps-photos.server");
    await attachMapsPhotos(admin, organizationId, String(org.name), placeId);
  }
  const { data: job, error } = await admin
    .from("generation_jobs")
    .insert({ organization_id: organizationId, status: "queued", progress: 0, current_step: null, created_by: actorId, steps: [] })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null; // Existing active-job constraint owns concurrency.
    throw new Error(`Couldn't queue the demo build: ${error.message}`);
  }
  if (!job) throw new Error("Couldn't queue the demo build: no job was returned.");
  await admin
    .from("website_settings")
    .update({ generation: { ...generation, prospectDemo: { ...raw, pitchFirst: false, pitchAnsweredAt: new Date().toISOString() } } } as never)
    .eq("organization_id", organizationId);
  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action: "jarvis.prospect_pitch.build_started",
    entity: "organization",
    entity_id: organizationId,
    metadata: { reason: "prospect_replied" },
  });
  return (job as { id: string }).id;
}

export type ProspectDemoSummary = {
  organizationId: string;
  name: string;
  industry: string | null;
  createdAt: string;
  previewToken: string;
  /** Set once the business claimed the demo (marker.claimedAt). */
  claimedAt?: string | null;
  build: { status: string; progress: number; step: string | null; error: string | null; wait: CapacityWaitState | null } | null;
};

/**
 * Lists prospect demos newest first, with the latest build state of each.
 * Selected by the generation->prospectDemo marker rather than is_demo, so a
 * claimed demo (is_demo flips to false) stays visible as "Claimed".
 */
export async function listProspectDemos(admin: SupabaseClient, limit = 20): Promise<ProspectDemoSummary[]> {
  const { data: settings, error } = await admin
    .from("website_settings")
    .select("organization_id, generation")
    .not("generation->prospectDemo", "is", null)
    .limit(500);
  if (error) throw new Error(error.message);

  const markers = new Map<string, { marker: ProspectDemoMarker; claimedAt: string | null }>();
  for (const row of settings ?? []) {
    const raw = (row.generation as Record<string, unknown> | null)?.["prospectDemo"];
    const marker = readProspectDemoMarker(raw);
    if (!marker) continue; // Other demo workspaces (the public product demo) are not prospects.
    const claimedRaw = (raw as Record<string, unknown>)["claimedAt"];
    markers.set(row.organization_id as string, {
      marker,
      claimedAt: typeof claimedRaw === "string" && claimedRaw ? claimedRaw : null,
    });
  }
  const ids = [...markers.entries()]
    .sort((a, b) => Date.parse(b[1].marker.createdAt) - Date.parse(a[1].marker.createdAt))
    .slice(0, 100)
    .map(([id]) => id);
  if (!ids.length) return [];

  const [orgs, jobs] = await Promise.all([
    admin.from("organizations").select("id, name, industry").in("id", ids),
    admin
      .from("generation_jobs")
      .select("organization_id, status, progress, current_step, error_message, created_at, resumes_at, wait_reason, wait_providers, lease_expires_at, failure_kind, capacity_deferrals")
      .in("organization_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  if (orgs.error) throw new Error(orgs.error.message);
  if (jobs.error) throw new Error(`Couldn't read demo build status: ${jobs.error.message}`);
  const orgById = new Map((orgs.data ?? []).map((org) => [org.id as string, org]));
  const latestJob = new Map<string, NonNullable<typeof jobs.data>[number]>();
  for (const job of jobs.data ?? []) {
    if (!latestJob.has(job.organization_id as string)) latestJob.set(job.organization_id as string, job);
  }

  const out: ProspectDemoSummary[] = [];
  for (const id of ids) {
    const org = orgById.get(id);
    const entry = markers.get(id);
    if (!org || !entry) continue;
    const job = latestJob.get(id);
    out.push({
      organizationId: id,
      name: org.name as string,
      industry: (org.industry as string | null) ?? null,
      createdAt: entry.marker.createdAt,
      previewToken: entry.marker.previewToken,
      claimedAt: entry.claimedAt,
      build: job
        ? {
            status: job.status as string,
            progress: Number(job.progress ?? 0),
            step: (job.current_step as string | null) ?? null,
            error: (job.error_message as string | null) ?? null,
            wait: capacityWaitState(job as never),
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

export type ProspectSearchSource = "free" | "google";
const truthy = (v: string | undefined) => Boolean(v && !["false", "0", "no", "off", ""].includes(v.trim().toLowerCase()));
/** Google Places only on explicit request and never while a zero-cost switch is on. */
export function prospectSearchUsesGoogle(source: ProspectSearchSource | undefined, env: Readonly<Record<string, string | undefined>> = process.env) {
  if (source !== "google") return false;
  return !["ZERO_COST_ONLY", "AI_FREE_ONLY", "FREE_AI_ONLY"].some((k) => truthy(env[k]));
}

/**
 * Finds businesses in a niche and city with no real website (Google Places),
 * skipping ones that already have a demo. Capped per day and audit-logged so
 * the panel and Jarvis share one budget. Caller must be a verified super-admin.
 */
export async function findProspects(
  db: SupabaseClient,
  actorId: string,
  input: { niche: string; city: string; state?: string | null; source?: ProspectSearchSource },
) {
  const useGoogle = prospectSearchUsesGoogle(input.source);
  const { MAX_SEARCHES_PER_DAY, selectProspects, isUpgradeProspect } = await import("@/lib/prospect-finder");
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "jarvis.prospects.search")
    .gte("created_at", since.toISOString());
  if ((count ?? 0) >= MAX_SEARCHES_PER_DAY)
    throw new Error(`Daily search limit reached (${MAX_SEARCHES_PER_DAY}). It resets at midnight UTC, so Google Places costs stay bounded.`);

  const query = `${input.niche} in ${input.city}${input.state ? `, ${input.state}` : ""}`;
  // Free mode (default) never calls Google Places, which can bill per request.
  const places = useGoogle
    ? await (await import("@/lib/integrations/google.server")).searchPlacesForProspects(query, 20)
    : [];
  const existing = (await listProspectDemos(db, 100)).map((demo) => demo.name);
  const google = selectProspects(places, existing, { includeWebsites: true });
  // Free second source: OpenStreetMap. Same-name businesses already found on Google are skipped.
  const { searchOsmProspects } = await import("@/lib/osm-prospects.server");
  const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known = new Set([...google.map((p) => norm(p.name)), ...existing.map(norm)]);
  const osm = (await searchOsmProspects(input.niche, input.city, input.state ?? null)).filter((p) => {
    const k = norm(p.name);
    if (known.has(k)) return false;
    known.add(k);
    return true;
  });
  const candidates = [...google, ...osm];
  // Businesses with their own site qualify only when it has verified gaps worth fixing.
  const { assessWebsite } = await import("@/lib/prospect-email.server");
  const checked = await Promise.all(
    candidates.slice(0, 40).map(async (prospect) => {
      if (prospect.presence !== "has_website") return prospect;
      const gaps = await assessWebsite(prospect.website).catch(() => null);
      return gaps && isUpgradeProspect(gaps) ? { ...prospect, siteGaps: gaps } : null;
    }),
  );
  const prospects = checked.filter((p): p is NonNullable<typeof p> => p !== null);
  await db.from("audit_logs").insert({
    organization_id: null,
    actor_id: actorId,
    action: "jarvis.prospects.search",
    entity: useGoogle ? "google_places" : "openstreetmap",
    entity_id: null,
    metadata: { query, source: useGoogle ? "google_and_osm" : "free_osm_only", results: places.length, osmResults: osm.length, prospects: prospects.length },
  });
  return { query, source: useGoogle ? ("google_and_osm" as const) : ("free_osm_only" as const), searched: places.length + osm.length, prospects };
}

/** The demo form, prefilled from a Google Maps link or a picture. Empty means unknown. */
export type ProspectPrefill = {
  businessName: string;
  industry: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  services: string;
  description: string;
  placeId: string;
  address?: string;
  hours?: string[];
};

export type ProspectSourceResult = {
  prefill: ProspectPrefill;
  source: "google_maps" | "image" | "image_and_google_maps";
  /** Where the facts came from, shown to the operator. */
  note: string;
  website: string | null;
  hasRealWebsite: boolean;
  mapsUri: string | null;
  /** Facts read from the business's own website; the operator must accept each one. */
  suggestions?: WebsiteSuggestion[];
  /** Outcome of reading the business's own website, when it lists one. */
  websiteRead?: { state: "read" | "failed" | "skipped"; message: string };
};

const MAX_SHORT_LINK_HOPS = 4;

async function resolveShortLink(url: string): Promise<string> {
  const { guardedFetch } = await import("@/lib/net-guard.server");
  const { mapsRedirectTarget } = await import("@/lib/prospect-source");
  let current = url;
  for (let hop = 0; hop < MAX_SHORT_LINK_HOPS; hop += 1) {
    const response = await guardedFetch(current, { signal: AbortSignal.timeout(8_000), headers: { "user-agent": "RevoraProspectLookup/1.0" } });
    await response.body?.cancel().catch(() => undefined);
    const next = mapsRedirectTarget(response.headers.get("location"), current);
    if (!next) break;
    const host = new URL(next).hostname.toLowerCase();
    if (!["maps.app.goo.gl", "goo.gl", "g.co", "g.page", "consent.google.com"].includes(host)) return next;
    current = next;
  }
  throw new Error("Couldn't open that share link. Open the business in Google Maps and paste the full address from the browser bar instead.");
}

async function assertSearchBudget(db: SupabaseClient) {
  const { MAX_SEARCHES_PER_DAY } = await import("@/lib/prospect-finder");
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "jarvis.prospects.search")
    .gte("created_at", since.toISOString());
  if ((count ?? 0) >= MAX_SEARCHES_PER_DAY)
    throw new Error(`Daily Google Places limit reached (${MAX_SEARCHES_PER_DAY}). It resets at midnight UTC.`);
}

/**
 * Google Places facts for one business from a Maps link or "name, city" text.
 * Shares the prospect finder's daily search budget. Caller must be a verified
 * super-admin.
 */
export async function prospectFromMaps(db: SupabaseClient, actorId: string, input: string): Promise<ProspectSourceResult> {
  const { mapsLookupFrom } = await import("@/lib/prospect-source");
  let lookup = mapsLookupFrom(input);
  if (lookup.kind === "short_link") lookup = mapsLookupFrom(await resolveShortLink(lookup.url));
  if (lookup.kind === "short_link") throw new Error("Couldn't read the business from that link.");
  await assertSearchBudget(db);
  const { searchPlacesForProspects, placeDetailsForProspect } = await import("@/lib/integrations/google.server");
  const { normalizePlace } = await import("@/lib/prospect-finder");
  const { pickPlaceMatch } = await import("@/lib/prospect-source");
  const near = lookup.lat !== null && lookup.lng !== null ? { lat: lookup.lat, lng: lookup.lng } : null;
  const label = lookup.query ?? (lookup.kind === "place_id" ? lookup.placeId : "");
  let raw: Record<string, unknown> | null = null;
  let results = 0;
  if (lookup.kind === "place_id") {
    // Exact listing: Place Details by id, never a fuzzy search.
    raw = await placeDetailsForProspect(lookup.placeId);
    results = raw ? 1 : 0;
  }
  if (!raw) {
    if (!lookup.query) throw new Error("Google Maps couldn't find that place. Open the business in Google Maps, tap Share → Copy link, and paste that.");
    const places = await searchPlacesForProspects(lookup.query, 5, near, ["places.editorialSummary", "places.location"]);
    results = places.length;
    const candidates = places.flatMap((entry) => {
      const normalized = normalizePlace(entry);
      const location = entry["location"] as { latitude?: unknown; longitude?: unknown } | undefined;
      return normalized
        ? [{ raw: entry, placeId: normalized.placeId, name: normalized.name, address: normalized.address, lat: typeof location?.latitude === "number" ? location.latitude : null, lng: typeof location?.longitude === "number" ? location.longitude : null }]
        : [];
    });
    const picked = pickPlaceMatch(lookup.query, candidates, near);
    if ("ambiguous" in picked) {
      const list = picked.ambiguous.map((c) => `${c.name}${c.address ? ` (${c.address})` : ""}`).join("; ");
      throw new Error(
        list
          ? `That link matches more than one listing, so nothing was filled in: ${list}. Ask the owner which one, or paste that listing's own Share link.`
          : `Google Maps has no open business matching "${lookup.query}". Check the link, or type the name and city.`,
      );
    }
    raw = candidates.find((c) => c.placeId === picked.match.placeId)!.raw;
  }
  await db.from("audit_logs").insert({
    organization_id: null,
    actor_id: actorId,
    action: "jarvis.prospects.search",
    entity: "google_places_lookup",
    entity_id: null,
    metadata: { query: label.slice(0, 200), kind: lookup.kind, results },
  });
  const place = raw ? normalizePlace(raw) : null;
  if (!place) throw new Error(`Google Maps has no open business matching "${label}". Check the link, or type the name and city.`);
  const category = place.category ?? "";
  const where = [place.city, place.state].filter(Boolean).join(", ");
  const missing = [
    ...(category ? [] : ["industry: Google lists no category. Use the trade the business name itself states (for example \"Auto Detail\" in the name means auto detailing); if the name states none, ask the owner."]),
    ...(place.city ? [] : ["city: not in the listing; ask the owner."]),
  ];
  let suggestions: WebsiteSuggestion[] = [];
  let websiteRead: ProspectSourceResult["websiteRead"] = { state: "skipped", message: "The listing has no website of its own." };
  if (place.presence === "has_website" && place.website) {
    try {
      const { auditPublicWebsite } = await import("@/lib/audit/website-audit");
      const read = await auditPublicWebsite(place.website);
      suggestions = websiteSuggestions(read);
      websiteRead = { state: "read", message: `Read ${read.finalUrl}. ${suggestions.length ? "Suggestions below need your approval." : "No usable description found."}` };
    } catch (error) {
      websiteRead = { state: "failed", message: `Couldn't read the business's website safely (${error instanceof Error ? error.message : "unknown error"}). Nothing from it was used.` };
    }
  }
  return {
    suggestions,
    websiteRead,
    prefill: {
      businessName: place.name,
      industry: category,
      city: place.city ?? "",
      state: place.state ?? "",
      phone: place.phone ?? "",
      email: "",
      services: "",
      description: place.summary ?? (category && where ? `${category} serving ${where}.` : ""),
      placeId: place.placeId,
      ...(place.address ? { address: place.address } : {}),
      ...(place.hours?.length ? { hours: place.hours } : {}),
    },
    source: "google_maps",
    note: `From the Google Maps listing: ${[place.name, place.address].filter(Boolean).join(", ")}.${missing.length ? ` Missing: ${missing.join(" ")}` : ""} Copy every prefill field (including placeId, address and hours) into demo.build.`,
    website: place.website,
    hasRealWebsite: place.presence === "has_website",
    mapsUri: place.mapsUri,
  };
}

const IMAGE_MIME = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
export const MAX_SOURCE_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Facts visible in a picture of a business (Maps screenshot, card, flyer,
 * sign), read by a Lovable vision model. If the picture names the business, the
 * Google Maps listing fills what the picture didn't show. The picture itself
 * is not stored or used on the site.
 */
export async function prospectFromImage(db: SupabaseClient, actorId: string, dataUrl: string): Promise<ProspectSourceResult> {
  const match = IMAGE_MIME.exec(dataUrl);
  if (!match) throw new Error("Use a PNG, JPEG or WebP picture.");
  if (Math.floor((match[2]!.length * 3) / 4) > MAX_SOURCE_IMAGE_BYTES) throw new Error("That picture is too large. Use one under 4 MB.");
  const { IMAGE_FACTS_PROMPT, parseImageFacts } = await import("@/lib/prospect-source");
  const { analyzeImage } = await import("@/lib/ai/router.server");
  let text = "";
  try {
    const result = await analyzeImage({ userId: actorId, task: "admin.jarvis.prospect_image" }, {
      maxOutputTokens: 600,
      temperature: 0,
      messages: [
        { role: "system", content: "You extract business facts from pictures. You output only JSON. You never guess." },
        {
          role: "user",
          content: [
            { type: "text", text: IMAGE_FACTS_PROMPT },
            { type: "image", dataUrl, mimeType: match[1]! },
          ],
        },
      ],
    });
    text = result.text;
  } catch {
    throw new Error("No AI model could read the picture right now. Try again in a minute, or paste a Google Maps link.");
  }
  const facts = parseImageFacts(text);
  if (!facts.businessName && !facts.phone && !facts.city)
    throw new Error("Couldn't read a business name, phone or city in that picture. Try a clearer screenshot, or paste the Google Maps link.");

  const prefill: ProspectPrefill = {
    businessName: facts.businessName,
    industry: facts.industry,
    city: facts.city,
    state: facts.state,
    phone: facts.phone,
    email: facts.email,
    services: facts.services.join("\n"),
    description: facts.description,
    placeId: "",
  };
  const base: ProspectSourceResult = {
    prefill,
    source: "image",
    note: "Read from the picture. Check every field before building.",
    website: facts.website || null,
    hasRealWebsite: false,
    mapsUri: null,
  };
  if (!facts.businessName) return base;
  // Fill the gaps from the business's own Google listing; the picture wins where both have a value.
  try {
    const maps = await prospectFromMaps(db, actorId, [facts.businessName, facts.city, facts.state].filter(Boolean).join(" "));
    const merged = { ...prefill };
    for (const key of Object.keys(merged) as (keyof ProspectPrefill)[]) if (!merged[key]) (merged as Record<string, unknown>)[key] = maps.prefill[key];
    if (maps.prefill.address) merged.address = maps.prefill.address;
    if (maps.prefill.hours?.length) merged.hours = maps.prefill.hours;
    return {
      prefill: merged,
      source: "image_and_google_maps",
      note: `Read from the picture, gaps filled from Google Maps (${maps.note.replace(/^From the Google Maps listing: /, "").replace(/\.$/, "")}). Check every field before building.`,
      website: base.website ?? maps.website,
      hasRealWebsite: maps.hasRealWebsite,
      mapsUri: maps.mapsUri,
    };
  } catch {
    return base;
  }
}
