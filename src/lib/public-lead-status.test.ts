import { describe, expect, it } from "vitest";
import { publicLeadStatus } from "./public-lead-status";

describe("publicLeadStatus", () => {
  it("never saves a booking request as booked", () => {
    expect(publicLeadStatus("booking")).toBe("new");
  });
  it("keeps quotes as quoted and everything else as new", () => {
    expect(publicLeadStatus("quote")).toBe("quoted");
    expect(publicLeadStatus("enquiry")).toBe("new");
    expect(publicLeadStatus(undefined)).toBe("new");
  });
});
