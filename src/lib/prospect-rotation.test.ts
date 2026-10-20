import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROTATION,
  ROTATION_COOLDOWN_DAYS,
  ROTATION_METROS,
  ROTATION_STATES,
  ROTATION_TRADES,
  describeRotation,
  nextRotationPairs,
  parseRotation,
  readRotation,
  rotationPairKey,
  rotationPairs,
} from "@/lib/prospect-rotation";

const NOW = new Date("2026-10-19T15:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("rotation data", () => {
  it("covers 30 trades and one to three metros in each of the 50 states", () => {
    expect(ROTATION_TRADES).toHaveLength(30);
    expect(new Set(ROTATION_TRADES.map((trade) => trade.toLowerCase())).size).toBe(30);
    expect(ROTATION_STATES).toHaveLength(50);
    for (const state of ROTATION_STATES) {
      expect(state).toMatch(/^[A-Z]{2}$/);
      const metros = ROTATION_METROS[state]!;
      expect(metros.length).toBeGreaterThanOrEqual(1);
      expect(metros.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("rotation settings", () => {
  it("ships off and reads anything malformed as off", () => {
    expect(DEFAULT_ROTATION.enabled).toBe(false);
    expect(readRotation(null)).toEqual(DEFAULT_ROTATION);
    expect(readRotation({ enabled: true, trades: ["not a trade"] })).toEqual(DEFAULT_ROTATION);
  });

  it("validates trades and states, canonicalizing and de-duplicating them", () => {
    expect(parseRotation({ enabled: true, trades: ["hvac", "HVAC", "Roofing"], states: ["nc", "TX", "NC"] })).toEqual({
      enabled: true,
      trades: ["HVAC", "roofing"],
      states: ["NC", "TX"],
    });
    expect(() => parseRotation({ enabled: "yes" })).toThrow(/true or false/);
    expect(() => parseRotation({ enabled: true, trades: ["crypto mining"] })).toThrow(/isn't one of the rotation trades/);
    expect(() => parseRotation({ enabled: true, states: ["ZZ"] })).toThrow(/state code/);
    expect(describeRotation({ enabled: true, trades: ["HVAC"], states: ["NC"] })).toBe("rotate through 1 trade across metros in NC");
  });
});

describe("rotation cursor", () => {
  const pairs = rotationPairs({ enabled: true, trades: ["HVAC", "roofing"], states: ["NC", "VT"] });

  it("pairs every selected trade with every metro in the selected states, in a stable order", () => {
    // NC has three metros, VT one: 4 metros x 2 trades.
    expect(pairs).toHaveLength(8);
    expect(new Set(pairs.map((pair) => pair.key)).size).toBe(8);
    expect(pairs.every((pair) => pair.key === rotationPairKey(pair.trade, pair.city, pair.state))).toBe(true);
    expect(rotationPairs({ enabled: true, trades: ["HVAC", "roofing"], states: ["VT", "NC"] }).map((p) => p.key)).toEqual(pairs.map((p) => p.key));
    // Empty lists mean everything.
    expect(rotationPairs({ enabled: true, trades: [], states: [] }).length).toBe(
      ROTATION_TRADES.length * Object.values(ROTATION_METROS).reduce((total, metros) => total + metros.length, 0),
    );
  });

  it("advances: never-searched pairs first, then the oldest, skipping any inside the cooldown", () => {
    const first = nextRotationPairs(pairs, new Map(), NOW, 3);
    expect(first.map((pair) => pair.key)).toEqual(pairs.slice(0, 3).map((pair) => pair.key));

    // After the first run searched those three, the next run continues with the rest.
    const searched = new Map(first.map((pair) => [pair.key, NOW.toISOString()]));
    const second = nextRotationPairs(pairs, searched, NOW, 3);
    expect(second.map((pair) => pair.key)).toEqual(pairs.slice(3, 6).map((pair) => pair.key));

    // Everything searched: only pairs past the cooldown come back, oldest first.
    const all = new Map(pairs.map((pair) => [pair.key, daysAgo(0)]));
    all.set(pairs[1]!.key, daysAgo(ROTATION_COOLDOWN_DAYS + 5));
    all.set(pairs[2]!.key, daysAgo(ROTATION_COOLDOWN_DAYS + 1));
    expect(nextRotationPairs(pairs, all, NOW, 5).map((pair) => pair.key)).toEqual([pairs[1]!.key, pairs[2]!.key]);
    expect(nextRotationPairs(pairs, all, NOW, 0)).toEqual([]);
  });
});
