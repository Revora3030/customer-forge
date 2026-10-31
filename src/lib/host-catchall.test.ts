/**
 * Audit P2-04 / P2-05: the custom-domain catch-all route.
 * - a path deeper than one segment is a 404, never the first segment's page;
 * - a real error and "page not found" are different pages;
 * - the 404 uses the site's body font, not the marketing face.
 */
import { readFileSync } from "node:fs";
import { isNotFound } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getHostSite = vi.fn();
vi.mock("@/lib/host-site.functions", () => ({ getHostSite: (args: unknown) => getHostSite(args) }));

const { Route } = await import("@/routes/$");
type Loader = (ctx: { params: { _splat: string } }) => Promise<unknown>;
const load = (splat: string) => (Route.options.loader as unknown as Loader)({ params: { _splat: splat } });

const site = (sections: unknown[]) => ({
  tenant: true,
  result: {
    slug: "harbor",
    host: "harborline.test",
    via: "custom",
    site: {
      org: { name: "Harbor Line Plumbing", slug: "harbor", id: "o1", industry: "Plumbing" },
      profile: { phone: "(919) 482-7731", font_preference: null },
      content: { page: { slug: "services" }, sections },
    },
  },
});

beforeEach(() => getHostSite.mockReset());

describe("catch-all path handling (audit P2-05)", () => {
  it("returns 404 for /services/anything/else without asking the host lookup", async () => {
    await expect(load("services/anything/else")).rejects.toSatisfy(isNotFound);
    await expect(load("services/x")).rejects.toSatisfy(isNotFound);
    expect(getHostSite).not.toHaveBeenCalled();
  });

  it("still serves /services and /services/", async () => {
    getHostSite.mockResolvedValue(site([{ id: "s1" }]));
    await expect(load("services")).resolves.toMatchObject({ host: "harborline.test" });
    await expect(load("services/")).resolves.toMatchObject({ host: "harborline.test" });
    expect(getHostSite).toHaveBeenCalledWith({ data: { pageSlug: "services" } });
  });

  it("an unpublished page on a known site is a 404 that carries the business name and phone", async () => {
    getHostSite.mockResolvedValue(site([]));
    const error = await load("services").catch((e) => e);
    expect(isNotFound(error)).toBe(true);
    expect((error as { data?: unknown }).data).toMatchObject({ name: "Harbor Line Plumbing", phone: "(919) 482-7731" });
  });

  it("withholds a placeholder phone from the 404 page", async () => {
    const response = site([]);
    response.result.site.profile.phone = "(555) 123-4567";
    getHostSite.mockResolvedValue(response);
    const error = await load("services").catch((e) => e);
    expect((error as { data?: { phone?: unknown } }).data?.phone ?? null).toBeNull();
  });
});

describe("catch-all error and 404 pages (audit P2-04)", () => {
  const source = readFileSync("src/routes/$.tsx", "utf8");
  it("uses a separate ErrorPage for errorComponent", () => {
    expect(source).toMatch(/errorComponent: ErrorPage/);
    expect(source).toMatch(/notFoundComponent: NotFoundPage/);
    expect(source).toContain("This page couldn't load.");
  });
  it("does not use the marketing face on a client's domain", () => {
    expect(source).not.toContain("font-editorial");
    expect(source).toContain("var(--font-body");
  });
});
