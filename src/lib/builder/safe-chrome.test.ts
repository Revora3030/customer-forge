import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/hall-of-fame.server", () => ({
  callBestThinker: async () => ({ ok: false, reason: "unavailable" }),
}));

import { composeSiteChrome } from "./first-build-chrome.server";
import { readSiteChrome, collectHrefs, requiredChromeLinks } from "./site-chrome";

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

describe("fallback site chrome", () => {
  it("is valid, renderable and links to every page plus the enquiry page", async () => {
    const db = fakeDb();
    await composeSiteChrome({
      db: db as never,
      organizationId: "org",
      businessName: "Acme Roofing",
      facts: { phone: "(555) 010-0199", email: "hi@acme.test", serviceArea: "Raleigh" } as never,
      lookSummary: "{}",
    });
    const chrome = readSiteChrome(db.saved.generation);
    expect(chrome.header).not.toBeNull();
    expect(chrome.footer).not.toBeNull();
    const required = requiredChromeLinks(db.pages);
    for (const tree of [chrome.header!, chrome.footer!]) {
      const hrefs = collectHrefs(tree);
      for (const href of required) expect(hrefs.has(href)).toBe(true);
    }
    expect(collectHrefs(chrome.header!).has("/book")).toBe(true);
  });
});
