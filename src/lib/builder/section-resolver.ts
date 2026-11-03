/**
 * REVORA BUILDER — SEMANTIC SECTION RESOLUTION (fail-safe targeting).
 *
 * A plan names the section each step changes by id. Between planning and
 * applying, that id can stop matching: the planner read a cached copy of the
 * site, a rebuild re-created the sections under new ids, or the model wrote a
 * descriptive name ("hero") instead of the real id. Before this module the
 * step was reported stale and, when every step was affected, the whole bundle
 * was rejected — the owner saw "nothing changed" for a perfectly clear edit.
 *
 * `resolveSectionTarget` finds the section a step meant, in a fixed order:
 *
 *   1. exact id (including the existing one-real-id near-miss repair);
 *   2. section role/type — the hinted kind, when exactly one live section has it;
 *   3. heading text similarity — a clear winner over the runner-up;
 *   4. nearest position on the same page — only when the page layout still
 *      lines up with what the planner saw.
 *
 * It never guesses. Anything below the confidence bar returns `null` with a
 * reason so the caller skips that one step and tells the owner why; editing
 * the wrong section is worse than not editing at all.
 *
 * Hints come from the plan itself: the plan step carries a `targetHint`
 * (kind, heading, page, position) recorded from the site the planner saw, and
 * a non-id `sectionId` such as "hero-section" is read as a kind when it names
 * one of the site's real section kinds. Pure: no network, no database.
 */

import { isStableId, repairId } from "./apply-plan";

/** What the planner saw about the section a step targets. */
export type SectionTargetHint = {
  kind?: string | null;
  heading?: string | null;
  pageId?: string | null;
  pageSlug?: string | null;
  /** 0-based index of the section on its page, in display order. */
  position?: number | null;
  /** How many sections that page had when the plan was made. */
  pageSectionCount?: number | null;
  /** How many sections of the hinted kind that page had when the plan was made. */
  kindCount?: number | null;
};

/** The live site, reduced to what resolution needs. */
export type ResolverSite = {
  pages: { id: string; slug: string }[];
  sections: { id: string; pageId: string; kind: string; heading: string | null; sortOrder: number }[];
};

export type ResolveStrategy = "exact" | "role" | "headline" | "position";

export type SectionResolution =
  | { id: string; strategy: ResolveStrategy; detail: string }
  | { id: null; strategy: null; reason: string };

/** Minimum heading similarity for a match, and the lead it needs over the runner-up. */
export const HEADLINE_MIN_SCORE = 0.6;
export const HEADLINE_MIN_LEAD = 0.2;
/** When the hinted kind no longer exists on the page, a heading must match this closely. */
export const HEADLINE_STRICT_SCORE = 0.8;

const TEMP_REF = /^temp_/i;
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "our", "your", "we", "us", "at", "by", "is"]);
const ID_NOISE = new Set(["section", "sec", "block", "id", "the", "main", "page", "area"]);

const words = (value: string): string[] =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Dice similarity over meaningful words; 1 for identical normalised text. */
export function headingSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return 0;
  if (wa.join(" ") === wb.join(" ")) return 1;
  const sa = new Set(wa.filter((w) => !STOP.has(w)));
  const sb = new Set(wb.filter((w) => !STOP.has(w)));
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared += 1;
  return (2 * shared) / (sa.size + sb.size);
}

/**
 * Reads a descriptive non-id ("hero", "faq-section", "services_block_2") as a
 * section kind, but only when it names a kind the live site really has.
 */
export function kindFromId(value: string, liveKinds: ReadonlySet<string>): string | null {
  if (!value || isStableId(value) || TEMP_REF.test(value)) return null;
  const tokens = words(value).filter((w) => !ID_NOISE.has(w) && !/^\d+$/.test(w));
  if (!tokens.length) return null;
  const joined = tokens.join("_");
  if (liveKinds.has(joined)) return joined;
  const single = tokens.filter((token) => liveKinds.has(token));
  return single.length === 1 ? single[0]! : null;
}

const cleanHint = (hint: unknown): SectionTargetHint => {
  if (!hint || typeof hint !== "object" || Array.isArray(hint)) return {};
  const row = hint as Record<string, unknown>;
  const str = (key: string) => (typeof row[key] === "string" && (row[key] as string).trim() ? (row[key] as string).trim().slice(0, 300) : null);
  const num = (key: string) => (typeof row[key] === "number" && Number.isFinite(row[key]) && (row[key] as number) >= 0 ? Math.floor(row[key] as number) : null);
  return {
    kind: str("kind"),
    heading: str("heading"),
    pageId: str("pageId"),
    pageSlug: str("pageSlug"),
    position: num("position"),
    pageSectionCount: num("pageSectionCount"),
    kindCount: num("kindCount"),
  };
};

