/**
 * ONE-TIME AI RESTYLE OF AN EXISTING SITE
 * =======================================
 *
 * Older sites still display through the built-in section layouts. This moves a
 * site onto AI-designed layouts: Sol designs every content section (and the
 * menu and footer) from that site's own words and pictures. Nothing about the
 * wording, prices or facts changes.
 *
 * Safety:
 *  - owner/admin/manager only, through the caller's own client (RLS applies);
 *  - the previous layout of every section is saved BEFORE anything is written,
 *    and a failure part-way puts every section straight back;
 *  - `undoAiRestyle` restores that saved layout at any time.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Client = { from: import("@supabase/supabase-js").SupabaseClient["from"] };
type Saved = { id: string; kind: string; settings: unknown };

const MANAGERS = ["owner", "admin", "manager"];
const FUNCTIONAL = new Set(["quote", "booking", "contact", "sticky_cta", "embed", "post_list", "composition"]);

async function requireManager(db: Client, organizationId: string, userId: string) {
  const { data } = await db
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (!role || !MANAGERS.includes(role)) throw new Error("Only an owner, admin or manager can restyle the website.");
}

async function putBack(db: Client, organizationId: string, saved: Saved[]) {
  // Every section is attempted; any that could not be written are reported
  // instead of claiming the earlier layout is back when it is not.
  let failed = 0;
  for (const row of saved) {
    const { error } = await db
      .from("website_sections")
      .update({ kind: row.kind, settings: row.settings } as never)
      .eq("id", row.id)
      .eq("organization_id", organizationId);
    if (error) failed += 1;
  }
  if (failed) {
    throw new Error(
      `${failed} section${failed === 1 ? "" : "s"} couldn't be put back. Try again in a moment.`,
    );
  }
}

const orgInput = (input: { organizationId?: unknown }) => {
  if (typeof input?.organizationId !== "string" || !input.organizationId) throw new Error("organizationId is required");
  return { organizationId: input.organizationId };
};

export type RestyleResult = { composed: number; alreadyAi: number; restyleId: string | null; summary: string };

export const restyleSiteWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orgInput)
  .handler(async ({ data, context }): Promise<RestyleResult> => {
    const db = context.supabase as unknown as Client;
    const orgId = data.organizationId;
    await requireManager(db, orgId, context.userId);

    const [{ data: sections }, { data: org }, { data: profile }, { data: services }, { data: settings }] = await Promise.all([
      db.from("website_sections").select("id,kind,settings").eq("organization_id", orgId),
      db.from("organizations").select("name,industry,conversion_goal").eq("id", orgId).maybeSingle(),
      db.from("business_profiles").select("description,city,state,service_area,phone,email,years_in_business,certifications,awards,review_link,website_goals,hours,primary_color,secondary_color,accent_color,font_preference").eq("organization_id", orgId).maybeSingle(),
      db.from("services").select("name,price,starting_price").eq("organization_id", orgId).eq("is_active", true),
      db.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle(),
    ]);
    const rows = (sections ?? []) as Saved[];
    // Recompose existing AI sections too: older composition trees can predate
    // media references, so treating them as permanently complete strands
    // generated pictures outside the visible layout.
    const legacy = rows.filter((row) => row.kind === "composition" || !FUNCTIONAL.has(row.kind));
    const alreadyAi = rows.filter((row) => row.kind === "composition").length;
    if (legacy.length === 0)
      return { composed: 0, alreadyAi, restyleId: null, summary: "This site has no sections that need an AI layout." };

    const o = (org ?? {}) as { name?: string | null; industry?: string | null; conversion_goal?: string | null };
    const p = (profile ?? {}) as Record<string, unknown>;
    const svc = (services ?? []) as { name: string; price: number | null; starting_price: number | null }[];
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    const facts = {
      businessName: o.name ?? null,
      industry: o.industry ?? null,
      services: svc.map((s) => s.name),
      description: str(p["description"]),
      city: str(p["city"]),
      region: str(p["state"]),
      serviceArea: str(p["service_area"]),
      phone: str(p["phone"]),
      email: str(p["email"]),
      yearsInBusiness: typeof p["years_in_business"] === "number" ? (p["years_in_business"] as number) : null,
      certifications: str(p["certifications"]),
      awards: str(p["awards"]),
      reviewLink: str(p["review_link"]),
      hasPrices: svc.some((s) => s.price != null || s.starting_price != null),
      goals: Array.isArray(p["website_goals"]) ? (p["website_goals"] as string[]) : null,
      conversionGoal: o.conversion_goal ?? null,
      hasHours: p["hours"] != null,
    };
    const look = {
      colors: { primary: str(p["primary_color"]), secondary: str(p["secondary_color"]), accent: str(p["accent_color"]) },
      font: str(p["font_preference"]),
      savedCreativeBrief: (settings as { generation?: { aiCreativeBrief?: unknown; firstBuildCreative?: unknown } } | null)?.generation?.aiCreativeBrief ??
        ((settings as { generation?: { firstBuildCreative?: { brief?: unknown } } } | null)?.generation?.firstBuildCreative?.brief ?? null),
    };

    // Save every section's current layout first; no save, no change.
    const { data: backup, error: backupError } = await db
      .from("ai_generations")
      .insert({
        organization_id: orgId,
        kind: "ai_restyle_backup",
        model: "none",
        instruction: null,
        result: { sections: legacy } as never,
        created_by: context.userId,
      } as never)
      .select("id")
      .maybeSingle();
    const restyleId = (backup as { id?: string } | null)?.id ?? null;
    if (backupError || !restyleId) throw new Error("Revora couldn't save your current layout first, so nothing was changed.");

    try {
      const { composeFirstBuildSections } = await import("@/lib/builder/first-build-compositions.server");
      const composed = await composeFirstBuildSections({ db: db as never, organizationId: orgId, facts, lookSummary: JSON.stringify(look) });
      // A half-redesigned site (some sections on old layouts) is never kept:
      // the earlier layout is put back and the owner is asked to try again.
      if ((composed.fallback ?? 0) > 0) {
        const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
        throw new AiStepUnavailableError("redesign", `${composed.fallback} section(s) could not be designed`);
      }
      const { recordTeamReview } = await import("@/lib/builder/edit-polish.server");
      await recordTeamReview({ organizationId: orgId, kind: "redesign_team_review", instruction: null, models: composed.models, reports: composed.gateReports });
      try {
        const { composeSiteChrome } = await import("@/lib/builder/first-build-chrome.server");
        await composeSiteChrome({ db: db as never, organizationId: orgId, businessName: o.name ?? "", facts, lookSummary: JSON.stringify(look) });
      } catch (error) {
        // The menu and footer are optional here: the site keeps its current ones.
        console.error("restyle chrome skipped", error);
      }
      return {
        composed: composed.composed,
        alreadyAi,
        restyleId,
        summary: `The AI designed a new layout for ${composed.composed} section${composed.composed === 1 ? "" : "s"}. Your wording, prices and photos are unchanged.`,
      };
    } catch (error) {
      await putBack(db, orgId, legacy);
      throw error;
    }
  });

export const undoAiRestyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId?: unknown; restyleId?: unknown }) => {
    const base = orgInput(input);
    if (typeof input.restyleId !== "string" || !input.restyleId) throw new Error("restyleId is required");
    return { ...base, restyleId: input.restyleId };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Client;
    await requireManager(db, data.organizationId, context.userId);
    const { data: row } = await db
      .from("ai_generations")
      .select("result")
      .eq("id", data.restyleId)
      .eq("organization_id", data.organizationId)
      .eq("kind", "ai_restyle_backup")
      .maybeSingle();
    const saved = ((row as { result?: { sections?: Saved[] } } | null)?.result?.sections ?? []) as Saved[];
    if (!saved.length) throw new Error("That earlier layout couldn't be found.");
    await putBack(db, data.organizationId, saved);
    return { summary: "Your previous layout is back." };
  });
