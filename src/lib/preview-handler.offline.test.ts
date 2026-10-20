import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      middleware: () => chain,
      validator: (fn: typeof validate) => { validate = fn; return chain; },
      handler: (...args: unknown[]) => {
        const fn = args.at(-1) as (input: unknown) => Promise<unknown>;
        return async (input: { data: unknown }) => fn({ ...input, data: validate(input.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/public-site.server", () => ({ resolvePreviewToken: mocks.resolve, loadSite: mocks.load }));
import { resolveSiteHref } from "./builder/site-chrome";

const TOKEN = "offline_preview_token_123";
const ORG = "11111111-1111-4111-8111-111111111111";
async function handler() {
  const path = "./public-site.functions.ts?server-fn-module-lookup";
  const module = await import(/* @vite-ignore */ path);
  return module["getPreviewSite"] as (input: { data: { token: string; pageSlug?: string } }) => Promise<{ ok: boolean; site: unknown; reason: string | null }>;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Offline fixture forbids external requests"); }));
  mocks.resolve.mockResolvedValue({ ok: true, slug: "fixture", organizationId: ORG, expiresAt: "2026-10-22T00:00:00Z", label: "Fixture" });
  mocks.load.mockResolvedValue({ org: { id: ORG }, content: { page: { slug: "about" }, sections: [{ id: "fixture-section" }] } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("shared preview handler offline", () => {
  it.each(["unknown", "revoked", "expired"])("does not read a draft for a %s token", async (reason) => {
    mocks.resolve.mockResolvedValue({ ok: false, reason });
    const result = await (await handler())({ data: { token: TOKEN } });
    expect(result).toMatchObject({ ok: false, site: null, reason });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("loads the requested unpublished page only after token resolution", async () => {
    const result = await (await handler())({ data: { token: TOKEN, pageSlug: "about" } });
    expect(result.ok).toBe(true);
    expect(mocks.resolve).toHaveBeenCalledWith(TOKEN);
    expect(mocks.load).toHaveBeenCalledWith("fixture", { allowUnpublished: true, pageSlug: "about" });
  });
  it("rejects a draft returned from another workspace", async () => {
    mocks.load.mockResolvedValue({ org: { id: "another-workspace" } });
    expect(await (await handler())({ data: { token: TOKEN } })).toMatchObject({ ok: false, site: null, reason: "unknown" });
  });
  it("does not expose a site with no verifiable workspace identity", async () => {
    mocks.load.mockResolvedValue({ org: {} });
    expect(await (await handler())({ data: { token: TOKEN } })).toMatchObject({ ok: false, site: null });
  });
  it.each([{ token: "short" }, { token: TOKEN, pageSlug: "../private" }])("rejects malformed input before reading data", async (data) => {
    await expect((await handler())({ data })).rejects.toThrow();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("keeps homepage, page and hash navigation on the shared preview", () => {
    const base = `/p/${TOKEN}`;
    const pages = new Set(["home", "about"]);
    expect(resolveSiteHref("/home", "fixture", false, pages, null, base)).toBe(base);
    expect(resolveSiteHref("/about?tab=team#contact", "fixture", false, pages, null, base)).toBe(`${base}/about?tab=team#contact`);
    expect(resolveSiteHref("/s/fixture/about", "fixture", false, pages, null, base)).toBe(`${base}/about`);
  });
});