const normSlug = (slug: string) => slug.replace(/^\/+|\/+$/g, "").toLowerCase();

/** Resolves one section id against the live site. See the module comment for the order. */
export function resolveSectionTarget(id: string, rawHint: unknown, site: ResolverSite): SectionResolution {
  const live = new Set(site.sections.map((section) => section.id));
  if (id && live.has(id)) return { id, strategy: "exact", detail: "id matched" };
  const repaired = id ? repairId(id, live) : id;
  if (repaired && repaired !== id && live.has(repaired)) return { id: repaired, strategy: "exact", detail: "near-miss id repaired" };

  const hint = cleanHint(rawHint);
  const liveKinds = new Set(site.sections.map((section) => section.kind));
  const kind = hint.kind || kindFromId(id, liveKinds);

  const page =
    (hint.pageId && site.pages.find((p) => p.id === hint.pageId)) ||
    (hint.pageSlug != null && site.pages.find((p) => normSlug(p.slug) === normSlug(hint.pageSlug!))) ||
    null;

  // The step names a page that no longer exists (by id or slug): its section
  // went with it. Never fall back to a site-wide search, which could land the
  // edit on another page's section of the same kind.
  if ((hint.pageId || hint.pageSlug != null) && !page)
    return { id: null, strategy: null, reason: "the page that section was on is no longer on the site" };

  const ordered = (pageId: string) =>
    site.sections.filter((s) => s.pageId === pageId).sort((a, b) => a.sortOrder - b.sortOrder);
  const scope = page ? ordered(page.id) : site.sections;

  if (!kind && !hint.heading && hint.position == null)
    return { id: null, strategy: null, reason: "no matching section and nothing to identify it by" };

  // 2. Role/type.
  let pool = scope;
  let kindMissing = false;
  let kindShrunk = false;
  if (kind) {
    const byRole = scope.filter((s) => s.kind === kind);
    // A lone section of the kind only identifies the target when the kind was
    // unique when the plan was made too; if there were several and only one
    // is left, the meant one may be the one that was removed, so the heading
    // has to confirm it instead.
    const wasUnique = hint.kindCount == null || hint.kindCount <= 1;
    if (byRole.length === 1 && wasUnique) return { id: byRole[0]!.id, strategy: "role", detail: `only ${kind} section${page ? " on the page" : ""}` };
    if (byRole.length >= 1) {
      pool = byRole;
      kindShrunk = byRole.length === 1;
    } else kindMissing = true;
  }

  // 3. Heading similarity.
  if (hint.heading) {
    const scored = pool
      .map((s) => ({ s, score: s.heading ? headingSimilarity(hint.heading!, s.heading) : 0 }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1]?.score ?? 0;
    const bar = kindMissing ? HEADLINE_STRICT_SCORE : HEADLINE_MIN_SCORE;
    if (best && best.score >= bar && best.score - second >= HEADLINE_MIN_LEAD)
      return { id: best.s.id, strategy: "headline", detail: `heading ${Math.round(best.score * 100)}% similar` };
  }

  // 4. Nearest position on the same page. Never across a kind contradiction.
  let layoutChanged = false;
  if (page && hint.position != null && !kindMissing && !kindShrunk) {
    const onPage = ordered(page.id);
    const indexOf = new Map(onPage.map((s, index) => [s.id, index]));
    const narrowed = pool !== scope; // role already narrowed to several of the same kind
    const layoutSame = hint.pageSectionCount != null && hint.pageSectionCount === onPage.length;
    const maxDistance = narrowed ? 1 : layoutSame ? 0 : -1;
    layoutChanged = maxDistance < 0;
    if (maxDistance >= 0) {
      const ranked = pool
        .map((s) => ({ s, distance: Math.abs((indexOf.get(s.id) ?? Infinity) - hint.position!) }))
        .sort((a, b) => a.distance - b.distance);
      const best = ranked[0];
      const tie = ranked[1] && ranked[1].distance === best?.distance;
      if (best && best.distance <= maxDistance && !tie)
        return { id: best.s.id, strategy: "position", detail: `section ${best.distance === 0 ? "at" : "next to"} position ${hint.position + 1}` };
    }
  }

  const why = kindMissing
    ? `no ${kind} section is on the ${page ? "page" : "site"} any more`
    : kindShrunk
      ? `the page had several ${kind} sections and only one is left, and its heading doesn't confirm it's the one meant`
    : layoutChanged
      ? "the page's layout changed since the plan, so its position alone isn't safe to go by"
      : pool.length > 1
      ? `${pool.length} sections could match and none stood out`
      : "no section matched closely enough";
  return { id: null, strategy: null, reason: why };
}

/* ------------------------------ whole batches ----------------------------- */

export type ResolvedTarget = { index: number; type: string; from: string; to: string; strategy: ResolveStrategy; detail: string };
export type SkippedTarget = { index: number; type: string; target: string; reason: string };

/** Fields on a plan step that name one existing section. */
function sectionField(row: Record<string, unknown>): "sectionId" | "targetId" | null {
  if (row["type"] === "set_block_style") return row["target"] === "section" ? "targetId" : null;
  // add_section's own `ref` is not a target; reorder lists are matched exactly.
  if (row["type"] === "reorder_sections" || row["type"] === "add_section") return null;
  return typeof row["sectionId"] === "string" ? "sectionId" : null;
}

/**
 * Resolves every section target in a raw plan (model or client JSON, before
 * it is parsed into actions). Steps whose target is found get the live id;
 * steps that cannot be resolved with confidence are removed and reported;
 * temporary refs and anything that is not a section target pass through
 * untouched. Only steps that changed, or were skipped, are reported.
 */
export function resolvePlanTargets(
  raw: unknown,
  site: ResolverSite,
): { actions: unknown; resolved: ResolvedTarget[]; skipped: SkippedTarget[] } {
  if (!Array.isArray(raw)) return { actions: raw, resolved: [], skipped: [] };
  const createdRefs = new Set<string>();
  for (const row of raw) {
    const ref = row && typeof row === "object" ? (row as Record<string, unknown>)["ref"] : null;
    if (typeof ref === "string" && ref) createdRefs.add(ref);
  }
  const live = new Set(site.sections.map((section) => section.id));
  const resolved: ResolvedTarget[] = [];
  const skipped: SkippedTarget[] = [];
  const out: unknown[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      out.push(item);
      return;
    }
    const row = item as Record<string, unknown>;
    const field = sectionField(row);
    const target = field ? row[field] : null;
    if (!field || typeof target !== "string" || !target || live.has(target) || TEMP_REF.test(target) || createdRefs.has(target)) {
      out.push(item);
      return;
    }
    const type = typeof row["type"] === "string" ? row["type"] : "unknown";
    const result = resolveSectionTarget(target, row["targetHint"], site);
    if (result.strategy !== null) {
      resolved.push({ index, type, from: target, to: result.id, strategy: result.strategy, detail: result.detail });
      out.push({ ...row, [field]: result.id });
    } else {
      skipped.push({ index, type, target, reason: result.reason });
    }
  });
  return { actions: out, resolved, skipped };
}

