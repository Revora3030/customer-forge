/**
 * Audit P1-07: a public page loads at most two font families (the site's
 * display + body pairing). A face named inside an AI layout is read as a role
 * and never becomes a font download or a literal font-family.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import { clientHeadExtrasSync } from "@/lib/site-head";
import { compositionFonts, pairingRoleFont, siteFontsHref } from "@/lib/site-theme";

const families = (href: string | null | undefined) => (href ? [...href.matchAll(/family=([^&:]+)/g)].map((m) => decodeURIComponent(m[1]!.replace(/\+/g, " "))) : []);

describe("font cap (audit P1-07)", () => {
  it("renders an off-pair face as the pairing's display or body variable, never literally", () => {
    const tree = {
      version: 1,
      root: { type: "stack", children: [{ type: "heading", level: 1, text: "Hello", style: { font: "Lobster" } }, { type: "text", text: "World", style: { font: "Pacifico" } }] },
    } as unknown as CompositionTree;
    const html = renderToStaticMarkup(<CompositionRenderer tree={tree} scope="s-font" resolveMedia={() => null} />);
    expect(html).not.toMatch(/Lobster|Pacifico/);
    expect(pairingRoleFont("Lobster", true)).toBe("var(--font-heading)");
    expect(pairingRoleFont("Pacifico", false)).toBe("var(--font-body)");
  });

  it("a page's head requests exactly the pairing, even when layouts name other faces", () => {
    const site = { org: { name: "Harbor Line", slug: "harbor-line", industry: "Plumbing" }, profile: { font_preference: "Bricolage Grotesque|Public Sans" } };
    const named = compositionFonts([{ root: { type: "heading", style: { font: "Lobster" } } }]);
    const { links } = clientHeadExtrasSync(site as never, "https://example.com", compositionFonts, siteFontsHref, () => ({ header: null, footer: null }));
    const sheets = links.filter((link) => "href" in link && String(link.href).includes("fonts.googleapis.com/css2"));
    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      const names = families((sheet as { href: string }).href);
      expect(names.length).toBeLessThanOrEqual(2);
      for (const name of named) expect(names).not.toContain(name);
    }
  });
});
