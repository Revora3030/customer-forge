import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COMPARISONS } from "@/lib/compare";

import { SeoMarkdown } from "./SeoMarkdown";

const render = (source: string, isLive?: (href: string) => boolean) =>
  renderToStaticMarkup(createElement(SeoMarkdown, isLive ? { source, isLive } : { source }));

describe("SeoMarkdown", () => {
  it("renders headings, bold, links and nested lists", () => {
    const html = render("## Title\n\nSome **bold** and [a link](/pricing).\n\n- one\n  - nested\n- two\n");
    expect(html).toContain("<h2");
    expect(html).toContain("<strong");
    expect(html).toContain('href="/pricing"');
    expect(html.match(/<ul/g)?.length).toBe(2);
    expect(html.match(/<li/g)?.length).toBe(3);
  });

  it("renders a pipe table with an accessible empty header cell and row headers", () => {
    const html = render("| | A | B |\n|---|---|---|\n| Row | 1 | 2 |\n");
    expect(html).toContain("<table");
    expect(html).toContain('<span class="sr-only">Factor</span>');
    expect(html).toContain('scope="row"');
    expect(html).toContain('role="region"');
  });

  it("links bare URLs safely and leaves links to unpublished pages as plain text", () => {
    const html = render("See https://example.com/x and [soon](/guides/later).", (href) => href !== "/guides/later");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('href="/guides/later"');
    expect(html).toContain("soon");
  });

  it("never emits raw HTML from content", () => {
    expect(render("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("renders every comparison page without leftover markdown syntax", () => {
    for (const c of COMPARISONS) {
      const html = render(c.body);
      expect(html, c.slug).not.toMatch(/\*\*|\]\(|\|---/);
    }
  });
});
