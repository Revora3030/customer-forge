import { describe, expect, it } from "vitest";
import { readComposition } from "./composition-tree";
import { dropMissingPictures, firstBuildCoverageProblems, missingPictureProblems, savedPictureRefs } from "./first-build-saved-coverage";

const pages = [{ id: "home", slug: "home" }, { id: "services", slug: "services" }] as const;
const settings = { composition: { version: 1, root: { type: "stack", children: [{ type: "heading", text: "Real business", level: 1 }] } } };
const sections = [
  { id: "home-opening", page_id: "home", kind: "composition", settings },
  { id: "services-opening", page_id: "services", kind: "composition", settings },
] as const;
const expected = { pages: 2, sections: 2 };
describe("first customer website saved coverage", () => {
  it("accepts authored sections on every saved page", () => {
    expect(firstBuildCoverageProblems(pages, sections, expected)).toEqual([]);
  });
  const inventory = {
    pages: [...pages],
    sections: sections.map(section => ({ id: section.id, page_id: section.page_id, role: "hero" })),
  };
  const authored = [
    { ...sections[0], settings: { ...settings, role: "hero" } },
    { ...sections[1], settings: { ...settings, role: "hero" } },
  ] as const;
  const exact = { ...expected, inventory };
  it("accepts the exact saved inventory in any readback order", () => {
    expect(firstBuildCoverageProblems([...pages].reverse(), [...authored].reverse(), exact)).toEqual([]);
  });
  it("rejects substituted pages with the same total count", () => {
    expect(firstBuildCoverageProblems([pages[0], { ...pages[1], slug: "wrong-page" }], authored, exact)).toContain("Saved pages do not match the accepted build inventory");
  });
  it("rejects substituted section identities with the same total count", () => {
    expect(firstBuildCoverageProblems(pages, [authored[0], { ...authored[1], id: "wrong-section" }], exact)).toContain("Saved sections do not match the accepted build inventory");
  });
  it("rejects a section moved to another page", () => {
    expect(firstBuildCoverageProblems(pages, [authored[0], { ...authored[1], page_id: "home" }], exact)).toContain("Saved sections do not match the accepted build inventory");
  });
  it("rejects a lost conversion role even when the composition renders", () => {
    expect(firstBuildCoverageProblems(pages, [authored[0], { ...authored[1], settings }], exact)).toContain("Saved sections do not match the accepted build inventory");
  });
  it("rejects duplicate page and section identities", () => {
    const problems = firstBuildCoverageProblems([pages[0], pages[0]], [authored[0], authored[0]], exact);
    expect(problems).toContain("Saved page inventory contains duplicate identities");
    expect(problems).toContain("Saved section inventory contains duplicate identities");
    expect(problems).toContain("Saved sections do not match the accepted build inventory");
  });
  it("does not let duplicate sections satisfy required multiplicity", () => {
    const withRepeatedRoles = { ...exact, inventory: { ...inventory, sections: [...inventory.sections, { id: "services-closing", page_id: "services", role: "hero" }] } };
    expect(firstBuildCoverageProblems(pages, [...authored, authored[1]], withRepeatedRoles)).toContain("Saved sections do not match the accepted build inventory");
  });
  it("rejects a homepage-only saved website", () => {
    expect(firstBuildCoverageProblems(pages.slice(0, 1), sections.slice(0, 1), expected)).toContain("Saved page inventory is incomplete");
  });
  it("rejects an empty supporting page", () => {
    expect(firstBuildCoverageProblems(pages, sections.slice(0, 1), expected)).toContain("Page services has no sections");
  });
  it("rejects a plain supporting section even when the homepage is designed", () => {
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], kind: "services", settings: {} }], expected)).toContain("Section services-opening has no renderable AI design");
  });
  it("rejects saved composition data that renders nothing", () => {
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], settings: { composition: { version: 1, root: { type: "unknown" } } } }], expected)).toContain("Section services-opening has no renderable AI design");
  });
  it("keeps only the two existing noncomposition mechanics exempt", () => {
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], kind: "embed", settings: {} }], expected)).toEqual([]);
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], kind: "contact", settings: {} }], expected)).toContain("Section services-opening has no renderable AI design");
  });
  it("rejects a design that shows a picture never saved to the website", () => {
    const pic = { composition: { version: 1, root: { type: "image", mediaRef: "temp_hero", alt: "x" } } };
    const withPic = [{ id: "hero", page_id: "home", kind: "composition", settings: pic }];
    expect(missingPictureProblems(withPic, new Set())).toEqual(["Section hero shows a picture that was never saved"]);
    expect(missingPictureProblems(withPic, new Set(["temp_hero"]))).toEqual([]);
  });
});

