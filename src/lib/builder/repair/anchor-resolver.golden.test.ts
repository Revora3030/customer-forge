/**
 * Golden master for the fuzzy anchor cascade (Aider EditBlockCoder port).
 * Every outcome is written down; a change in matching behaviour must change
 * this file on purpose.
 */
import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_HINT,
  NONE_HINT,
  OVERLAP_HINT,
  applyBatch,
  getAtPointer,
  normalizeWs,
  ratio,
  resolveAnchor,
  resolveNodeAnchor,
  setAtPointer,
  tokenize,
} from "./anchor-resolver";

const COPY = "Fast, friendly roof repairs across Leeds. Call today for a free inspection and an honest quote.";
const FILE = [
  "<section>",
  "  <h2>Our services</h2>",
  "  <p>We fix leaks, replace slates and clear gutters.</p>",
  "  <p>Every job is photographed before and after.</p>",
  "  <p>Insured work, tidy sites, fair prices.</p>",
  "  <a href=\"/quote\">Get a quote</a>",
  "</section>",
].join("\n");

describe("resolveAnchor cascade", () => {
  it("1. exact, unique", () => {
    const r = resolveAnchor(COPY, "free inspection");
    expect(r).toMatchObject({ matchType: "exact", confidence: 1, matchedText: "free inspection" });
    expect(COPY.slice(r.start, r.end)).toBe("free inspection");
  });

  it("1. exact but repeated is ambiguous, never a guess", () => {
    expect(resolveAnchor("call us. call us.", "call us").matchType).toBe("ambiguous");
  });

  it("2. normalized whitespace and typographic quotes map back to the original range", () => {
    const stored = "We\u2019re   open\n  seven days";
    const r = resolveAnchor(stored, "We're open seven days");
    expect(r.matchType).toBe("normalized");
    expect(r.confidence).toBe(0.97);
    expect(stored.slice(r.start, r.end)).toBe(stored);
  });

  it("3. sequence similarity ≥ 0.8 on one-line copy (one word dropped)", () => {
    const r = resolveAnchor(COPY, "Call today for a free roof inspection and an honest quote.");
    expect(r.matchType).toBe("sequence");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.matchedText).toContain("free inspection");
  });

  it("3. sequence on multi-line text picks the drifted line", () => {
    const r = resolveAnchor(FILE, "  <p>Every job is photographed before & after.</p>");
    expect(r.matchType).toBe("sequence");
    expect(r.matchedText).toBe("  <p>Every job is photographed before and after.</p>");
  });

  it("3. below 0.8 is none, not a guess", () => {
    expect(resolveAnchor(COPY, "Book a plumber in Manchester tonight").matchType).toBe("none");
  });

  it("3. two near-equal windows are ambiguous", () => {
    const text = "Get a free quote today\nGet a fast quote today";
    expect(resolveAnchor(text, "Get a quick quote today").matchType).toBe("ambiguous");
  });

  it("4. block anchor when the middle drifted", () => {
    const search = [
      "<section>",
      "  <h2>Our services</h2>",
      "  <p>We fix leaks, replace slates and clear gutters.</p>",
      "  <div class=\"grid grid-cols-3 gap-6 md:gap-10 lg:gap-14 xl:gap-16\">",
      "    <figure data-reveal=\"fade-up\" data-delay=\"120\" data-stagger=\"80\"><img src=\"/a.webp\" alt=\"Slate roof\" width=\"640\" height=\"480\"></figure>",
      "    <figure data-reveal=\"fade-up\" data-delay=\"240\" data-stagger=\"80\"><img src=\"/b.webp\" alt=\"Gutter clean\" width=\"640\" height=\"480\"></figure>",
      "  </div>",
      "  <p>Insured work, tidy sites, fair prices.</p>",
      "  <a href=\"/quote\">Get a quote</a>",
      "</section>",
    ].join("\n");
    const r = resolveAnchor(FILE, search);
    expect(r.matchType).toBe("block");
    expect(r.confidence).toBe(0.88);
    expect(r.start).toBe(0);
    expect(r.end).toBe(FILE.length);
  });

  it("empty search is none", () => {
    expect(resolveAnchor(COPY, "").matchType).toBe("none");
  });
});

