import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ host: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/site-host.server", () => ({
  resolveHostSite: mocks.host,
  platformOrigin: () => "https://revoragrowthsystems.com",
  sitemapUrls: () => [{ loc: "https://revoragrowthsystems.com", lastmod: null }],
  xmlSitemap: () => "<urlset />",
}));
import { Route as sitemap } from "@/routes/sitemap[.]xml";
import { Route as robots } from "@/routes/robots[.]txt";

type HandlerRoute = { server: { handlers: { GET: (input: { request: Request }) => Promise<Response> } } };
const request = new Request("https://revoragrowthsystems.com/sitemap.xml");
const run = (route: unknown) => (route as HandlerRoute).server.handlers.GET({ request });

beforeEach(() => {
  mocks.host.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("crawler inventories fail honestly", () => {
  it.each([["sitemap", sitemap], ["robots", robots]])("returns retryable uncached 503 for %s lookup errors", async (_name, route) => {
    mocks.host.mockRejectedValue(new Error("lookup unavailable"));
    const response = await run(route);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("advertises only the one live sitemap (the empty /sitemaps/sites.xml index is gone)", async () => {
    const rules = await (await run(robots)).text();
    expect(rules).toContain("Sitemap: https://revoragrowthsystems.com/sitemap.xml");
    expect(rules).not.toContain("/sitemaps/sites.xml");
  });

  it("serves a client host its own crawler rules and sitemap only", async () => {
    mocks.host.mockResolvedValue({ slug: "acme", origin: "https://acme.example", noindex: false, pages: [], publishedAt: null });
    const rules = await (await run(robots)).text();
    expect(rules).toContain("User-agent: GPTBot");
    expect(rules).toContain("User-agent: ClaudeBot");
    expect(rules).toContain("User-agent: PerplexityBot");
    expect(rules).toContain("Sitemap: https://acme.example/sitemap.xml");
    expect(rules).not.toContain("revoragrowthsystems.com");
    expect(rules).not.toContain("Disallow: /app");
  });

  it("tells crawlers to stay out of an offline client host", async () => {
    mocks.host.mockResolvedValue({ slug: "acme", origin: "https://acme.example", noindex: true, pages: [], publishedAt: null });
    const rules = await (await run(robots)).text();
    expect(rules).toContain("Disallow: /");
    expect(rules).not.toContain("Sitemap:");
    expect(rules).not.toMatch(/^Allow: \//m);
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