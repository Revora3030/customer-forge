import { describe, expect, it } from "vitest";
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { MOBILE_390_CHECKS, checkMobile390, type Mobile390CheckId } from "@/lib/builder/quality/mobile-390";
import { CRITERIA_WEIGHTS, VIDEO_BAR, HARD_CAP, repairTargets, scoreVideoBar, type VideoScoreInput } from "@/lib/builder/quality/video-score";
import { CRITERION_GROUP, planRegeneration, runVideoGate } from "@/lib/builder/quality/video-gate";
import { ownerBlockMessage } from "@/lib/builder/quality/video-publish-gate";
import { blueprintFor, goodSite } from "@/lib/builder/quality/video-score.fixtures";
import { extractFeatures, type ModelSection } from "@/lib/builder/quality/video-site-model";

const bp = blueprintFor("auto detailing");
const run = (input: VideoScoreInput) => checkMobile390(input.site, extractFeatures(input.site));
const ids = (input: VideoScoreInput) => run(input).findings.map((f) => f.id);
const lead = (i: VideoScoreInput) => i.site.sections.find((s) => s.id === "lead")!;
const hero = (i: VideoScoreInput) => i.site.sections.find((s) => s.id === "hero")!;
const addTo = (s: ModelSection, ...nodes: CompositionNode[]) => { s.composition!.children = [...(s.composition!.children ?? []), ...nodes]; };

