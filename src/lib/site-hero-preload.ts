/**
 * `<link rel="preload" as="image">` for a client page's opening picture.
 *
 * The first picture of the first section is the page's largest paint on almost
 * every generated site. The renderer already loads it eagerly with
 * `fetchpriority="high"`, but the browser only discovers it once the HTML body
 * is parsed and the stylesheet has arrived. A preload in the <head> starts the
 * download with the first bytes of the response instead.
 *
 * This follows the renderer's own rules exactly (CompositionRenderer: the first
 * `media` node met in tree order, a scene's backdrop first; `src` beats a
 * stored component; the same srcset/sizes), so the preloaded URL is the one the
 * page then asks for and nothing is downloaded twice. When the opening picture
 * cannot be known for sure (a video, a 3D model, an unsafe address, a legacy
 * section the renderer translates on the fly), nothing is preloaded.
 */
import { isRenderableSection } from "@/components/site/site-sections-utils";
import { readComposition, type CompositionNode } from "@/lib/builder/composition-tree";
import { responsiveImage } from "@/lib/builder/image-framing";
import { resolveImageSource } from "@/lib/brand-logos";
import { fitsFullBleed } from "@/lib/builder/first-build-image-qa";
import { isModelUrl } from "@/lib/site-models";
import { readComponentVisual, type PersistedComponentVisual } from "@/lib/site-style";

const VIDEO_SOURCE = /\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i;

export type HeroPreloadLink = {
  rel: "preload";
  as: "image";
  href: string;
  fetchPriority: "high";
  imageSrcSet?: string;
  imageSizes?: string;
};

type SectionLike = {
  id?: unknown;
  kind?: unknown;
  settings?: unknown;
  components?: unknown;
};

type Found = { node: CompositionNode; scene: boolean };

/** The first media node the renderer will meet, in its own order. */
function firstMedia(node: CompositionNode | undefined, depth = 0): Found | null {
  if (!node || depth > 40) return null;
  if (node.type === "media") return { node, scene: false };
  const children = node.children ?? [];
  if (node.type === "scene") {
    const [backdrop] = children;
    if (backdrop?.type === "media") return { node: backdrop, scene: true };
  }
  for (const child of children) {
    const found = firstMedia(child, depth + 1);
    if (found) return found;
  }
  const tabs = (node as { tabs?: { children?: CompositionNode[] }[] }).tabs ?? [];
  for (const tab of tabs) {
    for (const child of tab.children ?? []) {
      const found = firstMedia(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function safeImageAddress(source: string | null | undefined): string | null {
  if (!source) return null;
  const value = source.trim();
  if (!value || value.length > 2000) return null;
  if (VIDEO_SOURCE.test(value) || isModelUrl(value)) return null;
  if (value.startsWith("https://")) return value;
  // Same-origin uploads served by the app itself.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

function mediaSizes(visual: PersistedComponentVisual | undefined): string {
  return visual?.width ? `(max-width: ${visual.width}px) 100vw, ${visual.width}px` : "100vw";
}

/**
 * The preload link for a page's opening picture, or null.
 *
 * Only an AI-designed (stored) layout on the first renderable section is read:
 * that is what every current build produces, and it is the only case where the
 * picture the page will request is certain.
 */
export function heroPreloadLink(sections: unknown): HeroPreloadLink | null {
  if (!Array.isArray(sections)) return null;
  // Same rule as SitePageView: the first row that can be drawn is "first".
  const first = sections.find((row) => isRenderableSection(row)) as SectionLike | undefined;
  if (!first) return null;
  const tree = readComposition(first.settings);
  const found = firstMedia(tree?.root);
  if (!found) return null;
  const components = Array.isArray(first.components) ? (first.components as { id?: unknown; url?: unknown; settings?: unknown }[]) : [];
  const stored = found.node.mediaRef ? components.find((component) => component && component.id === found.node.mediaRef) : undefined;
  const visual = stored ? readComponentVisual(stored.settings) : undefined;
  if (visual?.media_kind === "video") return null;
  const raw = found.node.src ? resolveImageSource(found.node.src) : typeof stored?.url === "string" ? stored.url : null;
  const href = safeImageAddress(raw);
  if (!href) return null;
  // A scene photo too small to fill the screen is drawn at its own size from
  // the plain address (renderScene "framed"), so that is what gets preloaded.
  if (found.scene && !found.node.src && !fitsFullBleed(visual)) {
    return { rel: "preload", as: "image", href, fetchPriority: "high" };
  }
  const responsive = responsiveImage(href, found.scene ? "100vw" : mediaSizes(visual));
  return {
    rel: "preload",
    as: "image",
    href: responsive.src,
    fetchPriority: "high",
    ...(responsive.srcSet ? { imageSrcSet: responsive.srcSet, imageSizes: responsive.sizes ?? "100vw" } : {}),
  };
}
