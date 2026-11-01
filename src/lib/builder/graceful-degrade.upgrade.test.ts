import { describe, expect, it } from "vitest";
import { degradeCopyScaffold, degradeLayoutFallback, mergeFollowUps } from "./graceful-degrade";

const now = new Date("2026-11-01T12:00:00Z");

describe("facts-only upgrade follow-ups", () => {
  it("records a pending layout upgrade per unique section", () => {
    const out = degradeLayoutFallback({ sections: ["s1", "s2", "s1", ""], now });
    expect(out?.followUp).toMatchObject({ kind: "layout_upgrade", status: "pending", slots: ["s1", "s2"], recordedAt: now.toISOString() });
    expect(out?.followUp.reason).toMatch(/2 sections use/);
    expect(out?.attention).toMatch(/uses AI credits/);
  });
  it("records a pending wording upgrade", () => {
    const out = degradeCopyScaffold({ fields: ["heroHeadline", "metaTitle"], now });
    expect(out?.followUp).toMatchObject({ kind: "copy_upgrade", status: "pending", slots: ["heroHeadline", "metaTitle"] });
    expect(out?.followUp.reason).toMatch(/only when you approve/);
  });
  it("records nothing when nothing fell back", () => {
    expect(degradeLayoutFallback({ sections: [] })).toBeNull();
    expect(degradeCopyScaffold({ fields: [] })).toBeNull();
  });
  it("keeps one pending entry per kind", () => {
    const a = degradeLayoutFallback({ sections: ["s1"], now })!.followUp;
    const b = degradeLayoutFallback({ sections: ["s2"], now })!.followUp;
    const c = degradeCopyScaffold({ fields: ["metaTitle"], now })!.followUp;
    expect(mergeFollowUps([a, c], [b])).toEqual([c, b]);
  });
});
