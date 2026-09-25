/**
 * FIRST-BUILD CHROME. Sol designs the menu bar and footer from scratch as
 * composition trees. Every tree passes the safety validator and fact check, and
 * must link to every real page. One repair attempt; still invalid stops the
 * build — no built-in menu or footer design is substituted.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { screenText } from "@/lib/builder/collective-copy";
import { COMPOSITION_PRIMITIVES, PRIMITIVE_GUIDE, validateComposition, type CompositionIssue, type CompositionTree } from "@/lib/builder/composition-tree";
import { collectHrefs, requiredChromeLinks, writeSiteChrome } from "@/lib/builder/site-chrome";
import type { DnaFacts } from "@/lib/business-dna";

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const RULES = [
  "You are Sol, lead art director. Design this website's menu bar (header) and footer from scratch.",
  `Use only these primitives: ${COMPOSITION_PRIMITIVES.join(", ")}.`,
  PRIMITIVE_GUIDE,
  "Node shape: {type, text?, href?, src?, alt?, level?, items?, style?, responsive?: {mobile?, tablet?, desktop?}, motion?, children?}. Colours are #RRGGBB.",
  "Internal links use '/' for home and '/<page-slug>' for pages. Phone links use tel:, email links use mailto:.",
  "The header must link to every listed page and stay usable on a 320px phone (wrap or stack links; touch targets at least 44px).",
  "The footer must link to every listed page. Use only the supplied business facts — never invent addresses, hours, awards or claims.",
  "Text contrast at least 4.5. Match the site's look.",
  "Also write heroVideoBrief: one vivid 1-3 sentence art-direction brief (max 600 chars) for an optional silent, looping hero background video that fits this business and look. Show only real, generic scenes of the work — no text, logos, people's faces or invented claims.",
].join(" ");

function parse(text: string): { header?: unknown; footer?: unknown; heroVideoBrief?: unknown } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { header?: unknown; footer?: unknown; heroVideoBrief?: unknown };
  } catch {
    return null;
  }
}

export async function composeSiteChrome(input: {
  db: Db;
  organizationId: string;
  businessName: string;
  facts: DnaFacts;
  lookSummary: string;
}): Promise<{ models: string[]; costMicrocents: number }> {
  const { db, organizationId, facts } = input;
  const { data: pages, error } = await db.from("website_pages").select("slug,title,kind").eq("organization_id", organizationId).order("sort_order");
  if (error) throw new Error(error.message);
  const nav = ((pages ?? []) as { slug: string; title: string; kind: string | null }[]);
  const required = requiredChromeLinks(nav);
  const screen = (text: string) => {
    const problem = screenText(text, facts, 4000);
    return problem && problem !== "empty" ? problem : null;
  };
  const material = {
    businessName: input.businessName,
    pages: nav.filter((p) => p.kind !== "thanks" && p.kind !== "post").map((p) => ({ href: p.slug === "home" ? "/" : `/${p.slug}`, title: p.title })),
    phone: facts.phone ?? null,
    email: facts.email ?? null,
    area: facts.serviceArea ?? facts.city ?? null,
    ctaLabel: (facts as { ctaLabel?: string | null }).ctaLabel ?? null,
  };

  const models: string[] = [];
  let cost = 0;
  let feedback: Record<string, CompositionIssue[]> = {};
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const call = await callBestThinker({
      json: true,
      purpose: "creative_direction",
      complexity: "high",
      organizationId,
      maxOutputTokens: 8000,
      system: RULES,
      user: [
        "SITE LOOK:", input.lookSummary, "",
        "MATERIAL (only these facts):", JSON.stringify(material, null, 2),
        ...(Object.keys(feedback).length ? ["", "FIX THESE PROBLEMS:", JSON.stringify(feedback, null, 2)] : []),
        "", 'Return JSON: {"header": {"version":1,"root":{...}}, "footer": {"version":1,"root":{...}}, "heroVideoBrief": "..."}',
      ].join("\n"),
    });
    if (!call.ok) throw new Error(`The design team could not design this website's menu and footer (${call.detail ?? call.reason}). Nothing was published.`);
    if (call.model) models.push(call.model);
    cost += call.costMicrocents ?? 0;
    const parsed = parse(call.text) ?? {};
    feedback = {};
    const trees: Partial<Record<"header" | "footer", CompositionTree>> = {};
    for (const part of ["header", "footer"] as const) {
      const checked = validateComposition(parsed[part], { screenText: screen });
      if (!checked.ok) { feedback[part] = checked.issues.slice(0, 12); continue; }
      const hrefs = collectHrefs(checked.tree);
      const missing = required.filter((href) => !hrefs.has(href));
      if (missing.length) { feedback[part] = [{ path: "root", problem: `missing links to ${missing.join(", ")}` }]; continue; }
      trees[part] = checked.tree;
    }
    if (trees.header && trees.footer) {
      const { data } = await db.from("website_settings").select("generation").eq("organization_id", organizationId).maybeSingle();
      const chromed = writeSiteChrome(data?.generation ?? {}, { header: trees.header, footer: trees.footer });
      const brief = cleanVideoBrief(parsed.heroVideoBrief, screen);
      const generation = brief ? { ...chromed, heroVideoBrief: brief } : chromed;
      const { error: saveError } = await db.from("website_settings").upsert({ organization_id: organizationId, generation } as never, { onConflict: "organization_id" });
      if (saveError) throw new Error(saveError.message);
      return { models, costMicrocents: cost };
    }
  }
  throw new Error("The design team could not produce a safe menu and footer, so nothing was published. Please try again in a moment.");
}

/** Keeps Sol's hero-video idea only when it is safe, plain text with no unsupported claims. */
export function cleanVideoBrief(raw: unknown, screen?: (text: string) => string | null): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 600);
  if (text.length < 20 || /<|>|javascript:|https?:/i.test(text)) return null;
  if (screen?.(text)) return null;
  return text;
}
