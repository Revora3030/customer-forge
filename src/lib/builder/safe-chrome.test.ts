import { describe, expect, it, vi } from "vitest";

process.env["CHROME_RETRY_PAUSE_MS"] = "0";

vi.mock("@/lib/ai/hall-of-fame.server", () => ({
  callBestThinker: async () => ({ ok: false, reason: "unavailable" }),
}));

import { composeSiteChrome } from "./first-build-chrome.server";
import { readSiteChrome } from "./site-chrome";

function fakeDb() {
  const saved: { generation?: unknown } = {};
  const pages = [
    { slug: "home", title: "Home", kind: "home" },
    { slug: "services", title: "Services", kind: "page" },
    { slug: "book", title: "Book now", kind: "page" },
  ];
  return {
    saved,
    pages,
    from(table: string) {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: table === "website_pages" ? pages : [], error: null }),
        maybeSingle: async () => ({ data: { generation: {} }, error: null }),
        upsert: async (row: { generation: unknown }) => {
          saved.generation = row.generation;
          return { error: null };
        },
      });
      return chain;
    },
  };
}

describe("site chrome without the AI team", () => {
  it("never writes a generic menu or footer: the build stops with a retry message", async () => {
    const db = fakeDb();
    await expect(
      composeSiteChrome({
        db: db as never,
        organizationId: "org",
        businessName: "Acme Roofing",
        facts: { phone: "(555) 010-0199", email: "hi@acme.test", serviceArea: "Raleigh" } as never,
        lookSummary: "{}",
      }),
    ).rejects.toThrow(/menu and footer design.*try the build again/i);
    expect(db.saved.generation).toBeUndefined();
    expect(readSiteChrome(db.saved.generation).header).toBeNull();
  });
});
