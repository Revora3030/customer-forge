import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ASSET_QUEUE_LIMIT,
  buildAssetQueue,
  type AssetQueue,
  type AssetQueueRecord,
} from "./ai-city-assets";

/**
 * JC-24: pictures waiting for owner review across workspaces, for the
 * Creative District. Platform admins only; read-only.
 */
export const getCityAssetQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssetQueue> => {
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { MEDIA_BUCKET, isStoragePath } = await import("./media");
    const checkedAt = new Date().toISOString();

    const { data, error, count } = await db
      .from("image_records")
      .select(
        "id,organization_id,slot,status,source,alt_text,media_id,model,provider,generation,updated_at,created_at",
        { count: "exact" },
      )
      .eq("status", "pending")
      .order("updated_at", { ascending: false })
      .limit(ASSET_QUEUE_LIMIT);
    if (error || !Array.isArray(data)) {
      return buildAssetQueue({
        records: null,
        total: null,
        workspaces: new Map(),
        previews: new Map(),
        checkedAt,
      });
    }
    const records = data as AssetQueueRecord[];

    const workspaces = new Map<string, string>();
    const orgIds = [...new Set(records.map((row) => row.organization_id))];
    if (orgIds.length) {
      const { data: orgs } = await db.from("organizations").select("id,name").in("id", orgIds);
      for (const org of orgs ?? []) workspaces.set(org.id, org.name);
    }

    // Thumbnails only for files the record points at; short-lived links.
    const previews = new Map<string, string>();
    const mediaIds = [
      ...new Set(records.map((row) => row.media_id).filter((id): id is string => Boolean(id))),
    ];
    if (mediaIds.length) {
      const { data: media } = await db
        .from("media")
        .select("id,url,organization_id")
        .in("id", mediaIds);
      const owned = (media ?? []).filter(
        (row) => isStoragePath(row.url) && row.url.startsWith(`${row.organization_id}/`),
      );
      if (owned.length) {
        const { data: urls } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(
          owned.map((row) => row.url),
          10 * 60,
        );
        const byPath = new Map(
          (urls ?? [])
            .filter((u) => u.path && u.signedUrl)
            .map((u) => [u.path as string, u.signedUrl]),
        );
        for (const row of owned) {
          const url = byPath.get(row.url);
          if (url) previews.set(row.id, url);
        }
      }
    }
    return buildAssetQueue({
      records,
      total: count ?? records.length,
      workspaces,
      previews,
      checkedAt,
    });
  });
