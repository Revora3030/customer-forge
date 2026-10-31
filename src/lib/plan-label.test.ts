import { describe, expect, it } from "vitest";
import { planLabel } from "./plan-label";

describe("planLabel", () => {
  it("never prints a dangling separator", () => {
    expect(planLabel(null, null)).toBe("No plan yet");
    expect(planLabel(undefined, "")).toBe("No plan yet");
  });
  it("turns raw values into readable words", () => {
    expect(planLabel("growth_monthly", "trialing")).toBe("Growth monthly · Free first month");
    expect(planLabel("growth-system", "past_due")).toBe("Growth system · Payment past due");
  });
  it("keeps an unknown status readable rather than hiding it", () => {
    expect(planLabel("free", "some_new_state")).toBe("Free · Some new state");
  });
});
