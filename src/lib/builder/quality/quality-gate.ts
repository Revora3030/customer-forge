/**
 * QP-5 · The automatic gate every draft passes before a customer sees it.
 *
 * Five check families, all pure and offline:
 *  - facts:      no phone, email, price, rating, review count, years or award that is not in the intake
 *  - lint:       the anti-AI-look rules (filler phrasing, em dashes, emoji, banned display fonts, glow orbs, ...)
 *  - assets:     broken or placeholder images, missing alt text, dead or malformed links
 *  - perf:       a static budget (image weight and count, script count, font count)
 *  - structure:  mobile-first structural checks (viewport, fixed wide widths, unsized images)
 *
 * `runQualityGate` re-runs only the parts that failed, at most `maxRetries` times, and reports every failure so
 * the learning loop can store it. It never edits a draft itself: regeneration is injected.
 */
import { detectGenericPhrases } from "@/lib/builder/genericity";
import { type IntakeFacts, findInventedFacts } from "@/lib/builder/quality/facts-guard";

export type GateCheck = "facts" | "lint" | "assets" | "perf" | "structure";
export type GateSeverity = "block" | "warn";

export type GateFailure = {
  check: GateCheck;
  /** The section or part that failed. `null` means the whole draft, which cannot be regenerated part by part. */
  partId: string | null;
  severity: GateSeverity;
  code: string;
  message: string;
};

export type DraftImage = { src: string; alt?: string | null; bytes?: number | null; width?: number | null; height?: number | null; aspect?: string | null };

export type DraftPart = {
  id: string;
  kind: string;
  /** Every visible string in the part. */
  texts: string[];
  images: DraftImage[];
  /** Every href the part carries. */
  links: string[];
  /** Raw style or CSS text for the part, when known. */
  css?: string;
  /** Font families the part asks for. */
  fonts?: string[];
};

export type DraftSnapshot = {
  parts: DraftPart[];
  /** Page-level facts. Unknown stays `undefined` and is not checked. */
  hasViewportMeta?: boolean;
  scriptCount?: number;
  fontFiles?: number;
  /** Internal paths that exist, for dead-link detection. Omit to skip that check. */
  knownPaths?: readonly string[];
};

export type PerfBudget = { maxTotalImageBytes: number; maxImageBytes: number; maxImages: number; maxScripts: number; maxFontFamilies: number; maxFontFiles: number };

export const DEFAULT_PERF_BUDGET: PerfBudget = {
  maxTotalImageBytes: 4_000_000,
  maxImageBytes: 500_000,
  maxImages: 40,
  maxScripts: 6,
  maxFontFamilies: 2,
  maxFontFiles: 4,
};

// ---------------------------------------------------------------------------------------------- lint

