import { describe, expect, it, vi } from "vitest";
import { decidePublish, gateMode, intakeFromWorkspace, ownerBlockMessage, readinessDetail, themeFromProfile } from "@/lib/builder/quality/video-publish-gate";
import { scoreVideoBar } from "@/lib/builder/quality/video-score";
import { badSite, blueprintFor, goodSite } from "@/lib/builder/quality/video-score.fixtures";

const bp = blueprintFor("dentist");

describe("gate mode and decision", () => {
  it("defaults to warn, accepts warn and off, ignores junk", () => {
    expect(gateMode({})).toBe("warn");
    expect(gateMode({ VIDEO_BAR_GATE: "warn" })).toBe("warn");
    expect(gateMode({ VIDEO_BAR_GATE: " OFF " })).toBe("off");
    expect(gateMode({ VIDEO_BAR_GATE: "maybe" })).toBe("warn");
  });
  it("blocks below the bar only when enforcing", () => {
    const base = { score: 70, bar: 85 };
    expect(decidePublish({ ...base, mode: "enforce" })).toEqual({ ok: false, reason: "below_bar" });
    expect(decidePublish({ ...base, mode: "warn" }).ok).toBe(true);
    expect(decidePublish({ ...base, mode: "off" }).ok).toBe(true);
    expect(decidePublish({ score: 85, bar: 85, mode: "enforce" })).toEqual({ ok: true, reason: "passed" });
  });
  it("lets a live edit through only when it does not lower the live score", () => {
    const live = { score: 60, bar: 85, mode: "enforce" as const, liveEdit: true };
    expect(decidePublish({ ...live, previousScore: 60 }).ok).toBe(true);
    expect(decidePublish({ ...live, previousScore: 61 }).ok).toBe(false);
    expect(decidePublish({ ...live, previousScore: null }).ok).toBe(false);
    expect(decidePublish({ score: 60, bar: 85, mode: "enforce", liveEdit: false, previousScore: 60 }).ok).toBe(false);
  });
});

describe("owner message", () => {
  it("says the score, the bar and numbered fixes, with no internal codes", () => {
    const msg = ownerBlockMessage(scoreVideoBar(badSite(bp)));
    expect(msg).toMatch(/out of 100, it needs 85/);
    expect(msg).toMatch(/1\. /);
    expect(msg).not.toMatch(/truth_facts|lead_capture|hero_cinematic/);
    expect(readinessDetail(scoreVideoBar(goodSite(bp)), { ok: true, reason: "passed" })).toMatch(/Meets the bar/);
  });
});

describe("workspace mappers keep to the owner's own facts", () => {
  it("maps profile and services without inventing anything", () => {
    const intake = intakeFromWorkspace({
      businessName: "Owner Co",
      profile: { phone: "(646) 201-4477", city: "Fixture City", tagline: "Our promise", hours: { mon: "9-5" }, testimonials: [{ quote: "Owner supplied quote" }], years_in_business: 12 },
      services: [{ name: "Cleaning", price: 90 }, { name: "  " }],
    });
    expect(intake).toMatchObject({ businessName: "Owner Co", phone: "(646) 201-4477", yearsInBusiness: 12, email: null });
    expect(intake.services).toEqual([{ name: "Cleaning", description: null, price: 90 }]);
    expect(intake.ownerText).toContain("Owner supplied quote");
    expect(intake.ownerText).toContain("9-5");
    expect(intakeFromWorkspace({}).phone).toBeNull();
  });
  it("reads fonts and accent from the profile and leaves the rest unjudged", () => {
    expect(themeFromProfile({ font_preference: "Fraunces|Manrope", primary_color: "#1a2b3c" })).toEqual({ fonts: ["Fraunces", "Manrope"], palette: { accent: "#1A2B3C" } });
    expect(themeFromProfile({ primary_color: "red" })).toEqual({});
    expect(themeFromProfile(null)).toEqual({});
  });
});

describe("scoreWorkspaceVideoBar (fake database)", () => {
  it("scores the stored site with the org's trade blueprint and the live version", async () => {
    const good = goodSite(bp).site;
    const toSnap = (sections: typeof good.sections) => ({
      format: 1, takenAt: "2026-10-31T00:00:00Z",
      pages: [{ id: "p1", slug: "home", title: "Home", kind: "home", seo_title: null, seo_description: null, seo_canonical: null, og_title: null, og_description: null, og_image_url: null, noindex: false, sort_order: 1, is_visible: true,
        sections: sections.map((s, i) => ({ id: s.id, page_id: "p1", kind: s.kind, variant: "default", heading: s.heading ?? null, subheading: null, body: null, settings: { composition: { version: 1, root: JSON.parse(JSON.stringify(s.composition ?? null)) } }, sort_order: i, is_visible: true, components: [] })) }],
    });
    vi.resetModules();
    vi.doMock("@/lib/site-restore.functions", () => ({ readWebsiteState: async () => toSnap(good.sections) }));
    const tables: Record<string, unknown> = {
      organizations: { name: "Fixture", industry: "dentist" },
      business_profiles: { description: "", font_preference: `${bp.fonts.display}|${bp.fonts.body}`, primary_color: bp.palette.accent },
      services: [],
      website_versions: { pages: { ...toSnap(good.sections.slice(0, 2)), live_format: 1 } },
    };
    const db = { from: (t: string) => { type Chain = Record<string, (...a: never[]) => unknown>;
    const c: Chain = { select: () => c, eq: () => c, not: () => c, order: () => c, limit: () => c, maybeSingle: async () => ({ data: tables[t], error: null }), then: (r: (v: unknown) => unknown) => r({ data: tables[t], error: null }) }; return c; } };
    const { scoreWorkspaceVideoBar } = await import("@/lib/builder/quality/video-publish-gate.server");
    const r = await scoreWorkspaceVideoBar(db as never, "org", { withPrevious: true });
    expect(r.tradeSlug).toBe(bp.slug);
    expect(r.score.criteria).toHaveLength(14);
    expect(typeof r.previousScore).toBe("number");
    expect(r.previousScore!).toBeLessThan(r.score.score);
    const noPrev = await scoreWorkspaceVideoBar(db as never, "org");
    expect(noPrev.previousScore).toBeNull();
    vi.doUnmock("@/lib/site-restore.functions");
  });
});
