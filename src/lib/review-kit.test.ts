import { describe, expect, it } from "vitest";
import { parseReviewInput, qrFileName, reviewQrPng, reviewQrSvg, reviewRequestTemplate } from "./review-kit";

const ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";

describe("parseReviewInput", () => {
  it("builds the writereview link from a Place ID", () => {
    expect(parseReviewInput(` ${ID} `)).toEqual({
      ok: true,
      kind: "place_id",
      url: `https://search.google.com/local/writereview?placeid=${ID}`,
    });
  });

  it("rebuilds a pasted Google writereview link in canonical form", () => {
    const r = parseReviewInput(`https://search.google.com/local/writereview?placeid=${ID}&utm_source=x`);
    expect(r).toEqual({ ok: true, kind: "google_writereview", url: `https://search.google.com/local/writereview?placeid=${ID}` });
  });

  it("rejects a Google writereview link without a usable place ID", () => {
    expect(parseReviewInput("https://search.google.com/local/writereview?placeid=").ok).toBe(false);
    expect(parseReviewInput("https://search.google.com/local/writereview").ok).toBe(false);
  });

  it("accepts any other plain https review link", () => {
    const r = parseReviewInput("https://g.page/r/CabcDEF123/review");
    expect(r).toEqual({ ok: true, kind: "url", url: "https://g.page/r/CabcDEF123/review" });
  });

  it("refuses empty input, OSM ids, spaces, http, other schemes and embedded credentials", () => {
    for (const bad of ["", "   ", "osm:node/123456789", "two words", "http://g.page/r/x/review", "javascript:alert(1)", "ftp://x.com/a", "https://user:pw@g.page/r/x", "not a link", "short"]) {
      expect(parseReviewInput(bad).ok, bad).toBe(false);
    }
    expect(parseReviewInput(null).ok).toBe(false);
  });
});

describe("reviewRequestTemplate", () => {
  it("includes the business name and the link, and a placeholder first name", () => {
    const text = reviewRequestTemplate("Elite Mobile Detailing", "https://g.page/r/x/review");
    expect(text).toContain("Hi [first name],");
    expect(text).toContain("Elite Mobile Detailing");
    expect(text).toContain("https://g.page/r/x/review");
  });

  it("falls back when the name is missing", () => {
    expect(reviewRequestTemplate("  ", "https://g.page/r/x/review")).toContain("choosing our business!");
  });
});

describe("qrFileName", () => {
  it("makes a safe file name", () => {
    expect(qrFileName("Elite Mobile Detailing & Co.", "png")).toBe("elite-mobile-detailing-co-review-qr.png");
    expect(qrFileName(null, "svg")).toBe("business-review-qr.svg");
  });
});

describe("QR generation (lazy qrcode import)", () => {
  it("makes a PNG data URL and an SVG for a review link", async () => {
    const url = `https://search.google.com/local/writereview?placeid=${ID}`;
    expect(await reviewQrPng(url)).toMatch(/^data:image\/png;base64,/);
    expect(await reviewQrSvg(url)).toMatch(/^<svg[^>]*>/);
  });
});
