import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/readable-color";
import { themeContrastIssues } from "@/lib/site-contrast";
import {
  directionsHref,
  displayPhone,
  fullAddress,
  premiumAccent,
  premiumDarkThemeVars,
  premiumFactsFrom,
  premiumPageFor,
  premiumQuickActions,
  readPremiumTemplate,
  readServiceDetails,
  splitTwoTone,
  telHref,
  trustItems,
  writePremiumTemplate,
  PREMIUM_DARK_SURFACES,
  PREMIUM_DEFAULT_ACCENT,
} from "./premium-mobile-template";

describe("premium template flag", () => {
  it("is opt-in and round-trips without dropping other generation keys", () => {
    expect(readPremiumTemplate(null)).toBe(false);
    expect(readPremiumTemplate({ template: "classic" })).toBe(false);
    const on = writePremiumTemplate({ keep: 1 }, true);
    expect(on).toMatchObject({ keep: 1, template: "premium-mobile" });
    expect(readPremiumTemplate(on)).toBe(true);
    expect(readPremiumTemplate(writePremiumTemplate(on, false))).toBe(false);
  });
});

describe("premium dark theme", () => {
  it.each([null, "#3b82f6", "#0a1f44", "#ffeb3b", "#e11d48", "#000000", "not-a-colour"])("keeps every text pair at AA for brand %s", (brand) => {
    const vars = premiumDarkThemeVars({ brandColor: brand });
    expect(themeContrastIssues(vars)).toEqual([]);
    expect(contrastRatio(vars["--primary-foreground"]!, vars["--primary"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(vars["--primary-ink"]!, PREMIUM_DARK_SURFACES.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(vars["--muted-foreground"]!, PREMIUM_DARK_SURFACES.card)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a readable brand, lifts a too-dark one and falls back for black/white/missing", () => {
    expect(premiumAccent("#3B82F6")).toBe("#3b82f6");
    const lifted = premiumAccent("#0a1f44");
    expect(lifted).not.toBe("#0a1f44");
    expect(contrastRatio(lifted, PREMIUM_DARK_SURFACES.background)).toBeGreaterThanOrEqual(3);
    expect(premiumAccent("#000000")).toBe(PREMIUM_DEFAULT_ACCENT);
    expect(premiumAccent(undefined)).toBe(PREMIUM_DEFAULT_ACCENT);
  });
});

describe("facts helpers", () => {
  it("splits a headline into two tones without changing words", () => {
    expect(splitTwoTone("Showroom finish. Delivered to your driveway.")).toEqual({ lead: "Showroom finish.", accent: "Delivered to your driveway." });
    expect(splitTwoTone("Fast, friendly plumbing")).toEqual({ lead: "Fast,", accent: "friendly plumbing" });
    expect(splitTwoTone("Northline Detail Co")).toEqual({ lead: "Northline Detail", accent: "Co" });
    expect(splitTwoTone("Plumbing")).toEqual({ lead: "Plumbing", accent: null });
    const { lead, accent } = splitTwoTone("  Clean   pipes  every time ");
    expect(`${lead} ${accent}`).toBe("Clean pipes every time");
  });

  it("only builds directions and call links from real facts", () => {
    expect(directionsHref(null)).toBeNull();
    expect(directionsHref("12 Main St, Columbus, OH")).toBe("https://www.google.com/maps/dir/?api=1&destination=12%20Main%20St%2C%20Columbus%2C%20OH");
    expect(telHref("(614) 555-0142")).toBeNull();
    expect(telHref("555-1234")).toBeNull();
    expect(telHref("12")).toBeNull();
    expect(telHref("+1 (614) 000-0142")).toBe("tel:+16140000142");
    expect(displayPhone("16140000142")).toBe("(614) 000-0142");
    expect(fullAddress({ city: "Columbus", state: "OH" })).toContain("Columbus");
    expect(fullAddress({})).toBeNull();
  });

  it("builds the trust strip from stored facts only", () => {
    expect(trustItems({ yearsInBusiness: null, serviceArea: null, certifications: null, phoneDisplay: null })).toEqual([]);
    expect(trustItems({ yearsInBusiness: 0, serviceArea: " ", certifications: "", phoneDisplay: null })).toEqual([]);
    const items = trustItems({ yearsInBusiness: 12, serviceArea: "Greater Columbus", certifications: "Licensed & insured", phoneDisplay: "(614) 000-0142" });
    expect(items.map((i) => i.kind)).toEqual(["years", "area", "credential", "phone"]);
    expect(items.map((i) => i.value)).toEqual(["12", "Greater Columbus", "Licensed & insured", "(614) 000-0142"]);
  });

  it("hides each quick-action slot whose fact is missing", () => {
    const all = premiumQuickActions({ name: "A", phone: "6140000142", quoteHref: "#quote", address: "1 Main St" });
    expect([all.secondary?.label, all.primary?.label, all.tertiary?.label]).toEqual(["Call", "Get quote", "Directions"]);
    // visible label is the start of the accessible name (WCAG 2.5.3)
    for (const a of [all.secondary, all.primary, all.tertiary]) expect(a!.ariaLabel.toLowerCase().startsWith(a!.label.toLowerCase())).toBe(true);
    const none = premiumQuickActions({ name: "A", phone: "555-0100", quoteHref: null, address: null });
    expect(none).toEqual({ primary: null, secondary: null, tertiary: null });
  });

  it("reads owner-authored service detail and ignores junk", () => {
    const details = readServiceDetails({ premiumTemplate: { services: { "Ceramic Coating": { problem: " Swirls ", steps: ["Wash", "", 3], included: "nope" }, Bad: null } } });
    expect(details).toEqual({ "ceramic coating": { problem: "Swirls", steps: ["Wash"] } });
    expect(readServiceDetails({ premiumTemplate: { services: [] } })).toEqual({});
  });
});

describe("premiumFactsFrom", () => {
  const site = {
    org: { name: "Sample Co", slug: "sample", industry: "Plumbing" },
    profile: { phone: "(614) 555-0100", address: "", city: null, tagline: "Fixed right", hero_image_url: null, service_area: null },
    services: [{ name: "Drain Cleaning", description: "Clears blocked drains.", image_url: null }],
    gallery: [],
    settings: { generation: {} },
    quote: null,
    nav: [{ slug: "home", title: "Home", kind: "home" }, { slug: "drain-cleaning", title: "Drain Cleaning", kind: "service" }, { slug: "contact", title: "Contact", kind: "page" }],
  };

  it("never invents a phone, address, years, credentials or photo", () => {
    const facts = premiumFactsFrom(site, (p) => `/s/sample${p === "/" ? "" : p}`);
    expect(facts.phone).toBeNull();
    expect(facts.phoneDisplay).toBeNull();
    expect(facts.address).toBeNull();
    expect(facts.yearsInBusiness).toBeNull();
    expect(facts.certifications).toBeNull();
    expect(facts.hero).toBeNull();
    expect(facts.services[0]).toMatchObject({ name: "Drain Cleaning", image: null, href: "/s/sample/drain-cleaning", detail: {} });
    expect(facts.quoteHref).toBe("/s/sample/contact");
    expect(facts.nav.map((n) => n.label)).toEqual(["Home", "Contact"]);
    expect(JSON.stringify(facts)).not.toMatch(/\$\d|★|review|5 stars|years? of experience/i);
  });

  it("picks the template layout for a page", () => {
    const facts = premiumFactsFrom(site);
    expect(premiumPageFor(null, facts.services)).toEqual({ kind: "home" });
    expect(premiumPageFor({ kind: "service", title: "drain cleaning" }, facts.services).kind).toBe("service");
    expect(premiumPageFor({ kind: "service", title: "Other", slug: "drain-cleaning" }, facts.services).kind).toBe("service");
    expect(premiumPageFor({ kind: "page", title: "About" }, facts.services)).toEqual({ kind: "other", title: "About" });
  });
});
