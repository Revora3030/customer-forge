import { describe, expect, it } from "vitest";
import { auditLiveHtml, auditScore, auditStructure, sortIssues } from "./site-audit";
import {
  conversionGaps,
  ctaLadder,
  normalizeGoal,
  type ConversionContext,
} from "./conversion-engine";
import { proposeUpgrades, summarizeProposals } from "./auto-upgrade";
import { INTAKE_FIELDS, intakeCompleteness, intakeGaps } from "./intake-map";
import type { ContentPage } from "./website-content";
import { foldH1Counts, foldMeasurement } from "./builder/launch-review.functions";

const section = (kind: string, over: Partial<ContentPage["sections"][number]> = {}) =>
  ({
    id: `s-${kind}-${Math.random().toString(36).slice(2, 7)}`,
    page_id: "p1",
    kind,
    variant: "default",
    heading: `${kind} heading`,
    subheading: null,
    body: null,
    settings: null,
    sort_order: 0,
    is_visible: true,
    components: [],
    ...over,
  }) as ContentPage["sections"][number];

const page = (over: Partial<ContentPage> = {}): ContentPage =>
  ({
    id: "p1",
    slug: "home",
    title: "Home",
    kind: "home",
    sort_order: 0,
    is_visible: true,
    seo_title: "Mobile detailing in Raleigh",
    seo_description: "Mobile car detailing across Raleigh, Cary and Durham with online booking.",
    seo_canonical: null,
    og_title: null,
    og_description: null,
    og_image_url: null,
    noindex: false,
    sections: [
      section("hero"),
      section("services"),
      section("quote"),
      section("reviews"),
      section("faq"),
      section("cta"),
    ],
    ...over,
  }) as ContentPage;

describe("auditStructure", () => {
  it("flags an empty site as critical and offers a rebuild", () => {
    const { issues } = auditStructure({
      pages: [],
      goal: "quote",
      metaDescription: null,
      headline: null,
    });
    expect(issues[0]?.severity).toBe("critical");
    expect(issues[0]?.upgrade).toBe("rebuild_site");
  });

  it("passes a complete home page", () => {
    const { issues, pageScores } = auditStructure({
      pages: [page()],
      goal: "quote",
      metaDescription: "Mobile detailing in Raleigh.",
      headline: "Mobile detailing in Raleigh",
    });
    expect(pageScores[0]?.score).toBe(100);
    expect(issues.filter((i) => i.severity === "critical")).toHaveLength(0);
  });

  it("flags a dead-end page with no CTA or capture block", () => {
    const bare = page({
      sections: [section("hero"), section("intro"), section("about" as string)],
    });
    const { issues } = auditStructure({
      pages: [bare],
      goal: "quote",
      metaDescription: "x",
      headline: "y",
    });
    expect(issues.some((i) => i.key.startsWith("no-cta") && i.severity === "critical")).toBe(true);
    expect(issues.some((i) => i.key === "no-capture")).toBe(true);
  });

  it("flags noindex and missing page SEO", () => {
    const hidden = page({ noindex: true, seo_description: null });
    const { issues } = auditStructure({
      pages: [hidden],
      goal: "quote",
      metaDescription: "x",
      headline: "y",
    });
    expect(issues.some((i) => i.upgrade === "page_index")).toBe(true);
    expect(issues.some((i) => i.upgrade === "page_seo")).toBe(true);
  });
});

