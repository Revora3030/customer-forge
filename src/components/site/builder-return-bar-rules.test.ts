import { describe, expect, it } from "vitest";
import { canShowBuilderShortcut, isPublicSitePath } from "@/components/site/builder-return-bar-rules";

const ok = { signedIn: true, role: "owner", framed: false, dismissed: false, viewportWidth: 1280, pathname: "/draft/acme" };

describe("canShowBuilderShortcut", () => {
  it("shows to a signed-in owner or admin of this site on a desktop draft preview", () => {
    expect(canShowBuilderShortcut(ok)).toBe(true);
    expect(canShowBuilderShortcut({ ...ok, role: "admin" })).toBe(true);
    expect(canShowBuilderShortcut({ ...ok, viewportWidth: 768 })).toBe(true);
  });

  it("never shows on a phone, including 375px where the Call/Book bar lives", () => {
    for (const viewportWidth of [0, 320, 375, 390, 767]) {
      expect(canShowBuilderShortcut({ ...ok, viewportWidth })).toBe(false);
    }
  });

  it("never shows on a public /s/ page, even to a signed-in owner", () => {
    expect(isPublicSitePath("/s/acme")).toBe(true);
    expect(isPublicSitePath("/s/acme/about")).toBe(true);
    expect(isPublicSitePath("/draft/acme")).toBe(false);
    expect(canShowBuilderShortcut({ ...ok, pathname: "/s/acme" })).toBe(false);
    expect(canShowBuilderShortcut({ ...ok, pathname: "/s/acme/contact" })).toBe(false);
  });

  it("never shows to a visitor, a signed-in non-member, or a member without builder rights", () => {
    expect(canShowBuilderShortcut({ ...ok, signedIn: false })).toBe(false);
    expect(canShowBuilderShortcut({ ...ok, role: null })).toBe(false);
    expect(canShowBuilderShortcut({ ...ok, role: "staff" })).toBe(false);
    expect(canShowBuilderShortcut({ ...ok, role: "viewer" })).toBe(false);
  });

  it("stays hidden inside the builder's own frame and after it is dismissed", () => {
    expect(canShowBuilderShortcut({ ...ok, framed: true })).toBe(false);
    expect(canShowBuilderShortcut({ ...ok, dismissed: true })).toBe(false);
  });
});
