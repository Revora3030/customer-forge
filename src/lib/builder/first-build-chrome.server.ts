import { pageNavLabel } from "@/lib/website-content";
/**
 * FIRST-BUILD CHROME. Sol designs the menu bar and footer from scratch as
 * composition trees. Every tree passes the safety validator and fact check, and
 * must link to every real page. Faults that can be corrected with the owner's
 * real facts and pages (a missing page link, an invented phone number, a text
 * link where the action button belongs) are repaired on the AI's own design;
 * only genuine design faults go back to Sol. No built-in menu or footer design
 * is ever substituted.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { screenText } from "@/lib/builder/collective-copy";
import { COMPOSITION_PRIMITIVES, PRIMITIVE_GUIDE, validateComposition, type CompositionIssue, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";
import { collectHrefs, readSiteChrome, requiredChromeLinks, writeSiteChrome } from "@/lib/builder/site-chrome";
import type { DnaFacts } from "@/lib/business-dna";
import { completeChromeLinks, ensureHeaderAction, repairContactDetails } from "@/lib/builder/chrome-repair";
import { enquiryPage } from "@/lib/builder/link-integrity";

/** One menu/footer design call may not hold the build hostage. */
const CHROME_CALL_TIMEOUT_MS = 120_000;
/** Six tries (three before the old limit) across the free and paid teams. */
const CHROME_ATTEMPTS = 6;

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const RULES = [
  "You are Sol, lead art director. Design this website's menu bar (header) and footer from scratch.",
  `Use only these primitives: ${COMPOSITION_PRIMITIVES.join(", ")}.`,
  PRIMITIVE_GUIDE,
  "Node shape: {type, text?, href?, src?, alt?, level?, items?, style?, responsive?: {mobile?, tablet?, desktop?}, motion?, children?}. Colours are #RRGGBB. Sizes (padding, paddingX, paddingY, gap, etc.) are plain numbers in pixels, e.g. 24 — not CSS strings. Alignment uses align (left|center|right) and justify (start|center|end|between).",
  "Internal links use '/' for home and '/<page-slug>' for pages. Phone links use tel:, email links use mailto:.",
  "The header and footer must each link to every listed page. You choose their composition, hierarchy, arrangement, typography, colour, spacing, and responsive behaviour.",
  "Every interactive target must remain usable by keyboard and touch, with a minimum 44px target. Do not hide required navigation at any supported width.",
  "The footer must link to every listed page. Use only the supplied business facts — never invent addresses, hours, awards or claims.",
  "Text contrast at least 4.5. Match the site's look — the same typography, button shape and colour language as the page sections.",
  "Header craft: one row on desktop with the business name/wordmark on the left, page links in the middle or right, and ONE primary call-to-action button (using the supplied ctaLabel and a real page, tel: or mailto: href) styled as the strongest element; 15-16px link text; a quiet background that keeps the bar readable over any hero.",
  "Footer craft: a deliberate multi-column layout on desktop (brand + short line from supplied facts, page links, contact details) collapsing to one column on mobile via responsive.mobile.columns:1, generous padding (48-80px), muted-but-readable text, and a final row with the business name.",
  "Also write heroVideoBrief: one vivid 1-3 sentence art-direction brief (max 600 chars) for an optional silent, looping hero background video that fits this business and look. Show only real, generic scenes of the work — no text, logos, people's faces or invented claims.",
].join(" ");