describe("auditLiveHtml", () => {
  const good = `<!doctype html><html><head><title>Mobile detailing in Raleigh | Shine Co</title>
    <meta name="description" content="${"Mobile car detailing across Raleigh, Cary and Durham. Book online in sixty seconds or call for same-day help today."}">
    <link rel="canonical" href="https://x.test/s/shine"><meta property="og:title" content="Shine Co">
    <script type="application/ld+json">{}</script></head>
    <body><h1>Mobile detailing in Raleigh</h1><a href="tel:+19195550100">Call</a>
    <form><input name="email"><button>Get my quote</button></form>
    <img src="a.jpg" alt="Detailed car">
    <p>${"word ".repeat(300)}</p></body></html>`;

  it("reports a healthy live page with no issues", () => {
    const result = auditLiveHtml("/s/shine", "https://x.test/s/shine", 200, good);
    expect(result.observed.h1Count).toBe(1);
    expect(result.observed.telLinks).toBe(1);
    expect(result.observed.forms).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it("reports a broken page as critical", () => {
    const result = auditLiveHtml("/s/shine/book", "https://x.test/s/shine/book", 404, "");
    expect(result.issues[0]?.severity).toBe("critical");
    expect(result.issues[0]?.upgrade).toBe("publish_site");
  });

  it("catches thin content, no conversion path and missing alt text", () => {
    const bad = `<html><head><title>Home</title></head><body><h1>Home</h1><h1>Again</h1><img src="a.jpg"><p>short</p></body></html>`;
    const keys = auditLiveHtml("/s/shine", "https://x.test/s/shine", 200, bad).issues.map(
      (i) => i.key,
    );
    expect(keys.some((k) => k.startsWith("live-thin"))).toBe(true);
    expect(keys.some((k) => k.startsWith("live-cta"))).toBe(true);
    expect(keys.some((k) => k.startsWith("live-alt"))).toBe(true);
    expect(keys.some((k) => k.startsWith("live-h1"))).toBe(true);
  });

  it("scores and sorts issues worst first", () => {
    const issues = auditLiveHtml(
      "/x",
      "https://x.test/x",
      200,
      "<html><body></body></html>",
    ).issues;
    expect(auditScore(issues, 60)).toBeLessThan(100);
    expect(sortIssues(issues)[0]?.severity).toBe("critical");
  });
});

describe("conversion engine", () => {
  const ctx: ConversionContext = {
    phone: "(919) 555-0100",
    smsCapable: true,
    bookableCount: 2,
    quoteFormCount: 1,
    paymentsEnabled: false,
    email: "hi@shine.test",
    slug: "shine",
  };

  it("normalizes free-text goals", () => {
    expect(normalizeGoal("Get my quote")).toBe("quote");
    expect(normalizeGoal("Call now")).toBe("call");
    expect(normalizeGoal("Book appointments")).toBe("book");
    expect(normalizeGoal(null, "lead")).toBe("lead");
  });

  it("puts the chosen goal first and keeps working fallbacks", () => {
    const ladder = ctaLadder("call", ctx);
    expect(ladder[0]?.key).toBe("call");
    expect(ladder[0]?.href).toBe("tel:9195550100");
    expect(ladder.filter((step) => step.available).length).toBeGreaterThanOrEqual(4);
  });

  it("stays neutral when no owner goal is saved", () => {
    expect(normalizeGoal(null)).toBeNull();
    expect(ctaLadder(null, ctx)).toEqual([]);
    expect(conversionGaps(null, ctx, ["hero", "cta"], [])).toEqual([]);
  });

  it("flags a primary goal that cannot be completed", () => {
    const gaps = conversionGaps("call", { ...ctx, phone: null }, ["hero", "cta"], []);
    expect(gaps[0]?.severity).toBe("critical");
  });

  it("flags unanswered objections but never prescribes a fixed section list", () => {
    const gaps = conversionGaps("quote", ctx, ["hero", "cta"], ["What does it cost?"]);
    expect(gaps.some((g) => g.key === "missing-sections")).toBe(false);
    expect(gaps.some((g) => g.key === "objections")).toBe(true);
  });
});

describe("auto-upgrade proposals", () => {
  const base = {
    goal: "quote" as const,
    copyHeadline: "Mobile detailing in Raleigh",
    copyMetaDescription: "Mobile car detailing across Raleigh, Cary and Durham.",
    copyPrimaryCta: "Get my quote",
    headline: null,
    metaDescription: null,
    primaryCtaLabel: null,
    publishState: "draft",
    pages: [
      {
        id: "p1",
        title: "Home",
        slug: "home",
        seo_title: null,
        seo_description: null,
        noindex: false,
      },
    ],
    businessName: "Shine Co",
    city: "Raleigh",
  };

  it("proposes only safe, reviewable changes with before/after", () => {
    const { issues } = auditStructure({
      pages: [page({ sections: [section("hero")], seo_title: null, seo_description: null })],
      goal: "quote",
      metaDescription: null,
      headline: null,
    });
    const proposals = proposeUpgrades(issues, base);
    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) {
      expect(proposal.changes.length).toBeGreaterThan(0);
      for (const change of proposal.changes) expect(change.after.length).toBeGreaterThan(0);
    }
    expect(proposals.some((p) => p.kind === "publish_site")).toBe(true);
    expect(proposals.some((p) => p.kind === "apply_cta")).toBe(true);
  });

  it("blocks meta promotion when there is no drafted copy to use", () => {
    const proposals = proposeUpgrades([], {
      ...base,
      copyHeadline: null,
      copyMetaDescription: null,
    });
    const meta = proposals.find((p) => p.kind === "apply_meta");
    expect(meta?.applyable).toBe(false);
    expect(meta?.needs).toBeTruthy();
  });

  it("never proposes overwriting fields the owner already filled", () => {
    const proposals = proposeUpgrades([], {
      ...base,
      headline: "My own headline",
      metaDescription: "My own description",
      primaryCtaLabel: "Call now",
      publishState: "published",
    });
    expect(proposals.some((p) => p.kind === "apply_cta" || p.kind === "apply_meta")).toBe(false);
  });

  it("summarizes the approval batch", () => {
    const summary = summarizeProposals(proposeUpgrades([], base));
    expect(summary.count).toBeGreaterThan(0);
    expect(summary.headline).toContain("upgrade");
  });
});

describe("tenant page SEO checks", () => {
  const desc = "Mobile car detailing across Raleigh, Cary and Durham with online booking.";
  const seoIssues = (pages: ContentPage[]) =>
    auditStructure({ pages, goal: "quote", metaDescription: "x", headline: "y" }).issues.filter((issue) => issue.code);

  it("flags duplicate titles and descriptions across visible pages, using seo-audit code names", () => {
    const issues = seoIssues([
      page({ id: "a", title: "Home" }),
      page({ id: "b", slug: "about", title: "About", kind: "page" }),
      page({ id: "c", slug: "faq", title: "FAQ", kind: "page", seo_title: "FAQ about detailing", seo_description: "Answers about pricing, timing and coverage for mobile detailing in Raleigh." }),
    ]);
    expect(issues.filter((issue) => issue.code === "duplicate_title").map((issue) => issue.pageId).sort()).toEqual(["a", "b"]);
    expect(issues.filter((issue) => issue.code === "duplicate_description").map((issue) => issue.pageId).sort()).toEqual(["a", "b"]);
    expect(issues.every((issue) => issue.upgrade === "page_seo" && issue.severity === "warning")).toBe(true);
    expect(issues.some((issue) => issue.pageId === "c")).toBe(false);
  });

  it("ignores hidden, noindex and thank-you pages for duplicates", () => {
    const issues = seoIssues([
      page({ id: "a" }),
      page({ id: "b", slug: "hidden", is_visible: false }),
      page({ id: "c", slug: "private", noindex: true }),
      page({ id: "d", slug: "thanks", kind: "thanks" }),
    ]);
    expect(issues).toEqual([]);
  });

  it("flags titles over 60 and descriptions outside 50-160", () => {
    const issues = seoIssues([
      page({ id: "long", seo_title: "x".repeat(61), seo_description: desc }),
      page({ id: "short", slug: "s", seo_title: "Short desc page", seo_description: "Too short." }),
      page({ id: "wordy", slug: "w", seo_title: "Wordy page", seo_description: "y".repeat(161) }),
      page({ id: "ok", slug: "ok", seo_title: "x".repeat(60), seo_description: "z".repeat(50) }),
    ]);
    const codes = Object.fromEntries(issues.map((issue) => [issue.pageId, issue.code]));
    expect(codes).toEqual({ long: "title_too_long", short: "description_too_short", wordy: "description_too_long" });
  });

  it("keeps a complete page's structure score at 100", () => {
    const { pageScores } = auditStructure({
      pages: [page({ id: "a" }), page({ id: "b", slug: "about" })],
      goal: "quote",
      metaDescription: "x",
      headline: "y",
    });
    expect(pageScores.map((score) => score.score)).toEqual([100, 100]);
  });
});

describe("launch review H1 fold", () => {
  const row = (slug: string, h1: number) => ({
    measured_at: "2026-10-17T00:00:00Z",
    page_slug: slug,
    measurements: [{ width: 390, accessibility: { h1Count: h1 } }, { width: 1280, accessibility: { h1Count: h1 } }],
  });
  const copy = { title: "t", description: "d" };

  it("passes only when every measured page has exactly one H1", () => {
    expect(foldH1Counts([1, 1, 1])).toBe(1);
    expect(foldH1Counts([1, 0])).toBe(0);
    expect(foldH1Counts([1, 2])).toBe(2);
    expect(foldH1Counts([])).toBe(0);
  });

  it("does not hide a page without an H1 behind another page's single H1", () => {
    expect(foldMeasurement([row("home", 1), row("about", 0)], copy)?.seo.h1Count).toBe(0);
    expect(foldMeasurement([row("home", 1), row("about", 1)], copy)?.seo.h1Count).toBe(1);
  });

  it("uses the newest report per page", () => {
    // Rows arrive newest first: the old failing about-page report is superseded.
    expect(foldMeasurement([row("home", 1), row("about", 1), row("about", 0)], copy)?.seo.h1Count).toBe(1);
  });
});

describe("one-input intake", () => {
  it("asks only for blank required facts", () => {
    expect(intakeGaps({}).length).toBe(INTAKE_FIELDS.filter((f) => f.required).length);
    const filled = Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, "x"]));
    expect(intakeGaps(filled)).toHaveLength(0);
    expect(intakeCompleteness(filled).percent).toBe(100);
  });

  it("declares a downstream consumer for every fact", () => {
    for (const field of INTAKE_FIELDS) expect(field.usedBy.length).toBeGreaterThan(0);
  });
});
