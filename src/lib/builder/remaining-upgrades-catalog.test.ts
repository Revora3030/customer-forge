import { describe, expect, it } from "vitest";
import { REMAINING_SITE_UPGRADES, auditRemainingSiteUpgrades } from "./remaining-upgrades-catalog";

describe("remaining generated-site upgrade inventory", () => {
  it("contains hundreds of unique capabilities", () => {
    const audit = auditRemainingSiteUpgrades();
    expect(audit.total).toBeGreaterThan(300);
    expect(audit.unique).toBe(audit.total);
    expect(REMAINING_SITE_UPGRADES).toContain("database-render coherence pass");
  });
});
