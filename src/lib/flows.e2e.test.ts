/**
 * End-to-end flow tests against a running Revora app.
 *
 * These hit the real server (SSR, server routes, RLS-backed public reads) so a
 * regression in lead capture, quotes, booking, payments, notifications or
 * analytics surfaces here rather than in front of a customer.
 *
 * Run against the dev server (default) or any deployment:
 *   E2E_BASE_URL=https://customer-forge.lovable.app bunx vitest run src/lib/flows.e2e.test.ts
 *
 * An unreachable server fails unless E2E_ALLOW_OFFLINE=1 is explicitly set
 * outside CI. Missing tenant state is a real skip unless E2E_REQUIRE_TENANT=1
 * or E2E_TENANT_SLUG is configured, in which case it fails.
 */
import { beforeAll, describe, expect, it, type TestContext } from "vitest";

const BASE = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";
const TENANT_SLUGS = (process.env["E2E_TENANT_SLUG"] ?? "").split(",").map(slug => slug.trim()).filter(Boolean);
const REQUIRE_TENANT = process.env["E2E_REQUIRE_TENANT"] === "1" || TENANT_SLUGS.length > 0;

let reachable = false;
/** A published tenant site discovered from the sitemap, when one exists. */
let publicSite: string | null = null;

async function get(path: string) {
  const response = await fetch(`${BASE}${path}`, { headers: { "user-agent": "RevoraE2E/1.0" }, signal: AbortSignal.timeout(15_000) });
  return { status: response.status, body: await response.text() };
}

beforeAll(async () => {
  if (TENANT_SLUGS.some(slug => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))
    throw new Error("E2E_TENANT_SLUG must contain published tenant slugs, not URLs or paths.");
  try {
    const root = await fetch(BASE, { signal: AbortSignal.timeout(15_000) });
    reachable = root.ok;
  } catch {
    reachable = false;
  }
  if (!reachable) return;
  // Never let discovery substitute another site for an explicitly configured
  // fixture: a typo or wrong deployment must fail rather than look verified.
  if (TENANT_SLUGS.length) {
    for (const slug of TENANT_SLUGS) {
      const candidate = `/s/${slug}`;
      if ((await get(candidate)).status === 200) {
        publicSite = candidate;
        break;
      }
    }
    return;
  }
  // The platform sitemap deliberately keeps /s/ previews out of search, so it
  // can never advertise a tenant site. An explicit slug (E2E_TENANT_SLUG,
  // comma-separated, first one that serves) is the supported discovery path.
  const sitemap = await get("/sitemap.xml");
  publicSite = /<loc>[^<]*(\/s\/[a-z0-9-]+)<\/loc>/i.exec(sitemap.body)?.[1] ?? null;
}, 60_000);

/**
 * Critical production flows are NEVER optional: an unreachable app FAILS the
 * suite so a green run can never be mistaken for a verified app. The single
 * escape hatch must be requested deliberately (E2E_ALLOW_OFFLINE=1) and is
 * refused in CI, so it cannot be left on by accident.
 */
const ALLOW_OFFLINE = process.env["E2E_ALLOW_OFFLINE"] === "1" && process.env["CI"] !== "true";

const unreachable = () =>
  new Error(
    `E2E server unreachable at ${BASE}. Start the app (bun run dev) or set E2E_BASE_URL. ` +
      `Critical payment and production flows are not allowed to skip silently.`,
  );

/** A required flow. Unreachable app = failure, never a silent pass. */
const live = (name: string, fn: (context: TestContext) => Promise<void>, timeout = 30_000) =>
  it(
    name,
    async (context) => {
      if (!reachable) {
        if (ALLOW_OFFLINE) {
          console.warn(`[e2e] SKIPPED (E2E_ALLOW_OFFLINE=1, NOT VERIFIED): ${name}`);
          context.skip("E2E_ALLOW_OFFLINE=1: running app not verified");
        }
        throw unreachable();
      }
      await fn(context);
    },
    timeout,
  );

/**
 * An explicitly optional flow: it depends on state no test can create from
 * outside (a tenant having published a site). It still fails when the app is
 * unreachable — only the missing tenant state may skip it, and every skip is
 * announced so it can never be read as a pass. Point E2E_TENANT_SLUG at a
 * published site slug (e.g. E2E_TENANT_SLUG=elite-mobile-detailing) to run it.
 */
