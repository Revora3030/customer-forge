import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole } from "@/lib/org-authz.server";
import { normalizeMailDomain } from "./email-auth-health";

/**
 * Read-only SPF / DKIM / DMARC health for the workspace's connected domain.
 * Only public DNS is read (Cloudflare 1.1.1.1 DoH); nothing is stored or changed,
 * so staff access is enough.
 */
export const checkEmailAuthHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "staff");
    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("custom_domain")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");
    const domain = normalizeMailDomain(settings.custom_domain);
    if (!domain) throw new Error("Connect a domain first. There's nothing to check yet.");
    const { checkEmailAuth } = await import("./email-auth-health.server");
    return checkEmailAuth(domain);
  });
