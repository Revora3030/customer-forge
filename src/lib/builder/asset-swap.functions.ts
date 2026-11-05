/**
 * Asset Swapper (B12-4): puts one picture from the workspace library in place
 * of the picture the owner clicked in the builder preview. No AI turn.
 *
 * Every swap saves a restore point first (a `website_versions` row), so the
 * builder can undo it with the existing one-section restore. The write is
 * held to the clicked block with the same edit-scope predicate chat plans use.
 * The caller's own client is used, so row level security still applies;
 * manager role and entitlement are checked like every other builder write.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readComposition, writeComposition } from "@/lib/builder/composition-tree";
import { isInlinePath, nodeAtPath } from "@/lib/builder/inline-edit";
import {
  cleanAltText,
  planPictureSwap,
  SWAP_PROBLEM_MESSAGE,
  withPicture,
  type SwapMedia,
} from "@/lib/builder/asset-swap";
import { actionWithinEditScope } from "@/lib/builder/edit-scope";
import { writeComponentVisual } from "@/lib/site-style";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const swapSitePicture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      organizationId: string;
      sectionId: string;
      path: string;
      mediaId: string;
      alt?: string | null;
    }) => {
      const organizationId = String(input?.organizationId ?? "");
      const sectionId = String(input?.sectionId ?? "");
      const mediaId = String(input?.mediaId ?? "");
      if (!UUID.test(organizationId) || !UUID.test(sectionId) || !UUID.test(mediaId))
        throw new Error("Invalid picture");
      if (!isInlinePath(input?.path)) throw new Error("Invalid element");
      return {
        organizationId,
        sectionId,
        mediaId,
        path: input.path,
        alt: cleanAltText(input?.alt),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, context.userId, "manager");
    const { assertOrgEntitled } = await import("@/lib/entitlement.server");
    await assertOrgEntitled(context.supabase as never, data.organizationId);
    const supabase = context.supabase;

    const { data: mediaRow, error: mediaError } = await supabase
      .from("media")
      .select("id, url, alt_text, source, license, license_url, attribution, creator, source_page")
      .eq("id", data.mediaId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (mediaError) throw new Error("Couldn't load that picture. Try again.");
    if (!mediaRow) throw new Error("That picture is no longer in your library.");

    // The live draft, read once: it is the restore point AND the scope check.
    const { readWebsiteState } = await import("@/lib/site-restore.functions");
    const current = await readWebsiteState(supabase as never, data.organizationId);
    const section = current.pages
      .flatMap((page) => page.sections)
      .find((row) => row.id === data.sectionId);
    if (!section) throw new Error("That block no longer exists.");
    const tree = readComposition(section.settings);
    if (!tree)
      throw new Error("This picture can't be swapped in place yet. Ask the assistant instead.");

    const componentIds = new Set(section.components.map((component) => component.id));
    const plan = planPictureSwap({
      tree,
      path: data.path,
      media: mediaRow as SwapMedia,
      organizationId: data.organizationId,
      alt: data.alt,
      sectionComponentIds: componentIds,
      currentComponentUrl:
        section.components.find(
          (component) => component.id === nodeAtPath(tree, data.path)?.mediaRef,
        )?.media_url ?? null,
    });
    if (!plan.ok) {
      if (plan.problem === "unchanged")
        return { ok: true as const, unchanged: true as const, versionId: null, version: null };
      throw new Error(SWAP_PROBLEM_MESSAGE[plan.problem]);
    }
    // Same boundary chat edits use: the write must stay inside the clicked block.
    const action =
      plan.mode === "component"
        ? { type: "set_component_visual", componentId: plan.componentId }
        : {
            type: plan.mode === "new_component" ? "add_component" : "set_composition",
            sectionId: data.sectionId,
          };
    if (!actionWithinEditScope(action, current, { sectionIds: [data.sectionId] }))
      throw new Error("That picture belongs to another block. Pick it again.");

    // Restore point first, so the swap can always be undone.
    const { data: latest } = await supabase
      .from("website_versions")
      .select("version")
      .eq("organization_id", data.organizationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    let version = Number(latest?.version ?? 0);
    let versionId: string | null = null;
    for (let attempt = 0; attempt < 3 && !versionId; attempt += 1) {
      version += 1;
      const { data: saved } = await supabase
        .from("website_versions")
        .insert({
          organization_id: data.organizationId,
          version,
          label: "Before swapping a picture",
          pages: current as never,
          created_by: context.userId,
        })
        .select("id")
        .maybeSingle();
      if (saved?.id) versionId = String(saved.id);
    }
    if (!versionId) throw new Error("Couldn't save a restore point first, so nothing was changed.");

    if (plan.mode === "component") {
      const component = section.components.find((row) => row.id === plan.componentId)!;
      const { error } = await supabase
        .from("website_components")
        .update({
          media_url: plan.mediaUrl,
          settings: writeComponentVisual(component.settings, plan.visual),
        } as never)
        .eq("id", plan.componentId)
        .eq("organization_id", data.organizationId);
      if (error) throw new Error("Couldn't save that picture. Nothing was changed.");
      // Keep the layout's own description in step with the picture.
      const next = withPicture(tree, data.path, { mediaRef: plan.componentId, alt: plan.alt });
      await supabase
        .from("website_sections")
        .update({ settings: writeComposition(section.settings, next) } as never)
        .eq("id", data.sectionId)
        .eq("organization_id", data.organizationId);
    } else if (plan.mode === "new_component") {
      const sortOrder =
        section.components.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
      const { data: created, error } = await supabase
        .from("website_components")
        .insert({
          organization_id: data.organizationId,
          section_id: data.sectionId,
          kind: "image",
          media_url: plan.mediaUrl,
          settings: writeComponentVisual({}, plan.visual) as never,
          sort_order: sortOrder,
        })
        .select("id")
        .maybeSingle();
      if (error || !created?.id)
        throw new Error("Couldn't save that picture. Nothing was changed.");
      const componentId = String(created.id);
      const next = withPicture(tree, data.path, { mediaRef: componentId, alt: plan.alt });
      const { error: writeError } = await supabase
        .from("website_sections")
        .update({ settings: writeComposition(section.settings, next) } as never)
        .eq("id", data.sectionId)
        .eq("organization_id", data.organizationId);
      if (writeError) {
        await supabase
          .from("website_components")
          .delete()
          .eq("id", componentId)
          .eq("organization_id", data.organizationId);
        throw new Error("Couldn't save that picture. Nothing was changed.");
      }
    } else {
      const { error } = await supabase
        .from("website_sections")
        .update({ settings: writeComposition(section.settings, plan.tree) } as never)
        .eq("id", data.sectionId)
        .eq("organization_id", data.organizationId);
      if (error) throw new Error("Couldn't save that picture. Nothing was changed.");
    }

    const { invalidateWorkspaceContext } = await import("@/lib/agent/workspace-context.server");
    invalidateWorkspaceContext(data.organizationId);
    return { ok: true as const, unchanged: false as const, versionId, version };
  });
