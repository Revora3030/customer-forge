import { describe, expect, it } from "vitest";
import { safeLinkUrl } from "@/lib/website-content";

/**
 * Link targets become real hrefs on public customer sites, so only safe
 * schemes may ever survive a write. The database carries the same rule as a
 * CHECK constraint (website_components_link_url_safe_scheme) so no code path —
 * editor, AI apply, QA repair, page duplicate or restore — can store anything
 * a visitor's browser would execute.
 */
const SAFE_DB_PREFIX = /^(#|\/|https?:\/\/|mailto:|tel:|sms:)/;

describe("link target safety", () => {
  it("rejects executable and data URL schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/x",
    ]) {
      expect(safeLinkUrl(bad)).toBeNull();
    }
  });

  it("keeps the allowed forms and they satisfy the database rule", () => {
    for (const good of [
      "#quote",
      "/services",
      "https://example.com/pricing",
      "http://example.com",
      "mailto:hello@example.com",
      "tel:+15550100",
      "sms:+15550100",
    ]) {
      const safe = safeLinkUrl(good);
      expect(safe).toBeTruthy();
      expect(SAFE_DB_PREFIX.test(safe!)).toBe(true);
    }
  });

  it("collapses protocol-relative paths so they cannot leave the site", () => {
    expect(safeLinkUrl("//evil.example.com")).toBe("/evil.example.com");
  });
});
