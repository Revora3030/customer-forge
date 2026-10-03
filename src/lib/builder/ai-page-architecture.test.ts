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

  it("lets the AI reorder and omit sections, restores a dropped page, and reports the change", () => {
    const proposal = parsePageArchitecture(
      '{"pages":[{"slug":"home","sections":["hero","benefits","services","cta"]}]}',
    );
    expect(proposal).not.toBeNull();
    const result = normalizePageArchitecture({ proposal: proposal!, candidate });
    expect(result).not.toBeNull();
    expect(result!.changed).toBe(true);
    // The first build ships every page the business has material for.
    expect(result!.architecture.map((page) => page.slug)).toEqual(["home", "about"]);
    expect(result!.rejected.some((entry) => entry.field === "page.about" && /restored/.test(entry.reason))).toBe(true);
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
    // The invented "careers" page is refused; the real "about" page is kept.
    expect(result!.architecture.map((page) => page.slug)).toEqual(["home", "about"]);
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
    // The empty proposal is refused, then the real about page is restored with
    // its own material so the site is never missing a page.
    expect(result!.rejected.some((entry) => entry.field === "page.about")).toBe(true);
    expect(result!.architecture.map((page) => page.slug)).toEqual(["home", "about"]);
    expect(result!.architecture[1]?.sections.map((section) => section.role)).toEqual(["intro", "cta"]);
  });
});

describe("AI-invented sections and pages", () => {
  const candidate = [{ slug: "home", title: "Home", purpose: "home", primaryAction: "Call", sections: [{ role: "hero" }, { role: "services" }] }];
  it("accepts invented content sections and pages with their own headings", () => {
    const r = normalizePageArchitecture({ candidate, proposal: [
      { slug: "home", sections: [{ role: "hero" }, { role: "our_approach", heading: "How we work", body: "Plain words." }] },
      { slug: "process", title: "Process", sections: [{ role: "steps", heading: "The steps" }] },
    ] });
    expect(r?.architecture[0]?.sections[1]).toMatchObject({ role: "our_approach", custom: true, media: "none" });
    expect(r?.architecture[1]?.slug).toBe("process");
  });
  it("never lets the AI invent working features, headless sections or unsafe pages", () => {
    const r = normalizePageArchitecture({ candidate, proposal: [
      { slug: "home", sections: [{ role: "hero" }, { role: "booking", heading: "Book" }, { role: "story" }] },
      { slug: "../x", title: "X", sections: [{ role: "a_b", heading: "Hi" }] },
    ] });
    expect(r?.architecture).toHaveLength(1);
    expect(r?.architecture[0]?.sections.map((s) => s.role)).toEqual(["hero"]);
    expect(r?.rejected.length).toBeGreaterThanOrEqual(3);
  });
  it("allows a real functional capability to close an AI-invented page", () => {
    const withContact = [{
      ...candidate[0]!,
      sections: [...candidate[0]!.sections, { role: "contact" }],
    }];
    const r = normalizePageArchitecture({ candidate: withContact, proposal: [
      { slug: "home", sections: [{ role: "hero" }, { role: "contact" }] },
      { slug: "about", title: "About", sections: [
        { role: "story", heading: "Our approach" },
        { role: "contact", heading: "Start a conversation" },
      ] },
    ] });
    expect(r?.architecture[1]?.sections.map((section) => section.role)).toEqual(["story", "contact"]);
  });
});
