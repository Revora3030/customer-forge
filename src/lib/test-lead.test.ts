import { describe, expect, it } from "vitest";
import { TEST_LEAD_MESSAGE, TEST_LEAD_NAME, TEST_LEAD_SOURCE, isTestLead } from "./test-lead";
import { sourceLabel } from "./domain";

describe("test lead marker", () => {
  it("recognises only the test source", () => {
    expect(isTestLead({ source: TEST_LEAD_SOURCE })).toBe(true);
    expect(isTestLead({ source: "website" })).toBe(false);
    expect(isTestLead({ source: null })).toBe(false);
    expect(isTestLead(null)).toBe(false);
  });
  it("is labeled as a test in plain words", () => {
    expect(TEST_LEAD_NAME).toMatch(/TEST LEAD/);
    expect(TEST_LEAD_NAME).toMatch(/not a real customer/i);
    expect(TEST_LEAD_MESSAGE).toMatch(/not a real customer/i);
    expect(TEST_LEAD_MESSAGE).toMatch(/nobody was contacted/i);
    expect(sourceLabel(TEST_LEAD_SOURCE)).toBe("Test lead");
  });
});
