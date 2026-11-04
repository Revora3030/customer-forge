import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isNeverCached,
  OWNER_PWA_OFFLINE_PAGE,
  OWNER_PWA_SCOPE,
  ownerPwaOptions,
} from "./owner-pwa-config";

type Matcher = (ctx: { url: URL; request: { mode: string }; sameOrigin: boolean }) => boolean;
const ORIGIN = "https://revoragrowthsystems.com";
const rules = ownerPwaOptions.workbox?.runtimeCaching ?? [];

function firstMatch(href: string, mode = "cors") {
  const url = new URL(href);
  const ctx = { url, request: { mode }, sameOrigin: url.origin === ORIGIN };
  return rules.find((rule) => (rule.urlPattern as Matcher)(ctx));
}

describe("owner dashboard PWA service worker policy", () => {
  it("is scoped to the owner dashboard and uses a prompt-based update", () => {
    expect(OWNER_PWA_SCOPE).toBe("/app/");
    expect(ownerPwaOptions.scope).toBe("/app/");
    expect(ownerPwaOptions.registerType).toBe("prompt");
    expect(ownerPwaOptions.injectRegister).toBe(false);
    expect(ownerPwaOptions.workbox?.skipWaiting).toBe(false);
  });

  it("precaches only the static offline page and brand icons, never server HTML", () => {
    const patterns = ownerPwaOptions.workbox?.globPatterns ?? [];
    expect(patterns).toContain("app-offline.html");
    for (const pattern of patterns) {
      expect(pattern === "app-offline.html" || /\.png$/.test(pattern)).toBe(true);
    }
    expect(ownerPwaOptions.workbox?.navigateFallback).toBeNull();
    expect(existsSync(resolve(process.cwd(), "public", OWNER_PWA_OFFLINE_PAGE.slice(1)))).toBe(
      true,
    );
  });

  it("sends every dashboard navigation to the network (never cached)", () => {
    for (const path of ["/app", "/app/leads", "/app/quotes?id=1"]) {
      const rule = firstMatch(`${ORIGIN}${path}`, "navigate");
      expect(rule?.handler).toBe("NetworkOnly");
      expect(rule?.options?.precacheFallback?.fallbackURL).toBe(OWNER_PWA_OFFLINE_PAGE);
    }
  });

  it("never caches Supabase, server functions or API responses", () => {
    const urls = [
      "https://smqngrtayopyirrqcbhq.supabase.co/rest/v1/leads?select=*",
      "https://smqngrtayopyirrqcbhq.supabase.co/auth/v1/token",
      "https://smqngrtayopyirrqcbhq.supabase.co/storage/v1/object/x",
      `${ORIGIN}/_serverFn/abc`,
      `${ORIGIN}/api/public/leads`,
    ];
    for (const href of urls) {
      expect(isNeverCached(href)).toBe(true);
      const rule = firstMatch(href);
      expect(rule?.handler).toBe("NetworkOnly");
    }
  });

  it("caches only same-origin content-hashed /assets/ files", () => {
    expect(firstMatch(`${ORIGIN}/assets/index-abc123.js`)?.handler).toBe("CacheFirst");
    expect(firstMatch("https://cdn.example.com/assets/x.js")).toBeUndefined();
    expect(isNeverCached(`${ORIGIN}/assets/index-abc123.js`)).toBe(false);
  });

  it("keeps the installable manifest scoped to the dashboard in the dark-obsidian theme", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/routes/manifest[.]webmanifest.ts"),
      "utf8",
    );
    expect(src).toContain('start_url: "/app"');
    expect(src).toContain('scope: "/app"');
    expect(src).toContain('theme_color: "#0A0A0C"');
    expect(src).toContain('background_color: "#0A0A0C"');
  });

  it("registers the service worker only from the authenticated app shell", () => {
    const shell = readFileSync(resolve(process.cwd(), "src/routes/_authenticated/app.tsx"), "utf8");
    expect(shell).toContain("<OwnerPwaUpdatePrompt />");
    const root = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
    expect(root).not.toContain("OwnerPwaUpdatePrompt");
  });
});
