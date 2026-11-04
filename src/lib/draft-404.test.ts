import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { applyDraft404, draftSlugFromPath } from "./draft-404";

const html = () => new Response("<html>shell</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-keep": "1" } });
const req = (path: string, method = "GET") => new Request(`https://revoragrowthsystems.com${path}`, { method });

describe("draft address 404", () => {
  it("reads the slug from home and inner draft paths only", () => {
    expect(draftSlugFromPath("/draft/acme-roofing")).toBe("acme-roofing");
    expect(draftSlugFromPath("/draft/acme-roofing/services")).toBe("acme-roofing");
    expect(draftSlugFromPath("/draft/acme-roofing/")).toBe("acme-roofing");
    expect(draftSlugFromPath("/s/acme-roofing")).toBeNull();
    expect(draftSlugFromPath("/draft/a/b/c")).toBeNull();
    expect(draftSlugFromPath("/draft/Bad_Slug")).toBeNull();
  });

  it("answers 404 with the same shell and headers for an unknown business", async () => {
    const res = await applyDraft404(req("/draft/nope/about"), html(), async () => false);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-keep")).toBe("1");
    expect(await res.text()).toBe("<html>shell</html>");
  });

  it("keeps 200 for an existing business, so signed-in previews still load", async () => {
    const exists = vi.fn(async () => true);
    const res = await applyDraft404(req("/draft/acme"), html(), exists);
    expect(res.status).toBe(200);
    expect(exists).toHaveBeenCalledWith("acme");
  });

  it("fails open: a lookup error or unknown answer never turns into 404", async () => {
    expect((await applyDraft404(req("/draft/acme"), html(), async () => null)).status).toBe(200);
    expect((await applyDraft404(req("/draft/acme"), html(), async () => { throw new Error("db down"); })).status).toBe(200);
  });

  it("leaves non-draft paths, non-HTML, non-200 and non-GET responses alone without a lookup", async () => {
    const exists = vi.fn(async () => false);
    expect((await applyDraft404(req("/pricing"), html(), exists)).status).toBe(200);
    expect((await applyDraft404(req("/draft/x", "POST"), html(), exists)).status).toBe(200);
    expect((await applyDraft404(req("/draft/x"), new Response("{}", { headers: { "content-type": "application/json" } }), exists)).status).toBe(200);
    expect((await applyDraft404(req("/draft/x"), new Response("x", { status: 302, headers: { "content-type": "text/html" } }), exists)).status).toBe(302);
    expect(exists).not.toHaveBeenCalled();
  });

  it("is wired into the server entry and the lookup reads only the organization id", () => {
    const entry = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    expect(entry).toMatch(/applyDraft404\(request, response, organizationSlugExists\)/);
    const lookup = readFileSync(new URL("./draft-404.server.ts", import.meta.url), "utf8");
    expect(lookup).toMatch(/\.from\("organizations"\)\.select\("id"\)/);
  });
});
