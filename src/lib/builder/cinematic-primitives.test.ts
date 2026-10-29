import { describe, expect, it } from "vitest";
import { COMPOSITION_PRIMITIVES, PRIMITIVE_GUIDE, readComposition, validateComposition } from "./composition-tree";
import {
  MIN_SPIN_FRAMES,
  anchorsCollide,
  frameForDrag,
  frameForKey,
  offerActionProblem,
  sceneScrim,
  worstSceneContrast,
} from "./cinematic-primitives";
import { contrastRatio } from "@/lib/readable-color";

const tree = (root: unknown) => ({ version: 1, root });
const ref = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const pic = (n: number, alt = `Angle ${n}`) => ({ type: "media", mediaRef: ref(n), alt });
const button = (href = "/book", text = "Reserve") => ({ type: "button", text, href });
const offer = (extra: Record<string, unknown> = {}) => ({ type: "offer_card", text: "Evening detail", items: ["Two hours", "Indoor bay"], children: [button()], ...extra });
const scene = (extra: Record<string, unknown> = {}, children: unknown[] = []) => ({
  type: "scene",
  anchor: "bottom-left",
  children: [pic(1, "Car under studio light"), { type: "heading", level: 1, text: "Sunset, in red." }, ...children],
  ...extra,
});
const problems = (result: ReturnType<typeof validateComposition>) => (result.ok ? [] : result.issues.map((issue) => issue.problem));

describe("cinematic primitives are declared and documented for the AI", () => {
  it("lists every new primitive and describes it in the shared guide", () => {
    for (const name of ["scene", "scroll_chapters", "scrub_sequence", "offer_card", "spin_viewer", "collection_row"]) {
      expect(COMPOSITION_PRIMITIVES).toContain(name);
      expect(PRIMITIVE_GUIDE).toContain(name);
    }
    expect(PRIMITIVE_GUIDE).toMatch(/never type a price/);
    expect(PRIMITIVE_GUIDE).toMatch(/fewer than 8 angles it shows one still/);
  });
});

describe("scene", () => {
  it("accepts a backdrop with an anchored copy slot, scrim and focal point", () => {
    const result = validateComposition(tree(scene({ scrim: { color: "#0b0b0f", opacity: 40 }, focal: "50% 35%" }, [offer({ anchor: "top-right" })])));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tree.root.anchor).toBe("bottom-left");
      expect(result.tree.root.scrim).toEqual({ color: "#0b0b0f", opacity: 40 });
      expect(result.tree.root.focal).toBe("50% 35%");
    }
  });

  it("needs its media backdrop first, with alt text", () => {
    expect(problems(validateComposition(tree({ type: "scene", children: [{ type: "heading", text: "Hi" }] })))).toContain(
      "scene needs its media backdrop (a picture or video with alt text) as the first child",
    );
    expect(problems(validateComposition(tree({ type: "scene", children: [{ type: "media", mediaRef: ref(1) }] })))).toContain("images need alt text");
  });

  it("refuses an offer card that would cover the copy slot, and bad scrim values", () => {
    expect(problems(validateComposition(tree(scene({}, [offer({ anchor: "bottom-left" })])))).join(" ")).toMatch(/would cover the scene's copy/);
    expect(problems(validateComposition(tree(scene({ scrim: { color: "black", opacity: 140 } }))))).toEqual(
      expect.arrayContaining(["must be a #RRGGBB colour", "scrim opacity must be 0-95"]),
    );
    expect(problems(validateComposition(tree(scene({ anchor: "middle" }))))[0]).toMatch(/anchor must be one of/);
    expect(problems(validateComposition(tree({ type: "stack", anchor: "center", children: [{ type: "text", text: "x" }] })))).toContain("anchor is only used on scene and offer_card");
  });

  it("knows which anchors collide", () => {
    expect(anchorsCollide("bottom-left", "bottom-right")).toBe(false);
    expect(anchorsCollide("bottom-left", "top-right")).toBe(false);
    expect(anchorsCollide("bottom-left", "top-left")).toBe(false);
    expect(anchorsCollide("bottom-center", "bottom-right")).toBe(true);
    expect(anchorsCollide("center", "center-right")).toBe(true);
    expect(anchorsCollide("center-left", "center-left")).toBe(true);
  });
});

