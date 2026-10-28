import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  org: { id: "org-1", name: "Shine", slug: "shine-co", industry: null, is_demo: false } as Record<string, unknown> | null,
  live: true,
  lastSubmittedAt: null as string | null,
  address: { custom_domain: null as string | null, dns_ok: false, ssl_ok: false },
  inserted: [] as Record<string, unknown>[],
};

vi.mock("@/integrations/supabase/client.server", () => {
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "limit"]) chain[name] = () => chain;
    chain["maybeSingle"] = async () =>
      table === "audit_logs"
        ? { data: state.lastSubmittedAt ? { created_at: state.lastSubmittedAt } : null, error: null }
        : { data: state.address, error: null };
    chain["insert"] = async (row: Record<string, unknown>) => {
      state.inserted.push(row);
      return { error: null };
    };
    return chain;
  };
  return { supabaseAdmin: { from: query } };
});

vi.mock("@/lib/public-site.server", () => ({
  publicOrganization: async () => state.org,
  siteIsLive: async () => state.live,
}));

vi.mock("@/lib/site-host.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/site-host.server")>("@/lib/site-host.server");
  return {
    ...actual,
    tenantSitemapPages: async () => ({ pages: [{ slug: "services", updatedAt: null }], publishedAt: "2026-10-28T00:00:00.000Z" }),
  };
});

import {
  SITE_INDEXNOW_ACTION,
  SITE_INDEXNOW_COOLDOWN_MS,
  siteIndexNowDue,
  siteIndexNowTarget,
  submitPublishedSiteToIndexNow,
} from "@/lib/indexnow-site.server";
import { sitemapUrls } from "@/lib/site-host.server";

const now = Date.parse("2026-10-28T12:00:00.000Z");
const okFetch = () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
};

beforeEach(() => {
  state.org = { id: "org-1", name: "Shine", slug: "shine-co", industry: null, is_demo: false };
  state.live = true;
  state.lastSubmittedAt = null;
  state.address = { custom_domain: null, dns_ok: false, ssl_ok: false };
  state.inserted = [];
});

describe("siteIndexNowTarget", () => {
  const pages = [{ slug: "services", updatedAt: null }];
  it("uses the verified custom domain as both the key host and the page host", () => {
    const target = siteIndexNowTarget({ slug: "shine-co", domain: "shine.com", pages, publishedAt: null, sitemapUrls });
    expect(target.hostOrigin).toBe("https://shine.com");
    expect(target.urls).toEqual(["https://shine.com", "https://shine.com/services"]);
  });

  it("lists a site without its own domain under /s/<slug>, with the platform root owning the key", () => {
    const target = siteIndexNowTarget({ slug: "shine-co", domain: null, pages, publishedAt: null, sitemapUrls });
    expect(target.hostOrigin).toBe("https://revoragrowthsystems.com");
    expect(target.urls).toEqual(["https://revoragrowthsystems.com/s/shine-co", "https://revoragrowthsystems.com/s/shine-co/services"]);
  });
});

describe("siteIndexNowDue", () => {
  it("allows the first submission and one per cooldown after that", () => {
    expect(siteIndexNowDue(null, now)).toBe(true);
    expect(siteIndexNowDue(new Date(now - 60_000).toISOString(), now)).toBe(false);
    expect(siteIndexNowDue(new Date(now - SITE_INDEXNOW_COOLDOWN_MS).toISOString(), now)).toBe(true);
    expect(siteIndexNowDue("not a date", now)).toBe(true);
  });
});

describe("submitPublishedSiteToIndexNow", () => {
  it("submits the published pages with the key location on the owning host, and records it", async () => {
    state.address = { custom_domain: "shine.com", dns_ok: true, ssl_ok: true };
    const { calls, fetcher } = okFetch();
    const result = await submitPublishedSiteToIndexNow("org-1", fetcher, now);
    expect(result).toMatchObject({ ok: true, submitted: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.indexnow.org/indexnow");
    expect(calls[0]!.body).toMatchObject({ host: "shine.com", keyLocation: "https://shine.com/indexnow-key.txt", urlList: ["https://shine.com", "https://shine.com/services"] });
    expect(state.inserted[0]).toMatchObject({ organization_id: "org-1", action: SITE_INDEXNOW_ACTION });
  });

  it("ignores an unverified custom domain and uses the platform address", async () => {
    state.address = { custom_domain: "shine.com", dns_ok: true, ssl_ok: false };
    const { calls, fetcher } = okFetch();
    await submitPublishedSiteToIndexNow("org-1", fetcher, now);
    expect(calls[0]!.body).toMatchObject({ host: "revoragrowthsystems.com", keyLocation: "https://revoragrowthsystems.com/indexnow-key.txt" });
  });

  it("never submits a demo site, a site that is not live, or twice inside the cooldown", async () => {
    const { calls, fetcher } = okFetch();
    state.org = { ...state.org!, is_demo: true };
    expect((await submitPublishedSiteToIndexNow("org-1", fetcher, now)).submitted).toBe(0);
    state.org = { ...state.org!, is_demo: false };
    state.live = false;
    expect((await submitPublishedSiteToIndexNow("org-1", fetcher, now)).submitted).toBe(0);
    state.live = true;
    state.lastSubmittedAt = new Date(now - 5 * 60_000).toISOString();
    expect((await submitPublishedSiteToIndexNow("org-1", fetcher, now)).submitted).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("never throws when IndexNow cannot be reached", async () => {
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(submitPublishedSiteToIndexNow("org-1", failing, now)).resolves.toMatchObject({ ok: false, submitted: 0 });
  });
});
