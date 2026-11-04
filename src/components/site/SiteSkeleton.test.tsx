import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteSkeleton } from "@/components/site/SiteSkeleton";
import { framePainted, nextPreviewLoadState } from "@/lib/builder/preview-load";

describe("SiteSkeleton", () => {
  it("announces once and hides the decorative shapes", () => {
    const html = renderToStaticMarkup(<SiteSkeleton label="Loading your draft…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('<span class="sr-only">Loading your draft…</span>');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("motion-reduce:animate-none");
    expect(html.replace(/<span class="sr-only">[^<]*<\/span>/, "")).not.toMatch(/>[^<\s][^<]*</);
  });
  it("has a phone layout", () => {
    const wide = renderToStaticMarkup(<SiteSkeleton />);
    const phone = renderToStaticMarkup(<SiteSkeleton compact />);
    expect(wide).toContain("grid-cols-3");
    expect(phone).toContain("grid-cols-1");
  });
});

describe("builder frame paint detection", () => {
  const doc = (url: string, hasMain: boolean) => ({ URL: url, querySelector: (s: string) => (s === "main" && hasMain ? {} : null) });
  it("lifts the skeleton once the page itself is drawn", () => {
    expect(framePainted(doc("https://app.example/p/abc", true))).toBe(true);
    expect(framePainted(doc("https://app.example/draft/acme", false))).toBe(false);
    expect(framePainted(doc("about:blank", true))).toBe(false);
    expect(framePainted(null)).toBe(false);
    expect(nextPreviewLoadState("loading", "painted")).toBe("loaded");
  });
});
