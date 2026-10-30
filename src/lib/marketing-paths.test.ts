import { describe, expect, it } from "vitest";
import { eventPath, isPublicMarketingPath } from "@/lib/marketing-paths";

describe("marketing paths", () => {
  it("keeps public marketing pages", () => {
    for (const path of ["/", "/pricing", "/industries/electricians", "/contact"]) {
      expect(isPublicMarketingPath(path)).toBe(true);
    }
  });

  it("excludes Revora's own screens and tenant previews", () => {
    for (const path of [
      "/admin",
      "/admin/analytics",
      "/app",
      "/app/website",
      "/my/site",
      "/auth",
      "/s/elite-mobile",
      "/p/token",
      // /draft/$slug is a signed-in preview surface, never a marketing page.
      "/draft/supreme-barber-shop",
      "/draft/test-business-co/about",
    ]) {
      expect(isPublicMarketingPath(path)).toBe(false);
    }
  });


  it("prefers the exact recorded page over the session landing page", () => {
    expect(eventPath({ landing_path: "/", metadata: { path: "/admin" } })).toBe("/admin");
    expect(eventPath({ landing_path: "/pricing", metadata: null })).toBe("/pricing");
  });
});
