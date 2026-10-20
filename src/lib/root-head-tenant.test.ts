/**
 * The root <head> must not stamp Revora's own share image, Organization /
 * WebSite records, site verification or Ads consent onto a client page — on
 * any route, including a custom domain's /about, /contact and /pricing — and
 * keeps publisher identity on Revora pages; social images belong to leaf pages.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import { Route } from "@/routes/__root";
import { OG_IMAGE, isClientSiteMatch } from "@/lib/seo";

type Head = {
  meta?: Record<string, unknown>[];
  scripts?: { children?: string }[];
};

const rootHead = (matches: { routeId: string; loaderData?: unknown }[]): Head => {
  const head = Route.options.head as unknown as (ctx: { matches: unknown[] }) => Head;
  return head({ matches });
};

const revoraMarks = (head: Head) => ({
  ogImage: (head.meta ?? []).some((entry) => entry["property"] === "og:image" && entry["content"] === OG_IMAGE.url),
  organization: (head.scripts ?? []).some((script) => String(script.children ?? "").includes('"Organization"')),
  website: (head.scripts ?? []).some((script) => String(script.children ?? "").includes('"WebSite"')),
  verification: (head.meta ?? []).some((entry) => entry["name"] === "google-site-verification"),
  consent: (head.scripts ?? []).some((script) => String(script.children ?? "").includes("gtag('consent'")),
});

const clientSite = { site: { org: { name: "Acme" }, content: { page: { slug: "about" } } } };

describe("root head on client pages", () => {
  it.each(["/about", "/contact", "/pricing", "/", "/$", "/s/$slug", "/s/$slug/$page"])(
    "routeId %s with client site loaderData gets no Revora meta",
    (routeId) => {
      const marks = revoraMarks(rootHead([{ routeId: "__root__" }, { routeId, loaderData: clientSite }]));
      expect(marks).toEqual({ ogImage: false, organization: false, website: false, verification: false, consent: false });
    },
  );

  it.each(["/about", "/contact", "/pricing", "/"])("Revora's own %s (no tenant) keeps Revora meta", (routeId) => {
    const marks = revoraMarks(rootHead([{ routeId: "__root__" }, { routeId, loaderData: null }]));
    expect(marks).toEqual({ ogImage: false, organization: true, website: true, verification: true, consent: true });
  });

  it("treats a custom domain whose site is not yet published as a client address", () => {
    expect(isClientSiteMatch({ routeId: "/", loaderData: { pending: true } })).toBe(true);
    expect(isClientSiteMatch({ routeId: "/about", loaderData: { pending: true } })).toBe(false);
  });

  it("keeps the signed-in builder's draft frame a Revora app surface", () => {
    expect(isClientSiteMatch({ routeId: "/_authenticated/draft/$slug", loaderData: clientSite })).toBe(false);
  });
});
