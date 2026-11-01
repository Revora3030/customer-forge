import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { heroPreloadLink } from "@/lib/site-hero-preload";
import { heroPreloadLinks } from "@/lib/site-head";
import type { CompositionTree } from "@/lib/builder/composition-tree";

const PEXELS = "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress";
const CDN = "https://cdn.example/hero.jpg";
const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";

type Visual = Record<string, unknown>;
const section = (root: unknown, components: { id: string; url: string; visual?: Visual }[] = [], extra: Record<string, unknown> = {}) => ({
  id: "s1",
  kind: "custom",
  settings: { composition: { version: 1, root } },
  components: components.map((c) => ({ id: c.id, url: c.url, settings: c.visual ? { visual: c.visual } : {} })),
  ...extra,
});

/** The first <img> the real renderer would put on the page for the same section. */
function firstRenderedImage(row: ReturnType<typeof section>): { src: string | null; srcset: string | null } {
  const tree = row.settings.composition as unknown as CompositionTree;
  const html = renderToStaticMarkup(
    <CompositionRenderer
      tree={tree}
      scope="t"
      resolveMedia={(ref: string) => {
        const c = row.components.find((x) => x.id === ref);
        return c ? { url: c.url, visual: (c.settings as { visual?: Visual }).visual ?? {} } : null;
      }}
    />,
  );
  const img = html.match(/<img\b[^>]*>/)?.[0] ?? "";
  const attr = (name: string) => img.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, "&") ?? null;
  return { src: attr("src"), srcset: attr("srcSet") ?? attr("srcset") };
}

describe("hero image preload", () => {
  it("preloads the first picture with the renderer's own srcset", () => {
    const row = section({ type: "stack", children: [{ type: "heading", level: 1, text: "Hi" }, { type: "media", mediaRef: M1, alt: "Fictional van" }, { type: "media", mediaRef: M2, alt: "Fictional van" }] }, [
      { id: M1, url: PEXELS, visual: { width: 1600, height: 900 } },
      { id: M2, url: CDN },
    ]);
    const link = heroPreloadLink([row]);
    expect(link).toMatchObject({ rel: "preload", as: "image", fetchPriority: "high", href: PEXELS });
    expect(link?.imageSrcSet).toContain("w=");
    const rendered = firstRenderedImage(row);
    expect(rendered.src).toBe(link?.href);
    expect(rendered.srcset).toBe(link?.imageSrcSet);
  });
  it("preloads a scene backdrop, plain when the photo is framed", () => {
    const root = { type: "scene", children: [{ type: "media", mediaRef: M1, alt: "Fictional van" }, { type: "heading", level: 1, text: "Hi" }] };
    const small = section(root, [{ id: M1, url: CDN, visual: { width: 1024, height: 683 } }]);
    expect(heroPreloadLink([small])).toEqual({ rel: "preload", as: "image", href: CDN, fetchPriority: "high" });
    expect(firstRenderedImage(small).src).toBe(CDN);
    const big = section(root, [{ id: M1, url: PEXELS, visual: { width: 2400, height: 1600 } }]);
    const link = heroPreloadLink([big]);
    expect(link?.imageSizes).toBe("100vw");
    expect(firstRenderedImage(big).src).toBe(link?.href);
  });
  it("skips sections that cannot render and reads the first that can", () => {
    const row = section({ type: "media", mediaRef: M1, alt: "Fictional van" }, [{ id: M1, url: CDN }]);
    expect(heroPreloadLink([{ id: "", kind: "x" }, row])?.href).toBe(CDN);
  });
  it("preloads nothing it cannot be sure of", () => {
    expect(heroPreloadLink(null)).toBeNull();
    expect(heroPreloadLink([])).toBeNull();
    expect(heroPreloadLink([section({ type: "heading", level: 1, text: "No pictures" })])).toBeNull();
    expect(heroPreloadLink([section({ type: "media", mediaRef: M1, alt: "Fictional van" }, [{ id: M1, url: "https://cdn.example/clip.mp4" }])])).toBeNull();
    expect(heroPreloadLink([section({ type: "media", mediaRef: M1, alt: "Fictional van" }, [{ id: M1, url: CDN, visual: { media_kind: "video" } }])])).toBeNull();
    expect(heroPreloadLink([section({ type: "media", mediaRef: M1, alt: "Fictional van" }, [{ id: M1, url: "http://insecure.example/a.jpg" }])])).toBeNull();
    expect(heroPreloadLink([section({ type: "media", mediaRef: M1, alt: "Fictional van" }, [{ id: M1, url: "//evil.example/a.jpg" }])])).toBeNull();
    expect(heroPreloadLink([section({ type: "media", mediaRef: M1, alt: "Fictional van" }, [{ id: M1, url: "javascript:alert(1)" }])])).toBeNull();
    // A legacy section without a stored layout is translated on the fly: unknown picture.
    expect(heroPreloadLink([{ id: "s1", kind: "hero", settings: {}, components: [{ id: M1, url: CDN }] }])).toBeNull();
  });
  it("is wrapped as a head links list", () => {
    expect(heroPreloadLinks([section({ type: "media", mediaRef: M1, alt: "Fictional van" }, [{ id: M1, url: CDN }])])).toHaveLength(1);
    expect(heroPreloadLinks(undefined)).toEqual([]);
  });
});
