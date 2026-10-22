/**
 * Lane-by-task-size routing (owner decision 2026-10-22): the free pool leads
 * small, mechanical roles; the paid Lovable team leads creative/building
 * roles. These tests pin the group placement, never specific providers.
 */
import { describe, expect, it } from "vitest";

import { groupForRole, SMALL_TASK_ROLES } from "@/lib/ai/router.server";
import type { ModelRole } from "@/lib/ai/config";

type Entry = { model: string; free: string | null };

const paid = (model: string): Entry => ({ model, free: null });
const free = (model: string): Entry => ({ model, free: "groq" });

const ranked: Entry[] = [paid("openai/gpt-6.1-sol"), free("llama-3.3-70b"), paid("anthropic/claude-sonnet-5")];

describe("small-task lane routing", () => {
  it("names exactly the fast and conversation roles as small tasks", () => {
    expect([...SMALL_TASK_ROLES].sort()).toEqual(["conversation", "fast"]);
  });

  it("leads small-task roles with the free pool, paid team as failover", () => {
    for (const role of ["fast", "conversation"] as ModelRole[]) {
      const ordered = groupForRole(role, ranked);
      expect(ordered.map((entry) => entry.free !== null)).toEqual([true, false, false]);
      // Quality-first order is preserved inside each group.
      expect(ordered.map((entry) => entry.model)).toEqual([
        "llama-3.3-70b",
        "openai/gpt-6.1-sol",
        "anthropic/claude-sonnet-5",
      ]);
    }
  });

  it("leads creative and building roles with the paid team, free pool as backup", () => {
    for (const role of ["primary", "design", "vision", "coding", "image"] as ModelRole[]) {
      const ordered = groupForRole(role, ranked);
      expect(ordered.map((entry) => entry.free !== null)).toEqual([false, false, true]);
    }
  });

  it("keeps a free-only chain untouched when no paid candidate is present", () => {
    const freeOnly: Entry[] = [free("llama-3.3-70b"), free("qwen3-32b")];
    expect(groupForRole("primary", freeOnly)).toEqual(freeOnly);
  });
});
