import { describe, expect, it } from "vitest";
import { buildAssetQueue, slotLabel, type AssetQueueRecord } from "./ai-city-assets";

const ORG = "11111111-1111-4111-8111-111111111111";
const row = (over: Partial<AssetQueueRecord> = {}): AssetQueueRecord => ({
  id: "r1",
  organization_id: ORG,
  slot: "gallery-2",
  status: "pending",
  source: "generated",
  alt_text: "Clean driveway",
  media_id: "m1",
  model: "google/gemini-image",
  provider: "lovable",
  generation: 2,
  updated_at: "2026-11-04T20:00:00Z",
  created_at: "2026-11-04T19:00:00Z",
  ...over,
});

describe("buildAssetQueue", () => {
  it("shapes pending pictures with slot, workspace and thumbnail", () => {
    const queue = buildAssetQueue({
      records: [row()],
      total: 1,
      workspaces: new Map([[ORG, "Acme Wash"]]),
      previews: new Map([["m1", "https://signed.example/m1"]]),
      checkedAt: "now",
    });
    expect(queue.available).toBe(true);
    expect(queue.items[0]).toEqual({
      id: "r1",
      kind: "image",
      organizationId: ORG,
      workspace: "Acme Wash",
      slot: "Gallery 2",
      status: "pending",
      at: "2026-11-04T20:00:00Z",
      altText: "Clean driveway",
      thumbnail: "https://signed.example/m1",
      model: "google/gemini-image",
      attempt: 2,
    });
  });

  it("never invents a thumbnail, workspace name or non-Lovable model", () => {
    const queue = buildAssetQueue({
      records: [row({ media_id: null, provider: "pollinations", alt_text: " " })],
      total: 1,
      workspaces: new Map(),
      previews: new Map(),
      checkedAt: "now",
    });
    expect(queue.items[0]).toMatchObject({
      thumbnail: null,
      workspace: "Unnamed workspace",
      model: null,
      altText: null,
    });
  });

  it("reports voice and motion as not recorded, not zero", () => {
    const queue = buildAssetQueue({
      records: [],
      total: 0,
      workspaces: new Map(),
      previews: new Map(),
      checkedAt: "now",
    });
    expect(queue.kinds).toEqual([
      { kind: "image", recorded: true, waiting: 0 },
      { kind: "voice", recorded: false, waiting: null },
      { kind: "motion", recorded: false, waiting: null },
    ]);
  });

  it("an unreadable feed is unavailable, not empty", () => {
    const queue = buildAssetQueue({
      records: null,
      total: null,
      workspaces: new Map(),
      previews: new Map(),
      checkedAt: "now",
    });
    expect(queue).toMatchObject({ available: false, total: null, items: [] });
    expect(queue.kinds[0]?.waiting).toBeNull();
  });

  it("keeps the true total when more are waiting than shown", () => {
    const records = Array.from({ length: 60 }, (_, i) => row({ id: `r${i}` }));
    const queue = buildAssetQueue({
      records,
      total: 75,
      workspaces: new Map(),
      previews: new Map(),
      checkedAt: "now",
    });
    expect(queue.items).toHaveLength(50);
    expect(queue.total).toBe(75);
  });
});

describe("slotLabel", () => {
  it("is readable and safe", () => {
    expect(slotLabel("hero")).toBe("Hero");
    expect(slotLabel("service_card-1")).toBe("Service card 1");
    expect(slotLabel("<script>")).toBe("Script");
    expect(slotLabel(null)).toBe("Picture");
  });
});
