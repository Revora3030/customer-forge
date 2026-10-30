/**
 * Cinematic hero video loops from free, licensed stock (quality bar #1 / #10).
 *
 * Pure and client-safe: the trade → search-term map, the vetted Pexels clips,
 * the Pexels Videos API normaliser and the reader for the site's own
 * `generation.heroVideo` pointer. Downloading and storing a clip lives in
 * `hero-stock-video.server.ts`.
 *
 * Licence rules (Pexels License, https://www.pexels.com/license/): free for
 * commercial use, no attribution required, may be modified. Never sell an
 * unaltered copy, redistribute it on a stock platform, imply a person or brand
 * endorses the business, or present it as the client's own work. So:
 *  - every site gets its OWN copy in its own storage folder; there is no shared
 *    REVORA library and no cross-customer picker,
 *  - the shortlist below is a build-time recipe (exact clip URLs vetted for no
 *    faces and no brands), never shown to an owner as a catalogue,
 *  - credit and licence are recorded on the site's media rows.
 *
 * The pointer carries a `source` so a paid AI clip ("ai_generated") or the
 * owner's own clip ("owner") plugs into the same renderer later.
 */

export type HeroVideoTrade =
  | "auto-detailing"
  | "pressure-washing"
  | "pool-service"
  | "pest-control"
  | "plumbing"
  | "hvac"
  | "roofing"
  | "electrical"
  | "painting"
  | "landscaping"
  | "cleaning"
  | "moving"
  | "general-contracting";

/** Where the hero clip came from. `ai_generated` is reserved for paid AI video. */
export type HeroVideoSource = "stock" | "owner" | "ai_generated";

export const HERO_VIDEO_LICENSE = "Pexels License";
export const HERO_VIDEO_LICENSE_URL = "https://www.pexels.com/license/";

/** Media categories used only for the hero loop; never placed as a page photo or gallery item. */
export const HERO_VIDEO_CATEGORIES = ["hero_video", "hero_video_mobile", "hero_video_poster"] as const;
export type HeroVideoCategory = (typeof HERO_VIDEO_CATEGORIES)[number];

export function isHeroVideoCategory(category: unknown): boolean {
  return typeof category === "string" && (HERO_VIDEO_CATEGORIES as readonly string[]).includes(category.trim().toLowerCase());
}

/** Most specific first: "paint correction" is detailing, "pool deck pressure washing" is washing. */
const TRADE_RULES: ReadonlyArray<{ trade: HeroVideoTrade; pattern: RegExp; queries: string[] }> = [
  { trade: "auto-detailing", pattern: /auto\s*detail|car\s*detail|\bdetailing\b|car\s*wash|ceramic\s*coat|paint\s*correction|paint\s*protection|window\s*tint/i, queries: ["car detailing polish close up", "car wash foam"] },
  { trade: "pressure-washing", pattern: /pressure\s*wash|power\s*wash|soft\s*wash|exterior\s*(wash|clean)|driveway\s*clean|house\s*wash/i, queries: ["pressure washing", "power washer spray"] },
  { trade: "pool-service", pattern: /\bpools?\b|hot\s*tub|\bspa\s*service/i, queries: ["swimming pool water", "pool water surface"] },
  { trade: "pest-control", pattern: /\bpest|extermin|termite|rodent|mosquito|\bbugs?\b|wildlife\s*removal/i, queries: ["pest control spraying", "sprayer mist"] },
  { trade: "plumbing", pattern: /plumb|drain|sewer|water\s*heater|\bpipes?\b|\bleaks?\b|rooter/i, queries: ["plumbing pipes", "faucet water drip"] },
  { trade: "hvac", pattern: /hvac|heating|air\s*condition|\ba\/?c\b|furnace|heat\s*pump|cooling|ventilat|ductwork/i, queries: ["air conditioner unit", "hvac fan"] },
  { trade: "roofing", pattern: /roof|gutter|shingle/i, queries: ["roof aerial", "roofing shingles"] },
  { trade: "electrical", pattern: /electric|wiring|ev\s*charger|generator|lighting\s*install/i, queries: ["electrical wiring", "electrician tools"] },
  { trade: "painting", pattern: /\bpaint(er|ers|ing)?\b|drywall|stain(ing)?\b/i, queries: ["paint roller wall", "painting wall"] },
  { trade: "landscaping", pattern: /landscap|lawn|garden|\bmow|tree\s*(service|care|trim|removal)|\byards?\b|hardscap|irrigation|\bsod\b|arborist/i, queries: ["lawn mowing", "garden landscaping"] },
  { trade: "cleaning", pattern: /clean|maid|janitor|housekeep|carpet|window\s*wash|sanitiz/i, queries: ["cleaning floor", "cleaning surface"] },
  { trade: "moving", pattern: /\bmoving\b|\bmovers?\b|relocation|junk|hauling|storage\s*units?/i, queries: ["moving boxes", "cardboard boxes"] },
  { trade: "general-contracting", pattern: /contract|construct|remodel|renovat|handyman|builder|carpent|framing|concrete|masonry|deck|fenc/i, queries: ["construction aerial", "carpentry tools"] },
];