describe("computed scrim guarantees readable text over any photo", () => {
  it("raises the opacity until light ink passes AA over both a white and a black pixel", () => {
    const scrim = sceneScrim({ ink: "#ffffff", scrim: "#000000", opacity: 10 });
    expect(scrim.ink).toBe("#ffffff");
    expect(scrim.opacity).toBeGreaterThan(0.1);
    expect(scrim.contrast).toBeGreaterThanOrEqual(4.5);
    for (const surface of scrim.surfaces) expect(contrastRatio("#ffffff", surface)!).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the AI's opacity as a floor", () => {
    expect(sceneScrim({ ink: "#ffffff", scrim: "#000000", opacity: 80 }).opacity).toBeCloseTo(0.8, 5);
  });

  it("flips ink that can never be read on its scrim colour and reports the authored pair as impossible", () => {
    const scrim = sceneScrim({ ink: "#ffffff", scrim: "#ffffff", opacity: 30 });
    expect(scrim.ink).toBe("#101114");
    expect(scrim.required).toBeNull();
    expect(worstSceneContrast(scrim.ink, scrim.scrim, scrim.opacity)).toBeGreaterThanOrEqual(4.5);
  });

  it("defaults to light ink over a deep scrim when nothing was authored", () => {
    const scrim = sceneScrim({});
    expect(scrim.ink).toBe("#ffffff");
    expect(scrim.scrim).toBe("#000000");
    expect(scrim.contrast).toBeGreaterThanOrEqual(4.5);
  });
});

describe("scroll_chapters", () => {
  it("needs 2-8 scene children", () => {
    expect(validateComposition(tree({ type: "scroll_chapters", children: [scene(), scene({ anchor: "center" })] })).ok).toBe(true);
    expect(problems(validateComposition(tree({ type: "scroll_chapters", children: [scene()] })))).toContain("scroll_chapters needs 2-8 scene children");
    expect(problems(validateComposition(tree({ type: "scroll_chapters", children: [scene(), { type: "text", text: "x" }] })))).toContain("scroll_chapters needs 2-8 scene children");
  });
});

