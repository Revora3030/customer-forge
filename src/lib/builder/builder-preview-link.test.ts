import { describe, expect, it } from "vitest";
import {
  BUILDER_PREVIEW_LABEL,
  BUILDER_PREVIEW_REFRESH_MS,
  builderFrameSource,
  builderPreviewPath,
  builderTokenStorageKey,
  isBuilderPreviewLabel,
  isFreshBuilderToken,
  readCachedBuilderToken,
  withoutBuilderLinks,
  writeCachedBuilderToken,
} from "@/lib/builder/builder-preview-link";

const TOKEN = "abcdefghij0123456789KLMNOP";
const NOW = Date.parse("2026-11-01T12:00:00Z");

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe("builder preview link", () => {
  it("fits the share-link label limit and is recognised exactly", () => {
    expect(BUILDER_PREVIEW_LABEL.length).toBeLessThanOrEqual(120);
    expect(isBuilderPreviewLabel(BUILDER_PREVIEW_LABEL)).toBe(true);
    expect(isBuilderPreviewLabel(` ${BUILDER_PREVIEW_LABEL} `)).toBe(true);
    expect(isBuilderPreviewLabel("For Sam")).toBe(false);
    expect(isBuilderPreviewLabel(null)).toBe(false);
  });
  it("hides the builder's own link from the owner's share list", () => {
    const links = [{ id: "1", label: "For Sam" }, { id: "2", label: BUILDER_PREVIEW_LABEL }, { id: "3", label: null }];
    expect(withoutBuilderLinks(links).map((l) => l.id)).toEqual(["1", "3"]);
  });
  it("builds /p addresses for home and inner pages", () => {
    expect(builderPreviewPath(TOKEN, "home")).toBe(`/p/${TOKEN}`);
    expect(builderPreviewPath(TOKEN, null)).toBe(`/p/${TOKEN}`);
    expect(builderPreviewPath(TOKEN, "about-us")).toBe(`/p/${TOKEN}/about-us`);
  });
  it("uses the server-rendered preview only when a link exists and no build runs", () => {
    const draftPath = "/draft/acme-plumbing";
    expect(builderFrameSource({ draftPath, token: TOKEN, pageSlug: "home", buildActive: false })).toBe(`/p/${TOKEN}`);
    expect(builderFrameSource({ draftPath, token: TOKEN, pageSlug: "home", buildActive: true })).toBe(draftPath);
    expect(builderFrameSource({ draftPath, token: null, pageSlug: "home", buildActive: false })).toBe(draftPath);
  });
  it("only trusts a well-formed token with time to spare", () => {
    const later = (ms: number) => new Date(NOW + ms).toISOString();
    expect(isFreshBuilderToken({ token: TOKEN, expiresAt: later(2 * 3600_000) }, NOW)).toBe(true);
    expect(isFreshBuilderToken({ token: TOKEN, expiresAt: later(BUILDER_PREVIEW_REFRESH_MS - 1) }, NOW)).toBe(false);
    expect(isFreshBuilderToken({ token: "../x", expiresAt: later(2 * 3600_000) }, NOW)).toBe(false);
    expect(isFreshBuilderToken({ token: TOKEN, expiresAt: "soon" }, NOW)).toBe(false);
    expect(isFreshBuilderToken(null, NOW)).toBe(false);
  });
  it("caches per workspace and drops stale entries", () => {
    const storage = memoryStorage();
    const fresh = { token: TOKEN, expiresAt: new Date(NOW + 4 * 3600_000).toISOString() };
    writeCachedBuilderToken(storage, "org-1", fresh);
    expect(readCachedBuilderToken(storage, "org-1", NOW)).toEqual(fresh);
    expect(readCachedBuilderToken(storage, "org-2", NOW)).toBeNull();
    expect(readCachedBuilderToken(storage, "org-1", NOW + 4 * 3600_000)).toBeNull();
    expect(storage.data.has(builderTokenStorageKey("org-1"))).toBe(false);
    storage.setItem(builderTokenStorageKey("org-3"), "{not json");
    expect(readCachedBuilderToken(storage, "org-3", NOW)).toBeNull();
    expect(readCachedBuilderToken(null, "org-1", NOW)).toBeNull();
  });
});
