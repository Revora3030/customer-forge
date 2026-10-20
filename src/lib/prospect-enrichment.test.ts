import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emailVerifiedFor,
  isRoleJunkAddress,
  isValidEmailSyntax,
  parseMxAnswer,
  readProspectEnrichment,
} from "@/lib/prospect-enrichment";
import { extractMetaEmail } from "@/lib/prospect-email";

const mocks = vi.hoisted(() => ({ isDoNotContact: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/prospect-outreach.server", () => ({ isDoNotContact: mocks.isDoNotContact }));
import { enrichProspectEmail, mxStatus, reverifyLegacyDemos, verifyProspectEmail } from "@/lib/prospect-enrichment.server";
import { lookupPublicEmail } from "@/lib/prospect-email.server";

const db = {} as never;
const mx = (body: unknown) => Response.json(body);
const MX_OK = { Status: 0, Answer: [{ type: 15, data: "10 mx1.mail-host.net." }] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isDoNotContact.mockResolvedValue(false);
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("address checks", () => {
  it("accepts well-formed addresses and refuses malformed ones", () => {
    expect(isValidEmailSyntax("owner@shine-detailing.com")).toBe(true);
    expect(isValidEmailSyntax("Owner.Name+leads@shop.co.uk")).toBe(true);
    for (const bad of ["owner@", "@shop.com", "a..b@shop.com", ".a@shop.com", "a@b@shop.com", "a@shop", "a@-shop.com", "a b@shop.com", `${"a".repeat(65)}@shop.com`]) {
      expect(isValidEmailSyntax(bad)).toBe(false);
    }
  });

  it("rejects role/system mailboxes and platform domains, but keeps a published info@ address", () => {
    for (const junk of ["noreply@shop.com", "no-reply@shop.com", "do-not-reply@shop.com", "mailer-daemon@shop.com", "postmaster@shop.com", "abuse@shop.com", "privacy@shop.com", "support+x@shop.com", "owner@facebook.com", "joe@example.com"]) {
      expect(isRoleJunkAddress(junk)).toBe(true);
    }
    expect(isRoleJunkAddress("info@shine-detailing.com")).toBe(false);
    expect(isRoleJunkAddress("joe@shine-detailing.com")).toBe(false);
  });

  it("reads DNS-over-HTTPS MX answers, treating a null MX and NXDOMAIN as no mail", () => {
    expect(parseMxAnswer(MX_OK)).toBe("yes");
    expect(parseMxAnswer({ Status: 0, Answer: [{ type: 15, data: "0 ." }] })).toBe("no");
    expect(parseMxAnswer({ Status: 0, Answer: [{ type: 5, data: "alias.example." }] })).toBe("no");
    expect(parseMxAnswer({ Status: 3 })).toBe("no");
    expect(parseMxAnswer({ Status: 2 })).toBe("unknown");
    expect(parseMxAnswer("nope")).toBe("unknown");
  });

  it("finds bracketed addresses only in the profile's meta tags", () => {
    expect(extractMetaEmail('<meta property="og:description" content="Mobile detailing. Email owner [at] shine-detailing [dot] com">')).toBe(
      "owner@shine-detailing.com",
    );
    expect(extractMetaEmail("<meta name='description' content='Book: joe@joesplumbing.com'>")).toBe("joe@joesplumbing.com");
    expect(extractMetaEmail('<meta name="keywords" content="joe [at] joesplumbing [dot] com">')).toBeNull();
    expect(extractMetaEmail('<meta property="og:description" content="Call us at 5 or visit shop dot com">')).toBeNull();
  });
});

describe("MX check", () => {
  it("asks Cloudflare first and falls back to Google, with a timeout", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(mx(MX_OK));
    expect(await mxStatus("shine-detailing.com")).toBe("yes");
    const [first, second] = mocks.fetch.mock.calls;
    expect(first![0]).toBe("https://cloudflare-dns.com/dns-query?name=shine-detailing.com&type=MX");
    expect(second![0]).toBe("https://dns.google/resolve?name=shine-detailing.com&type=MX");
    expect(first![1]).toMatchObject({ redirect: "manual", headers: { accept: "application/dns-json" } });
    expect(first![1].signal).toBeInstanceOf(AbortSignal);
  });

  it("is unknown (not verified) when no resolver answers", async () => {
    mocks.fetch.mockResolvedValue(new Response("busy", { status: 503 }));
    expect(await mxStatus("shine-detailing.com")).toBe("unknown");
  });
});

describe("verifyProspectEmail", () => {
  it("verifies a published address whose domain takes mail", async () => {
    mocks.fetch.mockResolvedValue(mx(MX_OK));
    expect(await verifyProspectEmail(db, "Owner@Shine-Detailing.com")).toEqual({ status: "verified", reason: "ok" });
  });

  it("rejects role addresses and do-not-contact without any DNS lookup", async () => {
    expect(await verifyProspectEmail(db, "noreply@shine-detailing.com")).toEqual({ status: "rejected", reason: "role_address" });
    mocks.isDoNotContact.mockResolvedValue(true);
    expect(await verifyProspectEmail(db, "owner@shine-detailing.com")).toEqual({ status: "rejected", reason: "do_not_contact" });
    expect(mocks.isDoNotContact).toHaveBeenCalledWith(db, "owner@shine-detailing.com");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects a domain without MX and leaves DNS trouble unverified", async () => {
    mocks.fetch.mockResolvedValue(mx({ Status: 3 }));
    expect(await verifyProspectEmail(db, "owner@no-such-shop.com")).toEqual({ status: "rejected", reason: "no_mx" });
    mocks.fetch.mockReset().mockRejectedValue(new Error("offline"));
    expect(await verifyProspectEmail(db, "owner@shine-detailing.com")).toEqual({ status: "unverified", reason: "dns_unavailable" });
  });
});

describe("the gate", () => {
  const stored = { status: "verified", email: "owner@shine-detailing.com", source: "public_page", sourceUrl: "https://facebook.com/x", reason: "ok", checkedAt: "x" };

  it("passes only the exact verified, published address", () => {
    const enrichment = readProspectEnrichment(stored);
    expect(emailVerifiedFor(enrichment, "OWNER@shine-detailing.com")).toBe(true);
    expect(emailVerifiedFor(enrichment, "other@shine-detailing.com")).toBe(false);
    expect(emailVerifiedFor(readProspectEnrichment({ ...stored, status: "unverified" }), stored.email)).toBe(false);
    // A "verified" record with no published source is not trusted.
    expect(emailVerifiedFor(readProspectEnrichment({ ...stored, source: "guessed" }), stored.email)).toBe(false);
    expect(emailVerifiedFor(readProspectEnrichment(null), stored.email)).toBe(false);
  });
});

describe("public email lookup reuses the SSRF guard", () => {
  it("never fetches IP literals, metadata hosts or credentialed links", async () => {
    for (const link of ["http://127.0.0.1/", "https://169.254.169.254/latest/meta-data", "https://metadata.google.internal/", "https://user:pw@shop.com/", "ftp://shop.com/"]) { // DevSkim: ignore DS162092,DS137138 -- Negative fixtures: the SSRF guard must refuse these.
      expect(await lookupPublicEmail(link)).toBeNull();
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses a public name that resolves to a private address", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.startsWith("https://cloudflare-dns.com/")) {
        return Response.json(url.includes("type=A&") || url.endsWith("type=A") ? { Status: 0, Answer: [{ type: 1, data: "10.0.0.5" }] } : { Status: 0 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    expect(await lookupPublicEmail("https://facebook.com/shine")).toBeNull();
    expect(mocks.fetch.mock.calls.every(([url]) => String(url).startsWith("https://cloudflare-dns.com/"))).toBe(true);
  });

  it("finds a published address on the listed page without following redirects, then enriches it", async () => {
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://cloudflare-dns.com/dns-query?name=facebook.com&type=A")) return Response.json({ Status: 0, Answer: [{ type: 1, data: "157.240.1.35" }] });
      if (url.startsWith("https://cloudflare-dns.com/dns-query?name=facebook.com&type=AAAA")) return Response.json({ Status: 0 });
      if (url.includes("type=MX")) return mx(MX_OK);
      expect(init?.redirect).toBe("manual");
      return new Response('<meta property="og:description" content="Detailing. owner [at] shine-detailing [dot] com">', {
        headers: { "content-type": "text/html" },
      });
    });
    const enrichment = await enrichProspectEmail(db, "https://facebook.com/shine", { now: () => new Date("2026-10-19T00:00:00Z") });
    expect(enrichment).toEqual({
      status: "verified",
      email: "owner@shine-detailing.com",
      source: "social_meta",
      sourceUrl: "https://facebook.com/shine",
      reason: "ok",
      checkedAt: "2026-10-19T00:00:00.000Z",
    });
    expect(await enrichProspectEmail(db, null)).toMatchObject({ status: "none", email: null, reason: "no_listing_link" });
  });
});

describe("reverifyLegacyDemos", () => {
  type Row = Record<string, unknown>;
  const ORG = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  /** Reads "a->b->>c" style paths like PostgREST does (a missing key is SQL NULL). */
  const path = (row: Row, column: string): unknown =>
    column.split(/->>?/).reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Row)[key] : undefined), row);

  function fakeDb(seed: Record<string, Row[]>) {
    const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => structuredClone(r))]));
    const writes: Array<{ table: string; filters: string[]; patch: Row }> = [];
    const from = (name: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      const described: string[] = [];
      let patch: Row | null = null;
      let limit = Infinity;
      const rows = () => (tables[name] ?? []).filter((row) => filters.every((f) => f(row))).slice(0, limit);
      const run = () => {
        const matched = rows();
        if (patch) {
          writes.push({ table: name, filters: described, patch });
          matched.forEach((row) => Object.assign(row, structuredClone(patch)));
        }
        return { data: matched.map((r) => structuredClone(r)), error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (column: string, value: unknown) => (described.push(`eq:${column}`), filters.push((row) => path(row, column) === value), chain),
        in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(path(row, column))), chain),
        not: (column: string) => (filters.push((row) => path(row, column) != null), chain),
        is: (column: string) => (described.push(`is:${column}`), filters.push((row) => path(row, column) == null), chain),
        order: () => chain,
        limit: (n: number) => ((limit = n), chain),
        update: (values: Row) => ((patch = values), chain),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve(run()),
      };
      return chain;
    };
    return { db: { from } as never, tables, writes };
  }

  const demo = (n: number, marker: Row = {}) => ({
    organization_id: ORG(n),
    generation: { theme: "kept", prospectDemo: { kind: "prospect_demo", source: "autopilot", previewToken: `tok_${n}`, createdAt: "2026-09-01T00:00:00Z", ...marker } },
  });
  const profile = (n: number, email: string | null) => ({ organization_id: ORG(n), email });
  const NOW = () => new Date("2026-10-20T12:00:00Z");
  const markerOf = (row: Row | undefined) => (row?.["generation"] as Row)["prospectDemo"] as Row;

  it("verifies the profile email of legacy autopilot demos and writes a legacy_profile record, tenant-scoped", async () => {
    mocks.fetch.mockResolvedValue(mx(MX_OK));
    const recorded = { status: "none", email: null, source: null, sourceUrl: null, reason: "no_published_email", checkedAt: "x" };
    const { db, tables, writes } = fakeDb({
      website_settings: [demo(1), demo(2, { enrichment: recorded }), demo(3, { source: "admin" }), demo(4)],
      business_profiles: [profile(1, " Owner@Shine-Detailing.com "), profile(2, "x@shop.com"), profile(3, "y@shop.com"), profile(4, null)],
    });
    const result = await reverifyLegacyDemos(db, { now: NOW });
    expect(result).toEqual({ checked: 1, written: 1, results: [{ organizationId: ORG(1), status: "verified", reason: "ok", written: true }] });
    const settings = tables["website_settings"]!;
    expect((settings[0]!["generation"] as Row)["theme"]).toBe("kept");
    expect(markerOf(settings[0])["previewToken"]).toBe("tok_1");
    expect(markerOf(settings[0])["enrichment"]).toEqual({
      status: "verified",
      email: "owner@shine-detailing.com",
      source: "legacy_profile",
      sourceUrl: null,
      reason: "ok",
      checkedAt: "2026-10-20T12:00:00.000Z",
    });
    // The record passes the autopilot gate for exactly that address.
    expect(emailVerifiedFor(readProspectEnrichment(markerOf(settings[0])["enrichment"]), "owner@shine-detailing.com")).toBe(true);
    // Already-recorded, non-autopilot and email-less demos are untouched.
    expect(markerOf(settings[1])["enrichment"]).toEqual(recorded);
    expect(markerOf(settings[2])["enrichment"]).toBeUndefined();
    expect(markerOf(settings[3])["enrichment"]).toBeUndefined();
    expect(mocks.isDoNotContact).toHaveBeenCalledTimes(1);
    // One write, scoped to the tenant and guarded on the record still being absent.
    expect(writes).toEqual([{ table: "website_settings", filters: ["eq:organization_id", "is:generation->prospectDemo->enrichment"], patch: expect.any(Object) }]);

    // Never re-verified once it has a record.
    expect(await reverifyLegacyDemos(db, { now: NOW })).toEqual({ checked: 0, written: 0, results: [] });
    expect(mocks.isDoNotContact).toHaveBeenCalledTimes(1);
  });

  it("is bounded by limit (default 5) and records rejections and DNS trouble too", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    const ids = [1, 2, 3, 4, 5, 6, 7];
    const { db, tables } = fakeDb({
      website_settings: ids.map((n) => demo(n)),
      business_profiles: ids.map((n) => profile(n, n === 1 ? "noreply@shop.com" : `owner${n}@shop${n}.com`)),
    });
    const first = await reverifyLegacyDemos(db, { now: NOW });
    expect(first.checked).toBe(5);
    expect(first.results[0]).toEqual({ organizationId: ORG(1), status: "rejected", reason: "role_address", written: true });
    expect(first.results[1]).toMatchObject({ status: "unverified", reason: "dns_unavailable" });
    const second = await reverifyLegacyDemos(db, { now: NOW, limit: 1 });
    expect(second.results.map((r) => r.organizationId)).toEqual([ORG(6)]);
    expect(await reverifyLegacyDemos(db, { now: NOW, limit: 0 })).toEqual({ checked: 0, written: 0, results: [] });
    expect(tables["website_settings"]!.filter((row) => markerOf(row)["enrichment"])).toHaveLength(6);
  });

  it("skips claimed demos and records a do-not-contact address as rejected", async () => {
    mocks.isDoNotContact.mockResolvedValue(true);
    const { db } = fakeDb({
      website_settings: [demo(1, { claimedAt: "2026-10-01T00:00:00Z" }), demo(2)],
      business_profiles: [profile(1, "a@shop.com"), profile(2, "b@shop.com")],
    });
    const result = await reverifyLegacyDemos(db, { now: NOW });
    expect(result.results).toEqual([{ organizationId: ORG(2), status: "rejected", reason: "do_not_contact", written: true }]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
