import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #23 — visitors are served the last published copy, never draft edits.
 */
const state: { version: Record<string, unknown> | null } = { version: null };

vi.mock("@/integrations/supabase/client.server", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: state.version, error: null }),
  });
  return { supabaseAdmin: { from: () => chain } };
});

import { loadLiveSnapshot } from "./public-site.server";

describe("loadLiveSnapshot", () => {
  beforeEach(() => {
    state.version = null;
  });

  it("returns the published pages tree when the version is a live snapshot", async () => {
    state.version = {
      id: "v1",
      version: 3,
      published_at: "2026-10-01T00:00:00Z",
      seo: { title: "Live" },
      generation: {},
      pages: { live_format: 1, settings_pages: null, pages: [{ id: "p1", slug: "home", kind: "home", sections: [] }] },
    };
    const live = await loadLiveSnapshot("org");
    expect(live?.version).toBe(3);
    expect(live?.pages[0]?.["slug"]).toBe("home");
  });

  it("ignores versions saved before live snapshots existed, so old sites are not rolled back", async () => {
    state.version = { id: "v0", version: 1, published_at: "2026-09-01T00:00:00Z", pages: { pages: [] } };
    expect(await loadLiveSnapshot("org")).toBeNull();
  });

  it("returns null when nothing was published", async () => {
    expect(await loadLiveSnapshot("org")).toBeNull();
  });
});
