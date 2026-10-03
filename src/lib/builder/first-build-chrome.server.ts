/**
 * FIRST-BUILD CHROME. Sol designs the menu bar and footer from scratch as
 * composition trees. Every tree passes the safety validator and fact check, and
 * must link to every real page. One repair attempt; still invalid stops the
 * build — no built-in menu or footer design is substituted.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { screenText } from "@/lib/builder/collective-copy";
import { COMPOSITION_PRIMITIVES, PRIMITIVE_GUIDE, validateComposition, type CompositionIssue, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";
import { collectHrefs, requiredChromeLinks, writeSiteChrome } from "@/lib/builder/site-chrome";
import type { DnaFacts } from "@/lib/business-dna";

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
    phone: facts.phone?.trim() || null,
    email: facts.email?.trim() || null,
    area: facts.serviceArea ?? facts.city ?? null,
    ctaLabel: (facts as { ctaLabel?: string | null }).ctaLabel ?? null,
  };

  const models: string[] = [];
  let cost = 0;
  let feedback: Record<string, CompositionIssue[]> = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    if (!call.ok) {
      // The design team could not design chrome. Write a safe fallback so the
      // site always has navigation, then return.
      console.warn(`[first-build-chrome] AI chrome design failed: ${call.detail ?? call.reason}`);
      await writeSafeChromeFallback(db, organizationId, nav, input.businessName, facts);
      return { models, costMicrocents: cost };
    }
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
      if (saveError) {
        // Save failed. Don't stop the build — the site is already created.
        console.warn(`[first-build-chrome] Save failed: ${saveError.message}`);
        return { models, costMicrocents: cost };
      }
      return { models, costMicrocents: cost };
    }
  }
  const why = Object.entries(feedback)
    .map(([part, issues]) => `${part}: ${issues.slice(0, 3).map((i) => `${i.path} ${i.problem}`).join("; ")}`)
    .join(" | ");
  console.warn("[first-build-chrome] repair attempts exhausted", why);
  // Chrome design failed after all retries. Write a safe fallback header/footer
  // so the site always has navigation — never leave visitors stranded without
  // a menu or footer.
  await writeSafeChromeFallback(db, organizationId, nav, input.businessName, facts);
  return { models, costMicrocents: cost };
}

/**
 * Writes a minimal but complete header (nav links to every page) and footer
 * (business name + contact) when the AI chrome designer could not produce a
 * safe result. This guarantees every published site has working navigation.
 */
async function writeSafeChromeFallback(
  db: Db,
  organizationId: string,
  nav: { slug: string; title: string; kind: string | null }[],
  businessName: string,
  facts: DnaFacts,
): Promise<void> {
  try {
    const pages = nav.filter((p) => p.kind !== "thanks" && p.kind !== "post");
    const headerLinks = pages
      .filter((p) => p.slug !== "home")
      .map((p) => ({
        type: "link" as const,
        text: p.title,
        href: `/${p.slug}`,
        style: { size: 15, weight: 500, paddingX: 6, paddingY: 10 },
      }));
    // The enquiry page the visitor should reach from every screen.
    const enquiry =
      pages.find((p) => /^(book|booking|contact|quote|get-a-quote|estimate)$/.test(p.slug)) ??
      pages.find((p) => /book|contact|quote/i.test(p.slug));
    const cta = enquiry
      ? {
          type: "button" as const,
          text: (facts as { ctaLabel?: string | null }).ctaLabel?.trim() || enquiry.title,
          href: `/${enquiry.slug}`,
          style: { size: 15, weight: 600, paddingX: 20, paddingY: 12, radius: 999, borderWidth: 1 },
        }
      : facts.phone
        ? {
            type: "button" as const,
            text: `Call ${facts.phone}`,
            href: `tel:${facts.phone.replace(/[^\d+]/g, "")}`,
            style: { size: 15, weight: 600, paddingX: 20, paddingY: 12, radius: 999, borderWidth: 1 },
          }
        : null;
    const header: CompositionTree = {
      version: 1,
      label: "safe-header",
      root: {
        type: "row",
        style: { items: "center", justify: "between", gap: 24, maxWidth: 1152 },
        responsive: { mobile: { justify: "start", gap: 8 } },
        children: [
          { type: "link", text: businessName, href: "/", style: { weight: 700, size: 18, letterSpacing: -0.01 } },
          {
            type: "row",
            style: { gap: 20, items: "center", justify: "end" },
            responsive: { mobile: { gap: 4 } },
            children: [...headerLinks, ...(cta ? [cta] : [])],
          },
        ],
      },
    };
    const contactLines: CompositionNode[] = [];
    if (facts.phone) contactLines.push({ type: "link", text: facts.phone, href: `tel:${facts.phone.replace(/[^\d+]/g, "")}`, style: { size: 15 } });
    if (facts.email) contactLines.push({ type: "link", text: facts.email, href: `mailto:${facts.email}`, style: { size: 15 } });
    if (facts.serviceArea || facts.city) contactLines.push({ type: "text", text: `Serving ${facts.serviceArea ?? facts.city}`, style: { size: 15, opacity: 80 } });
    const footer: CompositionTree = {
      version: 1,
      label: "safe-footer",
      root: {
        type: "stack",
        style: { gap: 32, paddingX: 24, paddingY: 56, maxWidth: 1152 },
        children: [
          {
            type: "grid",
            style: { columns: 3, gap: 32 },
            responsive: { mobile: { columns: 1 }, tablet: { columns: 2 } },
            children: [
              {
                type: "stack",
                style: { gap: 8 },
                children: [
                  { type: "heading", level: 2, text: businessName, style: { size: 22, weight: 700 } },
                  ...(cta ? [{ ...cta, style: { ...cta.style, size: 14 } }] : []),
                ],
              },
              {
                type: "stack",
                style: { gap: 6 },
                children: pages.map((p) => ({
                  type: "link" as const,
                  text: p.title,
                  href: p.slug === "home" ? "/" : `/${p.slug}`,
                  style: { size: 15 },
                })),
              },
              ...(contactLines.length ? [{ type: "stack" as const, style: { gap: 6 }, children: contactLines }] : []),
            ],
          },
          { type: "divider", style: { opacity: 20 } },
          { type: "text", text: `© ${new Date().getFullYear()} ${businessName}`, style: { size: 13, opacity: 70 } },
        ],
      },
    };
    const { data: settings } = await db.from("website_settings").select("generation").eq("organization_id", organizationId).maybeSingle();
    const generation = writeSiteChrome(settings?.generation ?? {}, { header, footer });
    await db.from("website_settings")
      .upsert({ organization_id: organizationId, generation } as never, { onConflict: "organization_id" });
  } catch (error) {
    console.warn("[first-build-chrome] Safe fallback chrome write failed:", error);
  }
}

/** Keeps Sol's hero-video idea only when it is safe, plain text with no unsupported claims. */
export function cleanVideoBrief(raw: unknown, screen?: (text: string) => string | null): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 600);
  if (text.length < 20 || /<|>|javascript:|https?:/i.test(text)) return null;
  if (screen?.(text)) return null;
  return text;
}
