import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CityAttention } from "./CityAttention";
import { CityActivity } from "./CityActivity";
import { Sparkline } from "./Sparkline";
import { attentionItems, type CitySnapshot, type CityWork } from "@/lib/ai-city";

const NOW = Date.parse("2026-10-27T18:00:00Z");
const row = (id: string, district: CityWork["district"], status: string, minutesAgo: number, title: string): CityWork => ({ id, district, status, title, source: "generation_jobs", at: new Date(NOW - minutesAgo * 60_000).toISOString() });
const SNAP: CitySnapshot = {
  checkedAt: "",
  sources: { jobs: { available: true, total: 3, truncated: false, rows: [row("a", "factory", "failed", 360, "Layout rescue"), row("b", "growth", "pending", 90, "Pitch to Acme"), row("c", "factory", "ok", 5, "Wording")] } },
};

describe("CityAttention", () => {
  it("lists failures before waiting items with how long they have stood", () => {
    const html = renderToStaticMarkup(<CityAttention items={attentionItems(SNAP, NOW)} available onOpen={() => undefined} />);
    expect(html.indexOf("Layout rescue")).toBeLessThan(html.indexOf("Pitch to Acme"));
    expect(html).toContain("1 failed · 1 waiting");
    expect(html).toContain("6h");
    expect(html).toContain("Website Factory");
  });

  it("says plainly when nothing needs attention and when records could not be read", () => {
    expect(renderToStaticMarkup(<CityAttention items={[]} available onOpen={() => undefined} />)).toContain("Nothing failed or waiting in the records read");
    const unreadable = renderToStaticMarkup(<CityAttention items={[]} available={false} onOpen={() => undefined} />);
    expect(unreadable).toContain("Records unavailable");
    expect(unreadable).not.toContain("Nothing failed");
  });

  it("caps the list and reports how many were left out", () => {
    const many = Array.from({ length: 10 }, (_, i) => row(`f${i}`, "factory", "failed", 10 + i, `Job ${i}`));
    const html = renderToStaticMarkup(<CityAttention items={attentionItems({ checkedAt: "", sources: { jobs: { available: true, total: 10, truncated: false, rows: many } } }, NOW)} available onOpen={() => undefined} />);
    expect(html).toContain("Showing the 6 most urgent of 10");
  });
});

describe("CityActivity", () => {
  it("shows the newest recorded entries first with a labelled search and district filters", () => {
    const html = renderToStaticMarkup(<CityActivity snapshot={SNAP} now={NOW} onOpen={() => undefined} />);
    expect(html.indexOf("Wording")).toBeLessThan(html.indexOf("Pitch to Acme"));
    expect(html).toContain('aria-label="Search recorded activity"');
    expect(html).toContain("Showing 3 of 3 recorded entries");
    expect(html).toContain("Growth &amp; Sales Hub");
  });

  it("does not present unreadable records as an empty feed", () => {
    const html = renderToStaticMarkup(<CityActivity snapshot={undefined} now={NOW} onOpen={() => undefined} />);
    expect(html).toContain("could not be read");
    expect(html).not.toContain("No recorded entries");
  });
});

describe("Sparkline", () => {
  it("draws one bar per hour and names the peak", () => {
    const html = renderToStaticMarkup(<Sparkline values={[0, 1, 4, 2]} label="Records per hour" />);
    expect((html.match(/<rect/g) ?? []).length).toBe(4);
    expect(html).toContain("peak 4 per hour");
  });

  it("says so instead of drawing a flat line when nothing was recorded", () => {
    const html = renderToStaticMarkup(<Sparkline values={[0, 0, 0]} label="x" />);
    expect(html).toContain("No records in the last 3 hours");
    expect(html).not.toContain("<svg");
  });
});

import { DistrictCarousel } from "./DistrictCarousel";

describe("DistrictCarousel", () => {
  const html = renderToStaticMarkup(<DistrictCarousel selected="growth" snapshot={SNAP} now={NOW} onSelect={() => undefined} onOpen={() => undefined} />);

  it("offers every district as a thumb-sized button inside a safe-area-padded phone-only bar", () => {
    expect((html.match(/<button/g) ?? []).length).toBe(7);
    expect(html).toContain("env(safe-area-inset-bottom)");
    expect(html).toContain("sm:hidden");
    expect(html).toContain("min-h-14");
  });

  it("marks the chosen district, says how many records are open, and names the state for screen readers", () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Tap to open");
    expect(html).toContain("Website Factory, attention, 1 need attention");
  });

  it("never reports an unreadable district as healthy", () => {
    const unreadable = renderToStaticMarkup(<DistrictCarousel selected="factory" snapshot={undefined} now={NOW} onSelect={() => undefined} onOpen={() => undefined} />);
    expect(unreadable).toContain("Website Factory, unavailable");
    expect(unreadable).not.toContain("idle");
  });
});
