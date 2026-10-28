import { describe, expect, it } from "vitest";
import { buildReport } from "./build-report";

const section = (root: unknown) => ({ settings: { composition: { version: 1, root } } });

describe("buildReport", () => {
  it("counts primitives, interactive blocks, pictures and stage timings", () => {
    const report = buildReport(
      [
        section({ type: "stack", children: [{ type: "heading", level: 2, text: "A" }, { type: "faq_accordion", faqItems: [{ question: "Q", answer: "A" }] }] }),
        section({ type: "collection_row", text: "Row", children: [{ type: "offer_card", text: "One", children: [{ type: "button", text: "Book", href: "/book" }] }] }),
        { settings: {} },
      ],
      [{ status: "approved" }, { status: "approved" }, { status: "rejected" }],
      { pictures: 41300, copy: 9200, bad: -1 },
    );
    expect(report.sections).toBe(3);
    expect(report.composed).toBe(2);
    expect(report.interactive).toBe(2);
    expect(report.primitives.find((p) => p.type === "heading")?.count).toBe(1);
    expect(report.pictures).toEqual({ total: 3, approved: 2, pending: 0, rejected: 1, failed: 0 });
    expect(report.stages).toEqual([{ stage: "pictures", seconds: 41.3 }, { stage: "copy", seconds: 9.2 }]);
  });

  it("handles a site with nothing composed", () => {
    const report = buildReport([], [], null);
    expect(report).toMatchObject({ sections: 0, composed: 0, interactive: 0, primitives: [], stages: [] });
  });
});
