import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEDIA_CATEGORIES } from "@/lib/media";
import { driveIntakeEnabled, parseDriveFolderId } from "./drive-intake";

export const importDrivePhotosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; folder: string; category: string }) => {
    const folderId = parseDriveFolderId(input?.folder ?? "");
    if (!folderId) throw new Error("Paste a Google Drive folder link.");
    if (!/^[a-f0-9-]{36}$/i.test(input?.organizationId ?? ""))
      throw new Error("Choose a business first.");
    const category = MEDIA_CATEGORIES.some((c) => c.id === input.category)
      ? input.category
      : "work";
    return { organizationId: input.organizationId, folderId, category };
  })
  .handler(async ({ context, data }) => {
    if (!driveIntakeEnabled(process.env["DRIVE_INTAKE_ENABLED"]))
      throw new Error("Importing from Google Drive isn't switched on yet.");
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(
      context.supabase as never,
      data.organizationId,
      String(context.userId),
      "manager",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { importDriveFolder } = await import("./drive-intake.server");
    return importDriveFolder(
      supabaseAdmin as unknown as SupabaseClient,
      orgId,
      data.folderId,
      data.category,
    );
  });
