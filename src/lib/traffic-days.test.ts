import { describe, expect, it, vi, afterEach } from "vitest";
import { summarizeTraffic } from "@/lib/traffic";

afterEach(() => vi.useRealTimers());

describe("traffic daily chart uses the owner's own calendar day", () => {
  it("puts an evening New York visit on that evening's day, not the next UTC day", () => {
    vi.useFakeTimers();
    // 2026-10-03 01:30 UTC = 2026-10-02 21:30 in New York (UTC-4, offset 240).
    vi.setSystemTime(new Date("2026-10-03T01:30:00Z"));
    const events = [
      { event_type: "page_view", path: "/", source: null, device: null, session_id: "abcdef1", created_at: "2026-10-03T01:00:00Z" },
    ];
    const local = summarizeTraffic(events, 2, 240);
    const last = local.daily.at(-1)!;
    expect(last.day).toBe("2026-10-02");
    expect(last.views).toBe(1);

    const utc = summarizeTraffic(events, 2, 0);
    expect(utc.daily.at(-1)?.day).toBe("2026-10-03");
  });
});
