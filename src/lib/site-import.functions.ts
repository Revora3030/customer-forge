import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ImportedFacts } from "./site-import";

export type SiteImportResponse =
  | { ok: true; url: string; pagesRead: string[]; facts: ImportedFacts }
  | { ok: false; message: string };

// A signed-in person can read a handful of sites an hour; the import fetches
// up to four pages each time.
const WINDOW_MS = 60 * 60_000;
const PER_WINDOW = 12;
const recent = new Map<string, number[]>();

function allowed(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= PER_WINDOW) return false;
  hits.push(now);
  recent.set(userId, hits);
  return true;
}

/** Reads the facts a business publishes on its existing website, for the owner to review. */
export const importExistingWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { url: string }) => {
    const url = String(input?.url ?? "").trim().slice(0, 300);
    if (url.length < 4) throw new Error("Enter your website address.");
    return { url };
  })
  .handler(async ({ context, data }): Promise<SiteImportResponse> => {
    if (!allowed(String(context.userId)))
      return { ok: false, message: "You've imported several sites in the last hour. Try again a little later." };
    const { importSite, SiteImportError } = await import("./site-import.server");
    try {
      return { ok: true, ...(await importSite(data.url)) };
    } catch (error) {
      if (error instanceof SiteImportError) return { ok: false, message: error.message };
      console.warn("site import failed", (error as Error).message);
      return { ok: false, message: "Revora couldn't read that website just now. You can type your details instead." };
    }
  });

const PROFILE_FIELDS = [
  ["businessName", null],
  ["about", "description"],
  ["phone", "phone"],
  ["email", "email"],
  ["address", "address"],
  ["city", "city"],
  ["state", "state"],
  ["hours", "hours"],
  ["logoUrl", "logo_url"],
  ["heroImageUrl", "hero_image_url"],
  ["primaryColor", "primary_color"],
] as const;

export type ApplyImportResult = { filled: string[]; servicesAdded: number; socialAdded: number };

/**
 * Saves facts from an owner's existing website into their workspace. Only
 * empty fields are filled — nothing the owner already saved is overwritten —
 * and services are added only when the workspace has none. Runs as the
 * signed-in owner, so RLS applies on top of the role check.
 */
export const applyImportedFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; url: string; facts: ImportedFacts }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    const raw = (input?.facts ?? {}) as Partial<ImportedFacts>;
    const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    const url = (value: unknown) => {
      const text = str(value, 500);
      return /^https?:\/\//i.test(text) ? text : "";
    };
    const facts: ImportedFacts = {
      businessName: str(raw.businessName, 120),
      about: str(raw.about, 1000),
      phone: str(raw.phone, 40),
      email: str(raw.email, 160),
      address: str(raw.address, 240),
      city: str(raw.city, 80),
      state: str(raw.state, 40),
      hours: str(raw.hours, 300),
      logoUrl: url(raw.logoUrl),
      heroImageUrl: url(raw.heroImageUrl),
      primaryColor: /^#[0-9a-f]{6}$/i.test(str(raw.primaryColor, 7)) ? str(raw.primaryColor, 7) : "",
      instagram: url(raw.instagram),
      facebook: url(raw.facebook),
      google: url(raw.google),
      services: (Array.isArray(raw.services) ? raw.services : [])
        .slice(0, 12)
        .map((service) => ({ name: str(service?.name, 80), description: str(service?.description, 300) }))
        .filter((service) => service.name.length >= 3),
    };
    return { organizationId, url: url(input?.url) || str(input?.url, 200), facts };
  })
  .handler(async ({ context, data }): Promise<ApplyImportResult> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager");
    const db = context.supabase;
    const orgId = data.organizationId;

    const { data: current, error } = await db.from("business_profiles").select("*").eq("organization_id", orgId).maybeSingle();
    if (error) throw new Error("Couldn't read your business details just now.");
    const existing = (current ?? {}) as Record<string, unknown>;
    const patch: Record<string, string> = {};
    const filled: string[] = [];
    for (const [key, column] of PROFILE_FIELDS) {
      if (!column) continue;
      const value = data.facts[key];
      if (value && !String(existing[column] ?? "").trim()) {
        patch[column] = value;
        filled.push(column.replace(/_url$/, "").replace(/_/g, " "));
      }
    }
    if (data.url && !String(existing["website"] ?? "").trim()) patch["website"] = data.url;
    if (Object.keys(patch).length) {
      const { error: saveError } = await db
        .from("business_profiles")
        .upsert({ organization_id: orgId, ...patch } as never, { onConflict: "organization_id" });
      if (saveError) throw new Error("Couldn't save your business details just now.");
    }

    let servicesAdded = 0;
    if (data.facts.services.length) {
      const { count } = await db.from("services").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      if ((count ?? 0) === 0) {
        const { error: serviceError } = await db.from("services").insert(
          data.facts.services.map((service, index) => ({
            organization_id: orgId,
            name: service.name,
            description: service.description || null,
            is_active: true,
            sort_order: index,
          })) as never,
        );
        if (!serviceError) servicesAdded = data.facts.services.length;
      }
    }

    let socialAdded = 0;
    const socials = { instagram: data.facts.instagram, facebook: data.facts.facebook, google_business: data.facts.google };
    if (Object.values(socials).some(Boolean)) {
      const { data: social } = await db.from("social_profiles").select("instagram, facebook, google_business").eq("organization_id", orgId).maybeSingle();
      const have = (social ?? {}) as Record<string, string | null>;
      const socialPatch = Object.fromEntries(Object.entries(socials).filter(([column, value]) => value && !have[column]));
      if (Object.keys(socialPatch).length) {
        const { error: socialError } = await db
          .from("social_profiles")
          .upsert({ organization_id: orgId, ...socialPatch } as never, { onConflict: "organization_id" });
        if (!socialError) socialAdded = Object.keys(socialPatch).length;
      }
    }

    const { invalidateWorkspaceContext } = await import("@/lib/agent/workspace-context.server");
    invalidateWorkspaceContext(orgId);
    return { filled, servicesAdded, socialAdded };
  });
