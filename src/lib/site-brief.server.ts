import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Server-only fact gathering for the Revora orchestrator.
 *
 * One place reads the workspace's real rows and shapes them for every consumer:
 * the AI analysis pass, the deterministic fact-gap prompts, and the launch QA
 * checks. Because all three read the same snapshot, the brief the owner reviews
 * is the brief the build actually uses.
 */

import type { CopyFacts } from "@/lib/site-engine.server";
import type { CaptureQaInput, FactInput } from "@/lib/launch-qa";

type Db = {
  from: SupabaseClient["from"];
};

export type BriefFacts = {
  orgName: string;
  slug: string | null;
  copyFacts: CopyFacts;
  factInput: FactInput;
  qaInput: CaptureQaInput;
  profile: Record<string, unknown>;
  photoCount: number;
  socialLinks: number;
  testimonialCount: number;
  goals: string[];
  serviceRows: {
    name: string;
    description?: string | null;
    price?: number | null;
    starting_price?: number | null;
  }[];
};

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const PLATFORM_SERVICE_TOKENS = new Set([
  "build my site",
  "generate site",
  "submit",
  "command center",
  "all",
]);

const INDUSTRY_SERVICE_ARCHETYPES: Record<string, string[]> = {
  "pressure washing": ["Driveway Cleaning", "House Soft Washing", "Roof Cleaning", "Deck Restoration"],
  roofing: ["Roof Inspection", "Roof Repair", "Roof Replacement", "Roof Maintenance"],
  "luxury detailing": ["Paint Correction", "Ceramic Coating", "Interior Detailing", "Exterior Detailing"],
  "auto detailing": ["Interior Detailing", "Exterior Detailing", "Paint Correction", "Ceramic Coating"],
  landscaping: ["Lawn Maintenance", "Landscape Design", "Mulching", "Seasonal Cleanup"],
  "house cleaning": ["Recurring Home Cleaning", "Deep Cleaning", "Move-In Cleaning", "Move-Out Cleaning"],
  hvac: ["AC Repair", "Heating Repair", "HVAC Maintenance", "System Replacement"],
  plumbing: ["Drain Cleaning", "Leak Repair", "Water Heater Service", "Pipe Repair"],
  electrical: ["Electrical Repairs", "Lighting Installation", "Panel Upgrades", "Electrical Inspections"],
};

const normalizeServiceToken = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export type SanitizedServiceRow = BriefFacts["serviceRows"][number];

export function sanitizeServiceRows(
  rows: SanitizedServiceRow[],
  industry: string | null,
): SanitizedServiceRow[] {
  const clean: SanitizedServiceRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = str(row.name);
    if (!name) continue;
    const token = normalizeServiceToken(name);
    if (PLATFORM_SERVICE_TOKENS.has(token) || seen.has(token)) continue;
    seen.add(token);
    clean.push({ ...row, name });
  }
  if (clean.length) return clean;
  const archetypeKey = normalizeServiceToken(industry ?? "");
  const archetypes = INDUSTRY_SERVICE_ARCHETYPES[archetypeKey];
  return (archetypes ?? []).map((name) => ({ name }));
}

export function sanitizeCustomerContactEmail(
  value: string | null,
  options: { orgName?: string | null; orgSlug?: string | null } = {},
): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const internalWorkspace =
    /\brevora\b/i.test(options.orgName ?? "") ||
    /(^|[-_])revora([-_]|$)/i.test(options.orgSlug ?? "");
  if (!internalWorkspace && email.endsWith("@revoragrowthsystems.com")) return null;
  return email;
}