/** Builds the hint a plan step carries so apply can re-find its section later. */
export function hintForSection(sectionId: string, site: ResolverSite): SectionTargetHint | null {
  const section = site.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  const onPage = site.sections.filter((s) => s.pageId === section.pageId).sort((a, b) => a.sortOrder - b.sortOrder);
  const page = site.pages.find((p) => p.id === section.pageId);
  return {
    kind: section.kind,
    heading: section.heading ? section.heading.slice(0, 200) : null,
    pageId: section.pageId,
    pageSlug: page?.slug ?? null,
    position: onPage.findIndex((s) => s.id === section.id),
    pageSectionCount: onPage.length,
    kindCount: onPage.filter((s) => s.kind === section.kind).length,
  };
}

/** The section id a parsed action targets, when it targets exactly one. */
export function sectionTargetOf(action: Record<string, unknown>): string | null {
  const field = sectionField(action);
  const value = field ? action[field] : null;
  return typeof value === "string" && value ? value : null;
}

/** One line per outcome for the apply diagnostics and the server log. */
export function resolutionLines(resolved: ResolvedTarget[], skipped: SkippedTarget[]): string[] {
  return [
    ...resolved
      .filter((entry) => entry.strategy !== "exact" || entry.from !== entry.to)
      .map((entry) => `resolved ${entry.type} target by ${entry.strategy} (${entry.detail})`),
    ...skipped.map((entry) => `stale ${entry.type} (low_confidence_section): ${entry.reason}`),
  ];
}
