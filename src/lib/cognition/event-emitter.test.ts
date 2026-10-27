import { describe, expect, it } from "vitest";
import { MAX_COLLECTED_EVENTS, collectEvents, type EventSource } from "./event-emitter";
import type { PlatformEvent } from "./event-rules";

const ev = (id: string, at: number, type = "build.failed"): PlatformEvent => ({ id, type, occurredAt: at, subject: id });

describe("collectEvents", () => {
  it("merges sources newest first and reports a failed source by name instead of as quiet", async () => {
    const sources: EventSource[] = [
      { name: "a", read: async () => [ev("1", 100), ev("2", 300)] },
      { name: "b", read: async () => { throw new Error("boom"); } },
      { name: "c", read: async () => [ev("3", 200)] },
    ];
    const result = await collectEvents(sources, 0);
    expect(result.events.map((e) => e.id)).toEqual(["2", "3", "1"]);
    expect(result.failedSources).toEqual(["b"]);
    expect(result.dropped).toBe(0);
  });

  it("drops duplicates of the same event, ignores events with no usable time, and caps the total", async () => {
    const dup: EventSource = { name: "d", read: async () => [ev("1", 100), ev("1", 100), { ...ev("2", 100, "ci.failed") }, ev("1", 100, "ci.failed"), { ...ev("x", Number.NaN) }] };
    expect((await collectEvents([dup], 0)).events).toHaveLength(3);
    const many: EventSource = { name: "m", read: async () => Array.from({ length: MAX_COLLECTED_EVENTS + 5 }, (_, i) => ev(`e${i}`, i)) };
    const capped = await collectEvents([many], 0);
    expect(capped.events).toHaveLength(MAX_COLLECTED_EVENTS);
    expect(capped.dropped).toBe(5);
    expect(capped.events[0]!.id).toBe(`e${MAX_COLLECTED_EVENTS + 4}`);
  });

  it("returns an empty, clean result for no sources", async () => {
    expect(await collectEvents([], 0)).toEqual({ events: [], failedSources: [], dropped: 0 });
  });
});
