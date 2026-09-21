import { describe, expect, it } from "vitest";
import { playbookFor } from "./industry";
import {
  copyDepthPack,
  depthIsFactSafe,
  objectionBlock,
  processBlock,
  questionDepth,
  serviceDepth,
  type DepthFacts,
} from "./copy-depth";

const playbook = playbookFor("plumbing");

const facts = (over: Partial<DepthFacts> = {}): DepthFacts => ({
  name: "Nolan Plumbing",
  city: "Leeds",
  serviceArea: "West Yorkshire",
  services: [{ name: "Boiler repair" }, { name: "Bathroom fitting" }],
  ...over,
});

describe("industry copy depth", () => {
  it("writes the trade's real worries as things to get right", () => {
    const block = objectionBlock(playbook, facts());
    expect(block.bullets.length).toBeGreaterThan(1);
    expect(block.paragraphs[0]).toContain("Nolan Plumbing");
    expect(depthIsFactSafe(block)).toBe(true);
  });

  it("writes a how-it-works that names the place when known", () => {
    expect(processBlock(playbook, facts()).paragraphs[0]).toContain("Leeds");
    expect(processBlock(playbook, facts({ city: null })).paragraphs[0]).toContain("West Yorkshire");
    expect(processBlock(playbook, facts({ city: null, serviceArea: null })).paragraphs[0]).not.toContain(
      "in ",
    );
  });

  it("writes service depth from the service's own name", () => {
    const block = serviceDepth("Boiler repair", playbook, facts());
    expect(block.heading).toBe("Boiler repair");
    expect(block.paragraphs[0]).toContain("boiler repair");
    expect(depthIsFactSafe(block)).toBe(true);
  });

  it("lists the questions that trade is actually asked", () => {
    const block = questionDepth(playbook, facts(), 4);
    expect(block.bullets.length).toBeLessThanOrEqual(4);
    expect(block.bullets.length).toBeGreaterThan(0);
  });

  it("never states a price, rating, award, count or guarantee", () => {
    const pack = copyDepthPack(playbook, facts());
    for (const block of [pack.objections, pack.process, pack.questions, ...pack.services]) {
      expect(depthIsFactSafe(block)).toBe(true);
    }
  });

  it("catches an unsafe claim if one were ever introduced", () => {
    expect(
      depthIsFactSafe({ heading: "x", paragraphs: ["Rated best in Leeds"], bullets: [] }),
    ).toBe(false);
  });

  it("is deterministic and safe with nothing stored yet", () => {
    const bare: DepthFacts = { name: null, city: null, serviceArea: null, services: [] };
    const a = copyDepthPack(playbook, bare);
    const b = copyDepthPack(playbook, bare);
    expect(a).toEqual(b);
    expect(a.services).toEqual([]);
    expect(depthIsFactSafe(a.process)).toBe(true);
  });

  it("de-duplicates repeated material", () => {
    const block = objectionBlock(playbook, facts());
    expect(new Set(block.bullets.map((b) => b.toLowerCase())).size).toBe(block.bullets.length);
  });
});
