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
import { runAdvisoryPanel, runReviewPanel } from "@/lib/builder/review-panel.server";
import { NO_EVIDENCE, gatherReviewEvidence, type ReviewEvidence } from "@/lib/builder/review-evidence.server";
import { runImprovementGate, type GateReport } from "@/lib/builder/improvement-gate.server";

const IMPROVEMENT_ROUNDS = 2;

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
  id: string;
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
  /** One entry per improvement round: whether the team's revision beat the prior version. */
  gateReports: GateReport[];
};

const RULES = [
  "You are Sol, the lead art director of a world-class web studio.",
  `Design each section from scratch as a composition tree built only from these primitives: ${COMPOSITION_PRIMITIVES.join(", ")}.`,
  PRIMITIVE_GUIDE,
  "Node shape: {type, text?, href?, src?, mediaRef?, alt?, level?, items?, style?, responsive?: {mobile?, tablet?, desktop?}, motion?: {kind: none|fade|rise|scale|float|slide-left|slide-right|blur|reveal, delayMs?, durationMs?}, children?}.",
  "style keys: columns, gap, padding, paddingX, paddingY, maxWidth, align, justify, items, span, size, weight, lineHeight, letterSpacing, italic, uppercase, font, color, background, gradientTo, gradientAngle, radius, borderWidth, borderColor, shadow, opacity, aspect, objectFit, minHeight, hidden, position, top, left, right, bottom, zIndex, overlap, blur, rotate, gridAreas, area. Colours are #RRGGBB.",
  "Use ONLY the words, pictures and links supplied for the section — you may restructure, never invent facts, prices, reviews, awards or results.",
  "Every supplied picture must appear visibly as a media node using its exact mediaRef. Never copy its private storage path into src.",
  "Text on a background needs contrast of at least 4.5. Buttons need an href. Images need alt text. Collapse to one column on mobile.",
  "Make every creative choice from the authored brief and supplied material; no platform house style is implied.",
  "Use any validated composition, depth, hierarchy, spacing, media treatment, and motion the authored brief calls for. On mobile, provide responsive overrides wherever needed so nothing collides at 320px.",
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
      mediaRef: part.media_url ? part.id : null,
      href: part.link_url && isSafeHref(part.link_url) ? part.link_url : null,
      linkLabel: part.link_label,
    })),
  };
}

