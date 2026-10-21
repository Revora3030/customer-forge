import { describe, expect, it } from "vitest";
import { DEFAULT_TARGET, resolveAllowedTarget } from "./jarvis-target-url";
import { buildPageSpeedUrl, normalizeStrategy } from "./jarvis-pagespeed";
import { browserCheckHasProblems, summarizeBrowserCheck } from "./jarvis-browser-check";
import { buildDocsUrl, cleanDocsQuery, pickLibraryId } from "./jarvis-docs-lookup";

const verified = async (h: string) => h === "shinedup.com";

describe("Jarvis page-check allow-list", () => {
  it("defaults to the Revora homepage", async () => {
    expect(await resolveAllowedTarget(undefined, verified)).toBe(DEFAULT_TARGET);
  });
  it("allows Revora pages and verified customer domains", async () => {
    expect(await resolveAllowedTarget("https://revoragrowthsystems.com/states", verified)).toBe("https://revoragrowthsystems.com/states");
    expect(await resolveAllowedTarget("https://shinedup.com/", verified)).toBe("https://shinedup.com/");
  });
  it("rejects other hosts, http, ports and credentials", async () => {
    for (const bad of ["https://evil.com/", "http://revoragrowthsystems.com/", "https://revoragrowthsystems.com:8443/", "https://a:b@revoragrowthsystems.com/", "https://169.254.169.254/", "javascript:alert(1)"]) {
      expect(await resolveAllowedTarget(bad, verified)).toBeNull();
    }
  });
});

describe("Lighthouse options", () => {
  it("uses the chosen target and desktop strategy", () => {
    const u = new URL(buildPageSpeedUrl(undefined, "https://shinedup.com/", normalizeStrategy("desktop")));
    expect(u.searchParams.get("url")).toBe("https://shinedup.com/");
    expect(u.searchParams.get("strategy")).toBe("desktop");
    expect(normalizeStrategy("anything")).toBe("mobile");
  });
});

describe("Live page check", () => {
  it("flags script errors and overflow, passes a clean page", () => {
    const clean = summarizeBrowserCheck({ viewports: [{ viewport: "phone", httpStatus: 200, scriptErrors: [], failedRequests: [], brokenLinks: [], horizontalOverflowPx: 0 }] }, DEFAULT_TARGET)!;
    expect(browserCheckHasProblems(clean)).toBe(false);
    const bad = summarizeBrowserCheck({ viewports: [{ viewport: "phone", httpStatus: 200, scriptErrors: ["x is undefined"], horizontalOverflowPx: 40 }] }, DEFAULT_TARGET)!;
    expect(browserCheckHasProblems(bad)).toBe(true);
  });
  it("treats a missing page load as a problem and junk as unparseable", () => {
    const noLoad = summarizeBrowserCheck({ viewports: [{ viewport: "desktop", httpStatus: null }] }, DEFAULT_TARGET)!;
    expect(browserCheckHasProblems(noLoad)).toBe(true);
    expect(summarizeBrowserCheck({}, DEFAULT_TARGET)).toBeNull();
  });
});

describe("Docs lookup", () => {
  it("splits library and topic", () => {
    expect(cleanDocsQuery("tanstack start: server functions")).toEqual({ library: "tanstack start", topic: "server functions" });
    expect(cleanDocsQuery("")).toBeNull();
  });
  it("builds a docs URL with topic and picks the first library", () => {
    const u = new URL(buildDocsUrl("/tanstack/router", "loaders"));
    expect(u.pathname).toBe("/api/v1/tanstack/router");
    expect(u.searchParams.get("topic")).toBe("loaders");
    expect(pickLibraryId({ results: [{ id: "/tanstack/router", title: "TanStack Router" }] })?.id).toBe("/tanstack/router");
    expect(pickLibraryId({ results: [] })).toBeNull();
  });
});
