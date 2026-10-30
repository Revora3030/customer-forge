import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSafeRedirect, ownerPreviewPath, ownerPreviewSignInPath } from "./prospect-claim";

describe("unpublished /s/:slug shows a preview notice (Phase A item 8)", () => {
  it("links the owner to sign in and land on /draft/:slug", () => {
    expect(ownerPreviewPath("elite-mobile-detail")).toBe("/draft/elite-mobile-detail");
    expect(ownerPreviewSignInPath("elite-mobile-detail")).toBe(
      "/auth?redirect=%2Fdraft%2Felite-mobile-detail",
    );
    expect(isSafeRedirect(ownerPreviewPath("elite-mobile-detail"))).toBe(true);
    expect(ownerPreviewPath("a/../b")).toBe("/draft/a%2F..%2Fb");
  });

  it("replaces 'Business not found' with a noindex preview page", () => {
    const route = readFileSync("src/routes/s.$slug.tsx", "utf8");
    expect(route).not.toContain("Business not found");
    expect(route).toContain("This site is in preview");
    expect(route).toContain('content: "noindex, nofollow"');
    expect(route).toContain("notFoundComponent: SitePreviewNotice");
    expect(route).toContain("ownerPreviewSignInPath(slug)");
  });
});
