import { describe, expect, it } from "vitest";
import { dropMissingPictures, missingPictureProblems, savedPictureRefs } from "./first-build-saved-coverage";
import { substantiveRejections } from "./collective-copy";
import { readComposition } from "./composition-tree";

const section = (root: unknown) => ({ id: "s1", page_id: "p1", kind: "composition", settings: { composition: { version: 1, root } } });

describe("a missing picture no longer blocks a finished site", () => {
  it("drops only the unsaved picture and keeps the section's copy", () => {
    const s = section({ type: "stack", children: [{ type: "heading", text: "Mobile detailing" }, { type: "media", mediaRef: "gone", alt: "car" }, { type: "media", mediaRef: "kept", alt: "van" }] });
    const fixed = dropMissingPictures(s.settings, new Set(["gone"]))!;
    const refs = savedPictureRefs([{ ...s, settings: fixed }]);
    expect([...refs.keys()]).toEqual(["kept"]);
    expect(missingPictureProblems([{ ...s, settings: fixed }], new Set(["kept"]))).toEqual([]);
    expect(JSON.stringify(fixed)).toContain("Mobile detailing");
  });
  it("turns a scene that lost its backdrop into a plain layout", () => {
    const s = section({ type: "scene", children: [{ type: "media", mediaRef: "gone", alt: "x" }, { type: "heading", text: "Shine" }] });
    const fixed = dropMissingPictures(s.settings, new Set(["gone"])) as { composition: { root: { type: string } } };
    expect(fixed.composition.root.type).toBe("stack");
  });
  it("leaves sections with no missing pictures untouched", () => {
    expect(dropMissingPictures(section({ type: "stack", children: [] }).settings, new Set(["gone"]))).toBeNull();
  });
  it("repaired designs still pass the renderer's check", () => {
    const s = section({ type: "stack", children: [{ type: "heading", text: "Hi" }, { type: "media", mediaRef: "gone", alt: "x" }] });
    const before = readComposition(s.settings);
    const fixed = dropMissingPictures(s.settings, new Set(["gone"]));
    expect(before === null || readComposition(fixed) !== null).toBe(true);
  });
});

describe("reviewer rejections must name a real problem", () => {
  it("treats the 22 Oct 'Not a violation' note as advice, not a rejection", () => {
    expect(substantiveRejections([{ field: "services[].'social_proof','booking' sections omitted", reason: "Not a violation — booking omitted because no booking tool exists" }])).toEqual([]);
  });
  it("keeps real rejections", () => {
    const real = { field: "pages", reason: "Home page invents a 5-star review" };
    expect(substantiveRejections([real])).toEqual([real]);
  });
});
