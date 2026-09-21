import { describe, expect, it } from "vitest";
import { createDesignFingerprint } from "@/lib/builder/design-fingerprint";
import {
  isSiteWide,
  planRedesign,
  readRedesignRequest,
  redesignOverrides,
  redesignSummary,
} from "@/lib/builder/sitewide-redesign";

const base = () =>
  createDesignFingerprint({ businessName: "Harbour Dental", industry: "dentist", city: "Hull" });

describe("site-wide redesign command", () => {
  it("reads the direction out of plain sentences", () => {
    expect(readRedesignRequest("make it feel more premium")?.direction).toBe("premium");
    expect(readRedesignRequest("Can you make the whole site calmer?")?.direction).toBe("calm");
    expect(readRedesignRequest("bolder please")?.direction).toBe("bold");
    expect(readRedesignRequest("more modern and sleek")?.direction).toBe("modern");
    expect(readRedesignRequest("make it warmer and more welcoming")?.direction).toBe("warm");
  });

  it("returns nothing rather than guessing", () => {
    expect(readRedesignRequest("add a booking form")).toBeNull();
    expect(readRedesignRequest("")).toBeNull();
  });

  it("recognises a request that should reach every page", () => {
    expect(isSiteWide("make the whole site more premium")).toBe(true);
    expect(isSiteWide("make this page more premium")).toBe(false);
  });

  it("changes design choices and nothing else", () => {
    const fingerprint = base();
    const { next, changes } = planRedesign(fingerprint, "premium");
    expect(changes.length).toBeGreaterThan(0);
    expect(next.id).toBe(fingerprint.id);
    expect(next.seed).toBe(fingerprint.seed);
    expect(next.family).toBe(redesignOverrides("premium").family);
  });

  it("never applies a look the owner turned down", () => {
    const fingerprint = { ...base(), rejected: [redesignOverrides("bold").typeSystem] };
    const { next, blocked } = planRedesign(fingerprint, "bold");
    expect(blocked).toContain(redesignOverrides("bold").typeSystem);
    expect(next.typeSystem).not.toBe(redesignOverrides("bold").typeSystem);
  });

  it("reports no change when the site already looks that way", () => {
    const first = planRedesign(base(), "calm");
    const second = planRedesign(first.next, "calm");
    expect(second.changes).toEqual([]);
    expect(redesignSummary("calm", second.changes, second.blocked)).toContain("already");
  });

  it("summarises how many choices changed", () => {
    const { changes, blocked } = planRedesign(base(), "technical");
    expect(redesignSummary("technical", changes, blocked)).toContain(`${changes.length} design choice`);
  });

  it("every direction has a complete set of choices", () => {
    for (const direction of [
      "premium", "calm", "bold", "modern", "warm", "editorial", "playful", "technical",
    ] as const) {
      const overrides = redesignOverrides(direction);
      expect(overrides.describe.length).toBeGreaterThan(10);
      expect(overrides.family).toBeTruthy();
      expect(["none", "subtle", "expressive"]).toContain(overrides.motionLevel);
    }
  });
});
