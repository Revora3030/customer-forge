/**
 * LINK INTEGRITY — every button and menu link on a customer site goes somewhere
 * real.
 *
 * AI layouts and the AI menu/footer hold their own links ("/services",
 * "/#contact", "tel:…"). Pages get added, renamed and removed afterwards, so a
 * link written last week can point at a page that no longer exists (a 404 for a
 * visitor) or at an in-page anchor nothing carries (a button that does nothing).
 *
 * This module finds those links and computes the closest real destination:
 * - a page link whose page is gone goes to the page with the most similar
 *   name, else the enquiry page, else home;
 * - an in-page anchor with no target goes to the page that matches its name
 *   ("#contact" → "/contact"), else the enquiry page;
 * - tel:/mailto: links with nothing usable go to the enquiry page.
 * External https links are left alone. Nothing is ever invented: the new
 * destination is always a real page of this site.
 */
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

export type SitePage = { slug: string; kind?: string | null; title?: string | null };

export type LinkFix = { path: string; from: string; to: string };

const ENQUIRY_SLUGS = [
  "contact",
  "book",
  "booking",
  "quote",
  "get-a-quote",
  "contact-us",
  "appointments",
];

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !["the", "and", "our", "your", "page"].includes(w));
}

/** The page visitors should reach to get in touch, if the site has one. */
export function enquiryPage(pages: SitePage[]): string | null {
  for (const slug of ENQUIRY_SLUGS) if (pages.some((p) => p.slug === slug)) return `/${slug}`;
  const byKind = pages.find((p) => /contact|book|quote/i.test(String(p.kind ?? "")));
  return byKind ? `/${byKind.slug}` : null;
}

function closestPage(target: string, pages: SitePage[]): string | null {
  const want = words(target);
  if (!want.length) return null;
  let best: { slug: string; score: number } | null = null;
  for (const page of pages) {
    if (page.slug === "home") continue;
    const have = new Set([...words(page.slug), ...words(page.title ?? "")]);
    const score = want.filter(
      (w) => have.has(w) || [...have].some((h) => h.startsWith(w) || w.startsWith(h)),
    ).length;
    if (score > 0 && (!best || score > best.score)) best = { slug: page.slug, score };
  }
  return best ? `/${best.slug}` : null;
}

/**
 * Decides where one link should point. Returns null when the link is fine.
 * `anchors` holds the in-page anchor ids that exist on the site.
 */
