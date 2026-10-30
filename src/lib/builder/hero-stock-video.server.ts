/**
 * Gives one website its own cinematic hero loop from free, licensed stock.
 *
 * The clip is downloaded once and stored in THIS site's private media folder
 * (`tenant-media/<orgId>/…`), recorded as a media row with its creator,
 * source page and licence, and pointed at from `generation.heroVideo`. There
 * is no shared REVORA library: two sites in the same trade each hold their
 * own copy. Nothing here ever throws into a build; every failure leaves the
 * site's hero photo exactly as it was.
 *
 * Works with no secret at all (vetted clip shortlist). When `PEXELS_API_KEY`
 * is set, trades with no shortlisted clip, or an owner asking for a different
 * clip after the shortlist is used up, search the Pexels Videos API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";
import {
  HERO_VIDEO_LICENSE,
  HERO_VIDEO_LICENSE_URL,
  heroStockClipsFor,
  heroVideoCredit,
  heroVideoDisabled,
  heroVideoQueries,
  heroVideoTrade,
  normalizePexelsVideo,
  pickHeroStockClip,
  readHeroVideo,
  type HeroStockClip,
  type HeroVideoPointer,
  type HeroVideoTrade,
} from "@/lib/builder/hero-stock-video";

type Db = SupabaseClient;

/** Larger files are skipped: a hero loop must stay light enough for phones. */
export const MAX_HERO_CLIP_BYTES = 20 * 1024 * 1024;
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;

export type HeroStockResult =
  | { status: "added"; pointer: HeroVideoPointer; message: string }
  | { status: "exists" | "disabled" | "no_trade" | "no_clip" | "failed"; message: string };

type Fetch = typeof fetch;

async function download(fetchImpl: Fetch, url: string, kind: "video" | "image", max: number): Promise<{ bytes: Uint8Array; type: string }> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`stock ${kind} download failed (${response.status})`);
  const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (kind === "video" ? type !== "video/mp4" : !/^image\/(jpeg|png|webp)$/.test(type)) throw new Error(`stock ${kind} has an unexpected type`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max) throw new Error(`stock ${kind} is too large`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > max) throw new Error(`stock ${kind} is empty or too large`);
  return { bytes, type };
}

