import { describe, expect, it } from "vitest";
import { decodeAnchor, previewDestination } from "./preview-navigation";
import { repairSiteHref, resolveSiteHref } from "./site-chrome";

describe("preview navigation", () => {
  it.each(["p/token123", "draft/acme"])("keeps Home and subpages inside %s", (scope) => {
    const current = `https://example.com/${scope}/services`;
    for (const href of ["/", "/home", "/home/", "/s/acme", "/s/acme/", "/s/acme/home", "/s/acme/home/", `/${scope}/home`]) {
      expect(previewDestination(href, current, "acme"), href).toBe(`/${scope}`);
    }
    expect(previewDestination("/s/acme/contact?from=menu#contact-form", current, "acme"))
      .toBe(`/${scope}/contact?from=menu#contact-form`);
    expect(previewDestination("#contact-form", current, "acme")).toBe(`/${scope}/services#contact-form`);
    expect(previewDestination("/s/acme#contact-form", current, "acme")).toBe(`/${scope}#contact-form`);
  });

  it("never rewrites external, platform, other tenant, or other preview links", () => {
    const current = "https://example.com/p/token123/services";
    for (const href of ["https://outside.example.com/", "/s/acme-other/contact", "/s/other", "/app/website", "/p/other/contact", "tel:+19195550100"]) {
      expect(previewDestination(href, current, "acme"), href).toBeNull();
    }
    expect(previewDestination("/home", "https://example.com/app/website", "acme")).toBeNull();
  });

  it("repairs alias anchors only to existing targets", () => {
    expect(repairSiteHref("#contact", new Set(["home"]), new Set(["contact-form"]))).toBe("#contact-form");
    expect(repairSiteHref("#get-quote", null, new Set(["contact-form"]))).toBe("#contact-form");
    expect(repairSiteHref("#contact-form", null, new Set(["contact"]))).toBe("#contact");
    expect(repairSiteHref("#contact-form", new Set(["home", "contact"]), new Set())).toBe("/contact");
    expect(repairSiteHref("#contact", new Set(["home", "contact"]), new Set())).toBe("/contact");
    expect(repairSiteHref("#get-quote", new Set(["home"]), new Set())).toBe("#get-quote");
  });

  it("normalizes stored public Home links without matching slug prefixes", () => {
    expect(resolveSiteHref("/s/acme/home?x=1#contact", "acme", false, null, null, "/p/token123")).toBe("/p/token123?x=1#contact");
    expect(resolveSiteHref("/s/acme-other/home", "acme", false, null, null, "/p/token123")).toBe("/s/acme-other/home");
    expect(resolveSiteHref("/home/", "acme", false, null, null, "/draft/acme")).toBe("/draft/acme");
  });

  it("decodes anchor IDs without throwing on malformed escapes", () => {
    expect(decodeAnchor("#contact%2Dform")).toBe("contact-form");
    expect(decodeAnchor("#%xx")).toBe("%xx");
  });
});
