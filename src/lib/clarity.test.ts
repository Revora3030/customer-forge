import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("isClarityPath", () => {
  it("allows public marketing pages", async () => {
    const { isClarityPath } = await import("./clarity");
    for (const path of ["/", "/pricing", "/get-started", "/about", "/guides/some-post", "/industries/hvac", "/locations/austin", "/compare/wix", "/crm/plumbers", "/crm-for-contractors", "/privacy"]) {
      expect(isClarityPath(path), path).toBe(true);
    }
  });
  it("never allows client sites, the app, login, admin, billing or checkout", async () => {
    const { isClarityPath } = await import("./clarity");
    for (const path of ["/s/elite-mobile-detailing", "/s/x/contact", "/p/token", "/app", "/app/billing", "/admin/clients", "/login", "/signup", "/auth", "/onboarding", "/reset-password", "/invite/abc", "/portal", "/share", "/checkout", "/billing", "/demo/dashboard", "/api/public/x", "/unsubscribe/outreach/abc", "/draft/x", "/my"]) {
      expect(isClarityPath(path), path).toBe(false);
    }
  });
  it("is off when there is no path", async () => {
    const { isClarityPath } = await import("./clarity");
    expect(isClarityPath(null)).toBe(false);
    expect(isClarityPath("")).toBe(false);
  });
});

describe("clarityProjectId", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("defaults to the public Revora project", async () => {
    const { clarityProjectId, DEFAULT_CLARITY_ID } = await import("./clarity");
    expect(DEFAULT_CLARITY_ID).toBe("z6io1xv7sb");
    expect(clarityProjectId()).toBe("z6io1xv7sb");
  });
  it("ignores a malformed override", async () => {
    vi.stubEnv("VITE_CLARITY_ID", "bad id!");
    const { clarityProjectId } = await import("./clarity");
    expect(clarityProjectId()).toBe("z6io1xv7sb");
  });
});

describe("loadClarity", () => {
  let appended: Array<{ src: string }>;
  let store: Record<string, string>;
  let host: string;
  let path: string;

  beforeEach(() => {
    vi.resetModules();
    appended = [];
    store = {};
    host = "revoragrowthsystems.com";
    path = "/pricing";
    const win: Record<string, unknown> = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => void (store[k] = v),
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    Object.defineProperty(win, "location", { get: () => ({ hostname: host, pathname: path }) });
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", {
      head: { appendChild: (n: { src: string }) => appended.push(n) },
      createElement: () => ({ src: "", async: false }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not load when the visitor rejected cookies", async () => {
    store["cookie_consent"] = "denied";
    const { loadClarity } = await import("./clarity");
    expect(await loadClarity()).toBe(false);
    expect(appended).toHaveLength(0);
  });

  it("loads once after consent and calls clarity('consent')", async () => {
    store["cookie_consent"] = "granted";
    const { loadClarity } = await import("./clarity");
    expect(await loadClarity()).toBe(true);
    expect(await loadClarity()).toBe(true);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.src).toBe("https://www.clarity.ms/tag/z6io1xv7sb");
    const q = (window as unknown as { clarity: { q: unknown[][] } }).clarity.q;
    expect(q).toEqual([["consent"]]);
  });

  it("never loads on a private path or a non-Revora host, even with consent", async () => {
    store["cookie_consent"] = "granted";
    path = "/app/billing";
    const { loadClarity } = await import("./clarity");
    expect(await loadClarity()).toBe(false);
    path = "/pricing";
    host = "some-client-site.com";
    expect(await loadClarity()).toBe(false);
    host = "localhost";
    expect(await loadClarity()).toBe(false);
    expect(appended).toHaveLength(0);
  });

  it("skips staff browsers", async () => {
    store["cookie_consent"] = "granted";
    store["revora.staff.v1"] = "1";
    const { loadClarity } = await import("./clarity");
    expect(await loadClarity()).toBe(false);
  });
});
