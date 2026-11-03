import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: unknown; [k: string]: unknown }) => (
    <a href={to} {...(rest as object)}>
      {children as never}
    </a>
  ),
  useRouterState: () => "/",
}));
vi.mock("@/lib/auth-session", () => ({ useSession: () => ({ loading: true, user: null }) }));
vi.mock("@/lib/use-tenant", () => ({ useSignOut: () => () => undefined }));
vi.mock("@/components/marketing/ConversionKit", () => ({ MarketingConversionKit: () => null }));
vi.mock("@/components/marketing/VisitorJarvisLazy", () => ({ VisitorJarvis: () => null }));
vi.mock("@/components/marketing/ScrollReveal", () => ({ ScrollReveal: () => null }));
vi.mock("@/components/marketing/AuthButtons", () => ({
  AuthActions: () => null,
  SIGN_IN_SEARCH: {},
  SIGN_UP_SEARCH: {},
}));

import { SiteFooter } from "@/components/marketing/Chrome";
import { FOOTER_DISCOVERY_GROUPS } from "@/lib/footer-links";
import { indexablePlatformEntries } from "@/lib/seo-intent";

const allLinks = FOOTER_DISCOVERY_GROUPS.flatMap((g) => g.links);

describe("marketing footer discovery links", () => {
  const html = renderToStaticMarkup(<SiteFooter />);

  it("renders every link as a plain, crawlable <a href> in the server-rendered footer", () => {
    for (const link of allLinks) {
      expect(html, link.to).toContain(`href="${link.to}"`);
    }
    for (const group of FOOTER_DISCOVERY_GROUPS) {
      expect(html).toContain(`aria-label="${group.heading.replace(/&/g, "&amp;")}"`);
    }
  });

  it("covers the five /compare pages and the website audit that were not indexed", () => {
    for (const slug of ["wix", "squarespace", "diy-website-builder", "buying-leads", "hiring-office-help"]) {
      expect(allLinks.map((l) => l.to)).toContain(`/compare/revora-vs-${slug}`);
    }
    // /website-audit is already a sitewide footer link; it must stay, once.
    expect(html.match(/href="\/website-audit"/g)?.length).toBe(1);
  });

  it("links only live pages: each path is an indexable sitemap page with a route file", () => {
    const sitemapPaths = new Set(indexablePlatformEntries().map((e) => e.path));
    for (const link of allLinks) {
      expect(sitemapPaths.has(link.to), `${link.to} is not a live indexable page`).toBe(true);
      const [, section] = link.to.split("/");
      const routeFile =
        section === "local"
          ? "local.$industry.index.tsx"
          : section === "locations"
            ? "locations.$city.tsx"
            : `${section}.${section === "states" ? "$state" : section === "crm" ? "$trade" : "$slug"}.tsx`;
      expect(existsSync(`src/routes/${routeFile}`), `route file ${routeFile}`).toBe(true);
    }
  });

  it("is capped and has no duplicate or already-present links", () => {
    expect(allLinks.length).toBeLessThanOrEqual(24);
    const paths = allLinks.map((l) => l.to);
    expect(new Set(paths).size).toBe(paths.length);
    // None of these are in the pre-existing footer groups in Chrome.tsx.
    const chrome = readFileSync("src/components/marketing/Chrome.tsx", "utf8");
    const existing = [...chrome.matchAll(/to: "(\/[^"]*)"/g)].map((m) => m[1]);
    for (const p of paths) expect(existing).not.toContain(p);
  });
});
