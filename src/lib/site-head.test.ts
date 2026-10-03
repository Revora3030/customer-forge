import { describe, expect, it } from "vitest";
import { localBusinessSchema, openingHoursSpec, safeJsonLd, siteIconLinks, siteThemeColor } from "./site-head";
import { compositionFonts, siteFontsHref, isLight } from "./site-theme";

describe("client site head", () => {
  it("builds LocalBusiness data only from real facts", () => {
    const schema = localBusinessSchema({
      name: "Acme Roofing",
      url: "https://acme.test",
      profile: { phone: "(555) 010-0199", city: "Raleigh", state: "NC", hours: { monday: "9am-5pm", sunday: "Closed" } },
      reviews: [{ rating: 5, author_name: "Jo", comment: "Great" }, { rating: 4 }],
      services: [{ name: "Roof repair", price: 250 }],
    });
    expect(schema["@type"]).toBe("LocalBusiness");
    expect(schema["telephone"]).toBe("(555) 010-0199");
    expect((schema["address"] as Record<string, string>)["addressLocality"]).toBe("Raleigh");
    expect((schema["aggregateRating"] as Record<string, number>)["ratingValue"]).toBe(4.5);
    expect(schema["openingHoursSpecification"]).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "17:00" },
    ]);
    expect(schema["email"]).toBeUndefined();
  });
  it("omits ratings when there are no reviews", () => {
    const schema = localBusinessSchema({ name: "X", url: "https://x.test", profile: null });
    expect(schema["aggregateRating"]).toBeUndefined();
  });
  it("reads 9-5 as 09:00-17:00", () => {
    expect(openingHoursSpec({ tue: "9-5" })[0]).toMatchObject({ opens: "09:00", closes: "17:00" });
  });
  it("cannot break out of the script tag", () => {
    const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
  it("uses the business logo and colour, never an unsafe value", () => {
    expect(siteIconLinks({ logo_url: "https://cdn.test/logo.png" })[0]?.href).toBe("https://cdn.test/logo.png");
    expect(siteIconLinks({ logo_url: "org/logo.png" })).toEqual([]);
    expect(siteThemeColor({ primary_color: "#112233" })).toBe("#112233");
    expect(siteThemeColor({ primary_color: "red;}" })).toBeNull();
  });
});

describe("layout fonts", () => {
  it("loads fonts named inside AI layouts", () => {
    const fonts = compositionFonts([
      { root: { type: "stack", children: [{ type: "heading", style: { font: "Fraunces" } }, { type: "text", style: { font: "Arial" } }] } },
      { root: { type: "row", responsive: { mobile: { font: "Inter" } } } },
    ]);
    expect(fonts).toEqual(["Fraunces", "Inter"]);
    const href = siteFontsHref("Sora", fonts)!;
    expect(href).toContain("family=Sora");
    expect(href).toContain("family=Fraunces");
  });
  it("rejects unsafe font names", () => {
    expect(compositionFonts([{ root: { type: "text", style: { font: "x);}body{" } } }])).toEqual([]);
  });
});

describe("readable text on brand colours", () => {
  it("uses dark text on mid-tone colours where white would be unreadable", () => {
    expect(isLight("#f59e0b")).toBe(true); // amber
    expect(isLight("#38bdf8")).toBe(true); // sky
    expect(isLight("#1e3a8a")).toBe(false); // navy
  });
});
