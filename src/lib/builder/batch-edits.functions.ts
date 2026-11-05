/**
 * Saves a batch of quick text edits from the builder preview in ONE write:
 * one restore point (a `website_versions` row, restorable with the existing
 * restore), then every changed block. No AI turn runs, ever.
 *
 * The caller's own client is used, so row level security still applies;
 * manager role and entitlement are checked like every other builder write.
 * Published sites are unaffected until the owner publishes.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readComposition, writeComposition } from "@/lib/builder/composition-tree";
import { cleanInlineText, isInlinePath } from "@/lib/builder/inline-edit";
import { batchVersionLabel, MAX_BATCH_EDITS, planBatch, type BatchEditInput } from "@/lib/builder/batch-edits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const saveBatchEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; edits: { sectionId: string; path: string; text: string; label?: string | null }[] }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    const raw = Array.isArray(input?.edits) ? input.edits : [];
    if (!raw.length) throw new Error("No changes to save");
    if (raw.length > MAX_BATCH_EDITS) throw new Error(`Save at most ${MAX_BATCH_EDITS} changes at once`);
    const edits = raw.map((edit) => {
      const sectionId = String(edit?.sectionId ?? "");
      if (!UUID.test(sectionId)) throw new Error("Invalid block");
      if (!isInlinePath(edit?.path)) throw new Error("Invalid element");
      const text = cleanInlineText(edit?.text);
      if (!text) throw new Error("Text can't be empty");
      const label = cleanInlineText(edit?.label ?? "").slice(0, 60) || null;
      return { sectionId, path: edit.path, text, label };
    });
    return { organizationId, edits };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager");
    const { assertOrgEntitled } = await import("@/lib/entitlement.server");
    await assertOrgEntitled(context.supabase as never, data.organizationId);
    const supabase = context.supabase;

    // The live draft, read once: it is both the restore point and the base for every edit.
    const { readWebsiteState } = await import("@/lib/site-restore.functions");
    const current = await readWebsiteState(supabase as never, data.organizationId);
    const sections = new Map(current.pages.flatMap((page) => page.sections).map((row) => [row.id, row]));
    const trees = new Map(Array.from(sections, ([id, row]) => [id, readComposition(row.settings)] as const));
    const inputs: BatchEditInput[] = data.edits.map(({ sectionId, path, text }) => ({ sectionId, path, text }));
    const plan = planBatch(trees, inputs);
    if (!plan.applied.length) {
      return { ok: true as const, saved: 0, skipped: plan.skipped.length, versionId: null, version: null, changes: [] };
    }

    // Restore point first, so the whole batch can be undone in one step.
    const { data: latest } = await supabase
      .from("website_versions")
      .select("version")
      .eq("organization_id", data.organizationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const labels = plan.applied.map((change) => ({
      after: change.after,
      label: data.edits.find((edit) => edit.sectionId === change.sectionId && edit.path === change.path)?.label ?? null,
    }));
    let version = Number(latest?.version ?? 0);
    let versionId: string | null = null;
    for (let attempt = 0; attempt < 3 && !versionId; attempt += 1) {
      version += 1;
      const { data: saved } = await supabase
        .from("website_versions")
        .insert({
          organization_id: data.organizationId,
          version,
          label: batchVersionLabel(labels),
          pages: current as never,
          created_by: context.userId,
        })
        .select("id")
        .maybeSingle();
      if (saved?.id) versionId = String(saved.id);
    }
    if (!versionId) throw new Error("Couldn't save a restore point first, so nothing was changed.");

    let failed = 0;
    for (const [sectionId, tree] of plan.trees) {
      const row = sections.get(sectionId)!;
      const { error } = await supabase
        .from("website_sections")
        .update({ settings: writeComposition(row.settings, tree) } as never)
        .eq("id", sectionId)
        .eq("organization_id", data.organizationId);
      if (error) failed += 1;
    }
    if (failed) throw new Error("Couldn't save every change. Use Restore to go back, then try again.");

    const { invalidateWorkspaceContext } = await import("@/lib/agent/workspace-context.server");
    invalidateWorkspaceContext(data.organizationId);
    return {
      ok: true as const,
      saved: plan.applied.length,
      skipped: plan.skipped.length,
      versionId,
      version,
      changes: plan.applied,
    };
  });
