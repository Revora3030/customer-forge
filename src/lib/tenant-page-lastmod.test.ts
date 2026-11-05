import { describe, expect, it } from "vitest";
import { pageFingerprint, perPageLastmod } from "./tenant-page-lastmod";

const page = (slug: string, heading: string, id = `p-${slug}`) => ({
  id,
  slug,
  kind: slug === "home" ? "home" : "page",
  sections: [{ id: `s-${id}`, page_id: id, heading, components: [{ id: `c-${id}`, text: heading }] }],
});

describe("perPageLastmod", () => {
  it("dates each page to the publish where it last changed", () => {
    const v3 = { publishedAt: "2026-11-03T00:00:00.000Z", pages: [page("home", "New hero"), page("services", "Wash")] };
    const v2 = { publishedAt: "2026-11-02T00:00:00.000Z", pages: [page("home", "Old hero"), page("services", "Wash")] };
    const v1 = { publishedAt: "2026-11-01T00:00:00.000Z", pages: [page("home", "Old hero"), page("services", "Wash")] };
    const out = perPageLastmod([v3, v2, v1]);
    expect(out.get("home")).toBe(v3.publishedAt);
    expect(out.get("services")).toBe(v1.publishedAt);
  });

  it("stops at the first break in the run, never skipping back past a change", () => {
    const out = perPageLastmod([
      { publishedAt: "2026-11-03T00:00:00.000Z", pages: [page("about", "A")] },
      { publishedAt: "2026-11-02T00:00:00.000Z", pages: [page("about", "B")] },
      { publishedAt: "2026-11-01T00:00:00.000Z", pages: [page("about", "A")] },
    ]);
    expect(out.get("about")).toBe("2026-11-03T00:00:00.000Z");
  });

  it("ignores row ids so a restore that renumbers rows is not a change", () => {
    expect(pageFingerprint(page("faq", "Q", "x1"))).toBe(pageFingerprint(page("faq", "Q", "x2")));
  });

  it("uses the live publish time when there is no history or a version has no date", () => {
    expect(perPageLastmod([{ publishedAt: "2026-11-03T00:00:00.000Z", pages: [page("home", "H")] }]).get("home")).toBe("2026-11-03T00:00:00.000Z");
    const out = perPageLastmod([
      { publishedAt: "2026-11-03T00:00:00.000Z", pages: [page("home", "H")] },
      { publishedAt: null, pages: [page("home", "H")] },
    ]);
    expect(out.get("home")).toBe("2026-11-03T00:00:00.000Z");
    expect(perPageLastmod([]).size).toBe(0);
  });

  it("a page new in the live publish gets the live date", () => {
    const out = perPageLastmod([
      { publishedAt: "2026-11-03T00:00:00.000Z", pages: [page("gallery", "G")] },
      { publishedAt: "2026-11-01T00:00:00.000Z", pages: [] },
    ]);
    expect(out.get("gallery")).toBe("2026-11-03T00:00:00.000Z");
  });
});