describe("offer_card truth and action safety", () => {
  it("accepts a real service and a booking path", () => {
    const result = validateComposition(tree({ type: "stack", children: [offer({ service: "Full Detail" })] }), { serviceNames: ["Full Detail"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tree.root.children?.[0]?.service).toBe("Full Detail");
  });

  it("refuses a service that is not one of the business's real services", () => {
    expect(problems(validateComposition(tree({ type: "stack", children: [offer({ service: "Platinum Package" })] }), { serviceNames: ["Full Detail"] })).join(" ")).toMatch(/must be one of the business's real services/);
  });

  it("never lets a price be typed into the card", () => {
    expect(problems(validateComposition(tree({ type: "stack", children: [offer({ price: 99 })] }))).join(" ")).toMatch(/prices come only from the named real service/);
    expect(problems(validateComposition(tree({ type: "stack", children: [offer({ items: ["From $1,190"] })] }))).join(" ")).toMatch(/remove the typed amount/);
    expect(problems(validateComposition(tree({ type: "stack", children: [offer({ text: "Detail 150 dollars" })] }))).join(" ")).toMatch(/remove the typed amount/);
  });

  it("refuses external and checkout destinations", () => {
    expect(offerActionProblem("https://pay.example.test/checkout")).toMatch(/never an external address or checkout/);
    expect(offerActionProblem("/checkout")).toMatch(/checkout, cart or payment/);
    expect(offerActionProblem("/cart?item=1")).toMatch(/checkout, cart or payment/);
    expect(offerActionProblem("/book")).toBeNull();
    expect(offerActionProblem("#booking")).toBeNull();
    expect(offerActionProblem("tel:+15551234567")).toBeNull();
    expect(problems(validateComposition(tree({ type: "stack", children: [offer({ children: [button("https://shop.example.test/buy")] })] }))).join(" ")).toMatch(/never an external address/);
  });

  it("needs exactly one button and at most one picture", () => {
    expect(problems(validateComposition(tree({ type: "stack", children: [offer({ children: [] })] }))).join(" ")).toMatch(/exactly one button/);
    expect(problems(validateComposition(tree({ type: "stack", children: [offer({ children: [pic(1), pic(2), button()] })] }))).join(" ")).toMatch(/at most one picture/);
  });

  it("caps specs at three: a repair note while generating, trimmed (not hidden) when rendering a saved tree", () => {
    const four = tree({ type: "stack", children: [offer({ items: ["a", "b", "c", "d"] })] });
    expect(problems(validateComposition(four))).toContain("offer_card shows at most 3 specs");
    const saved = readComposition({ composition: four });
    expect(saved?.root.children?.[0]?.items).toEqual(["a", "b", "c"]);
  });
});

describe("spin_viewer", () => {
  it("accepts ordered angle pictures and an initial frame", () => {
    const result = validateComposition(tree({ type: "spin_viewer", text: "Spin the coupe", initialFrame: 3, children: Array.from({ length: MIN_SPIN_FRAMES }, (_, i) => pic(i + 1)) }));
    expect(result.ok).toBe(true);
  });

  it("only takes media children", () => {
    expect(problems(validateComposition(tree({ type: "spin_viewer", children: [{ type: "text", text: "x" }] }))).join(" ")).toMatch(/ordered angle pictures/);
  });

  it("turns like a turntable with arrows, Home/End and drag", () => {
    expect(frameForKey("ArrowRight", 7, 8)).toBe(0);
    expect(frameForKey("ArrowLeft", 0, 8)).toBe(7);
    expect(frameForKey("Home", 5, 8)).toBe(0);
    expect(frameForKey("End", 0, 8)).toBe(7);
    expect(frameForKey("PageUp", 0, 24)).toBe(3);
    expect(frameForKey("a", 0, 8)).toBeNull();
    expect(frameForDrag(0, 200, 400, 24)).toBe(12);
    expect(frameForDrag(0, -50, 400, 24)).toBe(21);
    expect(frameForDrag(2, 10, 0, 24)).toBe(2);
  });
});

describe("scrub_sequence", () => {
  const sequence = (frames: number, extra: unknown[] = []) => ({
    type: "scrub_sequence",
    text: "Scroll",
    children: [...Array.from({ length: frames }, (_, i) => pic(i + 1, `Frame ${i + 1}`)), ...extra],
  });

  it("accepts 2-6 frames plus overlay copy", () => {
    expect(validateComposition(tree(sequence(3, [{ type: "heading", level: 1, text: "Bring it dirty" }, button()]))).ok).toBe(true);
    expect(problems(validateComposition(tree(sequence(1))))).toContain("scrub_sequence needs 2-6 media frames of one subject, in order");
    expect(problems(validateComposition(tree(sequence(7))))).toContain("scrub_sequence needs 2-6 media frames of one subject, in order");
  });

  it("refuses a frame without alt text and a nested scene", () => {
    expect(problems(validateComposition(tree({ type: "scrub_sequence", children: [pic(1, ""), pic(2, "Clean panel")] }))).join(" ")).toMatch(/alt text/);
    expect(problems(validateComposition(tree(sequence(2, [scene()])))).join(" ")).toMatch(/not another scene/);
  });
});

describe("collection_row", () => {
  it("holds 1-12 offer cards only", () => {
    expect(validateComposition(tree({ type: "collection_row", text: "The collection", children: [offer({ children: [pic(1), button()] }), offer()] })).ok).toBe(true);
    expect(problems(validateComposition(tree({ type: "collection_row", children: [{ type: "card", children: [{ type: "text", text: "x" }] }] })))).toContain("collection_row needs 1-12 offer_card children");
  });
});
