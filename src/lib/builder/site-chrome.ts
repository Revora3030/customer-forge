/**
 * AI-authored site chrome (menu bar and footer).
 *
 * Sol designs both as ordinary composition trees; they are stored on
 * `website_settings.generation.chrome`. Reading re-validates every tree, so bad
 * stored data renders nothing rather than a substitute design. Sites without an
 * AI-authored chrome show no replacement chrome; the build/review pipeline must
 * repair or reject them instead of installing fixed copy.
 */
import { validateComposition, type CompositionNode, type CompositionTree, type NodeStyle } from "@/lib/builder/composition-tree";
import { selfLinkTarget } from "@/lib/builder/link-integrity";

export type SiteChrome = { header: CompositionTree | null; footer: CompositionTree | null };

export function readSiteChrome(generation: unknown): SiteChrome {
  const raw = (generation as Record<string, unknown> | null)?.["chrome"] as Record<string, unknown> | undefined;
  const read = (value: unknown) => {
    if (!value) return null;
    const result = validateComposition(value, { lenient: true });
    return result.ok ? result.tree : null;
  };
  return { header: read(raw?.["header"]), footer: read(raw?.["footer"]) };
}

export function writeSiteChrome(generation: unknown, chrome: { header: CompositionTree; footer: CompositionTree }): Record<string, unknown> {
  const base = generation && typeof generation === "object" && !Array.isArray(generation) ? { ...(generation as Record<string, unknown>) } : {};
  base["chrome"] = chrome;
  return base;
}

/**
 * The page slugs a site really has, or null when the page list is unknown
 * (then links are passed through untouched rather than guessed at).
 */
export function knownPageSlugs(nav: readonly { slug?: string | null }[] | null | undefined): ReadonlySet<string> | null {
  const slugs = (nav ?? []).map((row) => (typeof row?.slug === "string" ? row.slug.trim().toLowerCase() : "")).filter(Boolean);
  if (slugs.length === 0) return null;
  return new Set(["home", ...slugs]);
}

/**
 * Where a link that points at a page the site does not have should go instead,
 * so a visitor never lands on "Page not found" from the site's own button:
 * the contact page when there is one, otherwise the home page.
 */
const ENQUIRY_PAGES = ["contact", "quote", "get-a-quote", "contact-us", "book", "booking", "appointments"];

/**
 * Where a button that leads nowhere should go: the enquiry form on this page,
 * else the site's enquiry page, else home. A visitor who taps an action should
 * always reach a way to get in touch.
 */
function deadLinkTarget(known: ReadonlySet<string>, anchors?: ReadonlySet<string> | null): string {
  if (anchors?.has("contact-form")) return "#contact-form";
  if (anchors?.has("contact")) return "#contact";
  const page = ENQUIRY_PAGES.find((slug) => known.has(slug));
  return page ? `/${page}` : "/";
}

/**
 * Site-internal links are authored as "/" or "/<page>". On the platform share
 * path they must become "/s/<slug>/<page>"; on the owner's own domain they stay.
 *
 * When the site's real page list is supplied, links are also repaired:
 *  - an empty or bare "#" destination (a button that does nothing),
 *  - "/<page>" for a page that does not exist (a dead end),
 *  - "#<page>" where no such section exists but a page with that name does
 *    (e.g. "#contact" on a site whose contact form lives on /contact).
 */