/** The trade a business works in, read from its industry / name / services text. */
export function heroVideoTrade(text: string | null | undefined): HeroVideoTrade | null {
  const value = String(text ?? "").trim();
  if (!value) return null;
  return TRADE_RULES.find((rule) => rule.pattern.test(value))?.trade ?? null;
}

/** Pexels Videos API search terms for a trade (only used when PEXELS_API_KEY is set). */
export function heroVideoQueries(trade: HeroVideoTrade): string[] {
  return [...(TRADE_RULES.find((rule) => rule.trade === trade)?.queries ?? [])];
}

export type HeroStockClip = {
  trade: HeroVideoTrade;
  /** Pexels video id. */
  id: string;
  title: string;
  /** The clip's Pexels page (licence + creator). */
  page: string;
  creator: string;
  creatorUrl: string | null;
  /** Desktop rendition (≤1920 wide, ≤ ~10 MB). */
  desktop: string;
  desktopBytes: number;
  /** Phone rendition (540p where available). */
  mobile: string;
  mobileBytes: number;
  /** Poster frame; Pexels' own preview still. The scene's photo is preferred when present. */
  poster?: string;
  /** Loop window in seconds (4–8 s web loop). */
  loopStart: number;
  loopEnd: number;
};

type ClipRow = Omit<HeroStockClip, "trade" | "creatorUrl"> & { trade: HeroVideoTrade | string; creatorUrl: string };

/**
 * Vetted 2026-10-29/30: landscape, no identifiable faces, no brands or logos,
 * licence page checked. Rendition URLs and sizes probed on the Pexels CDN.
 */
