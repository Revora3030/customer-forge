import { describe, expect, it } from "vitest";
import { isLeafMatch, PRIVATE_NO_STORE, privatePreviewHeaders, PUBLIC_SITE_CACHE_CONTROL, publicSiteHeaders } from "@/lib/page-cache";

describe("page cache headers (PR3)", () => {
  it("edge-caches a rendered public site briefly, never in the browser", () => {
    expect(publicSiteHeaders(true)).toEqual({ "cache-control": PUBLIC_SITE_CACHE_CONTROL });
    expect(PUBLIC_SITE_CACHE_CONTROL).toMatch(/^public/);
    expect(PUBLIC_SITE_CACHE_CONTROL).toContain("max-age=0");
    expect(PUBLIC_SITE_CACHE_CONTROL).toContain("s-maxage=60");
    expect(PUBLIC_SITE_CACHE_CONTROL).toContain("stale-while-revalidate=600");
  });
  it("never caches a missing or unpublished site", () => {
    expect(publicSiteHeaders(false)).toEqual({ "cache-control": PRIVATE_NO_STORE });
  });
  it("keeps private previews out of every cache, index and referrer", () => {
    const headers = privatePreviewHeaders();
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(Object.values(headers).join(" ")).not.toMatch(/public|s-maxage/);
  });
  it("lets only the deepest route decide", () => {
    const matches = [{ id: "__root__" }, { id: "/s/$slug" }, { id: "/s/$slug/$page" }];
    expect(isLeafMatch(matches, { id: "/s/$slug/$page" })).toBe(true);
    expect(isLeafMatch(matches, { id: "/s/$slug" })).toBe(false);
    expect(isLeafMatch(matches.slice(0, 2), { id: "/s/$slug" })).toBe(true);
    expect(isLeafMatch(undefined, { id: "x" })).toBe(true);
  });
});

describe("routes use the right headers", () => {
  // Source checks: the route files are TanStack file routes whose options are
  // only reachable through the generated tree, so assert the wiring directly.
  const read = async (path: string) => (await import("node:fs")).readFileSync(path, "utf8");
  it("public site routes are NOT edge-cached until the owner approves it (purge on publish is open)", async () => {
    for (const file of ["src/routes/s.$slug.tsx", "src/routes/s.$slug.$page.tsx", "src/routes/$.tsx", "src/routes/index.tsx"]) {
      const source = await read(file);
      expect(source, file).not.toContain("publicSiteHeaders(");
    }
  });
  it("draft previews are private and no-store", async () => {
    for (const file of ["src/routes/p.$token.tsx", "src/routes/p.$token_.$page.tsx"]) {
      const source = await read(file);
      expect(source, file).toContain("privatePreviewHeaders()");
      expect(source, file).not.toContain("publicSiteHeaders");
    }
  });
});
