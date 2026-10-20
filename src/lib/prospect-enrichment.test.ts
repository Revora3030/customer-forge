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
import { enrichProspectEmail, mxStatus, verifyProspectEmail } from "@/lib/prospect-enrichment.server";
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
    for (const link of ["http://127.0.0.1/", "https://169.254.169.254/latest/meta-data", "https://metadata.google.internal/", "https://user:pw@shop.com/", "ftp://shop.com/"]) {
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
