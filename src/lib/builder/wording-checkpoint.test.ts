import { describe, expect, it } from "vitest";
import { inputDigest } from "./first-build-section-checkpoints";
import { fromStoredWordingPatches, toStoredWordingPatches, wordingCheckpointInputs } from "./wording-checkpoint";

const section = (id: string, heading: string) => ({ id, page: "home", kind: "hero", heading, subheading: null, body: "b" });

describe("section wording checkpoint", () => {
  it("reapplies saved wording to a retry's new section ids by position", () => {
    const first = [section("a1", "One"), section("a2", "Two")];
    const stored = toStoredWordingPatches(first, [{ id: "a2", heading: "Better two" }]);
    const retry = [section("b1", "One"), section("b2", "Two")];
    expect(fromStoredWordingPatches(retry, stored)).toEqual([{ id: "b2", heading: "Better two" }]);
  });

  it("the digest ignores row ids but changes when the starting copy changes", () => {
    const a = wordingCheckpointInputs([section("a1", "One")], { facts: 1 });
    const b = wordingCheckpointInputs([section("b1", "One")], { facts: 1 });
    const c = wordingCheckpointInputs([section("b1", "Changed")], { facts: 1 });
    expect(inputDigest(a)).toBe(inputDigest(b));
    expect(inputDigest(a)).not.toBe(inputDigest(c));
  });

  it("an empty saved list is a valid 'keep authored wording' result; missing is not", () => {
    expect(fromStoredWordingPatches([section("x", "One")], [])).toEqual([]);
    expect(fromStoredWordingPatches([section("x", "One")], null)).toBeNull();
    expect(fromStoredWordingPatches([section("x", "One")], [{ index: 5, heading: "h" }])).toEqual([]);
  });
});
