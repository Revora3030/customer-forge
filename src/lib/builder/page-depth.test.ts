import { describe, expect, it } from "vitest";
import { auditPageDepth, auditSiteDepth, depthNumbers, depthRepairNotes } from "@/lib/builder/page-depth";

describe("page depth", () => {
  it("passes a page with two content beats and a closing action", () => {
    const depth = auditPageDepth({
      slug: "about",
      sections: [
        { kind: "story", heading: "Our story", body: "We started detailing cars in Tampa." },
        { kind: "service_area", heading: "Where we work", body: "Tampa and St. Petersburg." },
        { kind: "contact" },
      ],
    });
    expect(depth.beats).toBeGreaterThanOrEqual(2);
    expect(depth.hasClosingAction).toBe(true);
    expect(depth.notes).toEqual([]);
    expect(depth.visibleChars).toBeGreaterThan(40);
  });

  it("names the empty sections of a thin page and asks for a closing action", () => {
    const depth = auditPageDepth({
      slug: "gallery",
      sections: [{ kind: "values", heading: "Our values" }],
    });
    expect(depth.beats).toBe(0);
    expect(depth.hasClosingAction).toBe(false);
    expect(depth.notes).toHaveLength(2);
    expect(depth.notes[0]).toMatch(/values/);
    expect(depth.notes[1]).toMatch(/closing action/);
  });

  it("counts attached material and stored components as beats", () => {
    const planned = auditPageDepth({
      slug: "services",
      sections: [{ role: "services", heading: "What we do", includes: ["service_cards", "primary_action"] }, { role: "faq", heading: "Questions", includes: ["faqs"] }],
    });
    expect(planned.beats).toBe(2);
    expect(planned.hasClosingAction).toBe(true);
    const stored = auditPageDepth({
      slug: "services",
      sections: [
        { kind: "services", heading: "What we do", components: [{ kind: "card", label: "Full detail", body: "Inside and out.", link_url: "/book" }] },
        { kind: "gallery", components: [{ kind: "image", media_url: "org/a.jpg" }] },
      ],
    });
    expect(stored.beats).toBe(2);
    expect(stored.hasClosingAction).toBe(true);
  });

  it("does not ask a legal page for a closing action", () => {
    const depth = auditPageDepth({
      slug: "privacy",
      sections: [{ kind: "policy", heading: "Privacy", body: "We keep your details private." }, { kind: "contact_info", body: "Email us any time." }],
    });
    expect(depth.notes).toEqual([]);
  });

  it("summarises a site as repair notes and plain numbers for the reviewer", () => {
    const site = auditSiteDepth([
      { slug: "home", sections: [{ kind: "hero", heading: "Hi" }, { kind: "quote" }, { kind: "contact" }] },
      { slug: "thin", sections: [{ kind: "values", heading: "Values" }] },
    ]);
    expect(Object.keys(depthNumbers(site))).toEqual(["home", "thin"]);
    expect(depthNumbers(site)["home"]).not.toHaveProperty("notes");
    expect(depthRepairNotes(site).every((note) => note.includes('"thin"'))).toBe(true);
  });
});
