/**
 * Reads and saves the site's three brand colours from the builder preview's
 * palette editor. It writes the SAME `business_profiles` columns the assistant's
 * `set_theme` action already writes (`primary_color`, `secondary_color`,
 * `accent_color`): no new table, column or function. The caller's own client is
 * used, so RLS still scopes the row to their workspace; manager role and
 * entitlement are checked exactly like the inline text save.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeHex, paletteFromProfile, readPalette, type Palette } from "@/lib/builder/palette-edit";
import { readDesignTokens, writeDesignTokens } from "@/lib/builder/design-tokens";
import { readSiteStyle, styleFromStored, stylePreference, styleTokens, type SiteStyle } from "@/lib/builder/style-edit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function orgIdOf(input: { organizationId?: unknown } | null | undefined) {
  const organizationId = String(input?.organizationId ?? "");
  if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
  return organizationId;
}

export type SiteThemeState = {
  palette: Palette;
  /** False when the caller may look but not change (viewer/staff). */
  canEdit: boolean;
  /** True when no colour was ever saved, so the palette shown is the blank default. */
  unset: boolean;
  /** Curated type pair, corners and spacing as saved (null parts were never chosen). */
  style: SiteStyle;
};

export const getSiteThemeColors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: orgIdOf(input) }))
  .handler(async ({ data, context }): Promise<SiteThemeState> => {
    const { orgRole, roleAtLeast } = await import("@/lib/org-authz.server");
    const role = await orgRole(context.supabase as never, data.organizationId, context.userId);
    if (!role) throw new Error("You don't have access to this workspace.");
    const { data: profile, error } = await context.supabase
      .from("business_profiles")
      .select("primary_color, secondary_color, accent_color, font_preference")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load the site colours. Try again.");
    const { data: settings } = await context.supabase
      .from("website_settings")
      .select("generation")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const style = styleFromStored(
      (profile as { font_preference?: string | null } | null)?.font_preference ?? null,
      readDesignTokens((settings as { generation?: unknown } | null)?.generation ?? null),
    );
    const unset = !normalizeHex(profile?.primary_color) && !normalizeHex(profile?.secondary_color) && !normalizeHex(profile?.accent_color);
    return { palette: paletteFromProfile(profile), canEdit: roleAtLeast(role, "manager"), unset, style };
  });

export const saveSiteThemeColors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; primary: string; secondary: string; accent: string; style?: SiteStyle }) => {
    const palette = readPalette(input);
    if (!palette) throw new Error("Colours must be hex values like #1d4ed8.");
    // Only curated pairs and known choices survive; anything else is dropped here.
    const style = input?.style === undefined ? null : readSiteStyle(input.style);
    return { organizationId: orgIdOf(input), palette, style };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager");
    const { assertOrgEntitled } = await import("@/lib/entitlement.server");
    await assertOrgEntitled(context.supabase as never, data.organizationId);

    const { data: rows, error } = await context.supabase
      .from("business_profiles")
      .update({
        primary_color: data.palette.primary,
        secondary_color: data.palette.secondary,
        accent_color: data.palette.accent,
        ...(data.style && stylePreference(data.style) ? { font_preference: stylePreference(data.style) } : {}),
      } as never)
      .eq("organization_id", data.organizationId)
      .select("organization_id");
    if (error) throw new Error("Couldn't save those colours. Try again.");
    if (!rows || rows.length === 0) throw new Error("This workspace has no business profile yet, so there is nothing to recolour.");
    const tokens = data.style ? styleTokens(data.style) : {};
    if (Object.keys(tokens).length) {
      // Same design tokens the AI writes (website_settings.generation), merged so other tokens stay.
      const { data: settings, error: readError } = await context.supabase
        .from("website_settings")
        .select("generation")
        .eq("organization_id", data.organizationId)
        .maybeSingle();
      if (readError) throw new Error("Colours saved, but the corners and spacing couldn't be read. Try again.");
      if (!settings) throw new Error("Colours saved, but this site has no settings yet for corners and spacing.");
      const generation = writeDesignTokens((settings as { generation?: unknown }).generation ?? null, tokens);
      const { error: tokenError } = await context.supabase
        .from("website_settings")
        .update({ generation } as never)
        .eq("organization_id", data.organizationId);
      if (tokenError) throw new Error("Colours saved, but the corners and spacing couldn't be saved. Try again.");
    }
    // The planner reuses a short-lived picture of the site; drop it so the next
    // chat request plans from the colours the owner just chose.
    const { invalidateWorkspaceContext } = await import("@/lib/agent/workspace-context.server");
    invalidateWorkspaceContext(data.organizationId);
    return { ok: true as const, palette: data.palette, style: data.style };
  });