describe("390px phone check", () => {
  it("runs eight checks and a site built to the blueprint passes every one", () => {
    expect(MOBILE_390_CHECKS).toHaveLength(8);
    const r = run(goodSite(bp));
    expect(r.findings).toEqual([]);
    expect(r.score).toBe(1);
  });

  it("is one scored criterion in the existing gate, not a second block", () => {
    expect(CRITERIA_WEIGHTS.mobile_390).toBeGreaterThan(0);
    expect(Object.values(CRITERIA_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(CRITERION_GROUP.mobile_390).toBe("layout");
    const r = scoreVideoBar(goodSite(bp));
    expect(r.criteria.find((c) => c.id === "mobile_390")!.met).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  const cases: [Mobile390CheckId, (i: VideoScoreInput) => void, boolean][] = [
    ["debug_overlay", (i) => addTo(hero(i), { type: "text", text: "0% \u00b7 1/2 \u00b7 OPENING SURFACE STUDY" }), true],
    ["owner_pill", (i) => addTo(lead(i), { type: "button", text: "\u2190 Builder", style: { position: "absolute", bottom: 16, right: 16, zIndex: 50 } }), false],
    ["owner_pill", (i) => addTo(lead(i), { type: "stack", children: [{ type: "text", text: "Help" }], style: { position: "sticky", bottom: 8, zIndex: 40 } }), false],
    ["sideways_scroll", (i) => addTo(lead(i), { type: "heading", level: 2, text: "Extraordinarily", style: { size: 96 } }), false],
    ["sideways_scroll", (i) => addTo(lead(i), { type: "stack", style: { position: "absolute", left: 500 }, children: [{ type: "text", text: "x" }] }), false],
    ["empty_gaps", (i) => addTo(lead(i), { type: "spacer", style: { minHeight: 480 } }), false],
    ["hero_contrast", (i) => { hero(i).composition!.style = { ...hero(i).composition!.style, background: "#222222" }; addTo(hero(i), { type: "text", text: "Hello", style: { color: "#2a2a2a", size: 18 } }); }, false],
    ["repeated_contact", (i) => {
      i.site.sections = [...i.site.sections, { id: "foot", pageSlug: "home", kind: "footer", composition: { type: "stack", children: [
        { type: "text", text: "Call (212) 555-0100" }, { type: "button", text: "Call us", href: "tel:+12125550100" }, { type: "text", text: "Or 212-555-0100 again" },
      ] } }];
    }, false],
    ["repeated_contact", (i) => addTo(lead(i), { type: "widget", text: "contact_details" }, { type: "widget", text: "direct_contact" }), false],
    ["covered_text", (i) => addTo(lead(i),
      { type: "stack", style: { position: "sticky", top: 0, zIndex: 20 }, children: [{ type: "text", text: "One" }] },
      { type: "stack", style: { position: "sticky", top: 0, zIndex: 21 }, children: [{ type: "text", text: "Two" }] }), false],
    ["no_content", (i) => { i.site.sections = []; }, true],
    ["no_content", (i) => addTo(lead(i), { type: "text", text: "This website is being updated" }), true],
  ];
  it.each(cases)("catches %s", (id, mutate, hard) => {
    const input = structuredClone(goodSite(bp));
    mutate(input);
    const r = run(input);
    expect(r.findings.map((f) => f.id)).toContain(id);
    expect(r.hardFailure).toBe(hard);
    const finding = r.findings.find((f) => f.id === id)!;
    expect(finding.detail).toMatch(/^on phones/);
    expect(finding.fix.length).toBeGreaterThan(10);
  });

  it("lets a phone override fix what a desktop style would break", () => {
    const input = structuredClone(goodSite(bp));
    addTo(lead(input), { type: "heading", level: 2, text: "Extraordinarily", style: { size: 96 }, responsive: { mobile: { size: 28 } } });
    addTo(lead(input), { type: "spacer", style: { minHeight: 480 }, responsive: { mobile: { minHeight: 24 } } });
    addTo(lead(input), { type: "text", text: "Studio", style: { position: "absolute", right: 16, bottom: 300 } });
    expect(ids(input)).toEqual([]);
  });

  it("ignores a node that is hidden on phones", () => {
    const input = structuredClone(goodSite(bp));
    addTo(lead(input), { type: "button", text: "Back to builder", style: { position: "absolute", bottom: 8, zIndex: 9 }, responsive: { mobile: { hidden: true } } });
    expect(ids(input)).toEqual([]);
  });

  it("a hard failure keeps the site under the bar and names a plain-English reason", () => {
    const input = structuredClone(goodSite(bp));
    addTo(hero(input), { type: "text", text: "0% \u00b7 1/2 \u00b7 OPENING SURFACE STUDY" });
    const r = scoreVideoBar(input);
    expect(r.blockers).toEqual(["debug_overlay"]);
    expect(r.score).toBeLessThanOrEqual(HARD_CAP);
    expect(r.passed).toBe(false);
    expect(r.score).toBeLessThan(VIDEO_BAR);
    const msg = ownerBlockMessage(r, 5, { autoFixTried: true });
    expect(msg).toMatch(/^Your site isn't ready to publish yet: on phones, a loading or debug message/);
    expect(msg).toContain("We tried to fix it automatically.");
    expect(msg).toContain("Rebuild this section");
    expect(ownerBlockMessage(r)).not.toContain("tried to fix");
  });

  it("a soft failure alone takes the criterion under 'met' and names the section to repair, nothing else", () => {
    const input = structuredClone(goodSite(bp));
    addTo(lead(input), { type: "spacer", style: { minHeight: 480 } });
    const r = scoreVideoBar(input);
    const c = r.criteria.find((x) => x.id === "mobile_390")!;
    expect(c.met).toBe(false);
    expect(c.sections).toEqual(["lead"]);
    expect(r.blockers).toEqual([]);
    const plan = planRegeneration(r, 1);
    expect(plan.flatMap((p) => p.targets)).toContain("mobile_390");
    expect(plan.flatMap((p) => p.sectionIds)).toEqual(["lead"]);
  });

  it("reuses the existing retry loop: only the failing section is rebuilt, then Publish unlocks", async () => {
    const broken = structuredClone(goodSite(bp));
    addTo(hero(broken), { type: "text", text: "0% \u00b7 1/2 \u00b7 OPENING SURFACE STUDY" });
    expect(repairTargets(scoreVideoBar(broken)).map((c) => c.id)).toContain("mobile_390");
    const clean = goodSite(bp).site.sections.find((s) => s.id === "hero")!;
    const calls: string[][] = [];
    const r = await runVideoGate({ ...broken, regenerate: async (req) => { calls.push(req.sectionIds); return { sections: [clean] }; } });
    expect(calls).toEqual([["hero"]]);
    expect(r.passed).toBe(true);
    expect(r.retriesUsed).toBe(1);
  });

  it("a site that cannot be repaired stays blocked after the loop, with a plain reason", async () => {
    const broken = structuredClone(goodSite(bp));
    addTo(hero(broken), { type: "text", text: "0% \u00b7 1/2 \u00b7 OPENING SURFACE STUDY" });
    const r = await runVideoGate({ ...broken, regenerate: async () => ({}) });
    expect(r.passed).toBe(false);
    expect(r.retriesUsed).toBe(2);
    expect(r.needsHuman.map((f) => f.criterion)).toContain("mobile_390");
    expect(r.ownerFixes.join(" ")).toMatch(/loading or debug message/);
  });
});
