/**
 * Shared preview links (/p/:token and /p/:token/:page): a dead link or a page
 * the draft does not have must be a real 404 (the loader throws notFound,
 * which TanStack Start answers with HTTP 404), never a 200 soft 404.
 * A live link still loads its draft.
 */
import { isNotFound } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPreviewSite = vi.fn();
const prospectLinkState = vi.fn();
vi.mock("@/lib/public-site.functions", () => ({ getPreviewSite: (a: unknown) => getPreviewSite(a) }));
vi.mock("@/lib/prospect-claim.functions", () => ({ prospectLinkState: (a: unknown) => prospectLinkState(a) }));

const home = await import("@/routes/p.$token");
const sub = await import("@/routes/p.$token_.$page");
type Loader = (ctx: { params: Record<string, string> }) => Promise<unknown>;
const loadHome = (token: string) => (home.Route.options.loader as unknown as Loader)({ params: { token } });
const loadPage = (token: string, page: string) =>
  (sub.Route.options.loader as unknown as Loader)({ params: { token, page } });

const live = (sections: unknown[], pageFound = true) => ({
  ok: true,
  label: "shared",
  site: { org: { id: "o1", name: "Harbor" }, pageFound, content: { sections } },
});

beforeEach(() => {
  getPreviewSite.mockReset();
  prospectLinkState.mockReset().mockResolvedValue({ isProspect: false });
});

describe("/p/:token", () => {
  it("throws notFound (HTTP 404) for an unknown token", async () => {
    getPreviewSite.mockResolvedValue({ ok: false, reason: "unknown" });
    await expect(loadHome("nope")).rejects.toSatisfy(isNotFound);
  });
  it("throws notFound for expired and revoked links, carrying the reason", async () => {
    for (const reason of ["expired", "revoked"]) {
      getPreviewSite.mockResolvedValue({ ok: false, reason });
      await expect(loadHome("old")).rejects.toMatchObject({ data: { reason } });
    }
  });
  it("still loads a valid link", async () => {
    getPreviewSite.mockResolvedValue(live([{ id: "s1" }]));
    await expect(loadHome("good")).resolves.toMatchObject({ result: { ok: true } });
    expect(prospectLinkState).not.toHaveBeenCalled();
  });
  it("expired and invalid tokens show the item-18 expired page with /get-started", () => {
    const expired = home.deadPreviewCopy({ reason: "expired", isProspect: true });
    const invalid = home.deadPreviewCopy({ reason: "unknown", isProspect: false });
    expect(expired.title).toBe("This preview has expired");
    expect(invalid.title).toBe("This preview has expired");
    expect(expired.href).toBe("/get-started");
    expect(invalid.href).toBe("/get-started");
  });
});

describe("/p/:token/:page", () => {
  it("throws notFound for an unknown token", async () => {
    getPreviewSite.mockResolvedValue({ ok: false, reason: "unknown" });
    await expect(loadPage("nope", "services")).rejects.toSatisfy(isNotFound);
  });
  it("throws notFound for a page the draft does not have", async () => {
    getPreviewSite.mockResolvedValue(live([], false));
    await expect(loadPage("good", "nope")).rejects.toMatchObject({ data: { reason: "page" } });
  });
  it("still loads a valid page", async () => {
    getPreviewSite.mockResolvedValue(live([{ id: "s1" }]));
    await expect(loadPage("good", "services")).resolves.toMatchObject({ ok: true });
  });
});
