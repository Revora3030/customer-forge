import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS } from "./ai-city";
import {
  APPROVAL_DISTRICT,
  approvalBeaconLabel,
  approvalBeacons,
  beaconDistricts,
  districtForApproval,
} from "./city-approval-beacons";

const ORDER = CITY_DISTRICTS.map((d) => d.id);

describe("JC-14 approval beacons", () => {
  it("puts every approvable action in a real district", () => {
    for (const [action, district] of Object.entries(APPROVAL_DISTRICT))
      expect(ORDER, action).toContain(district);
  });

  it("sends an action it does not know to Jarvis Tower, never drops it", () => {
    expect(districtForApproval("something.new")).toBe("executive");
    expect(districtForApproval("toString")).toBe("executive");
    expect(districtForApproval("demo.send")).toBe("growth");
  });

  it("counts only waiting approvals, per district", () => {
    const state = approvalBeacons([
      { action_id: "demo.send", state: "pending" },
      { action_id: "demo.send", state: "failed" },
      { action_id: "demo.send", state: "done" },
      { action_id: "demo.send", state: "rejected" },
      { action_id: "demo.send", state: "expired" },
      { action_id: "image.create", state: "pending" },
    ]);
    expect(state).toEqual({ status: "ok", total: 3, byDistrict: { growth: 2, creative: 1 } });
    expect(beaconDistricts(state, ORDER)).toEqual(
      [
        { id: "growth", count: 2 },
        { id: "creative", count: 1 },
      ].sort((a, b) => ORDER.indexOf(a.id as never) - ORDER.indexOf(b.id as never)),
    );
  });

  it("says unavailable, with no beacon and no zero, when the read failed", () => {
    for (const failed of [null, undefined]) {
      const state = approvalBeacons(failed);
      expect(state).toEqual({ status: "unavailable" });
      expect(beaconDistricts(state, ORDER)).toEqual([]);
      expect(approvalBeaconLabel(state)).toBe("Approvals unavailable");
      expect(approvalBeaconLabel(state)).not.toMatch(/\b0\b/);
    }
  });

  it("reports a clean read of nothing as nothing waiting, which is different", () => {
    const state = approvalBeacons([]);
    expect(state).toEqual({ status: "ok", total: 0, byDistrict: {} });
    expect(approvalBeaconLabel(state)).toBe("No approvals waiting");
    expect(beaconDistricts(state, ORDER)).toEqual([]);
  });

  it("words the count", () => {
    expect(approvalBeaconLabel({ status: "ok", total: 1, byDistrict: { growth: 1 } })).toBe(
      "1 approval waiting",
    );
    expect(approvalBeaconLabel({ status: "ok", total: 4, byDistrict: { growth: 4 } })).toBe(
      "4 approvals waiting",
    );
  });
});
