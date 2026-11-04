import { afterEach, describe, expect, it, vi } from "vitest";
import { searchOsmProspects } from "./osm-prospects.server";

afterEach(() => vi.unstubAllGlobals());

describe("directory discovery outcomes", () => {
  it("does not present failed city lookup as zero qualified leads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    await expect(searchOsmProspects("mobile detailing", "Durham", "NC")).rejects.toThrow("discovery is unavailable");
  });

  it("preserves a genuinely successful empty directory search", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json([{ boundingbox: ["35", "36", "-79", "-78"] }]))
      .mockResolvedValueOnce(Response.json({ elements: [] })));
    await expect(searchOsmProspects("mobile detailing", "Durham", "NC")).resolves.toEqual([]);
  });
});
describe("Overpass mirror failover (T022)", () => {
  it("backs off after a busy mirror and uses the next one", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([{ boundingbox: ["35", "36", "-79", "-78"] }]))
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("gateway", { status: 504 }))
      .mockResolvedValueOnce(Response.json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(searchOsmProspects("mobile detailing", "Durham", "NC", sleep)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000]);
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain("overpass.kumi.systems");
  });

  it("stays unavailable, not empty, when every mirror fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json([{ boundingbox: ["35", "36", "-79", "-78"] }]))
      .mockResolvedValue(new Response("busy", { status: 503 })));
    await expect(searchOsmProspects("mobile detailing", "Durham", "NC", async () => {})).rejects.toThrow("discovery is unavailable");
  });
});
