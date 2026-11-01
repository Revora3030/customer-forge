import { describe, expect, it } from "vitest";
import {
  isDuplicatePrivacySlug,
  preferPrivacyNoticeHref,
  PRIVACY_NOTICE_SLUG,
  siteServesPrivacyNotice,
} from "./privacy-notice-slug";
import { resolveSiteHref } from "./builder/site-chrome";

describe("privacy notice slug", () => {
  it("treats AI-written privacy slugs as duplicates of the generated notice", () => {
    expect(isDuplicatePrivacySlug("privacy")).toBe(true);
    expect(isDuplicatePrivacySlug("privacy-policy")).toBe(true);
    expect(isDuplicatePrivacySlug(PRIVACY_NOTICE_SLUG)).toBe(false);
    expect(isDuplicatePrivacySlug("services")).toBe(false);
    expect(isDuplicatePrivacySlug(null)).toBe(false);
  });

  it("points privacy links at the generated notice", () => {
    expect(preferPrivacyNoticeHref("/privacy")).toBe("/privacy-notice");
    expect(preferPrivacyNoticeHref("/privacy-policy#cookies")).toBe("/privacy-notice#cookies");
    expect(preferPrivacyNoticeHref("/privacy?x=1")).toBe("/privacy-notice?x=1");
    expect(preferPrivacyNoticeHref("/privacy-notice")).toBe("/privacy-notice");
    expect(preferPrivacyNoticeHref("/pricing")).toBe("/pricing");
    expect(preferPrivacyNoticeHref("https://example.com/privacy")).toBe(
      "https://example.com/privacy",
    );
  });

  it("is always served", () => {
    expect(siteServesPrivacyNotice()).toBe(true);
  });
});

describe("resolveSiteHref privacy links", () => {
  it("sends footer privacy links to the generated notice", () => {
    expect(resolveSiteHref("/privacy", "acme", false)).toBe("/s/acme/privacy-notice");
    expect(resolveSiteHref("/privacy-policy", "acme", true)).toBe("/privacy-notice");
  });
});

describe("leadEngineAudit privacy item", () => {
  it("counts the generated notice even without a builder privacy page", async () => {
    const { leadEngineAudit } = await import("./website-content");
    const audit = leadEngineAudit([]);
    expect(audit.items.find((item) => item.key === "page:privacy")?.ok).toBe(true);
    expect(audit.missing.some((item) => item.key === "page:privacy")).toBe(false);
  });
});
