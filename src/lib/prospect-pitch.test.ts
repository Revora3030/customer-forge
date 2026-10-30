import { describe, expect, it } from "vitest";
import { composePitchEmail, pitchOfferTerms } from "./prospect-pitch";
import { GROWTH_SYSTEM } from "./offer";
import { typicalComparison } from "./software-savings";

describe("composePitchEmail", () => {
  it("uses only the typical tool total and the canonical offer, with no claims", () => {
    const { subject, body } = composePitchEmail("Elite Mobile Detail");
    expect(subject).toBe("A quick question for Elite Mobile Detail");
    expect(body).toContain(`$${typicalComparison().toolsMonthly} a month`);
    expect(body).toContain(`$${GROWTH_SYSTEM.setupPrice} one time`);
    expect(body).toContain(`$${GROWTH_SYSTEM.monthlyPrice}/month`);
    expect(body).toContain("typical list prices, not a quote");
    expect(body).not.toMatch(/guarantee|risk-free|free website|more jobs|booked|\bsave\b|ROI|rank/i);
    // Every dollar figure in the email comes from the offer or the typical total.
    const allowed = new Set([`$${typicalComparison().toolsMonthly}`, `$${GROWTH_SYSTEM.setupPrice}`, `$${GROWTH_SYSTEM.monthlyPrice}`]);
    for (const figure of body.match(/\$\d[\d,]*/g) ?? []) expect(allowed.has(figure), figure).toBe(true);
  });

  it("neutralises an untrusted business name", () => {
    const { subject, body } = composePitchEmail("  Bad\nName\r\n  Co  ");
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toContain("Bad Name Co");
    expect(body).toContain("Bad Name Co");
    expect(composePitchEmail("   ").subject).toBe("A quick question for your business");
  });

  it("states the price sentence the demo emails use", () => {
    expect(pitchOfferTerms()).toContain("the first month is free");
    expect(pitchOfferTerms()).toContain("Nothing is charged unless you choose to sign up.");
  });
});
