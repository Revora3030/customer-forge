import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Candidate = {
  id: string; displayName?: { text?: string }; formattedAddress?: string;
  nationalPhoneNumber?: string; websiteUri?: string; primaryTypeDisplayName?: { text?: string };
  googleMapsUri?: string; businessStatus?: string;
};
const clean = (v: unknown, max: number) => typeof v === "string" ? v.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
const locationFrom = (address: string, city: string, region: string) => {
  const p = address.split(",").map((s) => s.trim()).filter(Boolean);
  return { city: clean(city || p[p.length - 3] || "", 120), region: clean(region || p[p.length - 2] || "", 120) };
};
const score = (p: Candidate) => Math.min(100, 35 + (!p.websiteUri ? 30 : 0) + (p.nationalPhoneNumber ? 10 : 0) + (p.formattedAddress ? 10 : 0) + (p.businessStatus === "OPERATIONAL" ? 15 : 0));

export const discoverJarvisProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query?: unknown; city?: unknown; region?: unknown; limit?: unknown }) => {
    const query = clean(input?.query, 120), city = clean(input?.city, 100), region = clean(input?.region, 100);
    const limit = Math.max(1, Math.min(20, Number(input?.limit) || 10));
    if (!query || query.length < 3 || !city || !region) throw new Error("Enter a business category, city, and state/region.");
    return { query, city, region, limit };
  })
  .handler(async ({ context, data }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase as never, String(context.userId));
    const key = process.env["GOOGLE_MAPS_API_KEY"] || process.env["GOOGLE_PLACES_API_KEY"];
    if (!key) throw new Error("Discovery is not configured. Add GOOGLE_MAPS_API_KEY or GOOGLE_PLACES_API_KEY as a server-side secret.");
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.googleMapsUri,places.businessStatus" },
      body: JSON.stringify({ textQuery: `${data.query} in ${data.city}, ${data.region}, United States`, pageSize: data.limit, regionCode: "US", languageCode: "en" }),
      signal: AbortSignal.timeout(12000), redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) throw new Error("Google Places rejected the configured key or API permissions.");
      if (response.status === 429) throw new Error("Google Places rate limit reached. Try again later.");
      throw new Error(`Discovery failed (HTTP ${response.status}).`);
    }
    const payload = await response.json() as { places?: Candidate[] };
    const candidates = (payload.places ?? []).slice(0, data.limit).map((p) => {
      const address = clean(p.formattedAddress, 300), location = locationFrom(address, data.city, data.region);
      return {
        externalId: clean(p.id, 200), name: clean(p.displayName?.text, 160),
        category: clean(p.primaryTypeDisplayName?.text || data.query, 120), ...location,
        phone: clean(p.nationalPhoneNumber, 40) || null, websiteUrl: clean(p.websiteUri, 500) || null,
        websiteStatus: p.websiteUri ? "website_found" as const : "no_website_listed" as const,
        mapsUrl: clean(p.googleMapsUri, 500) || null, businessStatus: clean(p.businessStatus, 40) || "unknown",
        leadScore: score(p), verificationRequired: true,
      };
    }).filter((p) => p.name && p.externalId);
    return { candidates, count: candidates.length, source: "google_places", note: "Missing website listing is only a signal. Independently verify the official website before outreach or site handoff." };
  });

