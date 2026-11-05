import { describe, expect, it } from "vitest";
import { composeEnquiryMessage, ENQUIRY_TIMINGS, enquiryUsesSteps, timingLabel } from "./enquiry-steps";

describe("enquiry steps", () => {
  it("only steps when there are two or more named services", () => {
    expect(enquiryUsesSteps([])).toBe(false);
    expect(enquiryUsesSteps([{ name: "Drain cleaning" }])).toBe(false);
    expect(enquiryUsesSteps([{ name: "Drain cleaning" }, { name: " " }])).toBe(false);
    expect(enquiryUsesSteps([{ name: "Drain cleaning" }, { name: "Water heaters" }])).toBe(true);
  });

  it("timings are visitor choices only, with no promise from the business", () => {
    expect(ENQUIRY_TIMINGS.map((t) => t.id)).toEqual(["asap", "weeks", "planning"]);
    for (const t of ENQUIRY_TIMINGS) expect(t.label).not.toMatch(/\d|hour|minute|same.day|guarantee/i);
    expect(timingLabel("weeks")).toBe("In the next few weeks");
    expect(timingLabel("bogus")).toBeNull();
    expect(timingLabel(null)).toBeNull();
  });

  it("adds the timing after the visitor's own words and stays within the server limit", () => {
    expect(composeEnquiryMessage("  Leaking pipe  ", null)).toBe("Leaking pipe");
    expect(composeEnquiryMessage("Leaking pipe", "asap")).toBe("Leaking pipe\n\nTiming: As soon as possible");
    const long = composeEnquiryMessage("x".repeat(3000), "planning");
    expect(long.length).toBe(2000);
    expect(long.endsWith("Timing: Just planning ahead")).toBe(true);
  });
});
