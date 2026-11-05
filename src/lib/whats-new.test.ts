import { describe, expect, it } from "vitest";
import { WHATS_NEW, hasUnreadEntry, latestEntryDate, publishedEntries, formatEntryDate } from "./whats-new";
import { indexablePlatformPaths } from "./seo-intent";

describe("what's new", () => {
  it("every entry is marked published", () => {
    for (const e of WHATS_NEW) expect((e as { published?: unknown }).published, e.id).toBe(true);
  });
  it("entries are plain, dated, unique and jargon-free", () => {
    expect(new Set(WHATS_NEW.map((e) => e.id)).size).toBe(WHATS_NEW.length);
    const today = new Date().toISOString().slice(0, 10);
    for (const e of WHATS_NEW) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.date <= today).toBe(true);
      expect(e.text).toMatch(/^[A-Z].*\.$/);
      expect(e.text).not.toMatch(/#\d|\bPR\b|\bL\d+\b|LOV-|FIX-|merge|credit|Lovable|lovable-sync|\$/i);
    }
  });
  it("filters unpublished entries out and sorts newest first", () => {
    const list = [
      { id: "a", date: "2026-10-01", text: "A.", published: true as const },
      { id: "b", date: "2026-10-05", text: "B.", published: false as unknown as true },
    ];
    expect(publishedEntries(list).map((e) => e.id)).toEqual(["a"]);
    expect(latestEntryDate(list)).toBe("2026-10-01");
  });
  it("shows the unread dot only for entries newer than the last visit", () => {
    const latest = latestEntryDate()!;
    expect(hasUnreadEntry(null)).toBe(true);
    expect(hasUnreadEntry(latest)).toBe(false);
    expect(hasUnreadEntry("2000-01-01")).toBe(true);
    expect(hasUnreadEntry(null, [])).toBe(false);
  });
  it("formats dates without shifting the day", () => {
    expect(formatEntryDate("2026-10-31")).toBe("October 31, 2026");
  });
  it("is in the sitemap", () => {
    expect(indexablePlatformPaths()).toContain("/whats-new");
  });
});