export function repairHref(
  href: string,
  pages: SitePage[],
  anchors: ReadonlySet<string> = new Set(),
  /** Anchors on the home page, for "/#x" links. Defaults to `anchors`. */
  homeAnchors: ReadonlySet<string> = anchors,
): string | null {
  const value = href.trim();
  if (/^https:\/\//i.test(value)) return null;
  const fallback = enquiryPage(pages) ?? "/";

  if (/^tel:/i.test(value)) return value.replace(/\D/g, "").length >= 7 ? null : fallback;
  if (/^mailto:/i.test(value))
    return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/i.test(value) ? null : fallback;

  // "#contact" or "/#contact": an in-page anchor.
  const anchorOnly = /^\/?#([\w-]+)$/.exec(value);
  if (anchorOnly) {
    const id = anchorOnly[1]!;
    // "#x" scrolls within the page it is on; "/#x" goes to the home page.
    const reachable = value.startsWith("/") ? homeAnchors : anchors;
    if (reachable.has(id)) return null;
    // The renderer writes "service-area" for a "service_area" section.
    const hyphenated = id.replace(/_/g, "-");
    if (hyphenated !== id && reachable.has(hyphenated)) return `${value.startsWith("/") ? "/" : ""}#${hyphenated}`;
    if (pages.some((p) => p.slug === id)) return `/${id}`;
    return closestPage(id, pages) ?? fallback;
  }
  if (value === "#" || value === "") return fallback;

  if (value.startsWith("/")) {
    const path = value.split(/[?#]/)[0] ?? "/";
    const slug = path.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
    if (slug === "" || slug === "home") return null;
    if (pages.some((p) => p.slug === slug)) return null;
    return closestPage(slug, pages) ?? fallback;
  }
  return null;
}

/** The id SiteSection renders for a section: its role (or kind), with "_" as "-". */
export function sectionAnchor(section: { kind: string; settings?: unknown }): string | null {
  const stored = (section.settings as Record<string, unknown> | null)?.["role"];
  const role = typeof stored === "string" && /^[a-z][a-z0-9_-]{0,40}$/.test(stored) ? stored : section.kind;
  return role && role !== "composition" ? role.replace(/_/g, "-") : null;
}

/**
 * The anchors a visitor can actually reach, per page slug: only VISIBLE
 * sections, only on the page they sit on, with exactly the ids the renderer
 * emits, plus the fixed ids of built-in blocks (#quote, #book, #contact-form).
 * A site-wide set let a "#quote" button on /services pass even though the quote
 * section lives on the home page, so the button did nothing.
 */
export function collectPageAnchors(
  sections: { page_id: string | null; kind: string; settings?: unknown; is_visible?: boolean | null }[],
  pages: { id: string; slug: string }[],
): Map<string, Set<string>> {
  const slugById = new Map(pages.map((page) => [page.id, page.slug]));
  const out = new Map<string, Set<string>>();
  for (const section of sections) {
    if (section.is_visible === false || !section.page_id) continue;
    const slug = slugById.get(section.page_id);
    if (!slug) continue;
    const set = out.get(slug) ?? new Set<string>();
    const anchor = sectionAnchor(section);
    if (anchor) set.add(anchor);
    if (section.kind === "quote") set.add("quote");
    if (section.kind === "booking") set.add("book");
    if (JSON.stringify(section.settings ?? null).includes('"enquiry_form"')) set.add("contact-form");
    out.set(slug, set);
  }
  return out;
}

/** Every in-page anchor id the site's layouts define (`style.id`-free: section kinds and ids). */
export function collectAnchors(
  sections: { id: string; kind: string; settings?: unknown }[],
): Set<string> {
  const out = new Set<string>();
  for (const section of sections) {
    out.add(section.id);
    const role = (section.settings as Record<string, unknown> | null)?.["role"];
    for (const name of [section.kind, typeof role === "string" ? role : null])
      if (name && name !== "composition") {
        out.add(name);
        out.add(name.replace(/_/g, "-"));
      }
  }
  return out;
}

/** In-page targets an action on its own page should scroll to, best first. */
const SELF_LINK_TARGETS = ["contact-form", "quote", "book", "contact"];

/**
 * A button on a page that links to that same page (a "Get a quote" on /contact
 * that points at "/contact") only reloads it. When the page carries a form or
 * booking block, the button scrolls to it instead. Returns null when the link
 * is not a self-link or the page has nothing better to point at.
 */
export function selfLinkTarget(
  href: string,
  currentSlug: string | null | undefined,
  anchors: ReadonlySet<string>,
): string | null {
  if (!currentSlug) return null;
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//") || /[?#]/.test(value)) return null;
  const slug = value.replace(/^\/+|\/+$/g, "").toLowerCase() || "home";
  if (slug !== currentSlug.toLowerCase()) return null;
  const target = SELF_LINK_TARGETS.find((id) => anchors.has(id));
  return target ? `#${target}` : null;
}

/**
 * Rewrites every broken link in a composition tree. Returns the fixed tree and
 * what changed; the input is never mutated. With `currentSlug`, a link back to
 * the page the tree sits on goes to that page's form instead.
 */
export function repairTreeLinks(
  tree: CompositionTree,
  pages: SitePage[],
  anchors: ReadonlySet<string> = new Set(),
  homeAnchors: ReadonlySet<string> = anchors,
  currentSlug?: string | null,
): { tree: CompositionTree; fixes: LinkFix[] } {
  const fixes: LinkFix[] = [];
  const fix = (href: string) =>
    selfLinkTarget(href, currentSlug, anchors) ?? repairHref(href, pages, anchors, homeAnchors);
  const visit = (node: CompositionNode, path: string): CompositionNode => {
    const next: CompositionNode = { ...node };
    if (typeof node.href === "string") {
      const to = fix(node.href);
      if (to && to !== node.href) {
        fixes.push({ path: `${path}.href`, from: node.href, to });
        next.href = to;
      }
    }
    for (const key of ["primaryCta", "secondaryCta"] as const) {
      const cta = node[key];
      if (cta?.href) {
        const to = fix(cta.href);
        if (to && to !== cta.href) {
          fixes.push({ path: `${path}.${key}.href`, from: cta.href, to });
          next[key] = { ...cta, href: to };
        }
      }
    }
    if (node.children)
      next.children = node.children.map((child, i) => visit(child, `${path}.children[${i}]`));
    if (node.tabs)
      next.tabs = node.tabs.map((tab, t) => ({
        ...tab,
        children: tab.children.map((child, i) => visit(child, `${path}.tabs[${t}].children[${i}]`)),
      }));
    return next;
  };
  const root = visit(tree.root, "root");
  return { tree: fixes.length ? { ...tree, root } : tree, fixes };
}

/** True when a tree carries at least one working action (button/link with a destination). */
export function hasAction(tree: CompositionTree): boolean {
  const walk = (node: CompositionNode): boolean =>
    ((node.type === "button" || node.type === "link") && Boolean(node.href)) ||
    Boolean(node.primaryCta?.href) ||
    (node.children ?? []).some(walk) ||
    (node.tabs ?? []).some((tab) => tab.children.some(walk));
  return walk(tree.root);
}

/**
 * Adds any missing page links to a menu/footer tree. New links are appended to
 * the container that already holds the most page links, styled like its
 * existing links, so a page added after the first build always shows up in the
 * menu without redesigning it.
 */
export function addMissingNavLinks(
  tree: CompositionTree,
  pages: { href: string; title: string }[],
): { tree: CompositionTree; added: string[] } {
  const present = new Set<string>();
  const collect = (node: CompositionNode) => {
    if (node.href) present.add(node.href.split(/[?#]/)[0] || node.href);
    node.children?.forEach(collect);
  };
  collect(tree.root);
  const missing = pages.filter((page) => !present.has(page.href));
  if (!missing.length) return { tree, added: [] };

  // Find the container with the most internal page links: that is the menu.
  let best: { path: number[]; count: number; sample: CompositionNode | null } = {
    path: [],
    count: -1,
    sample: null,
  };
  const scan = (node: CompositionNode, path: number[]) => {
    const links = (node.children ?? []).filter(
      (child) => (child.type === "link" || child.type === "button") && child.href?.startsWith("/"),
    );
    if (links.length > best.count) best = { path, count: links.length, sample: links[0] ?? null };
    node.children?.forEach((child, i) => scan(child, [...path, i]));
  };
  scan(tree.root, []);

  const sample = best.sample;
  const newLinks: CompositionNode[] = missing.map((page) => ({
    type: "link",
    text: page.title,
    href: page.href,
    ...(sample?.style ? { style: sample.style } : {}),
    ...(sample?.responsive ? { responsive: sample.responsive } : {}),
  }));
  const insert = (node: CompositionNode, path: number[]): CompositionNode => {
    if (!path.length) return { ...node, children: [...(node.children ?? []), ...newLinks] };
    const [head, ...rest] = path;
    return {
      ...node,
      children: (node.children ?? []).map((child, i) => (i === head ? insert(child, rest) : child)),
    };
  };
  return {
    tree: { ...tree, root: insert(tree.root, best.path) },
    added: missing.map((page) => page.href),
  };
}
