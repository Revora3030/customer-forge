import { describe, expect, it } from "vitest";

import { isPossibleTenantHost, isRevoraOnlyPath } from "@/lib/revora-address";

/**
 * A published client website and Revora's own site must never bleed into each
 * other. These cases are the contract: break one and a visitor on a client's
 * domain could reach Revora's dashboard or sales pages.
 */
describe("Revora / client website separation", () => {
  it("keeps Revora's own pages off a client's domain", () => {
    for (const path of [
      "/app/website",
      "/admin/analytics",
      "/auth",
      "/portal",
      "/get-started",
      "/onboarding",
      "/share",
      "/s/joes-plumbing",
      "/p/token123",
      "/guides/seo",
      "/industries/plumbers",
      "/local/plumbers/texas",
      "/compare/tool",
      "/crm/plumbers",
      "/website-audit",
      "/privacy",
      "/terms",
      "/my/account",
      "/invite/abc",
      "/reset-password",
    ]) {
      expect(isRevoraOnlyPath(path), path).toBe(true);
    }
  });

  it("leaves pages a client website owns alone", () => {
    for (const path of [
      "/",
      "/about",
      "/contact",
      "/pricing",
      "/services",
      "/book",
      "/gallery",
      "/emergency-callouts",
    ]) {
      expect(isRevoraOnlyPath(path), path).toBe(false);
    }
  });

  it("never treats Revora's own addresses as a client website", () => {
    for (const host of [
      "revoragrowthsystems.com",
      "www.revoragrowthsystems.com",
      "revoraweb.site",
      "www.revoraweb.site",
      "customer-forge.lovable.app",
      "localhost",
    ]) {
      expect(isPossibleTenantHost(host), host).toBe(false);
    }
  });
});
