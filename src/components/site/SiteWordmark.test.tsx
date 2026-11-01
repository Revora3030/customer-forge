import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteWordmark } from "@/components/site/SiteWordmark";

describe("SiteWordmark", () => {
  it("renders an accessible, deterministic SVG lockup", () => {
    const a = renderToStaticMarkup(<SiteWordmark name="Elite Mobile Detailing" trade="auto detailing" />);
    const b = renderToStaticMarkup(<SiteWordmark name="Elite Mobile Detailing" trade="auto detailing" />);
    expect(a).toBe(b);
    expect(a).toContain('role="img"');
    expect(a).toContain('aria-label="Elite Mobile Detailing"');
    expect(a).toContain("<title>Elite Mobile Detailing</title>");
    expect(a).toContain(">EM<");
    expect(a).toContain("var(--primary");
    expect(a).toContain("var(--font-display");
  });
  it("escapes hostile names instead of injecting markup", () => {
    const html = renderToStaticMarkup(<SiteWordmark name={'<script>alert(1)</script> "Bob" & Sons'} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/aria-label="[^"]*<[^"]*"/);
  });
  it("scales: mark-only is square and a long name stays inside the viewBox", () => {
    const mark = renderToStaticMarkup(<SiteWordmark name="Acme" variant="mark" height={32} />);
    expect(mark).toContain('viewBox="0 0 36 40"');
    expect(mark).not.toContain("textLength");
    const long = renderToStaticMarkup(<SiteWordmark name="Southeastern Heating Cooling and Air Quality Specialists" />);
    expect((long.match(/<text /g) ?? []).length).toBe(3);
    expect(long).toContain('viewBox="0 0 ');
  });
});