/** Phrases the anti-AI-look check bans from visible copy. Complements the builder's own stock-phrase list. */
const AI_PHRASES: readonly RegExp[] = [
  /\belevate\b/i, /\bseamless(?:ly)?\b/i, /\bunlock\b/i, /\bunleash\b/i, /\bgame[- ]?changer\b/i, /\bcutting[- ]edge\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i, /\bin today'?s fast[- ]paced\b/i, /\bit'?s not (?:just )?[^.]{1,40}, it'?s\b/i,
  /\bdelve\b/i, /\btapestry\b/i, /\bwelcome to our website\b/i,
];
const EM_DASH = /\u2014/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2728}]/u;
const BANNED_DISPLAY_FONTS: readonly string[] = ["inter", "geist", "space grotesk"];
const GLOW_ORB = (css: string) => /radial-gradient/i.test(css) && /filter\s*:\s*blur\(/i.test(css);

const norm = (font: string) => font.replace(/["']/g, "").trim().toLowerCase();

function lintPart(part: DraftPart): GateFailure[] {
  const out: GateFailure[] = [];
  const fail = (code: string, message: string, severity: GateSeverity = "block") => out.push({ check: "lint", partId: part.id, severity, code, message });
  const text = part.texts.join("\n");
  const phrase = AI_PHRASES.find((re) => re.test(text));
  if (phrase) fail("ai-phrasing", `filler phrasing: "${text.match(phrase)?.[0]}"`);
  if (EM_DASH.test(text)) fail("em-dash", "em dash in visible copy", "warn");
  if (EMOJI.test(text)) fail("emoji", "emoji in visible copy");
  const generic = detectGenericPhrases(part.texts);
  if (generic.length) fail("stock-phrase", `stock phrasing: ${generic.map((h) => h.phrase).join(", ")}`, "warn");
  for (const font of part.fonts ?? []) if (BANNED_DISPLAY_FONTS.includes(norm(font))) fail("banned-font", `display font "${font}" is the default look`, "warn");
  if (part.css && GLOW_ORB(part.css)) fail("glow-orb", "decorative glow orb background", "warn");
  return out;
}

// ---------------------------------------------------------------------------------------------- assets

const PLACEHOLDER_IMAGE = /(?:placehold|placeholder|dummyimage|lorempixel|picsum\.photos|via\.placeholder|example\.(?:com|org)|your-?image|image-?here)/i;

function assetPart(part: DraftPart, knownPaths: readonly string[] | undefined): GateFailure[] {
  const out: GateFailure[] = [];
  const fail = (code: string, message: string, severity: GateSeverity = "block") => out.push({ check: "assets", partId: part.id, severity, code, message });
  for (const img of part.images) {
    const src = (img.src ?? "").trim();
    if (!src) fail("image-empty", "image with no source");
    else if (PLACEHOLDER_IMAGE.test(src)) fail("image-placeholder", `placeholder image: ${src.slice(0, 80)}`);
    else if (/^http:\/\//i.test(src)) fail("image-insecure", `image over http: ${src.slice(0, 80)}`, "warn");
    if (img.alt == null || !String(img.alt).trim()) fail("image-alt", "image without alt text", "warn");
  }
  for (const raw of part.links) {
    const href = (raw ?? "").trim();
    if (!href || href === "#") fail("link-empty", "link with no destination");
    else if (/^javascript:/i.test(href)) fail("link-script", "javascript: link");
    else if (/^tel:/i.test(href) && href.replace(/\D/g, "").length < 7) fail("link-tel", `malformed phone link: ${href}`);
    else if (/^mailto:/i.test(href) && !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/i.test(href)) fail("link-mailto", `malformed email link: ${href}`);
    else if (knownPaths && href.startsWith("/") && !href.startsWith("//")) {
      const path = href.split(/[?#]/)[0] || "/";
      if (!knownPaths.includes(path)) fail("link-dead", `link to a page that does not exist: ${path}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- perf

function perfChecks(draft: DraftSnapshot, budget: PerfBudget): GateFailure[] {
  const out: GateFailure[] = [];
  const fail = (partId: string | null, code: string, message: string, severity: GateSeverity = "block") => out.push({ check: "perf", partId, severity, code, message });
  const images = draft.parts.flatMap((p) => p.images.map((i) => ({ id: p.id, ...i })));
  if (images.length > budget.maxImages) fail(null, "image-count", `${images.length} images, budget ${budget.maxImages}`, "warn");
  let total = 0;
  for (const img of images) {
    if (typeof img.bytes !== "number") continue;
    total += img.bytes;
    if (img.bytes > budget.maxImageBytes) fail(img.id, "image-weight", `one image is ${Math.round(img.bytes / 1000)} KB, budget ${Math.round(budget.maxImageBytes / 1000)} KB`);
  }
  if (total > budget.maxTotalImageBytes) fail(null, "image-total", `images total ${(total / 1e6).toFixed(1)} MB, budget ${(budget.maxTotalImageBytes / 1e6).toFixed(1)} MB`);
  if (typeof draft.scriptCount === "number" && draft.scriptCount > budget.maxScripts) fail(null, "script-count", `${draft.scriptCount} scripts, budget ${budget.maxScripts}`);
  const families = new Set(draft.parts.flatMap((p) => p.fonts ?? []).map(norm).filter(Boolean));
  if (families.size > budget.maxFontFamilies) fail(null, "font-families", `${families.size} font families, budget ${budget.maxFontFamilies}`);
  if (typeof draft.fontFiles === "number" && draft.fontFiles > budget.maxFontFiles) fail(null, "font-files", `${draft.fontFiles} font files, budget ${budget.maxFontFiles}`, "warn");
  return out;
}

// ---------------------------------------------------------------------------------------------- structure

const FIXED_WIDE = /(?:^|[;{\s])(?:min-)?width\s*:\s*(\d{3,5})px/gi;

function structurePart(part: DraftPart): GateFailure[] {
  const out: GateFailure[] = [];
  const fail = (code: string, message: string, severity: GateSeverity = "block") => out.push({ check: "structure", partId: part.id, severity, code, message });
  if (part.css) {
    for (const m of part.css.matchAll(FIXED_WIDE)) {
      if (Number(m[1]) > 480) { fail("fixed-width", `fixed ${m[1]}px width overflows a phone`); break; }
    }
    if (/white-space\s*:\s*nowrap/i.test(part.css) && /overflow-x\s*:\s*visible/i.test(part.css)) fail("nowrap-overflow", "no-wrap text can run off a small screen", "warn");
  }
  const unsized = part.images.filter((i) => !i.aspect && !(i.width && i.height)).length;
  if (unsized > 0) fail("image-unsized", `${unsized} image(s) with no size or aspect ratio, the page will jump while loading`, "warn");
  return out;
}

// ---------------------------------------------------------------------------------------------- evaluate

export type GateOptions = { perf?: Partial<PerfBudget> };

/** Runs every check once. Pure. */
export function evaluateGate(draft: DraftSnapshot, intake: IntakeFacts, options: GateOptions = {}): GateFailure[] {
  const out: GateFailure[] = [];
  const budget = { ...DEFAULT_PERF_BUDGET, ...options.perf };
  const invented = findInventedFacts(draft.parts.map((p) => ({ id: p.id, text: p.texts.join("\n") })), intake);
  for (const v of invented) out.push({ check: "facts", partId: v.partId, severity: "block", code: v.kind, message: v.detail });
  for (const part of draft.parts) {
    out.push(...lintPart(part), ...assetPart(part, draft.knownPaths), ...structurePart(part));
  }
  out.push(...perfChecks(draft, budget));
  if (draft.hasViewportMeta === false) out.push({ check: "structure", partId: null, severity: "block", code: "viewport-meta", message: "no mobile viewport meta tag" });
  return out;
}

export const blocking = (failures: readonly GateFailure[]) => failures.filter((f) => f.severity === "block");

// ---------------------------------------------------------------------------------------------- run with retries

export type RegenerateFn = (partIds: readonly string[], failures: readonly GateFailure[]) => Promise<DraftSnapshot>;

export type GateAttempt = { attempt: number; failures: GateFailure[]; regenerated: string[] };

export type GateOutcome = {
  passed: boolean;
  attempts: GateAttempt[];
  /** Failures left after the last attempt. */
  remaining: GateFailure[];
  /** Blocking failures that belong to the whole draft, which part-level retries cannot fix. */
  needsHuman: GateFailure[];
  draft: DraftSnapshot;
};

export const DEFAULT_MAX_RETRIES = 2;

/**
 * Evaluates the draft; on blocking failures regenerates ONLY the failed parts and tries again, up to `maxRetries`
 * times. Every attempt's failures are returned (and passed to `record`) for the learning loop. A draft that still
 * has a blocking failure after the cap is not passed.
 */
export async function runQualityGate(
  initial: DraftSnapshot,
  intake: IntakeFacts,
  regenerate: RegenerateFn,
  options: GateOptions & { maxRetries?: number; record?: (attempt: GateAttempt) => void | Promise<void> } = {},
): Promise<GateOutcome> {
  const cap = Math.max(0, Math.min(options.maxRetries ?? DEFAULT_MAX_RETRIES, 5));
  let draft = initial;
  const attempts: GateAttempt[] = [];
  for (let attempt = 0; attempt <= cap; attempt += 1) {
    const failures = evaluateGate(draft, intake, options);
    const blockers = blocking(failures);
    const failedParts = [...new Set(blockers.map((f) => f.partId).filter((id): id is string => id !== null))];
    const wholeDraft = blockers.filter((f) => f.partId === null);
    const willRetry = failedParts.length > 0 && attempt < cap;
    const record: GateAttempt = { attempt, failures, regenerated: willRetry ? failedParts : [] };
    attempts.push(record);
    await options.record?.(record);
    if (blockers.length === 0) return { passed: true, attempts, remaining: failures, needsHuman: [], draft };
    if (!willRetry) return { passed: false, attempts, remaining: failures, needsHuman: wholeDraft, draft };
    const next = await regenerate(failedParts, blockers.filter((f) => f.partId !== null));
    // Keep every part that passed exactly as it was. Only the failed ones are replaced.
    const replaced = new Map(next.parts.map((p) => [p.id, p]));
    draft = { ...next, parts: draft.parts.map((p) => (failedParts.includes(p.id) ? replaced.get(p.id) ?? p : p)) };
  }
  return { passed: false, attempts, remaining: [], needsHuman: [], draft };
}
