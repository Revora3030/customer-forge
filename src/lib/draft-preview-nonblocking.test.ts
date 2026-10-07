/**
 * The owner's draft preview must stay visible while a rebuild or AI update
 * runs; only an empty first build shows the full-page "still being built"
 * message. A stalled job (no updates for 10 min) on a draft with sections is
 * shown as ready so the preview never sits behind a dead worker.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DRAFT_STALL_MS, isStalledJob } from "@/lib/public-site.functions";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("isStalledJob", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  it("treats a job untouched for more than 10 minutes as stalled when the draft has sections", () => {
    expect(DRAFT_STALL_MS).toBe(600_000);
    expect(isStalledJob("2026-10-06T11:49:00Z", 5, now)).toBe(true);
  });
  it("keeps a recently updated job pending", () => {
    expect(isStalledJob("2026-10-06T11:55:00Z", 5, now)).toBe(false);
  });
  it("never marks an empty first build as ready", () => {
    expect(isStalledJob("2026-10-06T10:00:00Z", 0, now)).toBe(false);
  });
  it("ignores missing or invalid timestamps", () => {
    expect(isStalledJob(null, 5, now)).toBe(false);
    expect(isStalledJob("not a date", 5, now)).toBe(false);
  });
});

for (const [file, view, emptyTitle] of [
  ["src/routes/_authenticated/draft.$slug.tsx", "PublicSiteView", "Your website is still being built"],
  ["src/routes/_authenticated/draft.$slug.$page.tsx", "SitePageView", "This page is still being built"],
] as const) {
  describe(`non-blocking draft preview: ${file}`, () => {
    const src = read(file);
    it("renders the live draft (with the progress banner) before the pending full-page message", () => {
      const live = src.indexOf(`<${view} site={result.site} preview />`);
      const pendingMessage = src.indexOf(emptyTitle);
      expect(live).toBeGreaterThan(-1);
      expect(pendingMessage).toBeGreaterThan(-1);
      expect(live).toBeLessThan(pendingMessage);
      expect(src).toMatch(/result\?\.site && sections\.length > 0 && \(result\.status === "pending" \|\| result\.status === "ready"\)/);
      expect(src).toContain('{result.status === "pending" ? <DraftUpdatingBanner job={result.job} /> : null}');
    });
    it("keeps polling every 2.5s while pending", () => {
      expect(src).toContain('if (result?.status !== "pending") return;');
      expect(src).toContain("2500");
    });
  });
}

describe("draft updating banner", () => {
  const src = read("src/routes/_authenticated/draft.$slug.tsx");
  it("is accessible and shows the current step and progress", () => {
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('role="progressbar"');
    expect(src).toContain("Sol is drafting revisions…");
    // The job stores a step key; the owner sees the readable label.
    expect(src).toContain("stepLabel(job.currentStep)");
  });
  it("floats over the draft without blocking it and wraps long titles", () => {
    expect(src).toContain("pointer-events-none fixed");
    expect(src).toContain("break-words");
    expect(src).not.toContain("sticky top-0 z-50");
  });
});

describe("getOwnerDraftSite stall handling", () => {
  const src = read("src/lib/public-site.functions.ts");
  it("reads updated_at and returns ready for a stalled job on a draft with sections", () => {
    expect(src).toContain('.select("id, status, current_step, progress, updated_at")');
    expect(src).toMatch(/isStalledJob\(job\.updated_at as string \| null, sectionCount\)[\s\S]{0,80}status: "ready" as const/);
  });
});
