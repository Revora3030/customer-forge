/**
 * B12-6 /analyze handler. CU-4 owns the slash-command menu and calls this.
 * Read-only: fetches public pages, writes nothing, sends nothing.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnalyzeResult } from "@/lib/analyze/competitor-audit.server";

const UUID = /^[0-9a-f-]{36}$/i;

export function ownerSiteUrl(row: { custom_domain: string | null; domain_verified: boolean | null } | null): string | null {
  const domain = row?.custom_domain?.trim().toLowerCase();
  if (!domain || !row?.domain_verified || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return `https://${domain}/`;
}

export const analyzeCompetitorSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; url: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const url = String(input?.url ?? "").trim().slice(0, 2048);
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    if (!url) throw new Error("Paste a public web address.");
    return { organizationId, url: /^https?:\/\//i.test(url) ? url : `https://${url}` };
  })
  .handler(async ({ data, context }): Promise<AnalyzeResult> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, String(context.userId), "viewer");
    const { data: site } = await context.supabase
      .from("website_settings")
      .select("custom_domain, domain_verified")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const { analyzeCompetitor } = await import("@/lib/analyze/competitor-audit.server");
    return analyzeCompetitor(data.url, ownerSiteUrl(site ?? null));
  });
