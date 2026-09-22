import { describe, expect, it } from "vitest";

import {
  capabilityForPurpose,
  rankHallOfFame,
  roleForPurpose,
  spreadProviders,
  type HallOfFameCandidate,
} from "@/lib/ai/hall-of-fame";

const candidate = (
  provider: string,
  model: string,
  weight: number,
  extra?: Partial<HallOfFameCandidate>,
): HallOfFameCandidate => ({
  provider,
  model,
  weight,
  capabilities: ["planning", "reasoning", "design", "copy", "critique"],
  healthy: true,
  remainingToday: null,
  ...extra,
});

describe("hall of fame roster", () => {
  it("routes each purpose to a pool and a real capability", () => {
    expect(roleForPurpose("creative_direction")).toBe("design");
    expect(roleForPurpose("visual_review")).toBe("vision");
    expect(roleForPurpose("small_edit")).toBe("fast");
    expect(roleForPurpose("synthesis")).toBe("primary");
    expect(capabilityForPurpose("adversarial_review")).toBe("critique");
    expect(capabilityForPurpose("seo_analysis")).toBe("seo");
    expect(capabilityForPurpose("information_architecture")).toBe("planning");
  });

  it("drops models that cannot serve the capability", () => {
    const squad = rankHallOfFame({
      purpose: "seo_analysis",
      candidates: [
        candidate("groq", "big-70b", 80, { capabilities: ["copy"] }),
        candidate("nvidia", "seo-32b", 66, { capabilities: ["seo"] }),
      ],
    });
    expect(squad.map((entry) => entry.model)).toEqual(["seo-32b"]);
  });

  it("puts the strongest ready model first", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [
        candidate("groq", "small", 40),
        candidate("groq", "huge", 95),
        candidate("groq", "mid", 66),
      ],
    });
    expect(squad.map((entry) => entry.model)).toEqual(["huge", "mid", "small"]);
  });

  it("sinks resting providers and spent allowances behind ready ones", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [
        candidate("groq", "resting-huge", 95, { healthy: false }),
        candidate("nvidia", "spent-huge", 92, { remainingToday: 0 }),
        candidate("llm7", "ready-mid", 60),
      ],
    });
    expect(squad[0]?.model).toBe("ready-mid");
  });

  it("spreads consecutive attempts across providers", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [
        candidate("groq", "groq-a", 95),
        candidate("groq", "groq-b", 90),
        candidate("nvidia", "nvidia-a", 85),
        candidate("nvidia", "nvidia-b", 80),
      ],
    });
    expect(squad.map((entry) => entry.provider)).toEqual(["groq", "nvidia", "groq", "nvidia"]);
  });

  it("caps the squad size", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: Array.from({ length: 40 }, (_, index) =>
        candidate(`p${index % 5}`, `m${index}`, 90 - index),
      ),
      squadSize: 6,
    });
    expect(squad).toHaveLength(6);
  });

  it("keeps every entry when spreading providers", () => {
    const entries = [
      { provider: "a", id: 1 },
      { provider: "a", id: 2 },
      { provider: "b", id: 3 },
    ];
    expect(spreadProviders(entries).map((entry) => entry.id).sort()).toEqual([1, 2, 3]);
  });
});