/** Reads everything the orchestrator and QA need, using the caller's client. */
export async function gatherBriefFacts(
  db: Db,
  orgId: string,
  briefRequests: string[] = [],
): Promise<BriefFacts> {
  const [
    org,
    profile,
    services,
    media,
    socials,
    forms,
    questions,
    bookable,
    settings,
    sections,
    leads,
    activities,
    automations,
  ] = await Promise.all([
    db
      .from("organizations")
      .select("name, slug, industry, conversion_goal")
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
    db.from("quote_questions").select("id").eq("organization_id", orgId),
    db.from("services").select("id, name").eq("organization_id", orgId).eq("bookable", true),
    db
      .from("website_settings")
      .select("seo, generation")
      .eq("organization_id", orgId)
      .maybeSingle(),
    db
      .from("website_sections")
      .select("id, kind")
      .eq("organization_id", orgId)
      .eq("is_visible", true),
    db
      .from("leads")
      .select("id")
      .eq("organization_id", orgId)
      .in("source", ["quote", "booking", "form_submission", "website"]),
    db.from("lead_activities").select("id").eq("organization_id", orgId),
    db
      .from("automations")
      .select("id, trigger_event")
      .eq("organization_id", orgId)
      .eq("is_active", true),
  ]);

  if (!org.data) throw new Error("Workspace not found.");

  const p = (profile.data ?? {}) as Record<string, unknown>;
  const serviceRows = sanitizeServiceRows((services.data ?? []) as BriefFacts["serviceRows"], org.data.industry);
  const social = (socials.data ?? {}) as Record<string, unknown>;
  const socialLinks = [
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "google_business",
    "linkedin",
  ].filter((k) => typeof social[k] === "string" && String(social[k]).trim()).length;
  const testimonials = Array.isArray(p["testimonials"]) ? (p["testimonials"] as unknown[]) : [];
  const goalsRaw = (p["website_goals"] as string[] | undefined) ?? [];
  const goals = goalsRaw.length ? goalsRaw : org.data.conversion_goal ? [org.data.conversion_goal] : [];
  const email = sanitizeCustomerContactEmail(str(p["email"]), { orgName: org.data.name, orgSlug: org.data.slug });
  const photoCount = (media.data ?? []).length + (str(p["hero_image_url"]) ? 1 : 0);
  const seo = (settings.data?.seo ?? {}) as Record<string, unknown>;
  const hasHours = Boolean(p["hours"] && Object.keys(p["hours"] as object).length);

  const captureKinds = new Set(["quote", "booking", "contact", "lead_form", "cta"]);
  const captureSections = ((sections.data ?? []) as { kind: string }[]).filter((s) =>
    captureKinds.has(s.kind),
  ).length;
  const triggers = ((automations.data ?? []) as { trigger_event: string }[]).map(
    (a) => a.trigger_event,
  );

  const copyFacts: CopyFacts = {
    businessName: org.data.name ?? "",
    industry: org.data.industry ?? "",
    description: str(p["description"]),
    city: str(p["city"]),
    state: str(p["state"]),
    serviceArea: str(p["service_area"]),
    phone: str(p["phone"]),
    email,
    yearsInBusiness: (p["years_in_business"] as number) ?? null,
    hasHours,
    style: str(p["font_preference"]),
    goals: goals as never,
    ctaLabel: str(seo["primary_cta_label"]) ?? "",
    services: serviceRows,
  };

  return {
    orgName: org.data.name ?? "",
    slug: org.data.slug ?? null,
    copyFacts,
    profile: p,
    photoCount,
    socialLinks,
    testimonialCount: testimonials.length,
    goals: goals as string[],
    serviceRows,
    factInput: {
      businessName: org.data.name ?? "",
      description: str(p["description"]),
      phone: str(p["phone"]),
      email,
      city: str(p["city"]),
      serviceArea: str(p["service_area"]),
      servicesCount: serviceRows.length,
      serviceNames: serviceRows.map((service) => service.name),
      photoCount,
      hasHours,
      briefRequests,
    },
    qaInput: {
      primaryCtaLabel: str(seo["primary_cta_label"]),
      secondaryCtaLabel: str(seo["secondary_cta_label"]),
      phone: str(p["phone"]),
      email,
      quoteForms: (forms.data ?? []).length,
      quoteQuestions: (questions.data ?? []).length,
      bookableServices: ((bookable.data ?? []) as { id: string; name?: string | null }[])
        .filter((row) => !row.name || !isPlatformServiceToken(row.name))
        .length,
      captureSections,
      siteLeads: (leads.data ?? []).length,
      loggedActivities: (activities.data ?? []).length,
      confirmationAutomations: triggers.filter((t) =>
        [
          "lead_created",
          "quote_requested",
          "appointment_booked",
          "booking_created",
          "lead_status_changed",
        ].includes(t),
      ).length,
      notifiesOwner: true,
    },
  };
}