describe("applyBatch (order-invariant, back-to-front)", () => {
  it("applies independent edits regardless of order", () => {
    const edits = [
      { id: "b", search: "honest quote", replace: "fixed-price quote" },
      { id: "a", search: "Fast, friendly", replace: "Careful, friendly" },
    ];
    const forward = applyBatch(COPY, edits);
    const reverse = applyBatch(COPY, [...edits].reverse());
    expect(forward.text).toBe("Careful, friendly roof repairs across Leeds. Call today for a free inspection and an fixed-price quote.");
    expect(reverse.text).toBe(forward.text);
    expect(forward).toMatchObject({ applied: 2, failed: [] });
  });

  it("keeps ambiguous and none as distinct failures with distinct hints", () => {
    const out = applyBatch("call us. call us. thanks", [
      { id: "1", search: "call us", replace: "ring us" },
      { id: "2", search: "nothing like this text at all", replace: "x" },
      { id: "3", search: "thanks", replace: "cheers" },
    ]);
    expect(out.text).toBe("call us. call us. cheers");
    expect(out.failed).toEqual([
      { editId: "1", matchType: "ambiguous", confidence: 1, hint: AMBIGUOUS_HINT },
      { editId: "2", matchType: "none", confidence: expect.any(Number), hint: NONE_HINT },
    ]);
  });

  it("refuses an overlapping edit instead of half-applying it", () => {
    const out = applyBatch(COPY, [
      { id: "1", search: "free inspection", replace: "no-cost inspection" },
      { id: "2", search: "inspection and an honest", replace: "survey and a" },
    ]);
    expect(out.applied).toBe(1);
    expect(out.failed).toEqual([{ editId: "2", matchType: "ambiguous", confidence: 1, hint: OVERLAP_HINT }]);
    expect(out.text).toContain("no-cost inspection and an honest quote");
  });
});

describe("JSON pointer + AST anchors", () => {
  const plan = {
    actions: [
      { type: "set_section_text", sectionId: "s1", field: "heading", value: "Roof repairs done right" },
      {
        type: "set_composition",
        sectionId: "s2",
        tree: { version: 1, root: { type: "stack", children: [{ type: "heading", text: "Our services" }, { type: "text", text: "Lorem ipsum dolor sit amet" }] } },
      },
    ],
  };

  it("get/set by pointer is pure assignment on a copy", () => {
    const next = setAtPointer(plan, "/actions/0/value", "New heading");
    expect(next.ok).toBe(true);
    expect(getAtPointer(next.root, "/actions/0/value").value).toBe("New heading");
    expect(getAtPointer(plan, "/actions/0/value").value).toBe("Roof repairs done right");
    expect(setAtPointer(plan, "/actions/9/value", "x").ok).toBe(false);
  });

  it("trusts the exact path while its text still agrees", () => {
    expect(resolveNodeAnchor(plan, { path: "/actions/1/tree/root/children/1/text", expectText: "Lorem ipsum" })).toEqual({
      path: "/actions/1/tree/root/children/1/text",
      matchType: "exact",
      confidence: 1,
    });
  });

  it("re-finds a renumbered node by its text inside the scope", () => {
    expect(
      resolveNodeAnchor(plan, { path: "/actions/1/tree/root/children/0/text", expectText: "Lorem ipsum dolor sit amet", scope: "/actions/1" }),
    ).toEqual({ path: "/actions/1/tree/root/children/1/text", matchType: "exact", confidence: 1 });
  });

  it("never leaves its scope and never guesses below 0.8", () => {
    expect(resolveNodeAnchor(plan, { path: "/actions/1/x", expectText: "Roof repairs done right", scope: "/actions/1" }).matchType).toBe("none");
  });
});

describe("primitives", () => {
  it("normalizeWs collapses runs and folds quotes", () => {
    expect(normalizeWs("  a\u201Cb\u201D   c ").text).toBe('a"b" c');
  });
  it("ratio is 1 for identical token lists and 0 for disjoint", () => {
    expect(ratio(tokenize("a b c"), tokenize("a  b c"))).toBe(1);
    expect(ratio(tokenize("a b"), tokenize("c d"))).toBe(0);
  });
});