/** Pexels Videos API search; only used when the operator set PEXELS_API_KEY. */
export async function searchPexelsHeroClips(fetchImpl: Fetch, apiKey: string, trade: HeroVideoTrade): Promise<HeroStockClip[]> {
  const found: HeroStockClip[] = [];
  for (const query of heroVideoQueries(trade)) {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&size=medium&per_page=15`;
    try {
      const response = await fetchImpl(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) continue;
      const body = (await response.json()) as { videos?: unknown };
      for (const raw of Array.isArray(body.videos) ? body.videos : []) {
        const clip = normalizePexelsVideo(raw, trade);
        if (clip && clip.desktopBytes <= MAX_HERO_CLIP_BYTES && !found.some((item) => item.id === clip.id)) found.push(clip);
      }
    } catch {
      // One failed query never stops the build; the next query or the photo stands.
    }
  }
  return found;
}

async function latestGeneration(db: Db, orgId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const generation = (data as { generation?: unknown }).generation;
  return generation && typeof generation === "object" ? (generation as Record<string, unknown>) : {};
}

/** Writes only `generation.heroVideo`, re-reading first so no other build output is lost. */
export async function writeHeroVideoPointer(db: Db, orgId: string, value: HeroVideoPointer | { version: 1; disabled: true; setAt: string } | null): Promise<void> {
  const generation = (await latestGeneration(db, orgId)) ?? {};
  const next: Record<string, unknown> = { ...generation };
  if (value) next["heroVideo"] = value;
  else delete next["heroVideo"];
  const { error } = await db.from("website_settings").update({ generation: next } as never).eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}

/**
 * Idempotent: a site that already has a hero clip (stock, owner or AI), or
 * whose owner switched it off, is left alone unless `replace` is set.
 */
export async function ensureHeroStockVideo(
  db: Db,
  orgId: string,
  input: { tradeText: string; replace?: boolean; fetchImpl?: Fetch; apiKey?: string | null },
): Promise<HeroStockResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const apiKey = input.apiKey === undefined ? (process.env["PEXELS_API_KEY"] ?? null) : input.apiKey;
  const generation = await latestGeneration(db, orgId);
  if (!generation) return { status: "failed", message: "This website has no settings yet." };
  const current = readHeroVideo(generation, orgId);
  if (!input.replace) {
    if (heroVideoDisabled(generation)) return { status: "disabled", message: "The top-of-page video is switched off for this website." };
    if (current) return { status: "exists", message: "This website already has a top-of-page video." };
  }
  const trade = heroVideoTrade(input.tradeText);
  if (!trade) return { status: "no_trade", message: "No matching stock video for this kind of business yet; the top picture stays." };

  const exclude = current?.source === "stock" && current.providerId ? [current.providerId] : [];
  let clip = pickHeroStockClip(trade, orgId, exclude);
  if (!clip && apiKey) {
    const found = (await searchPexelsHeroClips(fetchImpl, apiKey, trade)).filter((item) => !exclude.includes(item.id));
    clip = found[0] ?? null;
  }
  if (!clip) {
    return {
      status: "no_clip",
      message: heroStockClipsFor(trade).length
        ? "There is no other stock clip for this kind of business yet."
        : "No stock video is available for this kind of business yet; the top picture stays.",
    };
  }

  const uploaded: string[] = [];
  const mediaIds: string[] = [];
  const credit = heroVideoCredit(clip.creator);
  const store = async (bytes: Uint8Array, type: string, name: string, category: string) => {
    const path = buildObjectPath(orgId, name);
    const { error: uploadError } = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    uploaded.push(path);
    const { data: row, error: rowError } = await db
      .from("media")
      .insert({
        organization_id: orgId,
        url: path,
        category,
        file_name: name,
        size_bytes: bytes.byteLength,
        alt_text: null,
        source: "stock:pexels",
        source_page: clip.page,
        license: HERO_VIDEO_LICENSE,
        license_url: HERO_VIDEO_LICENSE_URL,
        creator: clip.creator,
        attribution: credit,
      } as never)
      .select("id")
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    const id = (row as { id?: string } | null)?.id;
    if (id) mediaIds.push(id);
    return path;
  };

  try {
    const desktop = await download(fetchImpl, clip.desktop, "video", MAX_HERO_CLIP_BYTES);
    const src = await store(desktop.bytes, desktop.type, `hero-video-pexels-${clip.id}.mp4`, "hero_video");
    let mobileSrc: string | null = null;
    if (clip.mobile && clip.mobile !== clip.desktop) {
      const mobile = await download(fetchImpl, clip.mobile, "video", MAX_HERO_CLIP_BYTES);
      mobileSrc = await store(mobile.bytes, mobile.type, `hero-video-mobile-pexels-${clip.id}.mp4`, "hero_video_mobile");
    }
    let poster: string | null = null;
    if (clip.poster) {
      try {
        const still = await download(fetchImpl, clip.poster, "image", MAX_POSTER_BYTES);
        poster = await store(still.bytes, still.type, `hero-video-poster-pexels-${clip.id}.jpg`, "hero_video_poster");
      } catch {
        // The scene's own photo is the poster anyway; a missing still is fine.
      }
    }
    const pointer: HeroVideoPointer = {
      version: 1,
      source: "stock",
      provider: "pexels",
      providerId: clip.id,
      src,
      mobileSrc,
      poster,
      mediaIds,
      credit,
      sourcePage: clip.page,
      license: HERO_VIDEO_LICENSE,
      licenseUrl: HERO_VIDEO_LICENSE_URL,
      loopStart: clip.loopStart,
      loopEnd: clip.loopEnd,
      setAt: new Date().toISOString(),
    };
    // An earlier clip stays in the folder: the published copy may still use it until the next publish.
    await writeHeroVideoPointer(db, orgId, pointer);
    return { status: "added", pointer, message: `Added a ${trade.replace(/-/g, " ")} video loop (${credit}).` };
  } catch (error) {
    if (uploaded.length) await db.storage.from(MEDIA_BUCKET).remove(uploaded).catch(() => undefined);
    if (mediaIds.length) await Promise.resolve(db.from("media").delete().eq("organization_id", orgId).in("id", mediaIds)).catch(() => undefined);
    return { status: "failed", message: `The stock video could not be added (${(error as Error)?.message ?? "unknown error"}); the top picture stays.` };
  }
}

/** The business's own words that name its trade: industry first, then its name and services. */
export async function heroTradeText(db: Db, orgId: string): Promise<string> {
  const [org, services] = await Promise.all([
    db.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
    db.from("services").select("name").eq("organization_id", orgId).eq("is_active", true).limit(12),
  ]);
  const row = (org.data ?? {}) as { name?: string | null; industry?: string | null };
  const names = ((services.data ?? []) as { name?: string | null }[]).map((service) => service.name ?? "");
  // Industry decides when it names a trade; otherwise the name and services do.
  if (heroVideoTrade(row.industry)) return String(row.industry);
  return [row.industry, row.name, ...names].filter(Boolean).join(" · ");
}
