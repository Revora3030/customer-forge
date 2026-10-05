/**
 * Phase 1 + 6 regressions:
 * - The builder preview is mounted on the very first build (no `!firstRun`
 *   gate) and shows a live canvas skeleton fed by real build progress.
 * - Draft rendering survives half-written sections instead of crashing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canvasStatusLine } from "@/components/app/LiveCanvasSkeleton";
import { isRenderableSection, normalizeSection } from "@/components/site/site-sections-utils";

const read = (path: string) => readFileSync(path, "utf8");

describe("first-build preview canvas", () => {
  const route = read("src/routes/_authenticated/app.website.tsx");
  const preview = read("src/components/app/BuilderPreview.tsx");

  it("mounts the preview during the first build", () => {
    expect(route).not.toContain("!firstRun && org?.slug && (previewOpen || isWide)");
    expect(route).toContain("{org?.slug && (previewOpen || isWide) ? (");
    expect(route).toContain("firstRun={firstRun}");
  });

  it("offers the phone Chat/Preview toggle on the first build too", () => {
    expect(route).not.toMatch(/\{!firstRun \? \(\s*<div className="mb-2 flex justify-center lg:hidden">/);
  });

  it("renders the live canvas skeleton instead of an empty frame when there are no pages", () => {
    expect(preview).toContain("if (firstRun || props.pages.length === 0)");
    expect(preview).toContain("<LiveCanvasSkeleton");
  });
});

describe("canvasStatusLine (real progress only)", () => {
  it("uses the recorded stage and detail", () => {
    expect(
      canvasStatusLine({ status: "processing", stalled: false, latestStage: "Generating pictures", latestDetail: "2 of 6" }),
    ).toBe("Generating pictures — 2 of 6");
  });
  it("hides the synthetic percent detail and never invents a stage", () => {
    expect(
      canvasStatusLine({ status: "processing", stalled: false, latestStage: "layouts", latestDetail: "Build progress: 40%" }),
    ).toBe("layouts…");
    expect(canvasStatusLine({ status: "processing", stalled: false, latestStage: null, latestDetail: null })).toBe(
      "Revora's AI team is starting your website…",
    );
  });
  it("reports a stalled worker plainly", () => {
    expect(canvasStatusLine({ status: "processing", stalled: true, latestStage: "x", latestDetail: null })).toBe(
      "Reconnecting to your build…",
    );
  });
  it("invites the owner to start when nothing is running", () => {
    expect(canvasStatusLine({ status: null, stalled: false, latestStage: null, latestDetail: null })).toMatch(
      /Describe your business/,
    );
  });
});

describe("draft section guards", () => {
  it("rejects half-written section rows", () => {
    expect(isRenderableSection(undefined)).toBe(false);
    expect(isRenderableSection(null)).toBe(false);
    expect(isRenderableSection({})).toBe(false);
    expect(isRenderableSection({ id: "a" })).toBe(false);
    expect(isRenderableSection({ id: "a", kind: "" })).toBe(false);
    expect(isRenderableSection({ id: "a", kind: "hero", components: "nope" })).toBe(false);
  });
  it("accepts complete rows and normalises missing children", () => {
    const row = { id: "a", kind: "hero", settings: null, components: [null, { id: "c" }] };
    expect(isRenderableSection(row)).toBe(true);
    const safe = normalizeSection(row as never) as unknown as { settings: unknown; components: unknown[] };
    expect(safe.settings).toEqual({});
    expect(safe.components).toEqual([{ id: "c" }]);
  });
  it("renders a shimmer slot for pending sections on the page renderer", () => {
    const page = read("src/routes/s.$slug.$page.tsx");
    expect(page).toContain('data-testid="draft-section-pending"');
    expect(page).toContain("isRenderableSection(row)");
  });
  it("guards draft routes against a non-array sections payload", () => {
    for (const path of ["src/routes/_authenticated/draft.$slug.tsx", "src/routes/_authenticated/draft.$slug.$page.tsx"]) {
      expect(read(path)).toContain("Array.isArray(rawSections) ? rawSections : []");
    }
  });
  it("guards visual compositions against missing layer lists", () => {
    const vc = read("src/components/site/VisualComposition.tsx");
    expect(vc).toContain("Array.isArray(composition?.layers)");
    expect(vc).not.toContain("composition.layers.map(");
  });
});
