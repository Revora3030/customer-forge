/**
 * AI-authored site chrome (menu bar and footer).
 *
 * Sol designs both as ordinary composition trees; they are stored on
 * `website_settings.generation.chrome`. Reading re-validates every tree, so bad
 * stored data renders nothing rather than a substitute design. Sites without an
 * AI-authored chrome show no replacement chrome; the build/review pipeline must
 * repair or reject them instead of installing fixed copy.
 */
import { validateComposition, type CompositionTree } from "@/lib/builder/composition-tree";

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
 * Site-internal links are authored as "/" or "/<page>". On the platform share
 * path they must become "/s/<slug>/<page>"; on the owner's own domain they stay.
 */
export function resolveSiteHref(rawHref: string, slug: string, ownAddress: boolean): string {
  // "/home" is the home page's slug; it is the same page as "/".
  const href = rawHref === "/home" ? "/" : rawHref.replace(/^\/home(?=[#?])/, "/");
  if (ownAddress || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/s/")) return href;
  const base = `/s/${encodeURIComponent(slug)}`;
  if (href === "/") return base;
  if (href.startsWith("/#") || href.startsWith("/?")) return `${base}${href.slice(1)}`;
  return `${base}${href}`;
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
