import { describe, expect, it } from "vitest";
import { deliberate, type Deliberator } from "./deliberation";

const critic = (name: string, rule: (p: string) => boolean | string): Deliberator => ({
  name,
  critique: async (proposal) => {
    const result = rule(proposal);
    return result === true ? { approve: true } : { approve: false, objection: String(result) };
  },
});

describe("deliberate", () => {
  it("reaches consensus after revising against objections", async () => {
    const result = await deliberate({
      propose: async (feedback) => (feedback.length ? "Discount 10% for returning customers" : "Discount 50% for everyone"),
      critics: [critic("finance", (p) => (p.includes("50%") ? "margin too thin" : true)), critic("brand", () => true)],
    });
    expect(result).toMatchObject({ outcome: "consensus", rounds: 2, needsOwner: true, proposal: "Discount 10% for returning customers" });
    expect(result.openObjections).toEqual([]);
  });

  it("reports no consensus with the standing objections after the round cap", async () => {
    let proposals = 0;
    const result = await deliberate({ propose: async () => `v${++proposals}`, critics: [critic("legal", () => "claims a guarantee"), critic("brand", () => true)], maxRounds: 2 });
    expect(result).toMatchObject({ outcome: "no_consensus", rounds: 2, needsOwner: true });
    expect(result.openObjections).toEqual([{ by: "legal", objection: "claims a guarantee" }]);
    expect(proposals).toBe(2);
  });

  it("treats a failing critic as an objection and honours a lower quorum", async () => {
    const broken: Deliberator = { name: "broken", critique: async () => { throw new Error("down"); } };
    const strict = await deliberate({ propose: async () => "p", critics: [broken, critic("a", () => true)], maxRounds: 1 });
    expect(strict.outcome).toBe("no_consensus");
    const relaxed = await deliberate({ propose: async () => "p", critics: [broken, critic("a", () => true)], quorum: 0.5, maxRounds: 1 });
    expect(relaxed.outcome).toBe("consensus");
    expect(relaxed.openObjections[0]).toMatchObject({ by: "broken", objection: "critic unavailable" });
  });

  it("refuses to run with no critics and clamps the round count", async () => {
    await expect(deliberate({ propose: async () => "p", critics: [] })).rejects.toThrow();
    let calls = 0;
    await deliberate({ propose: async () => `v${++calls}`, critics: [critic("x", () => "no")], maxRounds: 99 });
    expect(calls).toBe(5);
  });
});
