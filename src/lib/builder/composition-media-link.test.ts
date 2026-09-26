import { describe, expect, it } from "vitest";
import { compositionMediaRefs, linkGeneratedMedia } from "./composition-media-link";

const tree = { version: 1 as const, root: { type: "stack" as const, children: [{ type: "media" as const, mediaRef: "old" }, { type: "heading" as const, text: "Hi" }] } };

describe("linkGeneratedMedia", () => {
  it("replaces a dead media slot", () => {
    const next = linkGeneratedMedia(tree as never, "new", new Set(["old"]));
    expect(compositionMediaRefs(next!)).toEqual(["new"]);
  });
  it("appends when no dead slot exists", () => {
    const next = linkGeneratedMedia(tree as never, "new", new Set());
    expect(compositionMediaRefs(next!)).toEqual(["old", "new"]);
  });
  it("is a no-op when already linked", () => {
    expect(linkGeneratedMedia(tree as never, "old", new Set())).toBeNull();
  });
});
