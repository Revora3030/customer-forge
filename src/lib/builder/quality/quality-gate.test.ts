import { describe, expect, it } from "vitest";
import type { IntakeFacts } from "@/lib/builder/quality/facts-guard";
import { type DraftPart, type DraftSnapshot, blocking, evaluateGate, runQualityGate } from "@/lib/builder/quality/quality-gate";

const intake: IntakeFacts = { businessName: "Test Co", phone: "919-555-0142", services: [{ name: "Gutter cleaning" }] };
const good = (id: string, over: Partial<DraftPart> = {}): DraftPart => ({
  id, kind: "services", texts: ["Gutter cleaning for homes in the service area."],
  images: [{ src: "https://cdn.test-host.net/a.jpg", alt: "Cleaned gutter", bytes: 120_000, width: 800, height: 600 }],
  links: ["/contact", "tel:9195550142"], fonts: ["Fraunces", "Manrope"], ...over,
});
const snap = (parts: DraftPart[], over: Partial<DraftSnapshot> = {}): DraftSnapshot => ({ parts, hasViewportMeta: true, scriptCount: 2, fontFiles: 3, knownPaths: ["/", "/contact"], ...over });
const codes = (d: DraftSnapshot) => evaluateGate(d, intake).map((f) => f.code);

describe("quality gate checks", () => {
  it("passes a clean draft", () => {
    expect(blocking(evaluateGate(snap([good("a"), good("b")]), intake))).toEqual([]);
  });
  it("flags an invented rating", () => {
    expect(evaluateGate(snap([good("a", { texts: ["Rated 4.9 stars by happy customers"] })]), intake).some((f) => f.check === "facts" && f.partId === "a")).toBe(true);
  });
  it("flags AI phrasing, emoji and em dashes", () => {
    const c = codes(snap([good("a", { texts: ["Elevate your home \u2014 seamlessly \u2728"] })]));
    expect(c).toEqual(expect.arrayContaining(["ai-phrasing", "em-dash", "emoji"]));
  });
  it("flags banned display fonts and glow orbs as warnings", () => {
    const f = evaluateGate(snap([good("a", { fonts: ["Inter", "Manrope"], css: "background: radial-gradient(circle, #f0f, transparent); filter: blur(80px)" })]), intake);
    expect(f.filter((x) => ["banned-font", "glow-orb"].includes(x.code)).every((x) => x.severity === "warn")).toBe(true);
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(["banned-font", "glow-orb"]));
  });
  it("flags placeholder and empty images, missing alt", () => {
    const c = codes(snap([good("a", { images: [{ src: "https://via.placeholder.com/600" , alt: "x" }, { src: "" , alt: "y"}, { src: "https://cdn.test-host.net/b.jpg", alt: "", aspect: "4/3" }] })]));
    expect(c).toEqual(expect.arrayContaining(["image-placeholder", "image-empty", "image-alt"]));
  });
  it("flags dead and malformed links", () => {
    const c = codes(snap([good("a", { links: ["#", "javascript:void(0)", "/nowhere", "tel:12", "mailto:nope"] })]));
    expect(c).toEqual(expect.arrayContaining(["link-empty", "link-script", "link-dead", "link-tel", "link-mailto"]));
  });
  it("skips dead-link checks when known paths are not supplied", () => {
    const { knownPaths: _omit, ...withoutPaths } = snap([good("a", { links: ["/anything"] })]);
    expect(codes(withoutPaths as DraftSnapshot)).not.toContain("link-dead");
  });
  it("enforces the perf budget", () => {
    const heavy = good("a", { images: Array.from({ length: 3 }, (_, i) => ({ src: `https://cdn.test-host.net/${i}.jpg`, alt: "x", bytes: 2_000_000, width: 10, height: 10 })) });
    const c = codes(snap([heavy], { scriptCount: 12, fontFiles: 9 }));
    expect(c).toEqual(expect.arrayContaining(["image-weight", "image-total", "script-count", "font-files"]));
  });
  it("counts font families across the page", () => {
    expect(codes(snap([good("a", { fonts: ["A", "B"] }), good("b", { fonts: ["C"] })]))).toContain("font-families");
  });
  it("flags structural mobile problems", () => {
    const c = codes(snap([good("a", { css: "width: 1200px", images: [{ src: "https://cdn.test-host.net/a.jpg", alt: "x" }] })], { hasViewportMeta: false }));
    expect(c).toEqual(expect.arrayContaining(["fixed-width", "image-unsized", "viewport-meta"]));
  });
});

describe("runQualityGate retries", () => {
  const bad = good("b", { texts: ["Rated 4.9 stars"] });

  it("regenerates only the failed part and then passes", async () => {
    const asked: string[][] = [];
    const out = await runQualityGate(snap([good("a"), bad]), intake, async (ids) => {
      asked.push([...ids]);
      return snap([good("a", { texts: ["CHANGED"] }), good("b")]);
    });
    expect(out.passed).toBe(true);
    expect(asked).toEqual([["b"]]);
    // part a was not replaced even though the regenerator returned a new version
    expect(out.draft.parts.find((p) => p.id === "a")?.texts[0]).toContain("Gutter cleaning");
    expect(out.attempts).toHaveLength(2);
  });

  it("caps retries and does not pass a draft that never improves", async () => {
    let calls = 0;
    const out = await runQualityGate(snap([bad]), intake, async () => { calls += 1; return snap([bad]); }, { maxRetries: 2 });
    expect(calls).toBe(2);
    expect(out.passed).toBe(false);
    expect(out.attempts).toHaveLength(3);
  });

  it("does not retry whole-draft failures, it reports them", async () => {
    let calls = 0;
    const out = await runQualityGate(snap([good("a")], { hasViewportMeta: false }), intake, async () => { calls += 1; return snap([good("a")]); });
    expect(calls).toBe(0);
    expect(out.passed).toBe(false);
    expect(out.needsHuman.map((f) => f.code)).toEqual(["viewport-meta"]);
  });

  it("records every attempt", async () => {
    const seen: number[] = [];
    await runQualityGate(snap([bad]), intake, async () => snap([good("b")]), { record: (a) => { seen.push(a.attempt); } });
    expect(seen).toEqual([0, 1]);
  });

  it("warnings alone never block", async () => {
    const out = await runQualityGate(snap([good("a", { fonts: ["Inter"] })]), intake, async () => { throw new Error("should not run"); });
    expect(out.passed).toBe(true);
  });
});
