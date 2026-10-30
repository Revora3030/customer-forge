import { describe, expect, it } from "vitest";
import { effectiveReviewLink, googleReviewUrl, placeIdFromGeneration } from "./google-review-link";

describe("googleReviewUrl", () => {
  it("builds the writereview link from a Google place ID", () => {
    expect(googleReviewUrl("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    );
  });
  it("refuses OpenStreetMap ids, blanks and junk", () => {
    expect(googleReviewUrl("osm:node/123456789")).toBeNull();
    expect(googleReviewUrl("")).toBeNull();
    expect(googleReviewUrl(null)).toBeNull();
    expect(googleReviewUrl("abc")).toBeNull();
    expect(googleReviewUrl("ChIJ<script>alert(1)</script>")).toBeNull();
  });
});

describe("effectiveReviewLink", () => {
  it("keeps an owner's saved link over the place ID", () => {
    expect(effectiveReviewLink("https://g.page/acme/review", "ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(
      "https://g.page/acme/review",
    );
  });
  it("falls back to the place ID, then to nothing", () => {
    expect(effectiveReviewLink("  ", "ChIJN1t_tDeuEmsRUsoyG83frY4")).toContain("placeid=ChIJ");
    expect(effectiveReviewLink(null, null)).toBeNull();
  });
  it("reads the prospect demo place ID", () => {
    expect(placeIdFromGeneration({ prospectDemo: { placeId: "ChIJabc1234567" } })).toBe("ChIJabc1234567");
    expect(placeIdFromGeneration(null)).toBeNull();
  });
});
