import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/public-site.functions", () => ({ getPublicSite: vi.fn(), trackPublicEvent: vi.fn() }));
vi.mock("@/routes/s.$slug.$page", () => ({ SitePageView: () => null }));
vi.mock("@/lib/site-head", () => ({ tenantSiteHead: (input: { canonical: string }) => ({ canonical: input.canonical }) }));
import { Route } from "@/routes/s.$slug";

type HeadInput = { params: { slug: string }; loaderData: { settings: { custom_domain?: string; dns_ok?: boolean; ssl_ok?: boolean }; content: { page: { slug: string; kind: string; seo_canonical?: string } } } };
const head = Route.options.head as unknown as (input: HeadInput) => { canonical: string };

describe("public home canonical uses served root, not stored home slug", () => {
  it("keeps an AI-named home page on the platform root address", () => {
    expect(head({ params: { slug: "acme" }, loaderData: { settings: {}, content: { page: { slug: "welcome", kind: "home" } } } }).canonical).toBe("https://revoragrowthsystems.com/s/acme");
  });
  it("preserves verified domain ownership", () => {
    expect(head({ params: { slug: "acme" }, loaderData: { settings: { custom_domain: "acme.example", dns_ok: true, ssl_ok: true }, content: { page: { slug: "welcome", kind: "home" } } } }).canonical).toBe("https://acme.example");
  });
  it("preserves an owner's explicit canonical", () => {
    expect(head({ params: { slug: "acme" }, loaderData: { settings: {}, content: { page: { slug: "welcome", kind: "home", seo_canonical: "https://owned.example/" } } } }).canonical).toBe("https://owned.example/");
  });
});