describe("dropping a picture that was never saved", () => {
  const tree = (root: unknown) => ({ composition: { version: 1, root } });
  const media = (ref: string) => ({ type: "media", mediaRef: ref, alt: "A parked car" });
  const heading = { type: "heading", level: 1, text: "Real business" };
  const rootOf = (settings: Record<string, unknown> | null) => (settings as { composition: { root: Record<string, unknown> } }).composition.root;

  it("returns null when nothing references a missing picture", () => {
    expect(dropMissingPictures(tree({ type: "stack", children: [heading, media("kept")] }), new Set(["gone"]))).toBeNull();
  });

  it("removes the missing media node and keeps its words and the other pictures", () => {
    const out = dropMissingPictures(tree({ type: "stack", children: [heading, media("gone"), media("kept")] }), new Set(["gone"]));
    expect(rootOf(out)["children"]).toEqual([heading, media("kept")]);
  });

  it("turns a scene that lost its backdrop into a plain stack with the same copy", () => {
    const out = dropMissingPictures(tree({ type: "scene", children: [media("gone"), heading] }), new Set(["gone"]));
    expect(rootOf(out)).toMatchObject({ type: "stack", children: [heading] });
  });

  it("drops a before/after pair that lost either side, since half a pair shows nothing", () => {
    const pair = { type: "before_after_slider", beforeImage: { mediaRef: "kept", alt: "Before" }, afterImage: { mediaRef: "gone", alt: "After" } };
    const out = dropMissingPictures(tree({ type: "stack", children: [heading, pair] }), new Set(["gone"]));
    expect(rootOf(out)["children"]).toEqual([heading]);
  });

  it("removes a picture reference from a node that is not a media node, keeping the node", () => {
    // The shape the old repair could not strip: it left the reference behind and
    // the whole build failed with "shows a picture that was never saved".
    const card = { type: "offer_card", text: "Full detail", mediaRef: "gone", children: [heading] };
    const out = dropMissingPictures(tree({ type: "stack", children: [card] }), new Set(["gone"]));
    expect(rootOf(out)["children"]).toEqual([{ type: "offer_card", text: "Full detail", children: [heading] }]);
    const nested = { type: "stack", children: [{ type: "collection_row", items: [{ title: "Detail", mediaRef: "gone" }, { title: "Wash", mediaRef: "kept" }] }] };
    const cleaned = dropMissingPictures(tree(nested), new Set(["gone"]));
    expect(JSON.stringify(cleaned)).not.toContain("gone");
    expect(JSON.stringify(cleaned)).toContain("kept");
  });

  it("leaves no reference to a missing picture behind, however it was written", () => {
    const root = { type: "stack", children: [media("gone"), { type: "gallery", children: [media("gone")] }, { type: "card", mediaRef: "gone", children: [] }] };
    const out = dropMissingPictures(tree(root), new Set(["gone"]));
    expect(missingPictureProblems([{ id: "s", page_id: "p", kind: "composition", settings: out }], new Set())).toEqual([]);
  });
});

/**
 * The build only accepts a repair the renderer will still show (readComposition),
 * and skips it otherwise. A repair that leaves a block the validator refuses
 * therefore fails the whole build at the finish line, which is how the
 * 10-22 build ended. Every shape below is a valid section before the picture is
 * lost, and must still be one after.
 */
