import { describe, expect, it } from "vitest";
import { nextPreviewLoadState, PREVIEW_LOAD_TIMEOUT_MS } from "./preview-load";

describe("preview load state", () => {
  it("fails when still loading at timeout", () => {
    expect(nextPreviewLoadState("loading", "timeout")).toBe("failed");
  });
  it("keeps a loaded frame visible after a late timeout", () => {
    expect(nextPreviewLoadState("loaded", "timeout")).toBe("loaded");
  });
  it("network error shows the failure state", () => {
    expect(nextPreviewLoadState("loading", "error")).toBe("failed");
  });
  it("timeout is 20 seconds", () => {
    expect(PREVIEW_LOAD_TIMEOUT_MS).toBe(20_000);
  });
});
