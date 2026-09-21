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
    db.from("services").select("id").eq("organization_id", orgId).eq("bookable", true),
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
  const serviceRows = (services.data ?? []) as BriefFacts["serviceRows"];
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
  const goals = goalsRaw.length ? goalsRaw : [org.data.conversion_goal ?? "quote"];
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
    email: str(p["email"]),
    yearsInBusiness: (p["years_in_business"] as number) ?? null,
    hasHours,
    style: str(p["font_preference"]),
    goals: goals as never,
    ctaLabel: str(seo["primary_cta_label"]) ?? "Get in touch",
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
      email: str(p["email"]),
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
      email: str(p["email"]),
      quoteForms: (forms.data ?? []).length,
      quoteQuestions: (questions.data ?? []).length,
      bookableServices: (bookable.data ?? []).length,
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
