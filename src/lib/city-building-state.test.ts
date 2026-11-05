import { describe, expect, it } from "vitest";
import {
  FIXTURE_NOW,
  allRunningSnapshot,
  emptySnapshot,
  fixtureRow,
  fixtureSnapshot,
  oneFailureSnapshot,
  quietSnapshot,
  unavailableSnapshot,
} from "./__fixtures__/city-demo-fixtures";
import {
  FAILED_STROBE_HZ,
  WAITING_BEACON_HZ,
  WORKING_BEACON_HZ,
  buildingAnimState,
  buildingStyleToken,
  cityCameraZoom,
  cityDrillKey,
} from "./city-building-state";

describe("JC-1 buildingAnimState", () => {
  it("maps working / idle / unavailable / failed from recorded rows", () => {
    expect(buildingAnimState("factory", allRunningSnapshot(), FIXTURE_NOW)).toBe("working");
    expect(buildingAnimState("factory", quietSnapshot(), FIXTURE_NOW)).toBe("idle");
    expect(buildingAnimState("factory", unavailableSnapshot(), FIXTURE_NOW)).toBe("unavailable");
    expect(buildingAnimState("factory", oneFailureSnapshot(), FIXTURE_NOW)).toBe("failed");
    expect(buildingAnimState("factory", undefined, FIXTURE_NOW)).toBe("unavailable");
  });

  it("maps waiting when attention is only queued/pending (no failures)", () => {
    const snapshot = fixtureSnapshot((s) =>
      s.key === "jobs"
        ? [fixtureRow({ id: "q1", source: s.source, district: "factory", status: "waiting", at: new Date(FIXTURE_NOW - 10 * 60_000).toISOString() })]
        : [],
    );
    expect(buildingAnimState("factory", snapshot, FIXTURE_NOW)).toBe("waiting");
  });

  it("empty readable feed is idle, not invented busy", () => {
    expect(buildingAnimState("growth", emptySnapshot(), FIXTURE_NOW)).toBe("idle");
  });
});

describe("JC-1 buildingStyleToken", () => {
  it("maps each state to its style token (colour + icon)", () => {
    expect(buildingStyleToken("working", true)).toMatchObject({
      state: "working",
      colorKey: "ok",
      icon: "pulse",
      risingWindows: true,
      beaconHz: WORKING_BEACON_HZ,
      strobe: false,
    });
    expect(buildingStyleToken("waiting", true)).toMatchObject({
      state: "waiting",
      colorKey: "gold",
      icon: "ring",
      goldRing: true,
      beaconHz: WAITING_BEACON_HZ,
    });
    expect(buildingStyleToken("failed", true)).toMatchObject({
      state: "failed",
      colorKey: "danger",
      icon: "alert",
      strobe: true,
      beaconHz: FAILED_STROBE_HZ,
    });
    expect(buildingStyleToken("idle", true)).toMatchObject({
      state: "idle",
      colorKey: "tone",
      icon: "dim",
      dim: true,
      beaconHz: 0,
    });
    expect(buildingStyleToken("unavailable", true)).toMatchObject({
      state: "unavailable",
      colorKey: "muted",
      icon: "offline",
    });
  });

  it("caps failed strobe at 2 Hz", () => {
    expect(buildingStyleToken("failed", true).beaconHz).toBeLessThanOrEqual(2);
    expect(FAILED_STROBE_HZ).toBe(2);
  });

  it("reduced-motion keeps static colours + icon only (no motion flags)", () => {
    for (const state of ["working", "waiting", "failed", "idle", "unavailable"] as const) {
      const token = buildingStyleToken(state, false);
      expect(token.beaconHz).toBe(0);
      expect(token.risingWindows).toBe(false);
      expect(token.goldRing).toBe(false);
      expect(token.strobe).toBe(false);
      expect(token.icon).toBeTruthy();
      expect(token.colorKey).toBeTruthy();
    }
  });
});

describe("JC-5 cityDrillKey + camera zoom", () => {
  it("Enter opens when not drilled; Esc returns when drilled", () => {
    expect(cityDrillKey("Enter", false)).toBe("open");
    expect(cityDrillKey("Enter", true)).toBe(null);
    expect(cityDrillKey("Escape", true)).toBe("close");
    expect(cityDrillKey("Escape", false)).toBe(null);
    expect(cityDrillKey("a", false)).toBe(null);
  });

  it("drill-down zoom is higher than overview and within OrbitControls max", () => {
    const overview = cityCameraZoom(840, false);
    const drilled = cityCameraZoom(840, true);
    expect(drilled).toBeGreaterThan(overview);
    expect(drilled).toBeLessThanOrEqual(65);
  });
});
