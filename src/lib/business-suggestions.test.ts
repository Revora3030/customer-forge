import { describe, expect, it } from "vitest";
import { buildBusinessSuggestions } from "@/lib/business-suggestions";
import { routeCommand } from "@/lib/command-router";

const DETAILING_SERVICES = ["Ceramic Coating", "Interior Detail", "Paint Correction"];

/** Words from other trades that must never reach a tenant who doesn't offer them. */
const TRADE_WORDS =
  /gutter|plumb|roof|emergency|callout|hvac|electric|landscap|cleaning|detail|coating|lawn|pest/i;

const labels = (chips: { label: string }[]) => chips.map((chip) => chip.label);
const allText = (result: ReturnType<typeof buildBusinessSuggestions>) =>
  [result.placeholder, ...labels(result.chips)].join(" | ");

describe("business suggestions", () => {
  it("builds detailing chips and placeholder from a detailing business's services", () => {
    const result = buildBusinessSuggestions({
      businessName: "Elite mobile detail",
      industry: "Mobile car detailing",
      services: DETAILING_SERVICES,
      siteState: "published",
      pages: [
        { slug: "home", title: "Home" },
        { slug: "ceramic-coating", title: "Ceramic Coating" },
      ],
      newLeads: 0,
      reviews: 4,
      quotes: 2,
      bookings: 3,
    });

    expect(result.placeholder).toBe("e.g. I want more ceramic coating bookings this month");
    const chipLabels = labels(result.chips);
    expect(chipLabels).toContain("Add a page for Interior Detail");
    expect(chipLabels).toContain("Add a page for Paint Correction");
    // Already has a page, so it is not suggested again.
    expect(chipLabels).not.toContain("Add a page for Ceramic Coating");
    expect(result.chips.length).toBeGreaterThanOrEqual(4);
    expect(result.chips.length).toBeLessThanOrEqual(6);
    expect(allText(result)).not.toMatch(/gutter|emergency|callout|plumb|roof/i);

    // Every page chip names a service this business actually offers.
    for (const label of chipLabels.filter((l) => l.startsWith("Add a page for "))) {
      expect(DETAILING_SERVICES).toContain(label.replace("Add a page for ", ""));
    }
  });

  it("falls back to generic wording with no trade words when there are no services", () => {
    for (const siteState of ["none", "draft", "published"] as const) {
      const result = buildBusinessSuggestions({
        businessName: "Acme",
        services: [],
        siteState,
        pages: [],
        newLeads: 0,
        reviews: null,
        quotes: null,
        bookings: null,
      });
      expect(allText(result)).not.toMatch(TRADE_WORDS);
      expect(labels(result.chips)).toContain("Add my services");
      expect(labels(result.chips).some((l) => l.startsWith("Add a page for"))).toBe(false);
      expect(result.chips.length).toBeGreaterThanOrEqual(4);
      expect(result.chips.length).toBeLessThanOrEqual(6);
    }
  });

  it("uses the industry for the placeholder when no service is listed", () => {
    const result = buildBusinessSuggestions({
      industry: "mobile_detailing",
      services: [],
      siteState: "draft",
    });
    expect(result.placeholder).toBe("e.g. I want more mobile detailing customers this month");
    const generic = buildBusinessSuggestions({
      industry: "Other",
      services: [],
      siteState: "draft",
    });
    expect(generic.placeholder).toBe("e.g. I want more customers from my website this month");
  });

  it("orders the site's next step first by site state", () => {
    const base = { services: DETAILING_SERVICES, pages: [], newLeads: 2 } as const;
    expect(buildBusinessSuggestions({ ...base, siteState: "none" }).chips[0]?.label).toBe(
      "Build my website",
    );
    expect(buildBusinessSuggestions({ ...base, siteState: "draft" }).chips[0]?.label).toBe(
      "Launch my site",
    );
    const published = labels(buildBusinessSuggestions({ ...base, siteState: "published" }).chips);
    expect(published[0]).toBe("Follow up my 2 new leads");
    expect(published).not.toContain("Build my website");
    expect(published).not.toContain("Launch my site");

    // No site yet: build first, and no service-page chips before a site exists.
    const none = labels(buildBusinessSuggestions({ ...base, siteState: "none" }).chips);
    expect(none.some((l) => l.startsWith("Add a page for"))).toBe(false);
  });

  it("never invents counts", () => {
    const unknown = buildBusinessSuggestions({
      services: DETAILING_SERVICES,
      siteState: "published",
      pages: null,
      newLeads: null,
      reviews: null,
      quotes: null,
      bookings: null,
    });
    const text = allText(unknown);
    expect(text).not.toMatch(/\d/);
    expect(labels(unknown.chips)).not.toContain("Get more reviews");
    expect(labels(unknown.chips)).not.toContain("Add booking");

    const known = buildBusinessSuggestions({
      services: DETAILING_SERVICES,
      siteState: "published",
      newLeads: 1,
      reviews: 0,
    });
    expect(labels(known.chips)).toContain("Follow up my 1 new lead");
    expect(labels(known.chips)).toContain("Get more reviews");
    // The only number shown is the one we were given.
    expect(allText(known).match(/\d+/g)).toEqual(["1"]);
  });

  it("does not offer service chips while services are still loading", () => {
    const result = buildBusinessSuggestions({ services: null, siteState: "draft", pages: [] });
    expect(labels(result.chips)).not.toContain("Add my services");
    expect(result.placeholder).toBe("e.g. I want more customers from my website this month");
  });

  it("routes router-bound chips to real subsystems", () => {
    const result = buildBusinessSuggestions({
      services: DETAILING_SERVICES,
      siteState: "draft",
      pages: [],
      reviews: 0,
      quotes: 0,
      bookings: 0,
    });
    for (const chip of result.chips) {
      if (chip.route || chip.assistant) continue;
      expect(routeCommand(chip.label).confident).toBe(true);
    }
    const reviews = result.chips.find((chip) => chip.label === "Get more reviews");
    expect(reviews?.route).toBe("/app/reviews");
    expect(routeCommand("Launch my site").target).toBe("publish");
  });
});
