/**
 * MULTI-PAGE STORYTELLING PASS
 * ============================
 *
 * Reads every page of a website together and works out the order a visitor
 * should travel through them, then writes the "next step" link at the foot of
 * each page so the site reads as one story instead of a pile of pages.
 *
 * It never invents a fact. Link labels are built only from page titles and a
 * small set of fixed, neutral connecting phrases.
 */

export type StoryPage = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  isVisible: boolean;
  /** Section kinds on the page, in order. */
  sectionKinds: string[];
};

export type StoryStep = {
  slug: string;
  title: string;
  /** Why this page sits here, in the owner's words. */
  role: string;
  position: number;
};

export type StoryLink = {
  fromSlug: string;
  toSlug: string;
  /** Neutral, fact-free label. */
  label: string;
  /** Internal path only. */
  href: string;
};

export type StoryFinding = {
  kind: "dead_end" | "orphan" | "missing_step" | "duplicate_role";
  slug: string;
  detail: string;
};

export type StoryPlan = {
  order: StoryStep[];
  links: StoryLink[];
  findings: StoryFinding[];
  summary: string;
};

/**
 * The journey a visitor takes: understand what is offered, see it is real,
 * see what it costs, then get in touch. Pages are sorted into that journey by
 * what they contain, not by the order they happen to be stored in.
 */
const JOURNEY: { role: string; match: (page: StoryPage) => boolean }[] = [
  { role: "First impression", match: (p) => p.slug === "home" || p.slug === "" || p.kind === "home" },
  { role: "What you offer", match: (p) => /service|offer|what-we-do|menu|treatment|program|room|package/.test(p.slug) || p.sectionKinds.includes("services") },
  { role: "Why you can be trusted", match: (p) => /about|story|team|why/.test(p.slug) || p.sectionKinds.includes("team") },
  { role: "Proof from customers", match: (p) => /review|testimonial|result|case|work|gallery|portfolio/.test(p.slug) || p.sectionKinds.some((k) => ["testimonials", "reviews", "gallery", "proof"].includes(k)) },
  { role: "What it costs", match: (p) => /pricing|price|plan|rate|cost|fee/.test(p.slug) || p.sectionKinds.some((k) => ["pricing", "plans"].includes(k)) },
  { role: "Questions answered", match: (p) => /faq|question|help|support/.test(p.slug) || p.sectionKinds.includes("faq") },
  { role: "Get in touch", match: (p) => /contact|book|quote|appointment|enquir|inquir/.test(p.slug) || p.sectionKinds.some((k) => ["contact", "booking", "quote"].includes(k)) },
];

const NEXT_PHRASE: Record<string, string> = {
  "What you offer": "See what we do",
  "Why you can be trusted": "About us",
  "Proof from customers": "See real results",
  "What it costs": "See pricing",
  "Questions answered": "Common questions",
  "Get in touch": "Get in touch",
};

function roleFor(page: StoryPage): { role: string; position: number } {
  for (let index = 0; index < JOURNEY.length; index += 1) {
    const step = JOURNEY[index];
    if (step && step.match(page)) return { role: step.role, position: index };
  }
  return { role: "Supporting detail", position: JOURNEY.length };
}

function pagePath(slug: string): string {
  if (!slug || slug === "home") return "/";
  return `/${slug.replace(/^\/+/, "")}`;
}

/**
 * Builds the journey, the next-step links and an honest list of problems.
 * Hidden pages are read for context but never linked to.
 */
export function buildStoryPlan(pages: StoryPage[]): StoryPlan {
  const visible = pages.filter((page) => page.isVisible);
  const ranked = visible
    .map((page) => ({ page, ...roleFor(page) }))
    .sort((a, b) => (a.position === b.position ? a.page.slug.localeCompare(b.page.slug) : a.position - b.position));

  const order: StoryStep[] = ranked.map((entry, index) => ({
    slug: entry.page.slug,
    title: entry.page.title,
    role: entry.role,
    position: index,
  }));

  const links: StoryLink[] = [];
  for (let index = 0; index < ranked.length - 1; index += 1) {
    const current = ranked[index];
    const next = ranked[index + 1];
    if (!current || !next) continue;
    links.push({
      fromSlug: current.page.slug,
      toSlug: next.page.slug,
      label: NEXT_PHRASE[next.role] ?? next.page.title,
      href: pagePath(next.page.slug),
    });
  }

  // A visitor who reaches the end of the journey should still be able to act,
  // so the last page points back at the way to get in touch when one exists.
  const contact = ranked.find((entry) => entry.role === "Get in touch");
  const last = ranked[ranked.length - 1];
  if (contact && last && last.page.slug !== contact.page.slug) {
    links.push({
      fromSlug: last.page.slug,
      toSlug: contact.page.slug,
      label: "Get in touch",
      href: pagePath(contact.page.slug),
    });
  }

  const findings: StoryFinding[] = [];
  const linkedTo = new Set(links.map((link) => link.toSlug));
  const linkedFrom = new Set(links.map((link) => link.fromSlug));

  for (const entry of ranked) {
    const slug = entry.page.slug;
    const isHome = slug === "home" || slug === "";
    if (!linkedFrom.has(slug) && slug !== contact?.page.slug) {
      findings.push({ kind: "dead_end", slug, detail: `${entry.page.title} does not point the visitor anywhere next.` });
    }
    if (!isHome && !linkedTo.has(slug)) {
      findings.push({ kind: "orphan", slug, detail: `${entry.page.title} is not reached from any other page in the journey.` });
    }
  }

  if (!contact) {
    findings.push({
      kind: "missing_step",
      slug: "",
      detail: "There is no page where a visitor can get in touch, so the journey has no ending.",
    });
  }

  const seen = new Map<string, string>();
  for (const entry of ranked) {
    if (entry.role === "Supporting detail") continue;
    const first = seen.get(entry.role);
    if (first) {
      findings.push({
        kind: "duplicate_role",
        slug: entry.page.slug,
        detail: `${entry.page.title} covers the same job as ${first}.`,
      });
    } else {
      seen.set(entry.role, entry.page.title);
    }
  }

  const summary =
    order.length === 0
      ? "There are no visitor-facing pages yet."
      : `${order.length} page${order.length === 1 ? "" : "s"} in order: ${order.map((step) => step.title).join(" → ")}.`;

  return { order, links, findings, summary };
}

export type StoryLinkAction = {
  pageSlug: string;
  label: string;
  href: string;
};

/**
 * The links that still need writing. A page already carrying the right link is
 * left alone so a repeat run honestly reports no change.
 */
export function pendingStoryLinks(
  plan: StoryPlan,
  existing: { pageSlug: string; href: string }[],
): StoryLinkAction[] {
  const have = new Set(existing.map((entry) => `${entry.pageSlug}→${entry.href}`));
  return plan.links
    .filter((link) => !have.has(`${link.fromSlug}→${link.href}`))
    .map((link) => ({ pageSlug: link.fromSlug, label: link.label, href: link.href }));
}
