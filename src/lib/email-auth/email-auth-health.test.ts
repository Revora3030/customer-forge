import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  gradeDkim,
  gradeDmarc,
  gradeSpf,
  normalizeMailDomain,
  overallStatus,
  rsaKeyBits,
  txtRecords,
  unquoteTxt,
  type DohResponse,
} from "./email-auth-health";
import { checkEmailAuth, DOH_ENDPOINT } from "./email-auth-health.server";

type Fixture = Record<string, DohResponse>;
const fixture = (name: string): Fixture =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), "src/lib/email-auth/__fixtures__", name), "utf8"),
  ) as Fixture;
const good = fixture("doh-good.json");
const weak = fixture("doh-weak.json");
const broken = fixture("doh-broken.json");
const NX: DohResponse = { Status: 3 };

function dohFetch(fixture: Fixture) {
  return vi.fn(async (url: string | URL | Request) => {
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe(DOH_ENDPOINT);
    expect(parsed.searchParams.get("type")).toBe("TXT");
    const body = fixture[parsed.searchParams.get("name") ?? ""] ?? NX;
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/dns-json" },
    });
  }) as unknown as typeof fetch;
}

const txt = (fixture: Fixture, name: string) => txtRecords(fixture[name] ?? NX);

describe("TXT parsing", () => {
  it("joins split character-strings and unescapes quotes", () => {
    expect(unquoteTxt('"v=spf1 include:a " "-all"')).toBe("v=spf1 include:a -all");
    expect(unquoteTxt('"say \\"hi\\""')).toBe('say "hi"');
    expect(unquoteTxt("bare")).toBe("bare");
  });

  it("keeps only TXT answers (follows CNAME), treats NXDOMAIN as empty, throws on SERVFAIL", () => {
    expect(txt(weak, "_dmarc.joes-roofing.net")).toEqual(["v=DMARC1; p=none"]);
    expect(txtRecords(NX)).toEqual([]);
    expect(() => txtRecords({ Status: 2 })).toThrow(/rcode 2/);
  });
});

describe("SPF", () => {
  it("passes a single record ending in -all (split across strings)", () => {
    const r = gradeSpf("acme-plumbing.com", txt(good, "acme-plumbing.com"));
    expect(r.status).toBe("pass");
    expect(r.record).toBe("v=spf1 include:_spf.google.com include:amazonses.com -all");
  });

  it("warns on ?all", () => {
    const r = gradeSpf("joes-roofing.net", txt(weak, "joes-roofing.net"));
    expect(r.status).toBe("warn");
    expect(r.hints.join(" ")).toMatch(/~all/);
  });

  it("fails on multiple records, +all and more than 10 lookups", () => {
    const records = txt(broken, "badmail.org");
    expect(gradeSpf("badmail.org", records)).toMatchObject({ status: "fail", record: null });
    const single = gradeSpf("badmail.org", [records[0]!]);
    expect(single.status).toBe("fail");
    expect(single.hints.join(" ")).toMatch(/11 DNS lookups/);
    expect(single.hints.join(" ")).toMatch(/\+all/);
  });

  it("fails with a fix hint when missing, and warns without an all rule", () => {
    const missing = gradeSpf("x.com", ["google-site-verification=1"]);
    expect(missing.status).toBe("fail");
    expect(missing.hints[0]).toMatch(/v=spf1 include:/);
    expect(gradeSpf("x.com", ["v=spf1 include:_spf.google.com"]).status).toBe("warn");
    expect(gradeSpf("x.com", ["v=spf1 redirect=_spf.x.com"]).status).toBe("pass");
    expect(gradeSpf("x.com", ["v=spf1 ptr ~all"]).status).toBe("warn");
  });
});

