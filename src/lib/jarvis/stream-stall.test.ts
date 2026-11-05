import { describe, expect, it } from "vitest";
import {
  JARVIS_CLIENT_STALL_MS,
  JARVIS_STALL_MAX_AUTO_RETRIES,
  JARVIS_STILL_WORKING_MS,
  jarvisCanAutoRetryStall,
  jarvisIsStalled,
  jarvisIsStillWorking,
  jarvisStillWorkingLabel,
} from "./stream-stall";

describe("Jarvis stream stall helpers (JC-49)", () => {
  it("shows the still-working hint after 8 seconds", () => {
    expect(JARVIS_STILL_WORKING_MS).toBe(8_000);
    expect(jarvisIsStillWorking(7_999)).toBe(false);
    expect(jarvisIsStillWorking(8_000)).toBe(true);
    expect(jarvisStillWorkingLabel(3)).toBe("Working · 3s");
    expect(jarvisStillWorkingLabel(8)).toContain("Still working");
    expect(jarvisStillWorkingLabel(8)).toContain("8s");
  });

  it("cuts off after the documented stall threshold and allows one auto-retry only", () => {
    expect(JARVIS_CLIENT_STALL_MS).toBe(120_000);
    expect(jarvisIsStalled(119_999)).toBe(false);
    expect(jarvisIsStalled(120_000)).toBe(true);
    expect(JARVIS_STALL_MAX_AUTO_RETRIES).toBe(1);
    expect(jarvisCanAutoRetryStall(0)).toBe(true);
    expect(jarvisCanAutoRetryStall(1)).toBe(false);
  });
});
