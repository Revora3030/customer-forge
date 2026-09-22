import { describe, expect, it } from "vitest";

import {
  deriveCandidateArchitecture,
  normalizePageArchitecture,
  parsePageArchitecture,
} from "@/lib/builder/ai-page-architecture";

const material = [
  {
    slug: "home",
    title: "Home",
    kind: "home",
    sections: [
      { kind: "hero" },
      { kind: "services" },
      { kind: "benefits" },
      { kind: "faq" },
      { kind: "cta" },
    ],
  },
  { slug: "about", title: "About", kind: "about", sections: [{ kind: "intro" }, { kind: "cta" }] },
];

const candidate = deriveCandidateArchitecture(material, "Book a visit");

describe("AI-authored page architecture", () => {
  it("offers the renderer's fillable material as the candidate", () => {
    expect(candidate.map((page) => page.slug)).toEqual(["home", "about"]);
    expect(candidate[0]?.sections.map((section) => section.role)).toEqual([
      "hero",
      "services",
      "benefits",
      "faq",
      "cta",
    ]);
    expect(candidate[0]?.primaryAction).toBe("Book a visit");
  });

  it("lets the AI reorder and omit sections, and reports the change", () => {
    const proposal = parsePageArchitecture(
      '{"pages":[{"slug":"home","sections":["hero","benefits","services","cta"]}]}',
    );
    expect(proposal).not.toBeNull();
    const result = normalizePageArchitecture({ proposal: proposal!, candidate });
    expect(result).not.toBeNull();
    expect(result!.changed).toBe(true);
    expect(result!.architecture.map((page) => page.slug)).toEqual(["home"]);
    expect(result!.architecture[0]?.sections.map((section) => section.role)).toEqual([
      "hero",
      "benefits",
      "services",
      "cta",
    ]);
  });

  it("refuses invented pages and sections instead of rendering empty containers", () => {
    const proposal = parsePageArchitecture(
      '{"pages":[{"slug":"home","sections":["hero","pricing","hero"]},{"slug":"careers","sections":["hero"]}]}',
    );
    const result = normalizePageArchitecture({ proposal: proposal!, candidate });
    expect(result).not.toBeNull();
    expect(result!.architecture[0]?.sections.map((section) => section.role)).toEqual(["hero"]);
    expect(result!.architecture.map((page) => page.slug)).toEqual(["home"]);
    expect(result!.rejected.map((entry) => entry.field)).toEqual(
      expect.arrayContaining(["page.home.pricing", "page.careers"]),
    );
  });

  it("refuses a plan that drops the home page", () => {
    const proposal = parsePageArchitecture('{"pages":[{"slug":"about","sections":["intro"]}]}');
    expect(normalizePageArchitecture({ proposal: proposal!, candidate })).toBeNull();
  });

  it("reports no change when the AI keeps the candidate exactly", () => {
    const proposal = parsePageArchitecture(
      JSON.stringify({
        pages: candidate.map((page) => ({
          slug: page.slug,
          sections: page.sections.map((section) => section.role),
        })),
      }),
    );
    const result = normalizePageArchitecture({ proposal: proposal!, candidate });
    expect(result!.changed).toBe(false);
  });

  it("rejects answers that are not the agreed shape", () => {
    expect(parsePageArchitecture("no json here")).toBeNull();
    expect(parsePageArchitecture('{"pages":[]}')).toBeNull();
    expect(parsePageArchitecture("{not json}")).toBeNull();
  });

  it("refuses a page left with no fillable sections", () => {
    const proposal = parsePageArchitecture(
      '{"pages":[{"slug":"home","sections":["hero"]},{"slug":"about","sections":["gallery"]}]}',
    );
    const result = normalizePageArchitecture({ proposal: proposal!, candidate });
    expect(result!.architecture.map((page) => page.slug)).toEqual(["home"]);
    expect(result!.rejected.some((entry) => entry.field === "page.about")).toBe(true);
  });
});
