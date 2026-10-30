/**
 * Creates a private preview link for a workspace's draft site.
 *
 * The browser used to insert the row itself, but the table's RLS policy only
 * admits owner/admin/manager memberships, so Revora support (a super admin in
 * an audited support session, not a member) was refused and Publish stopped
 * at "Couldn't create a preview link." twice. This checks the caller's role
 * with their own credentials (requireOrgRole honours open support sessions,
 * like `private.can_manage_org`) and only then writes the row.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { previewLinkInput, PREVIEW_LINK_DENIED, PREVIEW_LINK_SAVE_FAILED } from "@/lib/preview-links";

export const createPreviewLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(previewLinkInput)
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    const { orgRole, roleAtLeast } = await import("@/lib/org-authz.server");
    const role = await orgRole(context.supabase as never, data.organizationId, context.userId);
    if (!roleAtLeast(role, "manager")) throw new Error(PREVIEW_LINK_DENIED);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 40);
    const expires = new Date(Date.now() + data.hours * 3600_000);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("website_preview_links").insert({
      organization_id: data.organizationId,
      token,
      label: data.label,
      expires_at: expires.toISOString(),
      created_by: context.userId,
    });
    if (error) {
      console.warn("[preview-link] insert failed", { org: data.organizationId, code: error.code, message: error.message });
      throw new Error(PREVIEW_LINK_SAVE_FAILED);
    }
    return { token };
  });
