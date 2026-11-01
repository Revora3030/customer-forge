import { describe, expect, it } from "vitest";
import { aiUpgradeInstruction, aiUpgradeKey, aiUpgradeSummary, readAiUpgradeFollowUps } from "@/lib/builder/ai-upgrade-followups";

const generation = (followUps: unknown) => ({ report: { followUps } });

describe("AI upgrade follow-ups", () => {
  it("reads only pending layout and wording upgrades", () => {
    const list = readAiUpgradeFollowUps(
      generation([
        { kind: "pictures", status: "pending", reason: "x", slots: ["hero"], recordedAt: "2026-10-01T00:00:00Z" },
        { kind: "layout_upgrade", status: "pending", reason: "Basic layout", slots: ["s1", "s2", "s1"], recordedAt: "2026-10-01T00:00:00Z" },
        { kind: "copy_upgrade", status: "done", reason: "old", slots: [], recordedAt: "2026-09-01T00:00:00Z" },
        null,
        "junk",
      ]),
    );
    expect(list).toEqual([{ kind: "layout_upgrade", reason: "Basic layout", slots: ["s1", "s2"], recordedAt: "2026-10-01T00:00:00Z" }]);
  });
  it("keeps the newest entry of each kind, layout first", () => {
    const list = readAiUpgradeFollowUps(
      generation([
        { kind: "copy_upgrade", status: "pending", reason: "c", slots: ["headline"], recordedAt: "b" },
        { kind: "layout_upgrade", status: "pending", reason: "old", slots: ["s1"], recordedAt: "a" },
        { kind: "layout_upgrade", status: "pending", reason: "new", slots: ["s9"], recordedAt: "c" },
      ]),
    );
    expect(list.map((f) => `${f.kind}:${f.reason}`)).toEqual(["layout_upgrade:new", "copy_upgrade:c"]);
    expect(aiUpgradeKey(list)).toBe("layout_upgrade@c|copy_upgrade@b");
  });
  it("tolerates missing or malformed reports", () => {
    expect(readAiUpgradeFollowUps(null)).toEqual([]);
    expect(readAiUpgradeFollowUps({})).toEqual([]);
    expect(readAiUpgradeFollowUps({ report: { followUps: "nope" } })).toEqual([]);
  });
  it("asks for an upgrade that keeps every fact and invents nothing", () => {
    const list = readAiUpgradeFollowUps(
      generation([
        { kind: "layout_upgrade", status: "pending", reason: "r", slots: ["s1"], recordedAt: "a" },
        { kind: "copy_upgrade", status: "pending", reason: "r", slots: ["headline"], recordedAt: "a" },
      ]),
    );
    const instruction = aiUpgradeInstruction(list);
    expect(instruction).toContain("sections: s1");
    expect(instruction).toContain("(headline)");
    expect(instruction).toMatch(/Keep every business fact, service, price, review/);
    expect(instruction).toMatch(/Do not invent reviews, prices/);
    expect(aiUpgradeSummary(list)).toMatch(/basic layout and basic wording/);
    expect(aiUpgradeInstruction([])).toBe("");
  });
});
