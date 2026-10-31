import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HERO_VIDEO_MIN_REMAINING_MS, remainingMs, shouldSkipHeroVideo } from "./time-budget";
import { createRunSlice, NEXT_STAGE_RESERVE_MS } from "@/lib/site-engine.worker.server";

describe("time budget", () => {
  it("skips the optional hero video under 60 s and runs it with more", () => {
    const now = 1_000_000;
    expect(shouldSkipHeroVideo(now + HERO_VIDEO_MIN_REMAINING_MS - 1, now)).toBe(true);
    expect(shouldSkipHeroVideo(now + HERO_VIDEO_MIN_REMAINING_MS, now)).toBe(false);
    expect(shouldSkipHeroVideo(now - 5, now)).toBe(true);
  });
  it("never skips when there is no deadline (kick-less runs)", () => {
    expect(remainingMs(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(shouldSkipHeroVideo(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("layout hand-back point", () => {
  const store = () => {
    const data = new Map<string, unknown>();
    return {
      get: async <T,>(key: string) => (data.get(key) as T) ?? null,
      put: async (key: string, _inputs: unknown, value: unknown) => (data.set(key, value), true),
    };
  };
  it("hands back at 'layout' once progressed and inside the reserve", async () => {
    let now = 0;
    const slice = createRunSlice({ jobId: "j", deadline: 240_000, fresh: false, store: store(), now: () => now });
    now = 240_000 - NEXT_STAGE_RESERVE_MS + 1;
    await slice.handBackIfDue("layout"); // no progress: never hands back
    slice.progressed();
    await expect(slice.handBackIfDue("layout")).rejects.toMatchObject({ name: "BuildHandBackError", point: "layout" });
  });
  it("does not hand back with budget to spare", async () => {
    const slice = createRunSlice({ jobId: "j", deadline: 240_000, fresh: true, store: store(), now: () => 10_000 });
    await expect(slice.handBackIfDue("layout")).resolves.toBeUndefined();
  });
});

describe("worker wiring", () => {
  const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
  it("hands back after every section layout is saved, before the unsaved chrome work", () => {
    const layoutDone = worker.indexOf('await slice.handBackIfDue("layout");\n    await db.from("ai_generations")');
    const chrome = worker.indexOf("composeSiteChrome(", layoutDone);
    expect(layoutDone).toBeGreaterThan(0);
    expect(chrome).toBeGreaterThan(layoutDone);
  });
  it("keeps the pages hand-back", () => {
    expect(worker).toContain('await slice.handBackIfDue("pages")');
  });
  it("skips the hero video when time is short and says so", () => {
    expect(worker).toContain("shouldSkipHeroVideo(slice.deadline)");
    expect(worker).toContain("HERO_VIDEO_SKIPPED_MESSAGE");
  });
});
