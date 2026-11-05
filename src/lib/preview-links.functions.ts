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
import { previewLinkInput, PREVIEW_LINK_DENIED, PREVIEW_LINK_PASSWORD_FAILED, PREVIEW_LINK_SAVE_FAILED } from "@/lib/preview-links";
import { hashPreviewPassword } from "@/lib/preview-password";

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
    // Only a link that asks for a password sends the new column, so ordinary
    // links keep working even before the LOV-6 migration is published.
    const passwordHash = data.password ? await hashPreviewPassword(data.password) : null;
    const { data: created, error } = await supabaseAdmin
      .from("website_preview_links")
      .insert({
        organization_id: data.organizationId,
        token,
        label: data.label,
        expires_at: expires.toISOString(),
        created_by: context.userId,
        // The generated types predate the LOV-6 column, so widen just this key.
        ...((passwordHash ? { password_protected: true } : {}) as Record<never, never>),
      })
      .select("id")
      .maybeSingle();
    if (error || !created?.id) {
      console.warn("[preview-link] insert failed", { org: data.organizationId, code: error?.code, message: error?.message });
      throw new Error(PREVIEW_LINK_SAVE_FAILED);
    }
    if (passwordHash) {
      // Never leave a link that was meant to be locked open: if the hash can't
      // be saved, remove the link and say so.
      const { error: secretError } = await (
        supabaseAdmin as unknown as {
          from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { code?: string; message?: string } | null }> };
        }
      )
        .from("website_preview_link_secrets")
        .insert({ link_id: created.id, password_hash: passwordHash });
      if (secretError) {
        console.warn("[preview-link] password save failed", { org: data.organizationId, code: secretError.code });
        await supabaseAdmin.from("website_preview_links").delete().eq("id", created.id);
        throw new Error(PREVIEW_LINK_PASSWORD_FAILED);
      }
    }
    return { token };
  });
