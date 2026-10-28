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