const CLIP_ROWS: ClipRow[] = [
  { trade: "plumbing", id: "30615532", title: "Slow Drip Metal Faucet Close-Up", page: "https://www.pexels.com/video/slow-drip-metal-faucet-close-up-30615532/", creator: "Miguel Á. Padriñán", creatorUrl: "https://www.pexels.com/@padrinan/", desktop: "https://videos.pexels.com/video-files/30615532/13106397_1920_1080_30fps.mp4", desktopBytes: 6632745, mobile: "https://videos.pexels.com/video-files/30615532/13106395_960_540_30fps.mp4", mobileBytes: 1210470, loopStart: 0, loopEnd: 8 },
  { trade: "plumbing", id: "9890449", title: "Plumbing Tools and Wrenches on Table", page: "https://www.pexels.com/video/plumbing-tools-and-wrenches-on-table-9890449/", creator: "Alejandro Torres", creatorUrl: "https://www.pexels.com/@alejandro-torres-111616368/", desktop: "https://videos.pexels.com/video-files/9890449/9890449-hd_1920_1080_30fps.mp4", desktopBytes: 4865830, mobile: "https://videos.pexels.com/video-files/9890449/9890449-sd_960_540_30fps.mp4", mobileBytes: 1530477, loopStart: 0, loopEnd: 6.5 },
  { trade: "plumbing", id: "7584762", title: "A Person doing Plumbing", page: "https://www.pexels.com/video/a-person-doing-plumbing-7584762/", creator: "Stepan SK", creatorUrl: "https://www.pexels.com/@stepan-sk-3082908/", desktop: "https://videos.pexels.com/video-files/7584762/7584762-hd_1280_720_25fps.mp4", desktopBytes: 4741624, mobile: "https://videos.pexels.com/video-files/7584762/7584762-sd_960_540_25fps.mp4", mobileBytes: 2655050, loopStart: 0, loopEnd: 8 },
  { trade: "hvac", id: "5684032", title: "A Plant Box on an Outdoor Unit of a Split Type Air Conditioner", page: "https://www.pexels.com/video/a-plant-box-on-an-outdoor-unit-of-a-split-type-air-conditioner-5684032/", creator: "Tima Miroshnichenko", creatorUrl: "https://www.pexels.com/@tima-miroshnichenko/", desktop: "https://videos.pexels.com/video-files/5684032/5684032-hd_1920_1080_25fps.mp4", desktopBytes: 5272326, mobile: "https://videos.pexels.com/video-files/5684032/5684032-sd_960_540_25fps.mp4", mobileBytes: 1528811, loopStart: 0, loopEnd: 8 },
  { trade: "roofing", id: "4198817", title: "Push-in Shot of a Drone on the House Roof", page: "https://www.pexels.com/video/push-in-shot-of-a-drone-on-the-house-roof-4198817/", creator: "K", creatorUrl: "https://www.pexels.com/@kelly/", desktop: "https://videos.pexels.com/video-files/4198817/4198817-hd_1280_720_24fps.mp4", desktopBytes: 9148233, mobile: "https://videos.pexels.com/video-files/4198817/4198817-sd_640_360_24fps.mp4", mobileBytes: 1916552, loopStart: 0, loopEnd: 8 },
  { trade: "roofing", id: "31025088", title: "Aerial View of Construction Workers Building Roof", page: "https://www.pexels.com/video/aerial-view-of-construction-workers-building-roof-31025088/", creator: "K", creatorUrl: "https://www.pexels.com/@kelly/", desktop: "https://videos.pexels.com/video-files/31025088/13261481_1280_720_24fps.mp4", desktopBytes: 8232081, mobile: "https://videos.pexels.com/video-files/31025088/13261477_640_360_24fps.mp4", mobileBytes: 2350308, loopStart: 0, loopEnd: 8 },
  { trade: "pressure-washing", id: "9245565", title: "Close up of Power Sprayers", page: "https://www.pexels.com/video/close-up-of-power-sprayers-9245565/", creator: "cottonbro studio", creatorUrl: "https://www.pexels.com/@cottonbro/", desktop: "https://videos.pexels.com/video-files/9245565/9245565-hd_1366_720_25fps.mp4", desktopBytes: 6853807, mobile: "https://videos.pexels.com/video-files/9245565/9245565-sd_960_506_25fps.mp4", mobileBytes: 3874145, loopStart: 0, loopEnd: 8 },
  { trade: "pressure-washing", id: "4451962", title: "Cleaning The Pool Side", page: "https://www.pexels.com/video/cleaning-the-pool-side-4451962/", creator: "Ahryin", creatorUrl: "https://www.pexels.com/@ahryin-2732648/", desktop: "https://videos.pexels.com/video-files/4451962/4451962-hd_1280_720_30fps.mp4", desktopBytes: 6322549, mobile: "https://videos.pexels.com/video-files/4451962/4451962-sd_960_540_30fps.mp4", mobileBytes: 3608238, loopStart: 0, loopEnd: 7 },
  { trade: "auto-detailing", id: "6159287", title: "Close-Up Video of Polished Car Roof", page: "https://www.pexels.com/video/close-up-video-of-polished-car-roof-6159287/", creator: "Pavel Danilyuk", creatorUrl: "https://www.pexels.com/@pavel-danilyuk/", desktop: "https://videos.pexels.com/video-files/6159287/6159287-hd_1920_1080_30fps.mp4", desktopBytes: 5046118, mobile: "https://videos.pexels.com/video-files/6159287/6159287-sd_960_540_30fps.mp4", mobileBytes: 1493422, loopStart: 0, loopEnd: 8 },
  { trade: "auto-detailing", id: "6873506", title: "Cleaning The Car Headlight", page: "https://www.pexels.com/video/cleaning-the-car-headlight-6873506/", creator: "Tima Miroshnichenko", creatorUrl: "https://www.pexels.com/@tima-miroshnichenko/", desktop: "https://videos.pexels.com/video-files/6873506/6873506-hd_1920_1080_25fps.mp4", desktopBytes: 5268804, mobile: "https://videos.pexels.com/video-files/6873506/6873506-sd_960_540_25fps.mp4", mobileBytes: 1745274, loopStart: 0, loopEnd: 8 },
  { trade: "landscaping", id: "31290564", title: "Lawn Mowing with Electric Mower in Spring", page: "https://www.pexels.com/video/lawn-mowing-with-electric-mower-in-spring-31290564/", creator: "Karl Byron", creatorUrl: "https://www.pexels.com/@karl-byron-568836130/", desktop: "https://videos.pexels.com/video-files/31290564/13360348_1280_720_25fps.mp4", desktopBytes: 8346457, mobile: "https://videos.pexels.com/video-files/31290564/13360346_640_360_25fps.mp4", mobileBytes: 2687543, loopStart: 0, loopEnd: 7 },
  { trade: "electrical", id: "6079420", title: "Person Fixing Electrical Wires", page: "https://www.pexels.com/video/person-fixing-electrical-wires-6079420/", creator: "K", creatorUrl: "https://www.pexels.com/@kelly/", desktop: "https://videos.pexels.com/video-files/6079420/6079420-hd_1920_1080_24fps.mp4", desktopBytes: 5087671, mobile: "https://videos.pexels.com/video-files/6079420/6079420-sd_960_540_24fps.mp4", mobileBytes: 2073672, loopStart: 0, loopEnd: 8 },
  { trade: "electrical", id: "18780266", title: "Technician attendance", page: "https://www.pexels.com/video/technician-attendance-18780266/", creator: "Johnny Chen", creatorUrl: "https://www.pexels.com/@johnny-chen-569702519/", desktop: "https://videos.pexels.com/video-files/18780266/18780266-hd_1920_1080_30fps.mp4", desktopBytes: 6329968, mobile: "https://videos.pexels.com/video-files/18780266/18780266-sd_960_540_30fps.mp4", mobileBytes: 1807393, loopStart: 0, loopEnd: 8 },
  { trade: "painting", id: "6474359", title: "Dirty Paint Roller With Grey Color", page: "https://www.pexels.com/video/dirty-paint-roller-with-grey-color-6474359/", creator: "Tima Miroshnichenko", creatorUrl: "https://www.pexels.com/@tima-miroshnichenko/", desktop: "https://videos.pexels.com/video-files/6474359/6474359-hd_1920_1080_25fps.mp4", desktopBytes: 2496654, mobile: "https://videos.pexels.com/video-files/6474359/6474359-sd_960_540_25fps.mp4", mobileBytes: 753639, loopStart: 0, loopEnd: 8 },
  { trade: "painting", id: "5500748", title: "A Person Using a Roller Paint to Paint the Wall", page: "https://www.pexels.com/video/a-person-using-a-roller-paint-to-paint-the-wall-5500748/", creator: "Anastasia Shuraeva", creatorUrl: "https://www.pexels.com/@anastasia-shuraeva/", desktop: "https://videos.pexels.com/video-files/5500748/5500748-hd_2048_1080_24fps.mp4", desktopBytes: 7186022, mobile: "https://videos.pexels.com/video-files/5500748/5500748-sd_960_506_24fps.mp4", mobileBytes: 1283290, loopStart: 0, loopEnd: 5 },
  { trade: "cleaning", id: "6496242", title: "Person Cleaning the Floor", page: "https://www.pexels.com/video/person-cleaning-the-floor-6496242/", creator: "Gustavo Fring", creatorUrl: "https://www.pexels.com/@gustavo-fring/", desktop: "https://videos.pexels.com/video-files/6496242/6496242-hd_1920_1080_30fps.mp4", desktopBytes: 6089515, mobile: "https://videos.pexels.com/video-files/6496242/6496242-sd_960_540_30fps.mp4", mobileBytes: 1790059, loopStart: 0, loopEnd: 8 },
  { trade: "cleaning", id: "6195938", title: "Woman Wiping a Marble Table", page: "https://www.pexels.com/video/woman-wiping-a-marble-table-6195938/", creator: "Tima Miroshnichenko", creatorUrl: "https://www.pexels.com/@tima-miroshnichenko/", desktop: "https://videos.pexels.com/video-files/6195938/6195938-hd_1920_1080_25fps.mp4", desktopBytes: 8427612, mobile: "https://videos.pexels.com/video-files/6195938/6195938-sd_960_540_25fps.mp4", mobileBytes: 2962538, loopStart: 0, loopEnd: 8 },
  { trade: "pest-control", id: "20776360", title: "fertilizer", page: "https://www.pexels.com/video/fertilizer-20776360/", creator: "Sashanka Sarma", creatorUrl: "https://www.pexels.com/@sashanka-sarma-778114441/", desktop: "https://videos.pexels.com/video-files/20776360/20776360-hd_1280_720_50fps.mp4", desktopBytes: 4511674, mobile: "https://videos.pexels.com/video-files/20776360/20776360-hd_1280_720_50fps.mp4", mobileBytes: 4511674, loopStart: 0, loopEnd: 8 },
  { trade: "pool-service", id: "8686004", title: "Blue Water in the Swimming Pool", page: "https://www.pexels.com/video/blue-water-in-the-swimming-pool-8686004/", creator: "Kindel Media", creatorUrl: "https://www.pexels.com/@kindelmedia/", desktop: "https://videos.pexels.com/video-files/8686004/8686004-hd_1920_1080_30fps.mp4", desktopBytes: 7646027, mobile: "https://videos.pexels.com/video-files/8686004/8686004-sd_960_540_30fps.mp4", mobileBytes: 2663060, loopStart: 0, loopEnd: 8 },
  { trade: "moving", id: "4553292", title: "A room with many boxes stacked on top of each other", page: "https://www.pexels.com/video/a-room-with-many-boxes-stacked-on-top-of-each-other-4553292/", creator: "cottonbro studio", creatorUrl: "https://www.pexels.com/@cottonbro/", desktop: "https://videos.pexels.com/video-files/4553292/4553292-hd_2048_1080_25fps.mp4", desktopBytes: 5202067, mobile: "https://videos.pexels.com/video-files/4553292/4553292-sd_960_506_25fps.mp4", mobileBytes: 1068903, loopStart: 0, loopEnd: 8 },
  { trade: "moving", id: "7463988", title: "Labeled Boxes of Belongings", page: "https://www.pexels.com/video/labeled-boxes-of-belongings-7463988/", creator: "RDNE Stock project", creatorUrl: "https://www.pexels.com/@rdne/", desktop: "https://videos.pexels.com/video-files/7463988/7463988-hd_1920_1080_30fps.mp4", desktopBytes: 5738534, mobile: "https://videos.pexels.com/video-files/7463988/7463988-sd_960_540_30fps.mp4", mobileBytes: 1661209, loopStart: 0, loopEnd: 8 },
];

