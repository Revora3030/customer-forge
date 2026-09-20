/**
 * The Google adapters must never invent data and never guess which verified
 * property to read. These tests pin both promises, plus the plain-language
 * failures Revora shows when the account isn't authorized.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gateway = () => import("@/lib/integrations/google.server");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("google search console adapter", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env["LOVABLE_API_KEY"] = "lovable-key";
    process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"] = "connection-key";
    process.env["GOOGLE_MAPS_API_KEY"] = "maps-key";
    const { resetLocalListingCache } = await gateway();
    resetLocalListingCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops unverified properties and never guesses between two matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          siteEntry: [
            { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
            { siteUrl: "https://example.com/", permissionLevel: "siteFullUser" },
            { siteUrl: "https://other.com/", permissionLevel: "siteOwner" },
            { siteUrl: "https://unverified.example.com/", permissionLevel: "siteUnverifiedUser" },
          ],
        }),
      ),
    );
    const { resolveProperty } = await gateway();
    const resolution = await resolveProperty("https://example.com/pricing");
    expect(resolution).toEqual({
      status: "selection_required",
      candidates: ["sc-domain:example.com", "https://example.com/"],
    });
  });

  it("refuses a chosen property that isn't verified for the site", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] }),
      ),
    );
    const { resolveProperty } = await gateway();
    await expect(resolveProperty("https://example.com/", "sc-domain:someone-else.com")).rejects.toThrow(
      /isn't verified/i,
    );
  });

  it("reports no data instead of inventing rows, and attaches the previous period", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        return call === 1
          ? jsonResponse({
              rows: [{ keys: ["https://example.com/", "roof repair"], clicks: 4, impressions: 220, position: 7.4 }],
            })
          : jsonResponse({
              rows: [{ keys: ["https://example.com/", "roof repair"], clicks: 9, impressions: 150 }],
            });
      }),
    );
    const { searchPerformance } = await gateway();
    const performance = await searchPerformance("https://example.com/");
    expect(performance.rows).toEqual([
      {
        page: "https://example.com/",
        query: "roof repair",
        clicks: 4,
        impressions: 220,
        position: 7.4,
        previous: { clicks: 9, impressions: 150 },
      },
    ]);
    expect(Date.parse(performance.fetchedAt)).toBeGreaterThan(0);
  });

  it("explains an access failure without retrying or guessing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));
    const { verifiedProperties, GoogleDataError } = await gateway();
    await expect(verifiedProperties()).rejects.toBeInstanceOf(GoogleDataError);
  });

  it("says the account isn't connected when no credentials are present", async () => {
    delete process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
    vi.resetModules();
    const { verifiedProperties } = await gateway();
    await expect(verifiedProperties()).rejects.toThrow(/isn't connected/i);
  });
});

describe("google maps listing adapter", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env["LOVABLE_API_KEY"] = "lovable-key";
    process.env["GOOGLE_MAPS_API_KEY"] = "maps-key";
    const { resetLocalListingCache } = await gateway();
    resetLocalListingCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only fields Google returned, and bills Google once per six hours", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        places: [
          { displayName: { text: "Apex Roofing" }, formattedAddress: "1 High St", rating: 4.8 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { localListings } = await gateway();
    const first = await localListings("Apex Roofing Leeds");
    expect(first[0]).toMatchObject({
      name: "Apex Roofing",
      address: "1 High St",
      phone: null,
      website: null,
      rating: 4.8,
      reviewCount: null,
    });
    await localListings("apex roofing leeds");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
