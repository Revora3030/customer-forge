import { describe, expect, it } from "vitest";
import { activePreviewToken, phoneLink, phoneQrAlt } from "./open-on-phone";

const NOW = Date.parse("2026-11-05T00:00:00Z");
const future = "2026-11-10T00:00:00Z";
const past = "2026-11-01T00:00:00Z";

describe("activePreviewToken", () => {
  it("picks the newest link that is on and not expired", () => {
    const links = [
      { token: "off", revoked: true, expires_at: future },
      { token: "old", revoked: false, expires_at: past },
      { token: "good", revoked: false, expires_at: future },
      { token: "older", revoked: false, expires_at: future },
    ];
    expect(activePreviewToken(links, NOW)).toBe("good");
  });
  it("returns null with no usable link, a bad date or an odd token", () => {
    expect(activePreviewToken(undefined, NOW)).toBeNull();
    expect(activePreviewToken([], NOW)).toBeNull();
    expect(activePreviewToken([{ token: "x", revoked: false, expires_at: "nope" }], NOW)).toBeNull();
    expect(activePreviewToken([{ token: "a/../b", revoked: false, expires_at: future }], NOW)).toBeNull();
  });
});

describe("phoneLink", () => {
  it("uses the live platform address once published", () => {
    const link = phoneLink({ publishState: "published", slug: "acme-plumbing" });
    expect(link).toEqual({
      kind: "live",
      url: expect.stringMatching(/^https:\/\/[^/]+\/s\/acme-plumbing$/),
      label: "your live website",
    });
  });
  it("has no live link without a slug", () => {
    expect(phoneLink({ publishState: "published", slug: "" })).toBeNull();
  });
  it("uses the private preview link for a draft", () => {
    const link = phoneLink({
      publishState: "draft",
      slug: "acme",
      origin: "https://app.example.com/",
      links: [{ token: "tok123", revoked: false, expires_at: future }],
      now: NOW,
    });
    expect(link?.kind).toBe("preview");
    expect(link?.url).toBe("https://app.example.com/p/tok123");
  });
  it("never invents a link for a draft with no active preview link", () => {
    expect(phoneLink({ publishState: "draft", slug: "acme", origin: "https://a.b", links: [], now: NOW })).toBeNull();
    expect(phoneLink({ publishState: "unpublished", slug: "acme", origin: "", links: [{ token: "t", revoked: false, expires_at: future }], now: NOW })).toBeNull();
  });
  it("describes the QR for screen readers", () => {
    const link = phoneLink({ publishState: "published", slug: "acme" })!;
    expect(phoneQrAlt(link)).toBe("QR code that opens your live website on a phone");
  });
});
