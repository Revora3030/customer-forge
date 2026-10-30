/**
 * The owner's controls for the top-of-page video loop: add a stock clip now
 * (or a different one), use their own clip instead, or switch it off. All
 * calls run through the owner's own client so RLS keeps every site's files in
 * its own folder. A stock clip is free; nothing here spends money. Earlier
 * clips are kept in the site's folder: the published copy may still show one
 * until the owner publishes again.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isOrgStoragePath, isStoragePath } from "@/lib/media";
import { heroVideoDisabled, heroVideoSlot, heroVideoTrade, readHeroVideo, readHeroVideoStatus, type HeroVideoPointer, type HeroVideoStatus } from "@/lib/builder/hero-stock-video";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_PATH = /\.(mp4|webm|m4v|mov)$/i;

const orgInput = (input: { organizationId: string }) => {
  const id = String(input?.organizationId ?? "");
  if (!UUID.test(id)) throw new Error("Invalid workspace");
  return { organizationId: id };
};

type Summary = {
  state: "on" | "off" | "none";
  source: HeroVideoPointer["source"] | null;
  credit: string | null;
  sourcePage: string | null;
  license: string | null;
  licenseUrl: string | null;
  trade: string | null;
  /** Whether the optional PEXELS_API_KEY is configured (never the value). */
  searchEnabled: boolean;
  /** The last attach attempt (after a build, or the owner's), if any. */
  lastAttempt: HeroVideoStatus | null;
  /** Where the home page's top section can show the loop ("none": nowhere). */
  slot: "scene" | "picture" | "none" | "unknown";
};

/** Reads the draft home page's first section and asks where a loop can play. */
async function homeHeroSlot(db: SupabaseClient<Database>, organizationId: string): Promise<Summary["slot"]> {
  try {
    const { data: pages } = await db.from("website_pages").select("id").eq("organization_id", organizationId).eq("kind", "home").limit(1);
    const pageId = (pages?.[0] as { id?: string } | undefined)?.id;
    if (!pageId) return "unknown";
    const { data: sections } = await db.from("website_sections").select("settings, sort_order").eq("organization_id", organizationId).eq("page_id", pageId).order("sort_order").limit(1);
    const settings = (sections?.[0] as { settings?: unknown } | undefined)?.settings;
    const { readComposition } = await import("@/lib/builder/composition-tree");
    const tree = readComposition(settings);
    return tree ? heroVideoSlot(tree) : "unknown";
  } catch {
    return "unknown";
  }
}

/** What the top-of-page video is right now. Safe to show the owner. */
export const heroVideoState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(orgInput)
  .handler(async ({ data, context }): Promise<Summary> => {
    const { data: row } = await context.supabase.from("website_settings").select("generation").eq("organization_id", data.organizationId).maybeSingle();
    const generation = (row?.generation ?? null) as unknown;
    const pointer = readHeroVideo(generation, data.organizationId);
    const { heroTradeText } = await import("@/lib/builder/hero-stock-video.server");
    const trade = heroVideoTrade(await heroTradeText(context.supabase as never, data.organizationId).catch(() => ""));
    return {
      state: pointer ? "on" : heroVideoDisabled(generation) ? "off" : "none",
      source: pointer?.source ?? null,
      credit: pointer?.credit ?? null,
      sourcePage: pointer?.sourcePage ?? null,
      license: pointer?.license ?? null,
      licenseUrl: pointer?.licenseUrl ?? null,
      trade,
      searchEnabled: Boolean(process.env["PEXELS_API_KEY"]),
      lastAttempt: readHeroVideoStatus(generation),
      slot: await homeHeroSlot(context.supabase, data.organizationId),
    };
  });

/** Adds a stock clip that matches the trade, or swaps the current stock clip for another. */
export const addStockHeroVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; replace?: boolean }) => ({ ...orgInput(input), replace: input?.replace === true }))
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const { ensureHeroStockVideo, heroTradeText } = await import("@/lib/builder/hero-stock-video.server");
    const tradeText = await heroTradeText(context.supabase as never, data.organizationId);
    const result = await ensureHeroStockVideo(context.supabase as never, data.organizationId, { tradeText, replace: data.replace });
    const { recordHeroVideoStatus } = await import("@/lib/builder/hero-stock-video.server");
    await recordHeroVideoStatus(context.supabase as never, data.organizationId, result, "owner");
    return { status: result.status, message: result.message };
  });

/**
 * Uses the owner's own uploaded clip. The browser uploads the file into the
 * workspace's own folder and records its media row first; this only accepts
 * a path in that folder that has a matching row.
 */
export const setOwnHeroVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; path: string; mediaId: string }) => {
    const { organizationId } = orgInput(input);
    const path = String(input?.path ?? "");
    const mediaId = String(input?.mediaId ?? "");
    if (!isStoragePath(path) || !isOrgStoragePath(path, organizationId) || !VIDEO_PATH.test(path)) throw new Error("Upload an MP4 or WebM video first.");
    if (!UUID.test(mediaId)) throw new Error("Upload an MP4 or WebM video first.");
    return { organizationId, path, mediaId };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const { data: row } = await context.supabase.from("media").select("id, url").eq("organization_id", data.organizationId).eq("id", data.mediaId).maybeSingle();
    if (!row || row.url !== data.path) throw new Error("That video upload was not found. Please upload it again.");
    const { writeHeroVideoPointer } = await import("@/lib/builder/hero-stock-video.server");
    const pointer: HeroVideoPointer = {
      version: 1,
      source: "owner",
      provider: "owner",
      providerId: null,
      src: data.path,
      mobileSrc: null,
      poster: null,
      mediaIds: [data.mediaId],
      credit: null,
      sourcePage: null,
      license: null,
      licenseUrl: null,
      loopStart: 0,
      loopEnd: null,
      setAt: new Date().toISOString(),
    };
    await writeHeroVideoPointer(context.supabase as never, data.organizationId, pointer);
    return { message: "Your own video now plays at the top of your home page. Publish to show it to visitors." };
  });

/** Switches the top-of-page video off; the builder never adds one back by itself. */
export const removeHeroVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orgInput)
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const { writeHeroVideoPointer } = await import("@/lib/builder/hero-stock-video.server");
    await writeHeroVideoPointer(context.supabase as never, data.organizationId, { version: 1, disabled: true, setAt: new Date().toISOString() });
    return { message: "The video is off; your top picture shows instead. Publish to update visitors." };
  });
