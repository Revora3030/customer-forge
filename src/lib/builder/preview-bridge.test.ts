import { describe, expect, it } from "vitest";
import {
  PREVIEW_BRIDGE_SOURCE,
  readBuilderMessage,
  readPreviewMessage,
  selectionPrefix,
} from "./preview-bridge";

describe("preview bridge", () => {
  it("reads a click on a block", () => {
    const message = readPreviewMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      type: "select",
      id: "abc-123",
      kind: "hero",
      label: "Headline banner",
      text: "  Mobile detailing  that comes to you ",
    });
    expect(message).toEqual({
      source: PREVIEW_BRIDGE_SOURCE,
      type: "select",
      id: "abc-123",
      kind: "hero",
      label: "Headline banner",
      text: "Mobile detailing that comes to you",
    });
  });

  it("ignores messages from anything that isn't the preview", () => {
    expect(readPreviewMessage({ type: "select", id: "abc" })).toBeNull();
    expect(readPreviewMessage("select")).toBeNull();
    expect(readPreviewMessage(null)).toBeNull();
  });

  it("refuses a block id that isn't a plain row id", () => {
    expect(
      readPreviewMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "select", id: "abc'; drop" }),
    ).toBeNull();
  });

  it("accepts the ready handshake", () => {
    expect(readPreviewMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "ready" })?.type).toBe("ready");
  });

  it("reads select mode from the builder and drops an unsafe selected id", () => {
    expect(
      readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on: true, selectedId: "a1" }),
    ).toEqual({ source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on: true, selectedId: "a1" });
    expect(
      readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on: 1, selectedId: "<img>" }),
    ).toEqual({ source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on: false, selectedId: null });
    expect(readBuilderMessage({ source: "other", type: "select-mode", on: true })).toBeNull();
  });

  it("describes the picked block for the assistant", () => {
    expect(selectionPrefix({ id: "s1", label: "Headline banner", kind: "hero" })).toBe(
      'On the "Headline banner" block (id s1):',
    );
    expect(selectionPrefix({ id: "s1", label: null, kind: "hero" })).toContain("hero");
    expect(selectionPrefix({ id: "s1", label: null, kind: null })).toContain("block");
  });
});
