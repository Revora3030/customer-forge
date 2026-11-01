import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { legibleType } from "@/components/site/CompositionRenderer";
import { SiteScrollProgress } from "@/components/site/SiteScrollProgress";
import { Button } from "@/components/ui/button";

describe("legibleType: no tiny, dim copy (audit item 3)", () => {
  it("raises 10px / 45% opacity copy over a photo to 14px / 90%", () => {
    const style = { fontSize: 10, opacity: 0.45 } as React.CSSProperties;
    legibleType({ type: "text" }, style, true);
    expect(style).toMatchObject({ fontSize: 14, opacity: 0.9 });
  });
  it("uses a gentler floor away from photos and reads px / rem strings", () => {
    const a = { fontSize: "10px", opacity: 0.5 } as React.CSSProperties;
    legibleType({ type: "quote" }, a, false);
    expect(a).toMatchObject({ fontSize: 12, opacity: 0.8 });
    const b = { fontSize: "0.6rem" } as React.CSSProperties;
    legibleType({ type: "text" }, b, true);
    expect(b.fontSize).toBe(14);
  });
  it("leaves big copy, non-text nodes and unset values alone", () => {
    const big = { fontSize: 18, opacity: 1 } as React.CSSProperties;
    legibleType({ type: "heading" }, big, true);
    expect(big).toEqual({ fontSize: 18, opacity: 1 });
    const box = { fontSize: 8, opacity: 0.1 } as React.CSSProperties;
    legibleType({ type: "media" }, box, true);
    expect(box).toEqual({ fontSize: 8, opacity: 0.1 });
    const none = {} as React.CSSProperties;
    legibleType({ type: "text" }, none, true);
    expect(none).toEqual({});
  });
});

describe("scroll meter pill never starts as '0% ...'", () => {
  it("server markup is hidden and empty, with no percentage text", () => {
    const html = renderToStaticMarkup(<SiteScrollProgress label="detailed" />);
    expect(html).toContain('data-testid="site-scroll-meter"');
    expect(html).toMatch(/data-testid="site-scroll-meter" hidden=""><\/span>/);
    expect(html).not.toContain("0% detailed");
  });
});

describe("builder device button 2560 (audit item 3)", () => {
  it("builder preview viewport buttons don't wrap or use the fixed 32px icon box", () => {
    const src = readFileSync("src/components/app/BuilderPreview.tsx", "utf8");
    const at = src.indexOf("relative z-30 inline-flex min-h-11 min-w-11");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 120);
    expect(block).toContain("whitespace-nowrap");
    expect(block).toContain("wrap-normal");
    expect(src).not.toMatch(/size="icon-sm"\s+variant=\{viewport === option\.key/);
  });
  it("the sm Button size has no fixed width, so four digits fit on one line", () => {
    const html = renderToStaticMarkup(<Button size="sm" className="whitespace-nowrap wrap-normal">2560</Button>);
    expect(html).toContain("whitespace-nowrap");
    expect(html).not.toContain("wrap-anywhere");
    expect(html).not.toMatch(/\bsize-(8|9)\b/);
  });
});
