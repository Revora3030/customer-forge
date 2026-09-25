import { describe, expect, it } from "vitest";
import { normalizeGridAreas } from "./composition-tree";

describe("grid areas spelling", () => {
  it("keeps the canonical form", () => {
    expect(normalizeGridAreas('"media copy" "media cta"')).toBe('"media copy" "media cta"');
  });
  it("accepts arrays, single quotes and slash/newline rows without changing the layout", () => {
    const want = '"media copy" "media cta"';
    expect(normalizeGridAreas(["media copy", "media cta"])).toBe(want);
    expect(normalizeGridAreas("'media copy' 'media cta'")).toBe(want);
    expect(normalizeGridAreas("media copy / media cta")).toBe(want);
    expect(normalizeGridAreas("media copy\nmedia  cta")).toBe(want);
  });
  it("rejects unsafe characters instead of guessing", () => {
    expect(normalizeGridAreas('"a" "b}; body{x:y"')).toBeNull();
    expect(normalizeGridAreas(42)).toBeNull();
  });
});

import { normalizeAspect } from "./composition-tree";
describe("aspect spelling", () => {
  it("normalises equivalent spellings to a:b", () => {
    for (const v of ["16:9", "16/9", "16 / 9", "16x9"]) expect(normalizeAspect(v)).toBe("16:9");
    expect(normalizeAspect("square")).toBe("1:1");
    expect(normalizeAspect("1")).toBe("1:1");
    expect(normalizeAspect(1.5)).toBe("15:10");
  });
  it("rejects anything else", () => {
    expect(normalizeAspect("16:9; x")).toBeNull();
    expect(normalizeAspect("wide")).toBeNull();
  });
});
