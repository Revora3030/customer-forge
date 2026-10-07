/**
 * Saves an inline text edit from the builder preview straight to the draft —
 * no AI turn. The caller's own client is used, so RLS still scopes the row to
 * their workspace; manager role and entitlement are checked like every other
 * builder write. Published sites are unaffected until the owner publishes.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readComposition, writeComposition } from "@/lib/builder/composition-tree";
import { applyInlineText, cleanInlineText, isInlinePath } from "@/lib/builder/inline-edit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const saveInlineText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; sectionId: string; path: string; text: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const sectionId = String(input?.sectionId ?? "");
    if (!UUID.test(organizationId) || !UUID.test(sectionId)) throw new Error("Invalid block");
    if (!isInlinePath(input?.path)) throw new Error("Invalid element");
    const text = cleanInlineText(input?.text);
    if (!text) throw new Error("Text can't be empty");
    return { organizationId, sectionId, path: input.path, text };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager");
    const { assertOrgEntitled } = await import("@/lib/entitlement.server");
    await assertOrgEntitled(context.supabase as never, data.organizationId);

    const { data: row, error } = await context.supabase
      .from("website_sections")
      .select("id, settings")
      .eq("id", data.sectionId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load that block. Try again.");
    if (!row) throw new Error("That block no longer exists.");

    const tree = readComposition(row.settings);
    if (!tree) throw new Error("This block can't be edited in place yet. Ask the assistant instead.");
    const result = applyInlineText(tree, data.path, data.text);
    if (!result.ok) {
      if (result.reason === "unchanged") return { ok: true as const, unchanged: true as const, before: data.text, after: data.text };
      throw new Error(result.reason === "not_editable" ? "Only text can be edited in place." : "That element changed. Refresh the preview.");
    }

    const { error: writeError } = await context.supabase
      .from("website_sections")
      .update({ settings: writeComposition(row.settings, result.tree) } as never)
      .eq("id", data.sectionId)
      .eq("organization_id", data.organizationId);
    if (writeError) throw new Error("Couldn't save that change. Try again.");

    return {
      ok: true as const,
      unchanged: false as const,
      before: result.before,
      after: result.after,
    };
  });