export const HERO_STOCK_CLIPS: readonly HeroStockClip[] = CLIP_ROWS.map((row) => ({
  ...row,
  trade: row.trade as HeroVideoTrade,
  poster: `https://images.pexels.com/videos/${row.id}/pictures/preview-0.jpg`,
}));

/** "construction" shares the new-build roof clip. */
const TRADE_FALLBACK: Partial<Record<HeroVideoTrade, string[]>> = { "general-contracting": ["31025088"] };

export function heroStockClipsFor(trade: HeroVideoTrade): HeroStockClip[] {
  const own = HERO_STOCK_CLIPS.filter((clip) => clip.trade === trade);
  if (own.length) return own;
  const ids = TRADE_FALLBACK[trade] ?? [];
  return HERO_STOCK_CLIPS.filter((clip) => ids.includes(clip.id)).map((clip) => ({ ...clip, trade }));
}

/** Stable, per-site choice so two sites in one trade rarely share a clip. */
export function pickHeroStockClip(trade: HeroVideoTrade, seed: string, exclude: readonly string[] = []): HeroStockClip | null {
  const clips = heroStockClipsFor(trade).filter((clip) => !exclude.includes(clip.id));
  if (!clips.length) return null;
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return clips[hash % clips.length] ?? null;
}

/** Credit line recorded with the clip (attribution is optional under the Pexels License). */
export function heroVideoCredit(creator: string): string {
  return `Video by ${creator.replace(/\s+/g, " ").trim()} on Pexels`;
}

