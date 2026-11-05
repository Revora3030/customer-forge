import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEMO_PREVIEW_EXPIRED_HREF,
  DEMO_PREVIEW_LABEL_TEXT,
  demoPreviewExpiredCopy,
} from "@/lib/demo-preview-label";
import { privatePreviewHeaders } from "@/lib/page-cache";
import { DEMO_PREVIEW_DAYS } from "@/lib/jarvis-demo-site";

describe("item 18 demo preview label + expiry copy", () => {
  it("uses the exact disclaimer Adam's brief requires", () => {
    expect(DEMO_PREVIEW_LABEL_TEXT).toBe("Demo preview — not approved by the business");
  });

  it("expired and invalid tokens share one plain page that links to /get-started", () => {
    for (const reason of ["expired", "unknown", "revoked", "bogus"]) {
      const copy = demoPreviewExpiredCopy(reason);
      expect(copy.title).toBe("This preview has expired");
      expect(copy.href).toBe("/get-started");
      expect(copy.href).toBe(DEMO_PREVIEW_EXPIRED_HREF);
      expect(copy.cta).toMatch(/get started/i);
      expect(copy.body.toLowerCase()).not.toMatch(/500|error|stack/);
    }
  });

  it("keeps the 30-day demo expiry (does not change when previews are built)", () => {
    expect(DEMO_PREVIEW_DAYS).toBe(30);
  });

  it("private preview responses send X-Robots-Tag: noindex, nofollow", () => {
    expect(privatePreviewHeaders()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("wires the label and noindex meta into both /p/:token routes", () => {
    for (const file of ["src/routes/p.$token.tsx", "src/routes/p.$token_.$page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("DemoPreviewLabel");
      expect(source, file).toContain('content: "noindex, nofollow"');
      expect(source, file).toContain("privatePreviewHeaders()");
      expect(source, file).toContain("demoPreviewExpiredCopy");
    }
  });

  it("PreviewMessage always offers /get-started and never embeds site content", () => {
    const source = readFileSync("src/components/PreviewMessage.tsx", "utf8");
    expect(source).toContain("href = DEMO_PREVIEW_EXPIRED_HREF");
    expect(source).toContain("Get started");
    expect(source).not.toContain("PublicSiteView");
    expect(source).not.toContain("sections");
  });
});
