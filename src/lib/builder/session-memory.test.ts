import { describe, expect, it } from "vitest";
import {
  extractMemories,
  memoryBrief,
  memoryKey,
  newMemories,
  pruneMemories,
  type MemoryEntry,
} from "@/lib/builder/session-memory";

describe("long-session memory", () => {
  it("keeps a standing rule and the request itself, in the owner's words", () => {
    const entries = extractMemories({
      instruction: "Always keep the headline exactly as written. Add a booking button to the hero.",
      summary: "Added a booking button",
      applied: ["hero button"],
    });
    expect(entries.some((e) => e.kind === "rule" && /Always keep the headline/.test(e.text))).toBe(
      true,
    );
    expect(entries.some((e) => e.kind === "decision")).toBe(true);
    expect(entries.some((e) => e.kind === "outcome" && e.text.includes("1 change"))).toBe(true);
  });

  it("records nothing about outcomes when nothing was applied", () => {
    const entries = extractMemories({ instruction: "Make the hero blue", applied: [] });
    expect(entries.some((e) => e.kind === "outcome")).toBe(false);
  });

  it("remembers what did not work so it is not retried blindly", () => {
    const entries = extractMemories({
      instruction: "Add a pricing table",
      applied: ["intro"],
      failed: ["pricing table on /home"],
    });
    expect(entries.some((e) => e.kind === "avoid" && e.text.includes("pricing table"))).toBe(true);
  });

  it("does not store the same note twice", () => {
    const existing: MemoryEntry[] = [{ kind: "rule", text: "Always keep the headline" }];
    const fresh = newMemories(
      existing,
      extractMemories({ instruction: "always keep the headline!" }),
    );
    expect(fresh.some((e) => e.kind === "rule")).toBe(false);
  });

  it("treats punctuation and case as the same note", () => {
    expect(memoryKey({ kind: "rule", text: "Stay on   the coastal blue look." })).toBe(
      memoryKey({ kind: "rule", text: "stay on the coastal-blue look" }),
    );
  });

  it("prunes the oldest ordinary entries but never a rule or a pinned entry", () => {
    const entries: MemoryEntry[] = [
      { kind: "rule", text: "never use stock smiles", createdAt: "2024-01-01T00:00:00Z" },
      { kind: "decision", text: "pinned ask", pinned: true, createdAt: "2024-01-02T00:00:00Z" },
      ...Array.from({ length: 5 }, (_, index) => ({
        kind: "decision" as const,
        text: `ask ${index}`,
        createdAt: `2024-02-0${index + 1}T00:00:00Z`,
      })),
    ];
    const { keep, drop } = pruneMemories(entries, 3);
    expect(keep.some((e) => e.kind === "rule")).toBe(true);
    expect(keep.some((e) => e.pinned)).toBe(true);
    expect(drop.map((e) => e.text)).toEqual(["ask 1", "ask 0"]);
  });

  it("briefs the planner with rules first and stays within its budget", () => {
    const brief = memoryBrief([
      { kind: "decision", text: "add a gallery" },
      { kind: "rule", text: "always keep the headline" },
    ]);
    expect(brief).toBeTruthy();
    const lines = brief!.split("\n");
    expect(lines[1]).toContain("Standing instruction");
    expect(brief!.length).toBeLessThan(1600);
  });

  it("returns no brief when there is nothing remembered", () => {
    expect(memoryBrief([])).toBeNull();
  });
});