/** Page slugs that suggest a person is the subject (face risk) or a brand is shown. */
const PEOPLE_OR_BRAND = /\b(man|men|woman|women|person|people|girl|boy|guy|lady|face|portrait|smil\w*|couple|family|kid|child|children|selfie|logo|brand)\b/i;

type PexelsVideoFile = { quality?: unknown; file_type?: unknown; width?: unknown; height?: unknown; link?: unknown; size?: unknown };

/**
 * One Pexels Videos API result → a clip, or null when it is unusable: not a
 * landscape web loop, no suitable renditions, or a slug that suggests people
 * or brands. Only https Pexels CDN links are accepted.
 */
export function normalizePexelsVideo(raw: unknown, trade: HeroVideoTrade): HeroStockClip | null {
  if (!raw || typeof raw !== "object") return null;
  const video = raw as { id?: unknown; width?: unknown; height?: unknown; duration?: unknown; url?: unknown; image?: unknown; user?: { name?: unknown; url?: unknown } | null; video_files?: unknown };
  const id = typeof video.id === "number" || typeof video.id === "string" ? String(video.id) : "";
  const page = typeof video.url === "string" ? video.url : "";
  const width = Number(video.width), height = Number(video.height), duration = Number(video.duration);
  if (!/^\d+$/.test(id) || !/^https:\/\/www\.pexels\.com\/video\//.test(page)) return null;
  if (!(width > height) || !(duration >= 4) || duration > 60) return null;
  if (PEOPLE_OR_BRAND.test(page.replace(/[-/]/g, " "))) return null;
  const files = (Array.isArray(video.video_files) ? video.video_files : []) as PexelsVideoFile[];
  const mp4 = files
    .map((file) => ({ link: typeof file.link === "string" ? file.link : "", width: Number(file.width), height: Number(file.height), type: String(file.file_type ?? ""), size: Number(file.size) || 0 }))
    .filter((file) => file.type === "video/mp4" && /^https:\/\/videos\.pexels\.com\//.test(file.link) && file.width > file.height);
  const desktop = mp4.filter((file) => file.width >= 1280 && file.width <= 1920).sort((a, b) => b.width - a.width)[0];
  const mobile = mp4.filter((file) => file.width >= 640 && file.width <= 1024).sort((a, b) => b.width - a.width)[0] ?? desktop;
  if (!desktop || !mobile) return null;
  const creator = typeof video.user?.name === "string" && video.user.name.trim() ? video.user.name.trim().slice(0, 80) : "a Pexels creator";
  const creatorUrl = typeof video.user?.url === "string" && /^https:\/\/www\.pexels\.com\//.test(video.user.url) ? video.user.url : null;
  const poster = typeof video.image === "string" && /^https:\/\/images\.pexels\.com\//.test(video.image) ? video.image : `https://images.pexels.com/videos/${id}/pictures/preview-0.jpg`;
  return {
    trade, id, title: page.replace(/^.*\/video\//, "").replace(/-\d+\/?$/, "").replace(/-/g, " ").slice(0, 120) || "Pexels video",
    page, creator, creatorUrl, desktop: desktop.link, desktopBytes: desktop.size, mobile: mobile.link, mobileBytes: mobile.size, poster,
    loopStart: 0, loopEnd: Math.min(8, Math.floor(duration * 10) / 10),
  };
}

/** The site's own hero loop, stored in `website_settings.generation.heroVideo`. */
export type HeroVideoPointer = {
  version: 1;
  source: HeroVideoSource;
  provider: "pexels" | "owner" | "ai";
  providerId: string | null;
  /** Storage paths inside the site's own `<orgId>/` folder. */
  src: string;
  mobileSrc: string | null;
  poster: string | null;
  mediaIds: string[];
  credit: string | null;
  sourcePage: string | null;
  license: string | null;
  licenseUrl: string | null;
  loopStart: number;
  loopEnd: number | null;
  setAt: string;
};

/** What the owner turned off: no hero video, and the builder never adds one back. */
export type HeroVideoOff = { version: 1; disabled: true; setAt: string };

const SOURCES: readonly HeroVideoSource[] = ["stock", "owner", "ai_generated"];
const PROVIDERS = ["pexels", "owner", "ai"] as const;

function ownPath(value: unknown, orgId: string): string | null {
  if (typeof value !== "string" || !value || !orgId) return null;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:")) return null;
  return value.startsWith(`${orgId}/`) && !value.includes("..") ? value : null;
}

const text = (value: unknown, max = 300): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const seconds = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 600 ? Math.round(n * 100) / 100 : null;
};

/** Whether the owner switched the hero video off. */
export function heroVideoDisabled(generation: unknown): boolean {
  const raw = generation && typeof generation === "object" ? (generation as Record<string, unknown>)["heroVideo"] : null;
  return Boolean(raw && typeof raw === "object" && (raw as Record<string, unknown>)["disabled"] === true);
}

/**
 * The site's hero loop, or null. Every path must sit in this site's own
 * storage folder, so a pointer can never show another customer's file.
 */
export function readHeroVideo(generation: unknown, orgId: string): HeroVideoPointer | null {
  const raw = generation && typeof generation === "object" ? (generation as Record<string, unknown>)["heroVideo"] : null;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value["disabled"] === true) return null;
  const src = ownPath(value["src"], orgId);
  const source = SOURCES.find((item) => item === value["source"]);
  if (!src || !source) return null;
  const provider = PROVIDERS.find((item) => item === value["provider"]) ?? (source === "stock" ? "pexels" : source === "owner" ? "owner" : "ai");
  const loopStart = seconds(value["loopStart"]) ?? 0;
  const loopEnd = seconds(value["loopEnd"]);
  return {
    version: 1,
    source,
    provider,
    providerId: text(value["providerId"], 40),
    src,
    mobileSrc: ownPath(value["mobileSrc"], orgId),
    poster: ownPath(value["poster"], orgId),
    mediaIds: Array.isArray(value["mediaIds"]) ? value["mediaIds"].filter((id): id is string => typeof id === "string").slice(0, 6) : [],
    credit: text(value["credit"], 160),
    sourcePage: text(value["sourcePage"]),
    license: text(value["license"], 80),
    licenseUrl: text(value["licenseUrl"]),
    loopStart,
    loopEnd: loopEnd != null && loopEnd > loopStart ? loopEnd : null,
    setAt: text(value["setAt"], 40) ?? "",
  };
}

/** What the renderer needs: signed URLs plus the loop window. */
export type HeroVideoMedia = {
  src: string;
  mobileSrc: string | null;
  poster: string | null;
  loopStart: number;
  loopEnd: number | null;
  source: HeroVideoSource;
};

/**
 * The last automatic (post-build) or owner attempt to attach a stock clip,
 * kept at `generation.heroVideoStatus` so the builder can say why a site has
 * no top-of-page video instead of failing silently.
 */
export type HeroVideoStatus = {
  status: "added" | "exists" | "disabled" | "no_trade" | "no_clip" | "failed";
  message: string;
  at: string;
  trigger: "build" | "owner";
};

const STATUS_VALUES = new Set(["added", "exists", "disabled", "no_trade", "no_clip", "failed"]);

export function readHeroVideoStatus(generation: unknown): HeroVideoStatus | null {
  if (!generation || typeof generation !== "object") return null;
  const raw = (generation as Record<string, unknown>)["heroVideoStatus"];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value["status"] !== "string" || !STATUS_VALUES.has(value["status"])) return null;
  return {
    status: value["status"] as HeroVideoStatus["status"],
    message: typeof value["message"] === "string" ? value["message"].slice(0, 300) : "",
    at: typeof value["at"] === "string" ? value["at"] : "",
    trigger: value["trigger"] === "owner" ? "owner" : "build",
  };
}

/**
 * Where the home page's top section can play the loop: over a full-screen
 * scene's photo, in place of its first picture, or nowhere (no picture at
 * all), checked in the order the renderer meets media.
 */
export function heroVideoSlot(tree: unknown): "scene" | "picture" | "none" {
  const root = tree && typeof tree === "object" ? (tree as { root?: unknown }).root : null;
  const walk = (node: unknown): "scene" | "picture" | null => {
    if (!node || typeof node !== "object") return null;
    const n = node as { type?: unknown; children?: unknown };
    const children = Array.isArray(n.children) ? n.children : [];
    if (n.type === "scene") return (children[0] as { type?: unknown } | undefined)?.type === "media" ? "scene" : null;
    if (n.type === "media") return "picture";
    for (const child of children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(root) ?? "none";
}
