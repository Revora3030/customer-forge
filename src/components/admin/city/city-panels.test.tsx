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

import { ApprovalCard, type ApprovalItem } from "./ApprovalCard";

describe("ApprovalCard", () => {
  const item: ApprovalItem = { id: "q1", item_type: "outreach_email", summary: "Pitch to Acme Roofing", preview: "Hi Acme,\n$350 one-time setup, first month free, then $100/month.", risk_level: "high", status: "pending", created_at: new Date(NOW - 3 * 3_600_000).toISOString() };
  const render = (over: Partial<ApprovalItem> = {}, extra: { busy?: boolean; note?: string | null } = {}) => renderToStaticMarkup(<ApprovalCard item={{ ...item, ...over }} now={NOW} busy={extra.busy ?? false} note={extra.note ?? null} onApprove={() => undefined} onReject={() => undefined} />);

  it("shows the whole content to be approved, its type, risk and age", () => {
    const html = render();
    expect(html).toContain("Pitch to Acme Roofing");
    expect(html).toContain("$350 one-time setup, first month free, then $100/month.");
    expect(html).toContain("outreach email");
    expect(html).toContain("high risk");
    expect(html).toContain("3h ago");
    expect(html).toContain("Approve this");
  });

  it("will not let an item with no saved preview be approved blind", () => {
    const html = render({ preview: null });
    expect(html).toContain("nothing to review");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(?:<svg[\s\S]*?<\/svg>)?\s*Approve this/);
  });

  it("disables both actions while a decision is in flight and shows the server's note", () => {
    const html = render({}, { busy: true, note: "This item changed after you opened it." });
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("This item changed after you opened it.");
  });
});

describe("CityAttention failure groups", () => {
  const trace = (i: number): CityWork => ({ id: `t${i}`, district: "institute", status: "failed", title: `stage${i}`, source: "ai_team_trace", detail: "provider_unavailable: 402", at: new Date(NOW - (5 + i) * 60_000).toISOString() });
  const snap: CitySnapshot = { checkedAt: "", sources: { traces: { available: true, total: 50, truncated: false, rows: Array.from({ length: 50 }, (_, i) => trace(i)) } } };

  it("shows 50 failures with one cause as one problem with a triage and dismiss action", () => {
    const html = renderToStaticMarkup(<CityAttention items={attentionItems(snap, NOW, 1000)} available onOpen={() => undefined} onTriage={() => undefined} onDismiss={() => undefined} onClear={() => undefined} />);
    expect(html).toContain("50 failed (1 cause) · 0 waiting");
    expect(html).toContain("50× AI model calls");
    expect(html).toContain("Triage with Jarvis");
    expect(html).toContain("Dismiss");
    expect(html).not.toContain("Showing the");
  });
});