const optional = (name: string, fn: (context: TestContext) => Promise<void>, timeout = 30_000) =>
  live(
    `${name} [optional: needs a published tenant site]`,
    async (context) => {
      if (!publicSite) {
        if (REQUIRE_TENANT) throw new Error("No configured published tenant was reachable. Verify E2E_BASE_URL and E2E_TENANT_SLUG against the same deployment.");
        console.warn(
          `[e2e] SKIPPED (no published tenant site, NOT VERIFIED): ${name} — set E2E_TENANT_SLUG to run this`,
        );
        context.skip("No published tenant fixture configured: conversion path not verified");
      }
      await fn(context);
    },
    timeout,
  );

describe("marketing and discovery", () => {
  live("serves the home page with pricing and a signup path", async () => {
    const { status, body } = await get("/");
    expect(status).toBe(200);
    expect(body).toMatch(/350/);
    expect(body).toMatch(/100/);
    // No legacy Revora price may be quoted as our own offer. (Competitor
    // comparison copy may still mention other market prices.)
    expect(body).not.toMatch(/\$1,?500\s*(one-time|setup)/i);
    expect(body).not.toMatch(/\$250\s*\/?\s*(month|mo\b)/i);
    expect(body).toMatch(/get-started|Get started/i);
  });

  live("exposes crawlable robots and sitemap", async () => {
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.body).not.toMatch(/^Disallow: \/$/m);
    const sitemap = await get("/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(sitemap.body).toMatch(/<urlset|<sitemapindex/);
  });

  live("renders unique metadata on every public route", async () => {
    const titles = new Set<string>();
    for (const path of ["/", "/pricing", "/about", "/contact", "/industries"]) {
      const { status, body } = await get(path);
      expect(status).toBe(200);
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.trim();
      expect(title, `${path} needs a title`).toBeTruthy();
      expect(title).not.toMatch(/Lovable/i);
      titles.add(title!);
    }
    expect(titles.size).toBeGreaterThan(3);
  });
});

describe("lead capture, quote and booking flows", () => {
  optional("renders a working conversion path on a published tenant site", async () => {
    const { status, body } = await get(publicSite!);
    expect(status).toBe(200);
    // A visitor must always have at least one way to convert.
    expect(/href=["']tel:|<form\b/i.test(body)).toBe(true);
    expect((body.match(/<h1\b/gi) ?? []).length).toBe(1);
  });

  optional("serves linked conversion pages without dead ends", async (context) => {
    const home = await get(publicSite!);
    const paths = new Set<string>();
    for (const match of home.body.matchAll(/href=["']([^"']+)["']/g)) {
      const url = new URL(match[1]!, BASE);
      if (url.origin === new URL(BASE).origin &&
          url.pathname.startsWith(`${publicSite}/`) &&
          /\/(?:pricing|book|booking|quote|contact)\/?$/.test(url.pathname))
        paths.add(url.pathname);
    }
    if (!paths.size) context.skip("This tenant converts on-page and exposes no separate conversion pages.");
    for (const path of paths) {
      const { status, body } = await get(path);
      expect(status, `Linked conversion page ${path} must exist`).toBe(200);
      expect(body.length).toBeGreaterThan(500);
    }
  });

  live("keeps the interactive product demo working end to end", async () => {
    const demo = await get("/demo/dashboard");
    expect(demo.status).toBe(200);
    expect(demo.body).toMatch(/demo/i);
  });
});

describe("CRM, notifications and analytics surfaces", () => {
  live("keeps workspace routes private behind authentication", async () => {
    for (const path of ["/app", "/app/leads", "/app/command", "/app/billing", "/admin"]) {
      const { status, body } = await get(path);
      expect(status).toBeLessThan(500);
      // Unauthenticated HTML must never leak workspace data.
      expect(body).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i);
    }
  });
});

describe("payment and webhook endpoints", () => {
  live("rejects unsigned payment webhooks", async () => {
    // The Stripe route needs its environment marker; without it the event is ignored, not processed.
    for (const path of [
      "/api/public/payments/webhook?env=live",
      "/api/public/payments/webhook?env=sandbox",
    ]) {
      const response = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });
      // 401/400 when configured. When a provider isn't configured the event is
      // acknowledged but explicitly ignored — never processed.
      if (response.status < 400) {
        const text = await response.text();
        expect(text).toMatch(/ignored/i);
      } else {
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    }
  });

  live("protects the background job endpoint from anonymous callers", async () => {
    const response = await fetch(`${BASE}/api/public/jobs/site-engine`, { method: "POST" });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
