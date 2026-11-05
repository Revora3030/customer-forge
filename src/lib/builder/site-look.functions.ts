import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanLook, MAX_LOOKS, readSectionLooks } from "@/lib/builder/site-look";

/**
 * Saves the owner's chosen look (CG-07) into website_settings.generation.look.
 * Only that one key changes; everything else in generation is kept. Free: no
 * AI call, no build credits.
 */
export const applySiteLook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; look: number }) => {
    const look = Number(input?.look);
    if (!Number.isInteger(look) || look < 0 || look >= MAX_LOOKS) throw new Error("That look isn't available.");
    return { organizationId: String(input?.organizationId ?? ""), look };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const { data: row, error } = await context.supabase.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle();
    if (error) throw new Error("Couldn't load your website settings. Try again.");
    if (!row) throw new Error("Build your website first, then try another look.");
    const generation = { ...((row.generation ?? {}) as Record<string, unknown>), look: cleanLook(data.look) };
    const { error: saveError } = await context.supabase.from("website_settings").update({ generation: generation as never }).eq("organization_id", orgId);
    if (saveError) throw new Error("Couldn't save the new look. Your site is unchanged.");
    return { look: generation.look };
  });

const SECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CG-14: saves a free layout look for one plain section into
 * website_settings.generation.sectionLooks[sectionId]. No AI call. Look 0
 * clears the override so the section follows the site look again.
 */
export const applySectionLook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; sectionId: string; look: number }) => {
    const look = Number(input?.look);
    const sectionId = String(input?.sectionId ?? "").trim();
    if (!SECTION_ID.test(sectionId)) throw new Error("That section isn't available.");
    if (!Number.isInteger(look) || look < 0 || look >= MAX_LOOKS) throw new Error("That look isn't available.");
    return { organizationId: String(input?.organizationId ?? ""), sectionId, look };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const { data: row, error } = await context.supabase.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle();
    if (error) throw new Error("Couldn't load your website settings. Try again.");
    if (!row) throw new Error("Build your website first, then try a new layout.");
    const generation = { ...((row.generation ?? {}) as Record<string, unknown>) };
    const sectionLooks = { ...readSectionLooks(generation) };
    const look = cleanLook(data.look);
    if (look === 0) delete sectionLooks[data.sectionId];
    else sectionLooks[data.sectionId] = look;
    if (Object.keys(sectionLooks).length === 0) delete generation["sectionLooks"];
    else generation["sectionLooks"] = sectionLooks;
    const { error: saveError } = await context.supabase.from("website_settings").update({ generation: generation as never }).eq("organization_id", orgId);
    if (saveError) throw new Error("Couldn't save the new layout. Your site is unchanged.");
    return { sectionId: data.sectionId, look };
  });
