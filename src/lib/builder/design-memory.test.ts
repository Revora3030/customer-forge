import { describe, expect, it } from "vitest";
import {
  designMemoryBrief,
  mergeDesignMemory,
  readDesignMemory,
  standingRulesFrom,
} from "./design-memory";

describe("design memory", () => {
  it("keeps standing rules and ignores one-off tasks", () => {
    expect(standingRulesFrom("Add a pricing page.")).toEqual([]);
    expect(standingRulesFrom("Always keep the headline exactly as I wrote it.")).toHaveLength(1);
    expect(standingRulesFrom("Stay on the coastal blue look. Add a gallery.")).toEqual([
      "Stay on the coastal blue look.",
    ]);
  });

  it("merges newest first without duplicates and caps the list", () => {
    let memory: import("./design-memory").DesignMemory = { notes: [] };
    memory = mergeDesignMemory(memory, "Never use red anywhere.");
    memory = mergeDesignMemory(memory, "Keep the phone number exactly as entered.");
    memory = mergeDesignMemory(memory, "Never use red anywhere.");
    // Repeating a rule moves it to the front: it is the most recent intent.
    expect(memory.notes).toEqual([
      "Never use red anywhere.",
      "Keep the phone number exactly as entered.",
    ]);
    expect(memory.updatedAt).toBeTruthy();
  });

  it("reads and restates stored notes for the planner", () => {
    const stored = readDesignMemory({ designMemory: { notes: ["Never use red anywhere."] } });
    expect(stored.notes).toEqual(["Never use red anywhere."]);
    expect(designMemoryBrief(stored)).toContain("Never use red anywhere.");
    expect(designMemoryBrief({ notes: [] })).toBeNull();
  });

  it("survives a missing or malformed settings blob", () => {
    expect(readDesignMemory(null).notes).toEqual([]);
    expect(readDesignMemory({ designMemory: { notes: [1, "ok"] } }).notes).toEqual(["ok"]);
  });
});