describe("a section repaired after a picture was lost is still one the renderer shows", () => {
  const tree = (root: unknown) => ({ composition: { version: 1, root } });
  const picture = (ref: string) => ({ type: "media", mediaRef: ref, alt: "A freshly detailed car" });
  const heading = (text: string) => ({ type: "heading", level: 2, text });
  const rootOf = (settings: Record<string, unknown> | null) => (settings as { composition: { root: Record<string, unknown> } }).composition.root;
  const childrenOf = (settings: Record<string, unknown> | null) => rootOf(settings)["children"] as Record<string, unknown>[];
  const shown = (settings: unknown) => readComposition(settings) !== null;
  /** Repairs `settings` for the lost pictures; proves the result still renders and holds no reference to them. */
  const repaired = (settings: Record<string, unknown>, ...lost: string[]) => {
    expect(shown(settings), "the fixture itself must be a valid section").toBe(true);
    const out = dropMissingPictures(settings, new Set(lost));
    expect(out).not.toBeNull();
    expect(shown(out), "the repaired section must still render").toBe(true);
    for (const ref of lost) expect(JSON.stringify(out)).not.toContain(ref);
    return out;
  };

  const scene = (ref: string, copy: string) => ({
    type: "scene",
    anchor: "bottom-left",
    focal: "50% 40%",
    scrim: { color: "#000000", opacity: 40 },
    children: [picture(ref), heading(copy)],
  });
  const slider = (label: string, afterRef: string) => ({
    type: "before_after_slider",
    text: label,
    beforeImage: { mediaRef: "temp_kept_before", alt: "Before", label: "Before" },
    afterImage: { mediaRef: afterRef, alt: "After", label: "After" },
  });
  const phase = (copy: string) => ({ type: "stack", children: [heading(copy)] });
  const layers = (...refs: string[]) => ({ type: "parallax_layers", children: refs.map(picture) });
  const withHeading = (copy: string, node: unknown) => tree({ type: "stack", children: [heading(copy), node] });

  it("turns a scene that lost its backdrop into a plain stack and drops the settings only a scene has", () => {
    const out = repaired(tree({ ...scene("temp_gone_backdrop", "Mobile detailing that comes to you"), scrub: true }), "temp_gone_backdrop");
    expect(rootOf(out)).toMatchObject({ type: "stack", children: [heading("Mobile detailing that comes to you")] });
    for (const key of ["anchor", "focal", "scrim", "scrub"]) expect(rootOf(out)).not.toHaveProperty(key);
  });

  it("turns scroll chapters into a plain stack when a chapter lost its backdrop, keeping every chapter's words", () => {
    const chapters = { type: "scroll_chapters", children: [scene("temp_kept_one", "Step one"), scene("temp_gone_two", "Step two")] };
    const [stack] = childrenOf(repaired(tree({ type: "stack", children: [chapters] }), "temp_gone_two"));
    expect(stack).toMatchObject({ type: "stack" });
    const [first, second] = stack!["children"] as Record<string, unknown>[];
    expect(first).toEqual(scene("temp_kept_one", "Step one"));
    expect(second).toMatchObject({ type: "stack", children: [heading("Step two")] });
  });

  it("turns a sticky story into a plain stack of its phases when its pinned picture is gone", () => {
    const story = { type: "sticky_split_story", children: [picture("temp_gone_pinned"), phase("Inspect"), phase("Prepare"), phase("Protect")] };
    const [stack] = childrenOf(repaired(tree({ type: "stack", children: [story] }), "temp_gone_pinned"));
    expect(stack).toMatchObject({ type: "stack", children: [phase("Inspect"), phase("Prepare"), phase("Protect")] });
  });

  it("removes a loupe whose one photo is gone", () => {
    const lens = { type: "lens_magnifier", text: "Inspect the finish", children: [picture("temp_gone_photo")] };
    expect(childrenOf(repaired(withHeading("Our finish", lens), "temp_gone_photo"))).toEqual([heading("Our finish")]);
  });

  it("keeps parallax layers while two remain behind their back layer, and removes the block otherwise", () => {
    // A front layer is lost: the other two still make the effect.
    expect(childrenOf(repaired(withHeading("Hero", layers("temp_back", "temp_mid", "temp_gone_front")), "temp_gone_front"))).toEqual([heading("Hero"), layers("temp_back", "temp_mid")]);
    // The back layer is lost: the layers in front would drift over nothing.
    expect(childrenOf(repaired(withHeading("Hero", layers("temp_gone_back", "temp_mid", "temp_front")), "temp_gone_back"))).toEqual([heading("Hero")]);
    // One layer left is not a parallax any more.
    expect(childrenOf(repaired(withHeading("Hero", layers("temp_back", "temp_gone_mid")), "temp_gone_mid"))).toEqual([heading("Hero")]);
  });

  it("keeps what is left of a gallery, a spin viewer or a row of logos, and removes it when nothing is left", () => {
    const gallery = (...refs: string[]) => ({ type: "gallery", children: refs.map(picture) });
    const spin = (...refs: string[]) => ({ type: "spin_viewer", text: "Spin the car", children: refs.map(picture) });
    const logos = (...refs: string[]) => ({ type: "marquee", children: refs.map(picture) });
    for (const make of [gallery, spin, logos]) {
      expect(childrenOf(repaired(withHeading("Proof", make("temp_gone_a", "temp_kept_b")), "temp_gone_a"))).toEqual([heading("Proof"), make("temp_kept_b")]);
      expect(childrenOf(repaired(withHeading("Proof", make("temp_gone_a")), "temp_gone_a"))).toEqual([heading("Proof")]);
    }
  });

  it("removes a tab group or a toggle that lost a panel it cannot do without, and keeps tabs that still have one", () => {
    const tabs = (...panels: unknown[]) => ({ type: "tabs", children: panels });
    const toggle = (...panels: unknown[]) => ({ type: "toggle", children: panels });
    expect(childrenOf(repaired(withHeading("See the work", tabs(slider("Sedan", "temp_kept_after"), slider("Truck", "temp_gone_after"))), "temp_gone_after"))).toEqual([
      heading("See the work"),
      tabs(slider("Sedan", "temp_kept_after")),
    ]);
    expect(childrenOf(repaired(withHeading("See the work", tabs(slider("Sedan", "temp_gone_after"))), "temp_gone_after"))).toEqual([heading("See the work")]);
    expect(childrenOf(repaired(withHeading("See the work", toggle(slider("Sedan", "temp_kept_after"), slider("Truck", "temp_gone_after"))), "temp_gone_after"))).toEqual([
      heading("See the work"),
    ]);
  });

  it("leaves a block that lost nothing exactly as it was", () => {
    const healthy = scene("temp_kept_backdrop", "Healthy scene");
    const out = repaired(tree({ type: "stack", children: [healthy, scene("temp_gone_backdrop", "Broken scene")] }), "temp_gone_backdrop");
    expect(childrenOf(out)[0]).toEqual(healthy);
  });

  // Every shape that carries a picture, with each of its pictures lost one at a
  // time and then all together.
  const offer = { type: "offer_card", text: "Full detail", children: [picture("temp_p_offer"), { type: "button", text: "Book now", href: "/booking" }] };
  const shapes: [string, Record<string, unknown>][] = [
    ["a scene", scene("temp_p_scene", "Scene")],
    ["scroll chapters", { type: "scroll_chapters", children: [scene("temp_p_ch1", "One"), scene("temp_p_ch2", "Two"), scene("temp_p_ch3", "Three")] }],
    ["a sticky story", { type: "sticky_split_story", children: [picture("temp_p_pin"), phase("A"), phase("B"), phase("C")] }],
    ["a loupe", { type: "lens_magnifier", text: "Inspect", children: [picture("temp_p_lens")] }],
    ["parallax layers", layers("temp_p_l1", "temp_p_l2", "temp_p_l3")],
    ["a gallery", { type: "gallery", children: [picture("temp_p_g1"), picture("temp_p_g2")] }],
    ["a spin viewer", { type: "spin_viewer", text: "Spin", children: [picture("temp_p_s1"), picture("temp_p_s2"), picture("temp_p_s3")] }],
    ["a compare", { type: "compare", children: [picture("temp_p_c1"), picture("temp_p_c2")] }],
    ["a before/after slider", slider("Clean it", "temp_p_after")],
    ["a scrub sequence", { type: "scrub_sequence", text: "Scroll", children: [picture("temp_p_q1"), picture("temp_p_q2"), heading("Bring it dirty")] }],
    ["a row of logos", { type: "marquee", children: [picture("temp_p_m1"), picture("temp_p_m2")] }],
    ["tabs of sliders", { type: "tabs", children: [slider("Sedan", "temp_p_t1"), slider("Truck", "temp_p_t2")] }],
    ["a toggle of sliders", { type: "toggle", children: [slider("Sedan", "temp_p_x1"), slider("Truck", "temp_p_x2")] }],
    ["an offer card with a picture", offer],
  ];
  it.each(shapes)("%s still renders after any of its pictures is lost", (_name, shape) => {
    const settings = withHeading("Real business", shape);
    const refs = [...savedPictureRefs([{ id: "s", page_id: "p", kind: "composition", settings }]).keys()].filter((ref) => ref.startsWith("temp_p_"));
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) repaired(settings, ref);
    repaired(settings, ...refs);
  });
});
