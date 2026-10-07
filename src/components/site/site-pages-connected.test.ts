import { describe, expect, it } from "vitest";
import { readablePaint } from "@/components/site/CompositionRenderer";
import { contrastRatio } from "@/lib/readable-color";
import { pageNavLabel, stripBusinessSuffix } from "@/lib/website-content";
import { durationLabel, reviewWallItems, serviceMenuItems } from "@/components/site/live-blocks-utils";
import { COMPOSITION_WIDGETS, validateComposition } from "@/lib/builder/composition-tree";

describe("readable text on AI layouts", () => {
  it("fixes white text on a pale grey hero panel (the washed-out hero)", () => {
    const panel = readablePaint({ type: "stack", style: { background: "#c4c4c4" } }, { bg: "#0b0b0d", fg: "#ffffff" });
    const heading = readablePaint({ type: "heading", style: { color: "#ffffff" } }, panel);
    expect(heading.color).toBeDefined();
    expect(contrastRatio(heading.color!, "#c4c4c4")!).toBeGreaterThanOrEqual(4.5);
    const body = readablePaint({ type: "text", style: {} }, panel);
    expect(contrastRatio(body.color ?? panel.fg!, "#c4c4c4")!).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves an already readable choice untouched", () => {
    const out = readablePaint({ type: "heading", style: { color: "#111111", background: "#ffffff" } }, {});
    expect(out.color).toBeUndefined();
  });

  it("rejects sub-AA contrast even for large headings", () => {
    const out = validateComposition({
      version: 1,
      root: { type: "heading", level: 1, text: "Readable", style: { color: "#ffffff", background: "#c4c4c4", size: 64 } },
    });
    expect(out.ok).toBe(false);
    expect(out.ok ? [] : out.issues.some((issue) => issue.problem.includes("below 4.5"))).toBe(true);
  });

  it("checks both ends of a gradient", () => {
    const out = readablePaint({ type: "text", style: { color: "#ffffff", background: "#ffffff", gradientTo: "#000000" } }, {});
    expect(out.color).toBeDefined();
  });
});

describe("page names in menus and tabs", () => {
  it("drops the repeated business name", () => {
    expect(pageNavLabel("Services — Test Business Co.", "Test Business Co.", "services")).toBe("Services");
    expect(pageNavLabel("About | Acme", "Acme", "about")).toBe("About");
    expect(pageNavLabel("Acme: Contact", "Acme", "contact")).toBe("Contact");
    expect(pageNavLabel("Test Business Co.", "Test Business Co.", "home")).toBe("Home");
    expect(pageNavLabel("Pricing", "Acme", "pricing")).toBe("Pricing");
    expect(pageNavLabel("", "Acme", "book-now")).toBe("Book Now");
  });
  it("keeps the logo link text", () => {
    expect(stripBusinessSuffix("Acme", "Acme")).toBe("Acme");
    expect(stripBusinessSuffix("Book — Acme", "Acme")).toBe("Book");
  });
});

describe("Services and Reviews tools reach the website", () => {
  it("lists live services, featured first, with real prices", () => {
    const items = serviceMenuItems([
      { id: "1", name: "Wash", price: 40, duration_minutes: 45, sort_order: 2, bookable: true },
      { id: "2", name: "Ceramic coating", starting_price: 600, duration_minutes: 240, sort_order: 5, featured: true },
      { id: "3", name: "   ", price: 1 },
    ]);
    expect(items.map((i) => i.name)).toEqual(["Ceramic coating", "Wash"]);
    expect(items[0]!.price).toMatch(/^From \$600/);
    expect(items[0]!.duration).toBe("4 hr");
    expect(items[1]!.bookable).toBe(true);
  });
  it("shows only reviews with real words", () => {
    const items = reviewWallItems([
      { id: "a", author_name: "Dana", rating: 5, comment: "Car looked brand new after the detail." },
      { id: "b", author_name: null, rating: 9, comment: "ok" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.rating).toBe(5);
  });
  it("formats durations", () => {
    expect(durationLabel(90)).toBe("1 hr 30 min");
    expect(durationLabel(0)).toBeNull();
  });
  it("lets AI layouts place the live service menu and review wall", () => {
    expect(COMPOSITION_WIDGETS).toContain("service_menu");
    expect(COMPOSITION_WIDGETS).toContain("review_wall");
    const result = validateComposition({ version: 1, root: { type: "stack", children: [{ type: "widget", text: "service_menu" }, { type: "widget", text: "review_wall" }] } });
    expect(result.ok).toBe(true);
  });
});
