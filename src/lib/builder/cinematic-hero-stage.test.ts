import { describe, expect, it } from "vitest";
import { parseHeroStage, promotedLayerIds, HERO_STAGE_MAX_FRAMES } from "@/lib/builder/cinematic-hero-stage";
import { HERO_STAGE_GOLDEN, DETAILER_HERO_STAGE, PLUMBER_HERO_STAGE, MED_SPA_HERO_STAGE } from "@/lib/builder/cinematic-hero-stage.fixtures";
import { COMPOSITION_PRIMITIVES, INTERACTIVE_PRIMITIVES, PRIMITIVE_GUIDE, validateComposition } from "@/lib/builder/composition-tree";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are mutated freely to build invalid stages.
type Mutable = any;
const detailer = (): Mutable => clone(DETAILER_HERO_STAGE) as Mutable;
const tree = (heroStage: unknown, extra: Record<string, unknown> = {}) => ({ version: 1, root: { type: "cinematic_hero_stage", heroStage, ...extra } });
const problems = (raw: unknown) => {
  const r = parseHeroStage(raw);
  return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.problem}`);
};

describe("cinematic_hero_stage registration", () => {
  it("is a composition primitive, an interactive one, and documented for the planner", () => {
    expect(COMPOSITION_PRIMITIVES).toContain("cinematic_hero_stage");
    expect(INTERACTIVE_PRIMITIVES.has("cinematic_hero_stage")).toBe(true);
    expect(PRIMITIVE_GUIDE).toContain("cinematic_hero_stage (");
    expect(PRIMITIVE_GUIDE).toMatch(/productPixels real\|none — never generated/);
  });
});

describe("golden fixtures (deepseek round 7 §4.2–4.4)", () => {
  for (const [name, fixture] of Object.entries(HERO_STAGE_GOLDEN)) {
    it(`${name} passes the schema and semantic rules`, () => {
      expect(problems(fixture)).toEqual([]);
    });
    it(`${name} validates as a composition node`, () => {
      const result = validateComposition(tree(fixture));
      expect(result.ok ? [] : result.issues).toEqual([]);
      if (!result.ok) return;
      expect(result.tree.root.heroStage?.id).toBe(fixture.id);
    });
  }
  it("keeps each fixture's animated layers inside its own promotion budget", () => {
    const stages = [DETAILER_HERO_STAGE, PLUMBER_HERO_STAGE, MED_SPA_HERO_STAGE].map((f) => {
      const r = parseHeroStage(f);
      if (!r.ok) throw new Error("fixture invalid");
      return r.stage;
    });
    expect(stages.map((s) => promotedLayerIds(s))).toEqual([["amb-1", "paint", "sweep"], ["wall", "route"], ["amb-1", "room"]]);
  });
});

describe("truth and safety guardrails", () => {
  it("never accepts generated product pixels", () => {
    const s = detailer();
    s.layers[1].productPixels = "generated";
    expect(problems(s).join("\n")).toMatch(/layers\.1\.productPixels/);
    const g = detailer();
    g.layers[1].source = "generated_environment";
    expect(problems(g).join("\n")).toMatch(/generated environment cannot carry real product pixels/);
  });

  it("holds a media stack to 4–18 real frames", () => {
    const few = detailer();
    few.layers[1].frames = few.layers[1].frames.slice(0, 3);
    few.motion.scrubs[1].to = 2;
    expect(problems(few).join("\n")).toMatch(/frames/);
    const many = detailer();
    many.layers[1].frames = Array.from({ length: HERO_STAGE_MAX_FRAMES + 1 }, (_, i) => ({ src: `https://cdn.revora.test/f-${i}.webp`, alt: `Frame ${i}` }));
    expect(problems(many).join("\n")).toMatch(/frames/);
  });

  it("accepts only design tokens as colours", () => {
    for (const color of ["red", "#fff", "url(https://evil.test/x.png)", "var(--a);background:url(x)", "expression(alert(1))"]) {
      const s = detailer();
      s.layers[0].washes[0].color = color;
      expect(problems(s).length, color).toBeGreaterThan(0);
    }
  });

  it("accepts only SVG path data in a rule_path", () => {
    const s = clone(PLUMBER_HERO_STAGE) as Mutable;
    s.layers[1].d = 'M 0 0" onload="alert(1)';
    expect(problems(s).join("\n")).toMatch(/layers\.1\.d/);
  });

  it("keeps the headline to 72 characters and 9 words", () => {
    const s = detailer();
    s.lockup.headline.text = "Your paint under a light you can finally stand today.";
    s.lockup.headline.emphasis = [];
    expect(problems(s).join("\n")).toMatch(/at most 9 words/);
  });

  it("floors a scrim under copy at 0.72 and requires one over media", () => {
    const weak = detailer();
    weak.layers[3].strength = 0.6;
    expect(problems(weak).join("\n")).toMatch(/strength/);
    const none = detailer();
    none.layers.splice(3, 1);
    expect(problems(none).join("\n")).toMatch(/needs a scrim layer/);
  });

  it("rejects scrubs and reveals aimed at layers that do not exist, and conflicting scrubs", () => {
    const s = detailer();
    s.motion.scrubs.push({ target: "ghost", property: "opacity", from: 0, to: 1, range: [0, 1] });
    s.motion.reveals.push({ target: "lockup.nope", effect: "rise" });
    const found = problems(s).join("\n");
    expect(found).toContain('unknown layer "ghost"');
    expect(found).toContain('unknown target "lockup.nope"');
    const dup = detailer();
    dup.motion.scrubs.push({ target: "sweep", property: "translateX", from: 0, to: 1, range: [0, 1] });
    expect(problems(dup).join("\n")).toMatch(/one scrub per layer and property/);
    const frames = detailer();
    frames.motion.scrubs[1].to = 9;
    expect(problems(frames).join("\n")).toMatch(/frameIndex runs between 0 and 5/);
  });

  it("enforces the promoted-layer guardrail", () => {
    const s = clone(PLUMBER_HERO_STAGE) as Mutable;
    s.motion.scrubs.push({ target: "scrim", property: "opacity", from: 1, to: 0.8, range: [0, 1] });
    expect(problems(s).join("\n")).toMatch(/scrim layers do not move/);
    s.motion.scrubs.pop();
    s.guardrails.maxPromotedLayers = 1;
    expect(problems(s).join("\n")).toMatch(/2 animated layers exceed the stage's limit of 1/);
  });

  it("rejects unknown keys (strict) such as raw CSS", () => {
    const s = detailer();
    s.layers[0].css = "position:fixed";
    expect(problems(s).length).toBeGreaterThan(0);
  });

  it("screens visitor-facing copy with the truth screen and refuses unsafe links", () => {
    const screened = validateComposition(tree(DETAILER_HERO_STAGE), { screenText: (t) => (t.includes("nine-year") ? "unsupported warranty claim" : null) });
    expect(screened.ok).toBe(false);
    if (!screened.ok) expect(screened.issues).toContainEqual({ path: "root.heroStage.lockup.sub.text", problem: "unsupported warranty claim" });
    const s = detailer();
    s.lockup.cta.href = "javascript:alert(1)";
    const unsafe = validateComposition(tree(s));
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) expect(unsafe.issues.map((i) => i.path)).toContain("root.heroStage.lockup.cta.href");
  });

  it("first builds take pictures only from the section's own media", () => {
    const urls = validateComposition(tree(DETAILER_HERO_STAGE), { firstBuild: true });
    expect(urls.ok).toBe(false);
    const s = detailer();
    const refs = s.layers[1].frames.map((_: unknown, i: number) => `temp_frame_${i}`);
    s.layers[1].frames = s.layers[1].frames.map((f: Mutable, i: number) => ({ mediaRef: refs[i], alt: f.alt }));
    const ok = validateComposition(tree(s), { firstBuild: true, allowedMediaRefs: new Set(refs), requiredMediaRefs: new Set(refs) });
    expect(ok.ok ? [] : ok.issues).toEqual([]);
    const foreign = validateComposition(tree(s), { firstBuild: true, allowedMediaRefs: new Set(refs.slice(1)) });
    expect(foreign.ok).toBe(false);
  });

  it("allows one hero stage per tree, no children, and heroStage only on its own primitive", () => {
    const two = validateComposition({ version: 1, root: { type: "stack", children: [tree(DETAILER_HERO_STAGE).root, tree(MED_SPA_HERO_STAGE).root] } });
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.issues.map((i) => i.problem)).toContain("a page has at most one cinematic_hero_stage");
    const kids = validateComposition(tree(DETAILER_HERO_STAGE, { children: [{ type: "text", text: "Hi" }] }));
    expect(kids.ok).toBe(false);
    const wrong = validateComposition({ version: 1, root: { type: "stack", heroStage: DETAILER_HERO_STAGE } });
    expect(wrong.ok).toBe(false);
    const missing = validateComposition({ version: 1, root: { type: "cinematic_hero_stage" } });
    expect(missing.ok).toBe(false);
  });

  it("leaves existing trees untouched", () => {
    const plain = { version: 1, root: { type: "stack", children: [{ type: "heading", level: 1, text: "Hello" }] } };
    const result = validateComposition(plain);
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.tree)).not.toContain("heroStage");
  });
});
