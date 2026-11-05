import { describe, expect, it } from "vitest";
import { isPlaceholderSocialUrl, ownerSocialUrl } from "./social-links";
import { localBusinessSchema } from "./site-head";

describe("ownerSocialUrl", () => {
  it("keeps a real profile link", () => {
    expect(ownerSocialUrl("https://www.instagram.com/elitedetailing")).toBe(
      "https://www.instagram.com/elitedetailing",
    );
    expect(ownerSocialUrl("https://facebook.com/examplesdetailing")).toBe(
      "https://facebook.com/examplesdetailing",
    );
  });

  it("drops empty, missing and non-http values", () => {
    for (const v of [
      null,
      undefined,
      "",
      "   ",
      42,
      "javascript:alert(1)",
      "mailto:a@b.co",
      "/s/x",
    ]) {
      expect(ownerSocialUrl(v)).toBeNull();
    }
  });

  it("drops placeholder URLs from seed data", () => {
    for (const v of [
      "https://instagram.com/example",
      "https://www.facebook.com/example/",
      "https://tiktok.com/@example",
      "https://elitemobiledetailing.example",
      "https://www.example.com/me",
      "https://example.org",
    ]) {
      expect(ownerSocialUrl(v)).toBeNull();
      expect(isPlaceholderSocialUrl(v)).toBe(true);
    }
  });
});

describe("LocalBusiness sameAs", () => {
  it("omits placeholder and empty socials, keeps real ones", () => {
    const schema = localBusinessSchema({
      name: "Elite",
      url: "https://x.test",
      profile: {} as never,
      social: {
        instagram: "https://instagram.com/example",
        facebook: "https://facebook.com/example",
        tiktok: "",
        youtube: null,
        linkedin: "https://www.linkedin.com/company/real-co",
      } as never,
    });
    expect(schema["sameAs"]).toEqual(["https://www.linkedin.com/company/real-co"]);
  });

  it("has no sameAs at all when every social is a placeholder", () => {
    const schema = localBusinessSchema({
      name: "Elite",
      url: "https://x.test",
      profile: {} as never,
      social: {
        instagram: "https://instagram.com/example",
        facebook: "https://facebook.com/example",
      } as never,
    });
    expect(schema["sameAs"]).toBeUndefined();
  });
});
