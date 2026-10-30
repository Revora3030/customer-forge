import { describe, expect, it } from "vitest";
import { isGa4ProductionHost } from "./ga4";
import { DEFAULT_GA_MEASUREMENT_ID } from "./platform-settings.functions";

describe("GA4 production gating", () => {
  it.each(["revoragrowthsystems.com", "www.revoragrowthsystems.com", "WWW.RevoraGrowthSystems.com:443"])(
    "loads on the live marketing host %s",
    (host) => expect(isGa4ProductionHost(host)).toBe(true),
  );
  it.each(["localhost:5173", "127.0.0.1", "customer-forge.lovable.app", "id-preview--x.lovable.app", "revoraweb.site", "acme-plumbing.com", "", null])(
    "never loads on non-production host %s",
    (host) => expect(isGa4ProductionHost(host)).toBe(false),
  );
  it("ships Revora's GA4 property as the fallback ID", () => {
    expect(DEFAULT_GA_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]{4,20}$/);
    expect(DEFAULT_GA_MEASUREMENT_ID).toBe("G-WC1X5HWN7W");
  });
});
