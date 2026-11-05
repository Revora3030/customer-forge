import { describe, expect, it } from "vitest";
import {
  applyCheckpointMeta,
  changedSectionIds,
  checkpointBefore,
  checkpointTitle,
  cleanCheckpointName,
  isPinned,
  messageSentAt,
  readCheckpointMeta,
  snapshotOutline,
  stripCheckpointMeta,
  toCheckpoints,
} from "@/lib/builder/checkpoints";
import type { VersionEntry } from "@/lib/site-versions";

const entry = (version: number, date: string, extra: Partial<VersionEntry> = {}): VersionEntry => ({
  id: `v${version}`,
  version,
  date,
  who: "Adam",
  kind: "publish",
  restoredFrom: null,
  summary: "",
  isLive: false,
  verification: null,
  ...extra,
});

describe("checkpoint names and pins", () => {
  it("cleans names to one short line", () => {
    expect(cleanCheckpointName("  Before\n\tspring   prices ")).toBe("Before spring prices");
    expect(cleanCheckpointName("   ")).toBeNull();
    expect(cleanCheckpointName(null)).toBeNull();
    expect(cleanCheckpointName("x".repeat(80))).toHaveLength(60);
  });
  it("reads, applies and strips the meta without touching the snapshot", () => {
    const pages = { live_format: 1, pages: [{ id: "home" }] };
    const named = applyCheckpointMeta(pages, { name: "Spring", pinned: true });
    expect(named).toEqual({ ...pages, checkpoint_name: "Spring", checkpoint_pinned: true });
    expect(pages).not.toHaveProperty("checkpoint_name");
    expect(readCheckpointMeta(named)).toEqual({ name: "Spring", pinned: true });
    expect(applyCheckpointMeta(named, { pinned: false })).toEqual({
      ...pages,
      checkpoint_name: "Spring",
    });
    expect(applyCheckpointMeta(named, { name: "" })).toEqual({ ...pages, checkpoint_pinned: true });
    expect(stripCheckpointMeta(named)).toEqual(pages);
    expect(readCheckpointMeta(null)).toEqual({ name: null, pinned: false });
  });
  it("accepts a pin as a body, a boolean or PostgREST text", () => {
    expect(isPinned(true)).toBe(true);
    expect(isPinned("true")).toBe(true);
    expect(isPinned({ checkpoint_pinned: true })).toBe(true);
    expect(isPinned("false")).toBe(false);
    expect(isPinned(null)).toBe(false);
  });
  it("titles by name, else version", () => {
    expect(checkpointTitle({ name: "Spring", version: 3 })).toBe("Spring");
    expect(checkpointTitle({ name: null, version: 3 })).toBe("Version 3");
  });
  it("adds meta to version entries by id", () => {
    const out = toCheckpoints(
      [entry(2, "2026-10-02"), entry(1, "2026-10-01")],
      new Map([["v1", { checkpoint_name: "First" }]]),
    );
    expect(out.map((c) => [c.version, c.name, c.pinned])).toEqual([
      [2, null, false],
      [1, "First", false],
    ]);
  });
});

describe("restore to before a message", () => {
  const list = [
    entry(3, "2026-10-03T12:00:00Z", { isLive: true }),
    entry(2, "2026-10-02T12:00:00Z"),
    entry(1, "2026-10-01T12:00:00Z"),
  ];
  it("picks the newest checkpoint published before the message", () => {
    expect(checkpointBefore(list, Date.parse("2026-10-02T18:00:00Z"))?.version).toBe(2);
    expect(checkpointBefore(list, Date.parse("2026-10-01T18:00:00Z"))?.version).toBe(1);
  });
  it("offers nothing when the site has not changed since, or nothing came before", () => {
    expect(checkpointBefore(list, Date.parse("2026-10-04T00:00:00Z"))).toBeNull();
    expect(checkpointBefore(list, Date.parse("2026-09-01T00:00:00Z"))).toBeNull();
    expect(checkpointBefore(list, null)).toBeNull();
  });
  it("never offers a checkpoint whose live check failed", () => {
    const failed = [
      list[0]!,
      entry(2, "2026-10-02T12:00:00Z", { verification: "failed" }),
      list[2]!,
    ];
    expect(checkpointBefore(failed, Date.parse("2026-10-02T18:00:00Z"))).toBeNull();
  });
  it("uses the saved send time, else stamps a new message once", () => {
    expect(messageSentAt({ id: "a", sentAt: "2026-10-02T00:00:00Z" })).toBe(
      Date.parse("2026-10-02T00:00:00Z"),
    );
    expect(messageSentAt({ id: "fresh" }, () => 1000)).toBe(1000);
    expect(messageSentAt({ id: "fresh" }, () => 5000)).toBe(1000);
  });
});

describe("snapshot outline for the before/after slider", () => {
  const snapshot = (heading: string) => ({
    pages: [
      {
        id: "home",
        title: "Home",
        sections: [
          { id: "b", kind: "call_to_action", heading: "Call us", sort_order: 2 },
          { id: "a", kind: "hero", heading, subheading: "  Fast   and friendly ", sort_order: 1 },
          { id: "hidden", kind: "faq", is_visible: false },
        ],
      },
      { id: "secret", title: "Hidden", is_visible: false, sections: [] },
    ],
  });
  it("lists visible pages and sections in order with short text", () => {
    expect(snapshotOutline(snapshot("Plumbing"))).toEqual({
      pages: [
        {
          id: "home",
          title: "Home",
          sections: [
            { id: "a", label: "Hero", heading: "Plumbing", text: "Fast and friendly" },
            { id: "b", label: "Call to action", heading: "Call us", text: "" },
          ],
        },
      ],
    });
    expect(snapshotOutline(null)).toEqual({ pages: [] });
  });
  it("marks changed, added and removed sections", () => {
    const before = snapshotOutline(snapshot("Plumbing"));
    const after = snapshotOutline(snapshot("Plumbing & heating"));
    expect([...changedSectionIds(before, after)]).toEqual(["a"]);
    expect([...changedSectionIds(before, before)]).toEqual([]);
    expect([...changedSectionIds(before, { pages: [] })].sort()).toEqual(["a", "b"]);
  });
});
