import { describe, expect, it } from "vitest";
import {
  CRITERIA_WEIGHTS, HARD_CAP, VIDEO_BAR, ownerFixList, repairTargets, scoreVideoBar,
  type CriterionId, type VideoScoreInput,
} from "@/lib/builder/quality/video-score";
import { siteModelFromSnapshot } from "@/lib/builder/quality/video-site-model";
import { FIXTURE_TRADES, badSite, blueprintFor, goodSite } from "@/lib/builder/quality/video-score.fixtures";
import type { CompositionNode } from "@/lib/builder/composition-tree";
import type { FullSnapshot } from "@/lib/site-restore";

const byId = (r: ReturnType<typeof scoreVideoBar>, id: CriterionId) => r.criteria.find((c) => c.id === id)!;

describe("video bar scorer", () => {
  it("weights add up to exactly 100 and the bar is 85", () => {
    expect(Object.values(CRITERIA_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(VIDEO_BAR).toBe(85);
  });

  describe.each(FIXTURE_TRADES)("%s blueprint", (trade) => {
    const bp = blueprintFor(trade);

    it("a site built to the blueprint passes the bar with every criterion met", () => {
      const r = scoreVideoBar(goodSite(bp));
      const unmet = r.criteria.filter((c) => !c.met).map((c) => `${c.id}: ${c.detail}`);
      expect(unmet).toEqual([]);
      expect(r.score).toBeGreaterThanOrEqual(VIDEO_BAR);
      expect(r.passed).toBe(true);
      expect(r.capped).toBeNull();
      expect(r.criteria).toHaveLength(13);
      expect(ownerFixList(r)).toEqual([]);
    });

    it("a template-looking site with invented facts fails and says why", () => {
      const r = scoreVideoBar(badSite(bp));
      expect(r.passed).toBe(false);
      expect(r.score).toBeLessThanOrEqual(HARD_CAP);
      expect(r.capped).toBe("invented_facts");
      for (const id of ["hero_cinematic", "scroll_story", "signature_tool", "lead_capture", "type_rules", "palette_rules", "images", "anti_ai_lint", "truth_facts"] as CriterionId[]) {
        expect(byId(r, id).met, id).toBe(false);
      }
      expect(byId(r, "truth_facts").detail).toMatch(/rating|review|phone/i);
      expect(ownerFixList(r).length).toBeGreaterThan(0);
    });
  });

  it("is deterministic", () => {
    const input = goodSite(blueprintFor("roofing"));
    expect(scoreVideoBar(input)).toEqual(scoreVideoBar(input));
  });

  it("the owner's own phone and price are not flagged", () => {
    const input = goodSite(blueprintFor("roofing"));
    input.site.sections[0]!.heading = "Call (646) 201-4477 from $120";
    const flagged = scoreVideoBar(input);
    expect(byId(flagged, "truth_facts").score).toBe(0);
    const own: VideoScoreInput = { ...input, intake: { phone: "(646) 201-4477", services: [{ name: "Service", price: 120 }] } };
    expect(byId(scoreVideoBar(own), "truth_facts").score).toBe(1);
  });

  describe("each criterion moves the score when its part is removed", () => {
    const bp = blueprintFor("golf course");
    const cases: [CriterionId, (i: VideoScoreInput) => void][] = [
      ["signature_tool", (i) => { i.site.sections.find((s) => s.id === "tool")!.composition = { type: "text", text: "[Add your details]" }; }],
      ["scroll_story", (i) => { i.site.sections.find((s) => s.id === "story")!.composition = { type: "text", text: "[Add your details]" }; }],
      ["cta_bar", (i) => { i.site.sections.find((s) => s.id === "lead")!.composition!.children = [{ type: "widget", text: "enquiry_form" }]; }],
      ["hero_cinematic", (i) => { i.site.sections[0]!.composition = { type: "stack", children: [{ type: "text", text: "[Add your business name]" }] }; }],
      ["anti_ai_lint", (i) => { i.site.sections[3]!.heading = "Elevate everything \u2014 seamlessly"; i.site.sections[3]!.composition!.children!.push({ type: "text", text: "Elevate everything \u2014 seamlessly" }); }],
    ];
    it.each(cases)("%s", (id, mutate) => {
      const good = goodSite(bp);
      const base = scoreVideoBar(good);
      const broken = structuredClone(good);
      mutate(broken);
      const after = scoreVideoBar(broken);
      expect(byId(after, id).score).toBeLessThan(byId(base, id).score);
      expect(after.score).toBeLessThan(base.score);
    });
  });

  it("no form anywhere caps the score under the bar", () => {
    const input = goodSite(blueprintFor("dentist"));
    for (const s of input.site.sections) {
      const strip = (n: CompositionNode) => {
        n.children = (n.children ?? []).filter((c) => c.type !== "widget" && c.type !== "mobile_sticky_bar");
        n.children.forEach(strip);
      };
      if (s.composition) strip(s.composition);
    }
    const r = scoreVideoBar(input);
    expect(byId(r, "lead_capture").score).toBe(0);
    expect(r.capped).toBe("no_lead_capture");
    expect(r.passed).toBe(false);
  });

  it("repair targets name only the parts that failed, and always include a truth failure", () => {
    const bad = scoreVideoBar(badSite(blueprintFor("roofing")));
    const targets = repairTargets(bad).map((c) => c.id);
    expect(targets).toContain("truth_facts");
    expect(targets).toContain("lead_capture");
    const good = scoreVideoBar(goodSite(blueprintFor("roofing")));
    expect(repairTargets(good)).toEqual([]);
  });

  it("reads a stored website snapshot: hidden sections are ignored and the home page comes first", () => {
    const home = goodSite(blueprintFor("roofing")).site.sections;
    const snapshot: FullSnapshot = {
      format: 1, takenAt: "2026-10-31T00:00:00Z",
      pages: [
        { id: "p2", slug: "contact", title: "Contact", kind: "page", seo_title: null, seo_description: null, seo_canonical: null, og_title: null, og_description: null, og_image_url: null, noindex: false, sort_order: 2, is_visible: true, sections: [] },
        {
          id: "p1", slug: "home", title: "Home", kind: "home", seo_title: null, seo_description: null, seo_canonical: null, og_title: null, og_description: null, og_image_url: null, noindex: false, sort_order: 1, is_visible: true,
          sections: [
            ...home.map((s, i) => ({ id: s.id, page_id: "p1", kind: s.kind, variant: "default", heading: s.heading ?? null, subheading: null, body: null, settings: { composition: { version: 1, root: JSON.parse(JSON.stringify(s.composition ?? null)) } }, sort_order: i, is_visible: true, components: [] })),
            { id: "hidden", page_id: "p1", kind: "text", variant: "default", heading: "Hidden", subheading: null, body: null, settings: {}, sort_order: 99, is_visible: false, components: [] },
          ],
        },
      ],
    };
    const model = siteModelFromSnapshot(snapshot);
    expect(model.sections.map((s) => s.id)).toEqual(home.map((s) => s.id));
    expect(model.sections.every((s) => s.pageSlug === "home")).toBe(true);
    expect(model.sections[0]!.composition?.type).toBe("scene");
  });
});