describe("DMARC", () => {
  it("passes an enforced policy", () => {
    const r = gradeDmarc("acme-plumbing.com", txt(good, "_dmarc.acme-plumbing.com"));
    expect(r).toMatchObject({ status: "pass", summary: expect.stringMatching(/p=reject/) });
    expect(r.hints).toEqual([]);
  });

  it("warns on p=none and suggests rua", () => {
    const r = gradeDmarc("joes-roofing.net", txt(weak, "_dmarc.joes-roofing.net"));
    expect(r.status).toBe("warn");
    expect(r.hints.join(" ")).toMatch(/p=quarantine/);
    expect(r.hints.join(" ")).toMatch(/rua=mailto:dmarc@joes-roofing\.net/);
  });

  it("fails when missing (NXDOMAIN), duplicated or policy-less", () => {
    const missing = gradeDmarc("badmail.org", txt(broken, "_dmarc.badmail.org"));
    expect(missing.status).toBe("fail");
    expect(missing.hints[0]).toContain("_dmarc.badmail.org: v=DMARC1; p=none");
    expect(gradeDmarc("x.com", ["v=DMARC1; p=reject", "v=DMARC1; p=none"]).status).toBe("fail");
    expect(gradeDmarc("x.com", ["v=DMARC1; rua=mailto:a@x.com"]).status).toBe("fail");
  });

  it("warns on partial enforcement and unprotected subdomains", () => {
    expect(gradeDmarc("x.com", ["v=DMARC1; p=quarantine; pct=25; rua=mailto:d@x.com"]).status).toBe(
      "warn",
    );
    expect(gradeDmarc("x.com", ["v=DMARC1; p=reject; sp=none; rua=mailto:d@x.com"]).status).toBe(
      "warn",
    );
  });
});

describe("DKIM", () => {
  it("estimates RSA key sizes from real keys", () => {
    const goodKey = /p=([^;]+)$/.exec(txt(good, "google._domainkey.acme-plumbing.com")[0]!)![1]!;
    const weakKey = /p=([^;]+)$/.exec(txt(weak, "selector1._domainkey.joes-roofing.net")[0]!)![1]!;
    expect(rsaKeyBits(goodKey)).toBe(2048);
    expect(rsaKeyBits(weakKey)).toBe(1024);
  });

  it("passes a 2048-bit key", () => {
    const r = gradeDkim("acme-plumbing.com", [
      { selector: "google", txts: txt(good, "google._domainkey.acme-plumbing.com") },
      { selector: "selector1", txts: [] },
    ]);
    expect(r).toMatchObject({ status: "pass", summary: expect.stringMatching(/selector google/) });
  });

  it("warns on 1024-bit and test-mode keys", () => {
    const r = gradeDkim("joes-roofing.net", [
      {
        selector: "selector1",
        txts: txt(weak, "selector1._domainkey.joes-roofing.net"),
      },
    ]);
    expect(r.status).toBe("warn");
    expect(r.hints.join(" ")).toMatch(/2048/);
    expect(r.hints.join(" ")).toMatch(/t=y/);
  });

  it("fails on a revoked key and warns when nothing is found", () => {
    expect(
      gradeDkim("badmail.org", [{ selector: "s1", txts: txt(broken, "s1._domainkey.badmail.org") }])
        .status,
    ).toBe("fail");
    const none = gradeDkim("x.com", [{ selector: "google", txts: [] }]);
    expect(none.status).toBe("warn");
    expect(none.hints[0]).toMatch(/We checked: google/);
  });
});

describe("checkEmailAuth over DoH", () => {
  const now = () => new Date("2026-11-04T12:00:00Z");

  it("grades a healthy domain as pass", async () => {
    const report = await checkEmailAuth("acme-plumbing.com", {
      fetchImpl: dohFetch(good),
      now,
    });
    expect(report.status).toBe("pass");
    expect(report.results.map((r) => [r.check, r.status])).toEqual([
      ["spf", "pass"],
      ["dkim", "pass"],
      ["dmarc", "pass"],
    ]);
    expect(report.checkedAt).toBe("2026-11-04T12:00:00.000Z");
  });

  it("rolls up the worst status", async () => {
    expect((await checkEmailAuth("joes-roofing.net", { fetchImpl: dohFetch(weak) })).status).toBe(
      "warn",
    );
    expect((await checkEmailAuth("badmail.org", { fetchImpl: dohFetch(broken) })).status).toBe(
      "fail",
    );
  });

  it("degrades to warn when DNS is unreachable instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const report = await checkEmailAuth("x.com", { fetchImpl, selectors: ["google"] });
    expect(report.results.every((r) => r.status === "warn")).toBe(true);
    expect(overallStatus(report.results)).toBe("warn");
  });
});

describe("normalizeMailDomain", () => {
  it("accepts hostnames and rejects junk", () => {
    expect(normalizeMailDomain("https://www.Acme-Plumbing.com/")).toBe("acme-plumbing.com");
    expect(normalizeMailDomain("localhost")).toBeNull();
    expect(normalizeMailDomain("10.0.0.1")).toBeNull();
    expect(normalizeMailDomain("bad_host.com")).toBeNull();
    expect(normalizeMailDomain(null)).toBeNull();
  });
});