function mediaRefsFor(section: SectionRow, parts: ComponentRow[]) {
  return new Set(
    parts
      .filter((part) => part.section_id === section.id && Boolean(part.media_url))
      .map((part) => part.id),
  );
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
    db.from("website_components").select("id,section_id,kind,label,body,media_url,link_url,link_label").eq("organization_id", organizationId).order("sort_order"),
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

  const result: CompositionPassResult = { composed: 0, kept: rows.length, models: [], costMicrocents: 0, gateReports: [] };
  // The wider team advises Sol before the first design, from supplied material
  // only. A failed adviser is skipped; advice never blocks a build.
  let advice: { area: string; issues: string[] }[] = [];
  try {
    const panel = await runAdvisoryPanel({
      organizationId,
      material: JSON.stringify(rows.filter((r) => !FUNCTIONAL_SECTION_KINDS.has(r.kind)).map((s) => materialFor(s, parts.filter((p) => p.section_id === s.id)))),
    });
    result.models.push(...panel.models);
    result.costMicrocents += panel.costMicrocents;
    advice = panel.notes.filter((n) => n.issues.length).map(({ area, issues }) => ({ area, issues }));
  } catch (error) {
    console.warn("advisory panel skipped", (error as Error).message);
  }

  for (const pageSections of byPage.values()) {
    let pending = pageSections;
    let feedback: Record<string, CompositionIssue[]> = {};
    const designed = new Map<string, CompositionTree>();
    for (let attempt = 0; attempt < 3 && pending.length; attempt += 1) {
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
          ...(advice.length ? ["", "TEAM ADVICE (independent reviewers; use your judgement, never invent facts):", JSON.stringify(advice)] : []),
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
        const mediaRefs = mediaRefsFor(section, parts);
        const checked = validateComposition(trees[section.id], {
          screenText: screen,
          allowedMediaRefs: mediaRefs,
          requiredMediaRefs: mediaRefs,
        });
        if (!checked.ok) {
          feedback[section.id] = checked.issues.slice(0, 12);
          next.push(section);
          continue;
        }
        designed.set(section.id, checked.tree);
      }
      pending = next;
    }
    if (pending.length) {
      const first = Object.values(feedback).flat()[0];
      throw new Error(
        `The design team could not produce a safe layout for ${pending.length} section(s)${first ? ` (${first.path}: ${first.problem})` : ""}, so nothing was published. Please try again in a moment.`,
        { cause: feedback },
      );
    }
    // Search data only exists for a verified domain; a lookup failure never blocks the build.
    let domain: string | null = null;
    try {
      const { data: settings } = await db
        .from("website_settings")
        .select("custom_domain,domain_verified")
        .eq("organization_id", organizationId)
        .maybeSingle();
      domain = settings?.domain_verified ? settings.custom_domain : null;
    } catch {
      domain = null;
    }
    const evidence = await gatherReviewEvidence({
      industry: facts.industry ?? null,
      businessName: facts.businessName ?? null,
      city: facts.city ?? null,
      siteUrl: domain ? `https://${domain}/` : null,
    }).catch(() => NO_EVIDENCE);
    const best = await improveWithTeam({ organizationId, lookSummary: input.lookSummary, evidence, sections: pageSections, parts, designed, screen, result });
    for (const section of pageSections) {
      const tree = best.get(section.id);
      if (!tree) continue;
      await saveTree(db, organizationId, section, tree);
      result.composed += 1;
      result.kept -= 1;
    }
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

/**
 * The wider team gives Sol notes, Sol may revise from them, and the gate only
 * rejects renderer-unsafe output. It never scores or overrules creative taste.
 */
async function improveWithTeam(input: {
  organizationId: string;
  lookSummary: string;
  evidence: ReviewEvidence;
  sections: SectionRow[];
  parts: ComponentRow[];
  designed: Map<string, CompositionTree>;
  screen: (text: string) => string | null;
  result: CompositionPassResult;
}): Promise<Map<string, CompositionTree>> {
  let best = input.designed;
  const material = JSON.stringify(
    input.sections.map((s) => materialFor(s, input.parts.filter((p) => p.section_id === s.id))),
  );
  for (let round = 0; round < IMPROVEMENT_ROUNDS; round += 1) {
    try {
      const current = Object.fromEntries(best);
      const panel = await runReviewPanel({
        organizationId: input.organizationId,
        mode: "full",
        evidence: input.evidence,
        material: ["SUPPLIED MATERIAL:", material, "", "SOL'S DESIGN:", JSON.stringify(current)].join("\n"),
      });
      input.result.models.push(...panel.models);
      input.result.costMicrocents += panel.costMicrocents;
      const notes = panel.notes.filter((n) => n.issues.length);
      if (!notes.length) break;
      const call = await callBestThinker({
        json: true,
        purpose: "creative_direction",
        complexity: "high",
        organizationId: input.organizationId,
        maxOutputTokens: 16000,
        system: RULES,
        user: [
          "SITE LOOK (follow it):", input.lookSummary, "",
          "SECTION MATERIAL:", material, "",
          "YOUR CURRENT DESIGN:", JSON.stringify(current), "",
          "REVIEW PANEL NOTES (use your judgement; improve, never downgrade):", JSON.stringify(notes), "",
          'Return JSON: {"sections": {"<sectionId>": {"version": 1, "label": "...", "root": {...}}}} with one improved tree per section.',
        ].join("\n"),
      });
      if (!call.ok) break;
      if (call.model) input.result.models.push(call.model);
      input.result.costMicrocents += call.costMicrocents ?? 0;
      const trees = parseTrees(call.text) ?? {};
      const proposed = new Map<string, CompositionTree>();
      for (const [id, tree] of best) {
        const section = input.sections.find((candidate) => candidate.id === id);
        const mediaRefs = section ? mediaRefsFor(section, input.parts) : new Set<string>();
        const checked = validateComposition(trees[id], {
          screenText: input.screen,
          allowedMediaRefs: mediaRefs,
          requiredMediaRefs: mediaRefs,
        });
        proposed.set(id, checked.ok ? checked.tree : tree);
      }
      const gate = await runImprovementGate({
        organizationId: input.organizationId,
        context: `Website sections. Supplied material: ${material}`,
        current,
        proposed: Object.fromEntries(proposed),
      });
      input.result.costMicrocents += gate.costMicrocents;
      if (gate.model) input.result.models.push(gate.model);
      const { costMicrocents: _cost, ...report } = gate;
      input.result.gateReports.push(report);
      if (!gate.accepted) break;
      best = proposed;
    } catch (error) {
      console.warn("team improvement round skipped", (error as Error).message);
      break;
    }
  }
  return best;
}
