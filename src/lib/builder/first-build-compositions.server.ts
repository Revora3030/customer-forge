/**
 * FIRST-BUILD COMPOSITIONS.
 *
 * After the pages and sections exist, Sol designs every content section from
 * scratch as an open composition tree. Built-in section layouts are never used
 * for a new site: the section's own words, pictures and links are only the
 * material Sol composes with.
 *
 * Working parts that must keep running (forms, booking, embeds, post lists and
 * the sticky mobile action) stay as they are. Every tree passes the safety
 * validator and the fact check; an invalid tree gets one repair attempt, and a
 * section still without a valid AI layout stops the build — there is no
 * substitute design.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { screenText } from "@/lib/builder/collective-copy";
import {
  COMPOSITION_PRIMITIVES, PRIMITIVE_GUIDE,
  isSafeHref,
  validateComposition,
  writeComposition,
  type CompositionIssue,
  type CompositionTree,
} from "@/lib/builder/composition-tree";
import type { DnaFacts } from "@/lib/business-dna";

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Sections whose job is a working feature, not a layout. */
export const FUNCTIONAL_SECTION_KINDS = new Set([
  "quote", "booking", "contact", "sticky_cta", "embed", "post_list", "composition",
]);

type SectionRow = {
  id: string;
  page_id: string;
  kind: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  settings: unknown;
};
type ComponentRow = {
  section_id: string;
  kind: string;
  label: string | null;
  body: string | null;
  media_url: string | null;
  link_url: string | null;
  link_label: string | null;
};

export type CompositionPassResult = {
  composed: number;
  kept: number;
  models: string[];
  costMicrocents: number;
};

const RULES = [
  "You are Sol, the lead art director of a world-class web studio.",
  `Design each section from scratch as a composition tree built only from these primitives: ${COMPOSITION_PRIMITIVES.join(", ")}.`,
  PRIMITIVE_GUIDE,
  "Node shape: {type, text?, href?, src?, alt?, level?, items?, style?, responsive?: {mobile?, tablet?, desktop?}, motion?: {kind: none|fade|rise|scale|float, delayMs?}, children?}.",
  "style keys: columns, gap, padding, paddingX, paddingY, maxWidth, align, justify, items, span, size, weight, lineHeight, letterSpacing, italic, uppercase, font, color, background, gradientTo, gradientAngle, radius, borderWidth, borderColor, shadow, opacity, aspect, minHeight, hidden. Colours are #RRGGBB.",
  "Use ONLY the words, pictures and links supplied for the section — you may restructure, never invent facts, prices, reviews, awards or results.",
  "Text on a background needs contrast of at least 4.5. Buttons need an href. Images need alt text. Collapse to one column on mobile.",
  "Make each section distinct and premium, consistent with the site's look.",
].join(" ");

function materialFor(section: SectionRow, parts: ComponentRow[]) {
  return {
    sectionId: section.id,
    role: section.kind,
    heading: section.heading,
    subheading: section.subheading,
    body: section.body,
    parts: parts.map((part) => ({
      kind: part.kind,
      label: part.label,
      body: part.body,
      image: part.media_url && isSafeHref(part.media_url) ? part.media_url : null,
      href: part.link_url && isSafeHref(part.link_url) ? part.link_url : null,
      linkLabel: part.link_label,
    })),
  };
}

function parseTrees(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { sections?: unknown };
    return parsed.sections && typeof parsed.sections === "object" && !Array.isArray(parsed.sections)
      ? (parsed.sections as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function composeFirstBuildSections(input: {
  db: Db;
  organizationId: string;
  facts: DnaFacts;
  lookSummary: string;
}): Promise<CompositionPassResult> {
  const { db, organizationId, facts } = input;
  const [{ data: sections, error }, { data: components }] = await Promise.all([
    db.from("website_sections").select("id,page_id,kind,heading,subheading,body,settings").eq("organization_id", organizationId).order("sort_order"),
    db.from("website_components").select("section_id,kind,label,body,media_url,link_url,link_label").eq("organization_id", organizationId).order("sort_order"),
  ]);
  if (error) throw new Error(error.message);
  const rows = (sections ?? []) as SectionRow[];
  const parts = (components ?? []) as ComponentRow[];
  // Prices already written on the owner's own site are supplied facts.
  const materialText = [
    ...rows.map((r) => [r.heading, r.subheading, r.body].join(" ")),
    ...parts.map((c) => [c.label, c.body, c.link_label].join(" ")),
  ].join(" ");
  const screenFacts = /[$€£]\s?\d/.test(materialText) ? { ...facts, hasPrices: true } : facts;
  const screen = (text: string) => {
    const problem = screenText(text, screenFacts, 4000);
    return problem && problem !== "empty" ? problem : null;
  };

  const byPage = new Map<string, SectionRow[]>();
  for (const row of rows) {
    if (FUNCTIONAL_SECTION_KINDS.has(row.kind)) continue;
    byPage.set(row.page_id, [...(byPage.get(row.page_id) ?? []), row]);
  }

  const result: CompositionPassResult = { composed: 0, kept: rows.length, models: [], costMicrocents: 0 };
  for (const pageSections of byPage.values()) {
    let pending = pageSections;
    let feedback: Record<string, CompositionIssue[]> = {};
    for (let attempt = 0; attempt < 2 && pending.length; attempt += 1) {
      const call = await callBestThinker({
        json: true,
        purpose: "creative_direction",
        complexity: "high",
        organizationId,
        maxOutputTokens: 16000,
        system: RULES,
        user: [
          "SITE LOOK (follow it):",
          input.lookSummary,
          "",
          "SECTIONS TO DESIGN (material only):",
          JSON.stringify(pending.map((s) => materialFor(s, parts.filter((p) => p.section_id === s.id))), null, 2),
          ...(Object.keys(feedback).length ? ["", "FIX THESE PROBLEMS FROM YOUR LAST ATTEMPT:", JSON.stringify(feedback, null, 2)] : []),
          "",
          'Return JSON: {"sections": {"<sectionId>": {"version": 1, "label": "...", "root": {...}}}} with one tree per section.',
        ].join("\n"),
      });
      if (!call.ok) throw new Error(`The design team could not lay out this website's sections (${call.detail ?? call.reason}). Nothing was published.`);
      if (call.model) result.models.push(call.model);
      result.costMicrocents += call.costMicrocents ?? 0;
      const trees = parseTrees(call.text) ?? {};
      const next: SectionRow[] = [];
      feedback = {};
      for (const section of pending) {
        const checked = validateComposition(trees[section.id], { screenText: screen });
        if (!checked.ok) {
          feedback[section.id] = checked.issues.slice(0, 12);
          next.push(section);
          continue;
        }
        await saveTree(db, organizationId, section, checked.tree);
        result.composed += 1;
        result.kept -= 1;
      }
      pending = next;
    }
    if (pending.length)
      throw new Error(
        `The design team could not produce a safe layout for ${pending.length} section(s), so nothing was published. Please try again in a moment.`,
        { cause: feedback },
      );
  }
  return result;
}

async function saveTree(db: Db, organizationId: string, section: SectionRow, tree: CompositionTree) {
  const settings = writeComposition(section.settings, tree);
  const { error } = await db
    .from("website_sections")
    .update({ kind: "composition", settings } as never)
    .eq("id", section.id)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}