export function resolveSiteHref(
  rawHref: string,
  slug: string,
  ownAddress: boolean,
  knownPages?: ReadonlySet<string> | null,
  /** Section anchors present on the page being served ("contact", "services"...). */
  pageAnchors?: ReadonlySet<string> | null,
  /**
   * Inside a preview ("/p/<token>" or "/draft/<slug>") links stay on that
   * preview, so a link opened in a new tab or shared never lands on the
   * unpublished public address.
   */
  previewBase?: string | null,
): string {
  // "/home" is the home page's slug; it is the same page as "/".
  const repaired = repairSiteHref(rawHref, knownPages, pageAnchors);
  const href = repaired.replace(/^\/home\/?(?=[#?]|$)/, "/");
  const safeBase = previewBase && /^\/(?:p|draft)\/[A-Za-z0-9_-]+$/.test(previewBase) ? previewBase : null;
  const publicBase = `/s/${encodeURIComponent(slug)}`;
  if (safeBase && (href === publicBase || href.startsWith(`${publicBase}/`) || href.startsWith(`${publicBase}?`) || href.startsWith(`${publicBase}#`))) {
    const rest = href.slice(publicBase.length).replace(/^\/home\/?(?=[#?]|$)/, "").replace(/^\/(?=[#?]|$)/, "");
    return safeBase + rest;
  }
  if ((ownAddress && !safeBase) || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/s/")) return href;
  const base = safeBase ?? `/s/${encodeURIComponent(slug)}`;
  if (href === "/") return base;
  if (href.startsWith("/#") || href.startsWith("/?")) return `${base}${href.slice(1)}`;
  return `${base}${href}`;
}

/**
 * Repairs one authored link and returns it still in authored form ("/contact",
 * "#faq", "tel:..."). Without a known page list the link is returned unchanged.
 */
export function repairSiteHref(
  rawHref: string,
  knownPages?: ReadonlySet<string> | null,
  pageAnchors?: ReadonlySet<string> | null,
): string {
  const href = (rawHref ?? "").trim();
  if (/^#(?:contact|contact-form|get-quote|get_quote|quote-form)$/i.test(href)) {
    if (pageAnchors?.has(href.slice(1))) return href;
    if (pageAnchors?.has("contact-form")) return "#contact-form";
    if (pageAnchors?.has("contact")) return "#contact";
    // The other page exists, but its section IDs are not known here.
    if (knownPages?.has("contact")) return "/contact";
  }
  if (!knownPages) return href;
  if (href === "" || href === "#" || href === "/#") return deadLinkTarget(knownPages, pageAnchors);
  if (/^#[\w-]+$/.test(href)) {
    const name = href.slice(1).toLowerCase();
    if (!pageAnchors?.has(href.slice(1)) && name !== "home" && knownPages.has(name)) return `/${name}`;
    return href;
  }
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/s/")) {
    const page = (href.slice(1).split(/[/?#]/)[0] ?? "").toLowerCase();
    if (page && !knownPages.has(page)) return deadLinkTarget(knownPages, pageAnchors);
  }
  return href;
}

const LINK_KEYS = new Set(["href", "ctaHref", "link_url"]);

/**
 * Returns a copy of stored page data (section settings, components, custom
 * block specs) with every authored link repaired by `repairSiteHref`. Nothing
 * else is touched, so the AI's design renders exactly as authored — only a
 * destination that would have been a dead end is sent somewhere real.
 */
export function repairStoredLinks<T>(
  value: T,
  knownPages: ReadonlySet<string> | null,
  pageAnchors: ReadonlySet<string> | null,
  /** The page being served: a button back to it scrolls to its form instead of reloading. */
  currentSlug?: string | null,
): T {
  if (!knownPages) return value;
  const repair = (href: string) =>
    (pageAnchors ? selfLinkTarget(href, currentSlug, pageAnchors) : null) ?? repairSiteHref(href, knownPages, pageAnchors);
  const walk = (node: unknown, depth: number): unknown => {
    if (depth > 40 || node == null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      out[key] = LINK_KEYS.has(key) && typeof child === "string" ? repair(child) : walk(child, depth + 1);
    }
    // An AI button or link authored without any destination did nothing when
    // tapped. Give it the same destination as an empty link.
    if ((out["type"] === "button" || out["type"] === "link") && typeof out["href"] !== "string") {
      out["href"] = repairSiteHref("", knownPages, pageAnchors);
    }
    for (const ctaKey of ["primaryCta", "secondaryCta"]) {
      const cta = out[ctaKey];
      if (cta && typeof cta === "object" && !Array.isArray(cta) && typeof (cta as Record<string, unknown>)["href"] !== "string") {
        out[ctaKey] = { ...(cta as Record<string, unknown>), href: repairSiteHref("", knownPages, pageAnchors) };
      }
    }
    return out;
  };
  return walk(value, 0) as T;
}

/** Every page link the chrome must offer: home plus each real page. */
export function requiredChromeLinks(nav: { slug: string; kind?: string | null }[]): string[] {
  return ["/", ...nav.filter((p) => p.slug !== "home" && p.kind !== "thanks" && p.kind !== "post").map((p) => `/${p.slug}`)];
}

export function collectHrefs(tree: CompositionTree): Set<string> {
  const out = new Set<string>();
  const walk = (node: CompositionTree["root"]) => {
    if (node.href) out.add(node.href.split(/[?#]/)[0] || node.href);
    node.children?.forEach(walk);
  };
  walk(tree.root);
  return out;
}

/**
 * Pages the AI-authored menu forgot. Every real page must be reachable from the
 * menu, so these are offered as plain links (the page's own title) next to the
 * AI design instead of leaving the page orphaned.
 */
export function missingChromeLinks(
  tree: CompositionTree | null,
  nav: readonly { slug: string; title?: string | null; kind?: string | null }[],
): { href: string; slug: string; title: string }[] {
  const present = tree ? collectHrefs(tree) : new Set<string>();
  const normalized = new Set([...present].map((h) => (h === "/home" ? "/" : h.replace(/\/+$/, "") || "/").toLowerCase()));
  return nav
    .filter((p) => p.slug && p.slug !== "home" && p.kind !== "thanks" && p.kind !== "post")
    .filter((p) => !normalized.has(`/${p.slug}`.toLowerCase()))
    .map((p) => ({ href: `/${p.slug}`, slug: p.slug, title: (p.title ?? "").trim() || p.slug }));
}

/**
 * The links and action buttons in an AI-authored menu, in reading order, for
 * the phone menu. The AI's design can hide groups of links on small screens,
 * so the phone menu lists them plainly instead of re-rendering that design.
 */
export type MenuItem = { href: string; label: string; action: boolean; depth: 0 | 1 };

export function menuItems(tree: CompositionTree | null): MenuItem[] {
  if (!tree) return [];
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  const push = (href: string, label: string, action: boolean, depth: 0 | 1) => {
    const key = `${href}|${label.toLowerCase()}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push({ href, label, action, depth });
  };
  const walk = (node: CompositionNode, depth: 0 | 1) => {
    if (node.type === "link" || node.type === "button") {
      push((node.href ?? "").trim(), (node.text ?? "").trim(), node.type === "button", depth);
      // A folded submenu: the parent link carries its sub-links as children.
      node.children?.forEach((child) => walk(child, 1));
      return;
    }
    for (const cta of [node.primaryCta, node.secondaryCta]) {
      const label = cta?.label?.trim();
      if (cta && label) push(cta.href ?? "", label, true, depth);
    }
    node.children?.forEach((child) => walk(child, depth));
    node.tabs?.forEach((tab) => tab.children.forEach((child) => walk(child, depth)));
  };
  walk(foldHeaderSubmenus(tree).root, 0);
  return out.slice(0, 30);
}

const isNavLink = (node: CompositionNode | undefined): node is CompositionNode =>
  Boolean(node && node.type === "link" && (node.text ?? "").trim());

const pathOf = (href: string | undefined): string => {
  const raw = (href ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://site.invalid");
    return `${url.pathname.replace(/\/+$/, "")}${url.hash}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
};

/** True when `child` points inside `parent` ("/services" → "/services/drains" or "/services#drains"). */
function linksUnder(parent: CompositionNode, child: CompositionNode): boolean {
  const base = pathOf(parent.href);
  const target = pathOf(child.href);
  if (!base || base === "/" || base.includes("#") || !target || target === base) return false;
  return target.startsWith(`${base}/`) || target.startsWith(`${base}#`);
}

/** Layering an AI sometimes puts on submenu links; in a menu bar it stacks labels on top of each other. */
function plainSubLink(node: CompositionNode): CompositionNode {
  const strip = (style: NodeStyle | undefined): NodeStyle | undefined => {
    if (!style) return style;
    const { position, top, left, right, bottom, zIndex, overlap, rotate, depth, ...rest } = style;
    void position; void top; void left; void right; void bottom; void zIndex; void overlap; void rotate; void depth;
    return rest;
  };
  const responsive = node.responsive
    ? (Object.fromEntries(Object.entries(node.responsive).map(([k, v]) => [k, strip(v)])) as CompositionNode["responsive"])
    : undefined;
  const { children, style, ...rest } = node;
  void children;
  const plainStyle = strip(style);
  return { ...rest, ...(plainStyle ? { style: plainStyle } : {}), ...(responsive ? { responsive } : {}) };
}

const withSubmenu = (parent: CompositionNode, subs: CompositionNode[]): CompositionNode => ({
  ...plainSubLink(parent),
  children: [...(parent.children ?? []).filter(isNavLink), ...subs].map(plainSubLink),
});

const isLinkGroup = (node: CompositionNode | undefined): boolean =>
  Boolean(node && node.type !== "link" && node.type !== "button" && node.children?.length && node.children.every(isNavLink));

/**
 * Folds submenu shapes in an AI menu bar into one form — a link whose children
 * are its sub-links — so the header can render a real dropdown instead of
 * laying every sub-link into the bar. Recognised shapes:
 *  - a group whose first child is a link and the rest are links under it, or a
 *    single group of links (e.g. [Services, [Drains, Heaters]]);
 *  - a link followed by sibling links that point inside it (/services/...).
 */
export function foldHeaderSubmenus(tree: CompositionTree): CompositionTree {
  const fold = (node: CompositionNode): CompositionNode => {
    if (node.type === "link" && node.children?.some(isNavLink)) return withSubmenu(node, []);
    const kids = node.children;
    if (!kids?.length) return node;
    const first = kids[0];
    const rest = kids.slice(1);
    const group = rest.length === 1 && isLinkGroup(rest[0]) ? rest[0] : undefined;
    if (isNavLink(first) && rest.length > 0 && (group || rest.every((n) => isNavLink(n) && linksUnder(first, n)))) {
      return withSubmenu(first, group?.children ?? rest);
    }
    const out: CompositionNode[] = [];
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i]!;
      if (isNavLink(kid)) {
        const subs: CompositionNode[] = [];
        for (let next = kids[i + 1]; isNavLink(next) && linksUnder(kid, next); next = kids[i + 1]) {
          subs.push(next);
          i++;
        }
        out.push(subs.length ? withSubmenu(kid, subs) : kid);
        continue;
      }
      out.push(fold(kid));
    }
    return { ...node, children: out };
  };
  return { ...tree, root: fold(tree.root) };
}
