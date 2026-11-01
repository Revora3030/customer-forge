import { describe, expect, it } from "vitest";
import { QUIET_AFTER_MS, buildWorkFeed, quietNotice, stalledNotice } from "./work-feed";

const now = Date.parse("2026-10-31T12:00:00Z");
const job = (over: Record<string, unknown>) =>
  ({ id: "j", status: "processing", progress: 74, current_step: "layout", steps: [], created_at: new Date(now - 600_000).toISOString(), updated_at: new Date(now - 30_000).toISOString(), ...over }) as never;
const feed = (j: never) => buildWorkFeed({ job: j, progress: [], generations: [], images: [], now });

describe("quiet build reporting", () => {
  it("is not quiet while progress is recent", () => {
    expect(feed(job({})).quietMs).toBeNull();
  });
  it("reports how long a running build has recorded nothing, keeping the real percent", () => {
    const f = feed(job({ updated_at: new Date(now - QUIET_AFTER_MS - 60_000).toISOString() }));
    expect(f.percent).toBe(74);
    expect(f.quietMs).toBeGreaterThanOrEqual(QUIET_AFTER_MS);
    expect(quietNotice(f)).toMatch(/No new progress for 4 min/);
    expect(quietNotice(f)).toMatch(/nothing has been published/);
  });
  it("is never quiet once the build has ended", () => {
    expect(feed(job({ status: "failed", updated_at: new Date(now - 3_600_000).toISOString() })).quietMs).toBeNull();
  });
  it("only promises an automatic restart while attempts remain", () => {
    expect(stalledNotice({ attempts: 1 })).toMatch(/attempt 2 of 3/);
    expect(stalledNotice({ attempts: 3 })).toMatch(/won't restart by itself/);
  });
});
