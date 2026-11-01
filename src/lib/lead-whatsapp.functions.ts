import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only: may the owner be offered a WhatsApp reply link for this lead?
 * Answers false when the lead's phone is on the platform do-not-contact list
 * (STOP replies) or the list can't be read (fail closed). Sends nothing.
 */
export const getLeadWhatsAppAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const organizationId = String(raw["organizationId"] ?? "").trim();
    const leadId = String(raw["leadId"] ?? "").trim();
    if (!UUID.test(organizationId) || !UUID.test(leadId)) throw new Error("Invalid request");
    return { organizationId, leadId };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    // Ownership first: the service role is only loaded after the caller is proven staff of this org.
    const organizationId = await requireOrgRole(context.supabase, data.organizationId, context.userId, "staff");
    const [{ supabaseAdmin }, { isDoNotContact }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/prospect-outreach.server"),
    ]);
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("phone")
      .eq("id", data.leadId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !lead?.phone) return { allowed: false };
    return { allowed: !(await isDoNotContact(supabaseAdmin as never, lead.phone)) };
  });
