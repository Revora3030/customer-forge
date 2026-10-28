import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Draft package suggestions for the signed-in owner's own workspace. A manager
 * or above only; nothing is written to the database.
 */
export const suggestServicePackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager");
    const { suggestPackages } = await import("@/lib/service-suggestions.server");
    return suggestPackages(context.supabase as never, data.organizationId, context.userId);
  });