function hasButton(node: CompositionNode): boolean {
  return (node.type === "button" && Boolean(node.href)) || (node.children ?? []).some(hasButton);
}

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
  /** The AI-authored primary call to action for this site (already screened). */
  primaryCta?: string | null;
  /** Keep existing, renderable parts when repairing an interrupted build. */
  repairMissingOnly?: boolean;
  signal?: AbortSignal;
}): Promise<{ models: string[]; costMicrocents: number }> {
  const { db, organizationId, facts } = input;
  input.signal?.throwIfAborted();
  const { data: pages, error } = await db.from("website_pages").select("slug,title,kind,is_visible").eq("organization_id", organizationId).order("sort_order");
  if (error) throw new Error(error.message);
  const nav = ((pages ?? []) as { slug: string; title: string; kind: string | null; is_visible?: boolean | null }[])
    .filter((page) => page.is_visible !== false);
  const required = requiredChromeLinks(nav);
  const screen = (text: string) => {
    const problem = screenText(text, facts, 4000);
    return problem && problem !== "empty" ? problem : null;
  };
  const material = {
    businessName: input.businessName,
    pages: nav.filter((p) => p.kind !== "thanks" && p.kind !== "post").map((p) => ({ href: p.slug === "home" ? "/" : `/${p.slug}`, title: p.slug === "home" ? "Home" : pageNavLabel(p.title, input.businessName, p.slug) })),
    phone: facts.phone?.trim() || null,
    email: facts.email?.trim() || null,
    area: facts.serviceArea ?? facts.city ?? null,
    ctaLabel: input.primaryCta?.trim() || (facts as { ctaLabel?: string | null }).ctaLabel || null,
  };

  const linkablePages = nav.filter((p) => p.kind !== "thanks" && p.kind !== "post");
  const enquiryHref = enquiryPage(linkablePages);
  const enquiryTitle = enquiryHref ? linkablePages.find((p) => `/${p.slug}` === enquiryHref)?.title ?? null : null;
  const contact = { phone: material.phone, email: material.email, enquiryHref };

  const models: string[] = [];
  let cost = 0;
  let feedback: Record<string, CompositionIssue[]> = {};
  /** The best valid tree seen for each part, kept across attempts. */
  const best: Partial<Record<"header" | "footer", CompositionTree>> = {};
  const preserved = new Set<"header" | "footer">();
  if (input.repairMissingOnly) {
    const current = await db.from("website_settings").select("generation").eq("organization_id", organizationId).maybeSingle();
    if (current.error) throw new Error("Couldn't read the existing menu and footer.");
    const existing = readSiteChrome(current.data?.generation);
    for (const part of ["header", "footer"] as const) {
      if (existing[part]) {
        best[part] = existing[part];
        preserved.add(part);
      }
    }
    if (best.header && best.footer) return { models, costMicrocents: 0 };
  }
  for (let attempt = 0; attempt < CHROME_ATTEMPTS; attempt += 1) {
    input.signal?.throwIfAborted();
    const abort = new AbortController();
    const cancel = () => abort.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => abort.abort(), CHROME_CALL_TIMEOUT_MS);
    const call = await callBestThinker({
      json: true,
      purpose: "creative_direction",
      // Later attempts ask for a smaller design so a slow model still finishes.
      complexity: attempt >= 3 ? "medium" : "high",
      organizationId,
      maxOutputTokens: 8000,
      signal: abort.signal,
      system: RULES,
      user: [
        "SITE LOOK:", input.lookSummary, "",
        "MATERIAL (only these facts):", JSON.stringify(material, null, 2),
        ...(Object.keys(feedback).length ? ["", "FIX THESE PROBLEMS:", JSON.stringify(feedback, null, 2)] : []),
        ...(best.header && !best.footer ? ["", "Your header was accepted; only the footer still needs fixing (return both)."] : []),
        ...(best.footer && !best.header ? ["", "Your footer was accepted; only the header still needs fixing (return both)."] : []),
        "", 'Return JSON: {"header": {"version":1,"root":{...}}, "footer": {"version":1,"root":{...}}, "heroVideoBrief": "..."}',
      ].join("\n"),
    }).finally(() => {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
    });
    input.signal?.throwIfAborted();
    if (!call.ok) {
      // A single failed or slow call is often transient: try again before giving up.
      if (attempt < CHROME_ATTEMPTS - 1) {
        const pause = Number(process.env["CHROME_RETRY_PAUSE_MS"] ?? 1500);
        await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(pause) ? pause : 1500) * Math.min(attempt + 1, 3)));
        continue;
      }
      const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
      throw new AiStepUnavailableError("menu and footer design", call.detail ?? call.reason);
    }
    if (call.model) models.push(call.model);
    cost += call.costMicrocents ?? 0;
    const parsed = parse(call.text) ?? {};
    feedback = {};
    const trees: Partial<Record<"header" | "footer", CompositionTree>> = { ...best };
    for (const part of ["header", "footer"] as const) {
      if (preserved.has(part)) continue;
      if (parsed[part] == null && best[part]) continue;
      // Invented contact details are corrected to the owner's real ones (or the
      // real contact page) rather than costing the whole design.
      const repaired = repairContactDetails(parsed[part], contact).value;
      const checked = validateComposition(repaired, { screenText: screen });
      if (!checked.ok) { if (!best[part]) feedback[part] = checked.issues.slice(0, 12); continue; }
      // A forgotten page link is added in the style of the AI's own links.
      let tree = checked.tree;
      const hrefs = collectHrefs(tree);
      const missing = required.filter((href) => !hrefs.has(href));
      if (missing.length) tree = completeChromeLinks(tree, required, material.pages).tree;
      // The menu bar must carry one clear call-to-action button: promote the
      // AI's own contact link, or add its authored call to action.
      if (part === "header" && !hasButton(tree.root)) {
        tree = ensureHeaderAction(tree, { ctaLabel: material.ctaLabel, enquiryHref, phone: material.phone, enquiryTitle }).tree;
      }
      const final = validateComposition(tree, { screenText: screen });
      if (!final.ok) { if (!best[part]) feedback[part] = final.issues.slice(0, 12); continue; }
      const stillMissing = required.filter((href) => !collectHrefs(final.tree).has(href));
      if (stillMissing.length) { if (!best[part]) feedback[part] = [{ path: "root", problem: `missing links to ${stillMissing.join(", ")}` }]; continue; }
      if (part === "header" && !hasButton(final.tree.root)) {
        if (!best[part]) feedback[part] = [{ path: "root", problem: "the header needs one primary call-to-action button (type \"button\") linking to a real page, tel: or mailto:" }];
        continue;
      }
      trees[part] = final.tree;
      best[part] = final.tree;
      delete feedback[part];
    }
    if (trees.header && trees.footer) {
      const brief = cleanVideoBrief(parsed.heroVideoBrief, screen);
      if (input.repairMissingOnly) {
        await saveMissingChrome(db, organizationId, { header: trees.header, footer: trees.footer }, brief, input.signal);
      } else {
        const { data, error: readError } = await db.from("website_settings").select("generation").eq("organization_id", organizationId).maybeSingle();
        if (readError) throw new Error("Couldn't read the website settings before saving the menu.");
        const chromed = writeSiteChrome(data?.generation ?? {}, { header: trees.header, footer: trees.footer });
        const generation = brief ? { ...chromed, heroVideoBrief: brief } : chromed;
        const { error: saveError } = await db.from("website_settings").upsert({ organization_id: organizationId, generation } as never, { onConflict: "organization_id" });
        if (saveError) throw new Error(`The menu and footer couldn't be saved: ${saveError.message}`);
      }
      return { models, costMicrocents: cost };
    }
  }
  const why = Object.entries(feedback)
    .map(([part, issues]) => `${part}: ${issues.slice(0, 3).map((i) => `${i.path} ${i.problem}`).join("; ")}`)
    .join(" | ");
  // No generic menu or footer is substituted for the design team's.
  const { AiStepUnavailableError } = await import("@/lib/builder/ai-step-error");
  throw new AiStepUnavailableError("menu and footer design", why || null);
}


