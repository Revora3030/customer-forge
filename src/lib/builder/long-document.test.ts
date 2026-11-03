import { describe, expect, it } from "vitest";
import { COMPOSITION_PRIMITIVES, INTERACTIVE_PRIMITIVES, LONG_DOCUMENT_LIMITS, PRIMITIVE_GUIDE, validateComposition } from "./composition-tree";
import { activeChapter, readingProgress } from "./long-document";

const tree = (root: unknown) => ({ version: 1, root });
const chapter = (title: string, body = "We start every job by walking the property with you.") => ({
  type: "stack",
  children: [{ type: "heading", level: 2, text: title }, { type: "text", text: body }],
});
const doc = (chapters: unknown[], text = "In this guide") => ({ type: "long_document", text, children: chapters });
const problems = (result: ReturnType<typeof validateComposition>) => (result.ok ? [] : result.issues.map((issue) => issue.problem));

describe("long_document is declared and documented", () => {
  it("is a composition primitive with a guide entry, and is not counted as an interactive centrepiece", () => {
    expect(COMPOSITION_PRIMITIVES).toContain("long_document");
    expect(PRIMITIVE_GUIDE).toContain("long_document (");
    expect(INTERACTIVE_PRIMITIVES.has("long_document")).toBe(false);
  });
});

describe("long_document validation", () => {
  it("accepts 2-8 chapters that each open with a heading", () => {
    expect(validateComposition(tree(doc([chapter("Why we soft wash"), chapter("What we check first")]))).ok).toBe(true);
    const eight = Array.from({ length: LONG_DOCUMENT_LIMITS.maxChapters }, (_, i) => chapter(`Step ${i + 1}`));
    expect(validateComposition(tree(doc(eight))).ok).toBe(true);
  });

  it("rejects too few or too many chapters", () => {
    expect(problems(validateComposition(tree(doc([chapter("Only one")]))))).toContain("long_document needs 2-8 chapter children (stack or card, each opening with a heading)");
    const nine = Array.from({ length: 9 }, (_, i) => chapter(`Step ${i + 1}`));
    expect(problems(validateComposition(tree(doc(nine))))).toContain("long_document needs 2-8 chapter children (stack or card, each opening with a heading)");
  });

  it("rejects a chapter without a heading title or with an over-long one", () => {
    const untitled = { type: "stack", children: [{ type: "text", text: "Prose with no title." }] };
    expect(problems(validateComposition(tree(doc([chapter("Intro"), untitled])))).join(" ")).toMatch(/first child is a heading/);
    expect(problems(validateComposition(tree(doc([chapter("Intro"), { type: "text", text: "Bare text" }])))).join(" ")).toMatch(/first child is a heading/);
    expect(problems(validateComposition(tree(doc([chapter("Intro"), chapter("x".repeat(81))])))).join(" ")).toMatch(/80 characters or fewer/);
  });

  it("rejects scenes, sequences or nested documents inside a chapter, and an over-long label", () => {
    const nested = { type: "stack", children: [{ type: "heading", level: 2, text: "Inside" }, doc([chapter("A"), chapter("B")])] };
    expect(problems(validateComposition(tree(doc([chapter("Intro"), nested])))).join(" ")).toMatch(/not a scene, sequence/);
    expect(problems(validateComposition(tree(doc([chapter("A"), chapter("B")], "x".repeat(41))))).join(" ")).toMatch(/contents label/);
  });

  it("holds chapter prose to the same truth screen as any other text", () => {
    const result = validateComposition(tree(doc([chapter("Intro", "We are rated #1 with 500+ five-star reviews."), chapter("Next")])), { screenText: (text) => (/#1/.test(text) ? "an unverified ranking claim" : null) });
    expect(problems(result)).toContain("an unverified ranking claim");
  });
});

describe("reading progress maths", () => {
  it("runs 0 to 1 as the prose passes the reading line", () => {
    expect(readingProgress(800, 2000, 900)).toBe(0);
    expect(readingProgress(297 - 1000, 2000, 900)).toBeCloseTo(0.5, 2);
    expect(readingProgress(-5000, 2000, 900)).toBe(1);
    expect(readingProgress(0, 0, 900)).toBe(0);
  });

  it("marks the last chapter whose top crossed the reading line", () => {
    expect(activeChapter([500, 1400], 900)).toBeNull();
    expect(activeChapter([100, 1400], 900)).toBe(0);
    expect(activeChapter([-900, 200, 1200], 900)).toBe(1);
  });
});