export const saveJarvisProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { candidates?: unknown }) => {
    if (!Array.isArray(input?.candidates) || !input.candidates.length) throw new Error("Select at least one candidate.");
    const candidates = input.candidates.slice(0, 20).map((value) => {
      const x = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return {
        placeId: clean(x["externalId"], 200), name: clean(x["name"], 160), category: clean(x["category"], 120),
        city: clean(x["city"], 120), region: clean(x["region"], 120), phone: clean(x["phone"], 40),
        websiteUrl: clean(x["websiteUrl"], 500), websiteStatus: x["websiteStatus"] === "website_found" ? "website_found" : "no_website_listed",
        score: Math.max(0, Math.min(100, Number(x["leadScore"]) || 0)), sourceUrl: clean(x["mapsUrl"], 500),
      };
    }).filter((x) => x.placeId && x.name);
    if (!candidates.length) throw new Error("No valid candidates.");
    return { candidates };
  })
  .handler(async ({ context, data }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase as never, String(context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.candidates.map((x) => ({
      business_name: x.name, category: x.category, city: x.city, region: x.region, country_code: "US",
      place_id: x.placeId, phone: x.phone || null, website_url: x.websiteUrl || null, website_status: x.websiteStatus,
      lead_score: x.score, evidence: { source: "google_places", sourceUrl: x.sourceUrl, verificationRequired: true },
      status: "discovered", source: "google_places", source_url: x.sourceUrl || null, created_by: String(context.userId),
    }));
    const { data: saved, error } = await (supabaseAdmin as any).from("jarvis_prospects")
      .upsert(rows, { onConflict: "source,place_id", ignoreDuplicates: true })
      .select("id,business_name,category,city,region,phone,website_url,website_status,lead_score,status,source,source_url,created_at");
    if (error) throw new Error("Could not save prospects. Apply the Jarvis acquisition migration and retry.");
    return { saved: (saved ?? []).map((x: Record<string, unknown>) => ({
      id: String(x["id"]), businessName: String(x["business_name"]), category: String(x["category"] ?? ""),
      city: String(x["city"] ?? ""), region: String(x["region"] ?? ""), phone: (x["phone"] as string | null) ?? null,
      websiteUrl: (x["website_url"] as string | null) ?? null, websiteStatus: String(x["website_status"]),
      leadScore: Number(x["lead_score"] ?? 0), status: String(x["status"]), source: String(x["source"]),
      sourceUrl: (x["source_url"] as string | null) ?? null, createdAt: String(x["created_at"]),
    })), requested: data.candidates.length };
  });

export const listJarvisProspects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase as never, String(context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("jarvis_prospects")
      .select("id,business_name,category,city,region,phone,website_url,website_status,lead_score,status,source,source_url,created_at")
      .neq("status", "suppressed").order("lead_score", { ascending: false }).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error("Could not load pipeline. Apply the Jarvis acquisition migration.");
    return (data ?? []).map((x: Record<string, unknown>) => ({
      id: String(x["id"]), businessName: String(x["business_name"]), category: String(x["category"] ?? ""),
      city: String(x["city"] ?? ""), region: String(x["region"] ?? ""), phone: (x["phone"] as string | null) ?? null,
      websiteUrl: (x["website_url"] as string | null) ?? null, websiteStatus: String(x["website_status"]),
      leadScore: Number(x["lead_score"] ?? 0), status: String(x["status"]), source: String(x["source"]),
      sourceUrl: (x["source_url"] as string | null) ?? null, createdAt: String(x["created_at"]),
    }));
  });

export const queueJarvisSitePreparation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { prospectId?: unknown }) => {
    const prospectId = clean(input?.prospectId, 64);
    if (!/^[0-9a-f-]{36}$/i.test(prospectId)) throw new Error("Choose a valid prospect.");
    return { prospectId };
  })
  .handler(async ({ context, data }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase as never, String(context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await (supabaseAdmin as any).from("jarvis_prospects")
      .select("id,business_name,category,city,region,website_url,website_status,status")
      .eq("id", data.prospectId).maybeSingle();
    if (error || !p) throw new Error("Prospect not found.");
    if (p["website_status"] === "website_found") throw new Error("This business has a listed website. Use website audit instead.");
    if (p["status"] === "suppressed") throw new Error("This prospect is suppressed.");
    const idempotencyKey = `site-prep:${String(p["id"])}`;
    const { data: job, error: jobError } = await (supabaseAdmin as any).from("jarvis_acquisition_jobs")
      .upsert({ prospect_id: String(p["id"]), job_type: "site_build", status: "awaiting_approval",
        idempotency_key: idempotencyKey, requested_by: String(context.userId),
        input: { purpose: "private_demo_preparation", noExternalContact: true, noPublishing: true, requiresVerifiedFacts: true },
        output: { businessName: p["business_name"], category: p["category"], city: p["city"], region: p["region"], websiteStatus: p["website_status"] },
      }, { onConflict: "idempotency_key" }).select("id,status,job_type").single();
    if (jobError || !job) throw new Error("Could not queue site preparation.");
    return { jobId: String(job.id), status: String(job.status), jobType: String(job.job_type), message: "Queued for operator review. This action did not generate, publish, contact, or charge." };
  });
