/**
 * The owner's "Rules for my site" — read, save and delete.
 *
 * Every query runs through the caller's own client, so RLS decides which
 * workspace's rules can be read or changed (managers write, members read).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgId = (input: { organizationId?: unknown }) => {
  const value = typeof input?.organizationId === "string" ? input.organizationId.trim() : "";
  if (!value) throw new Error("Choose a workspace first.");
  return value;
};

export const getSiteRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: orgId(input) }))
  .handler(async ({ data, context }): Promise<{ rules: string }> => {
    const { loadSiteRules } = await import("@/lib/builder/site-rules.server");
    return { rules: await loadSiteRules(context.supabase as never, data.organizationId) };
  });

export const saveSiteRulesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; rules: string }) => ({
    organizationId: orgId(input),
    rules: typeof input?.rules === "string" ? input.rules : "",
  }))
  .handler(async ({ data, context }) => {
    const { saveSiteRules } = await import("@/lib/builder/site-rules.server");
    const userId = (context as { userId?: string }).userId ?? null;
    return saveSiteRules(context.supabase as never, data.organizationId, userId, data.rules);
  });

export const deleteSiteRulesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: orgId(input) }))
  .handler(async ({ data, context }) => {
    const { deleteSiteRules } = await import("@/lib/builder/site-rules.server");
    return deleteSiteRules(context.supabase as never, data.organizationId);
  });
