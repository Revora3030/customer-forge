import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ host: vi.fn(), slugs: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/site-host.server", () => ({
  resolveHostSite: mocks.host,
  platformSitemapSlugs: mocks.slugs,
  platformOrigin: () => "https://revoragrowthsystems.com",
  sitemapUrls: () => [{ loc: "https://revoragrowthsystems.com", lastmod: null }],
  xmlSitemap: () => "<urlset />",
  xmlSitemapIndex: () => "<sitemapindex />",
}));
import { Route as sitemap } from "@/routes/sitemap[.]xml";
import { Route as robots } from "@/routes/robots[.]txt";
import { Route as index } from "@/routes/sitemaps.sites[.]xml";

type HandlerRoute = { server: { handlers: { GET: (input: { request: Request }) => Promise<Response> } } };
const request = new Request("https://revoragrowthsystems.com/sitemap.xml");
const run = (route: unknown) => (route as HandlerRoute).server.handlers.GET({ request });

beforeEach(() => {
  mocks.host.mockReset().mockResolvedValue(null);
  mocks.slugs.mockReset().mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("crawler inventories fail honestly", () => {
  it.each([["sitemap", sitemap], ["robots", robots], ["site index", index]])("returns retryable uncached 503 for %s lookup errors", async (_name, route) => {
    mocks.host.mockRejectedValue(new Error("lookup unavailable"));
    mocks.slugs.mockRejectedValue(new Error("read unavailable"));
    const response = await run(route);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("allows a genuinely empty published index to return success", async () => {
    expect((await run(index)).status).toBe(200);
  });

  it("preserves private route exclusions in crawler rules", async () => {
    const response = await run(robots);
    expect(response.status).toBe(200);
    const rules = await response.text();
    for (const path of ["/app", "/admin", "/my", "/auth", "/api/", "/_serverFn/"]) {
      expect(rules).toContain(`Disallow: ${path}`);
    }
    expect(rules).not.toMatch(/^Disallow: \/$/m);
  });
});