/** Compare-and-set prevents a repair from replacing concurrent draft edits. */
async function saveMissingChrome(
  db: Db,
  organizationId: string,
  proposed: { header: CompositionTree; footer: CompositionTree },
  brief: string | null,
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal?.throwIfAborted();
    const { data, error } = await db.from("website_settings").select("generation").eq("organization_id", organizationId).maybeSingle();
    if (error || !data) throw new Error("Couldn't read the website settings before repairing the menu.");
    const current = readSiteChrome(data.generation);
    if (current.header && current.footer) return;
    const chromed = writeSiteChrome(data.generation, {
      header: current.header ?? proposed.header,
      footer: current.footer ?? proposed.footer,
    });
    const generation = brief && !chromed["heroVideoBrief"] ? { ...chromed, heroVideoBrief: brief } : chromed;
    let update = db.from("website_settings").update({ generation }).eq("organization_id", organizationId);
    update = data.generation == null ? update.is("generation", null) : update.eq("generation", JSON.stringify(data.generation));
    const saved = await update.select("organization_id");
    if (saved.error) throw new Error("The menu and footer couldn't be saved. Please try again.");
    if (saved.data?.length) return;
  }
  throw new Error("Your draft changed while the menu was being repaired. Please try again.");
}

/** Keeps Sol's hero-video idea only when it is safe, plain text with no unsupported claims. */
export function cleanVideoBrief(raw: unknown, screen?: (text: string) => string | null): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 600);
  if (text.length < 20 || /<|>|javascript:|https?:/i.test(text)) return null;
  if (screen?.(text)) return null;
  return text;
}
