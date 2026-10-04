import { describe, expect, it } from "vitest";

import { readVerdict } from "@/lib/ai/photo-direction.server";

describe("photo reviewer verdicts", () => {
  it("fails closed: only an explicit true publishes a picture", () => {
    expect(readVerdict({ publishable: true }).publishable).toBe(true);
    expect(readVerdict({}).publishable).toBe(false);
    expect(readVerdict({ publishable: "no" }).publishable).toBe(false);
    expect(readVerdict({ publishable: "yes" }).publishable).toBe(false);
    expect(readVerdict({ publishable: false }).publishable).toBe(false);
  });

  it("explains an unclear review to the owner instead of silently passing it", () => {
    const unclear = readVerdict({});
    expect(unclear.defects.length).toBeGreaterThan(0);
    expect(unclear.reviewed).toBe(true);
  });

  it("keeps a reshoot brief only when the picture was rejected and the brief is real", () => {
    const rejected = readVerdict({
      publishable: false,
      defects: ["the wheel is warped", "  ", 7],
      revisedPrompt: "Commissioned photograph of a detailer polishing a sedan bonnet, 85mm, soft morning side light.",
    });
    expect(rejected.defects).toEqual(["the wheel is warped"]);
    expect(rejected.revisedPrompt).not.toBeNull();

    expect(readVerdict({ publishable: false, revisedPrompt: "redo it" }).revisedPrompt).toBeNull();
    expect(readVerdict({ publishable: true, revisedPrompt: "a".repeat(200) }).revisedPrompt).toBeNull();
  });

  it("caps defect lists and marks the review as done", () => {
    const verdict = readVerdict({
      publishable: false,
      defects: Array.from({ length: 12 }, (_, index) => `defect ${index}`),
    });
    expect(verdict.defects).toHaveLength(6);
    expect(verdict.reviewed).toBe(true);
  });
});
