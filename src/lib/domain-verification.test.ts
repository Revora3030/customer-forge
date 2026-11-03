import { describe, expect, it } from "vitest";
import {
  caaAllowsCertificates,
  dnsRows,
  DOMAIN_IP,
  LOVABLE_TXT_PENDING_NOTE,
  normalizeLovableVerifyValue,
  parseCaaRecord,
  readCaaWarning,
  readLovableVerification,
  REGISTRAR_GUIDES,
  writeLovableVerification,
} from "@/lib/domain-setup";

describe("_lovable TXT verification rows", () => {
  it("shows A records plus pending TXT rows (never a placeholder value) until values are set", () => {
    const rows = dnsRows("example.com");
    expect(rows.map((r) => [r.type, r.name])).toEqual([
      ["A", "@"],
      ["A", "www"],
      ["TXT", "_lovable"],
      ["TXT", "_lovable.www"],
    ]);
    expect(rows.filter((r) => r.type === "A").every((r) => r.value === DOMAIN_IP)).toBe(true);
    const txt = rows.filter((r) => r.type === "TXT");
    expect(txt.every((r) => r.pending === true && r.value === LOVABLE_TXT_PENDING_NOTE)).toBe(true);
    expect(LOVABLE_TXT_PENDING_NOTE).toMatch(/Pending — Revora will send your verification value/);
    expect(txt.some((r) => r.value.startsWith("lovable_verify="))).toBe(false);
  });

  it("shows the stored apex and www values once Revora saves them", () => {
    const generation = writeLovableVerification({ brief: { a: 1 } }, "Example.com", {
      apex: " lovable_verify=abc123 ",
      www: '"lovable_verify=www456"',
    });
    expect(generation["brief"]).toEqual({ a: 1 });
    const v = readLovableVerification(generation, "example.com");
    expect(v).toEqual({ apex: "lovable_verify=abc123", www: "lovable_verify=www456" });
    const rows = dnsRows("example.com", v);
    expect(rows[2]).toMatchObject({ name: "_lovable", value: "lovable_verify=abc123" });
    expect(rows[2]?.pending).toBeUndefined();
    expect(rows[3]).toMatchObject({ name: "_lovable.www", value: "lovable_verify=www456" });
  });

  it("keeps www pending when only the apex value is known", () => {
    const g = writeLovableVerification({}, "example.com", { apex: "lovable_verify=abc123" });
    const rows = dnsRows("example.com", readLovableVerification(g, "example.com"));
    expect(rows[2]?.pending).toBeUndefined();
    expect(rows[3]?.pending).toBe(true);
  });

  it("ignores values saved for a different domain", () => {
    const g = writeLovableVerification({}, "old.com", { apex: "lovable_verify=abc123" });
    expect(readLovableVerification(g, "new.com")).toEqual({ apex: null, www: null });
    expect(readLovableVerification(null, "new.com")).toEqual({ apex: null, www: null });
  });

  it("only accepts real lovable_verify tokens", () => {
    expect(normalizeLovableVerifyValue("lovable_verify=AbC-1_2.3")).toBe("lovable_verify=AbC-1_2.3");
    expect(normalizeLovableVerifyValue("")).toBeNull();
    expect(normalizeLovableVerifyValue("google-site-verification=x")).toBeNull();
    expect(normalizeLovableVerifyValue("lovable_verify=<script>")).toBeNull();
    expect(normalizeLovableVerifyValue(42)).toBeNull();
  });
});

describe("Cloudflare guidance", () => {
  it("says DNS only (grey cloud) and never suggests proxied @ or * records", () => {
    const cf = REGISTRAR_GUIDES.find((g) => g.id === "cloudflare");
    expect(cf).toBeTruthy();
    const text = cf!.steps.join(" ");
    expect(text).toMatch(/DNS only \(grey cloud\)/);
    expect(text).not.toMatch(/\bName \*/);
    expect(text).toMatch(/_lovable\.www/);
  });
});

describe("CAA check", () => {
  it("parses presentation and RFC 3597 hex answers", () => {
    expect(parseCaaRecord('0 issue "letsencrypt.org"')).toEqual({ flags: 0, tag: "issue", value: "letsencrypt.org" });
    // 0 issue "pki.goog" in wire format
    const hex = "\\# 15 00 05 69 73 73 75 65 70 6b 69 2e 67 6f 6f 67";
    expect(parseCaaRecord(hex)).toEqual({ flags: 0, tag: "issue", value: "pki.goog" });
    expect(parseCaaRecord("garbage")).toBeNull();
  });

  it("is fine with no CAA records or only iodef/issuewild", () => {
    expect(caaAllowsCertificates([]).ok).toBe(true);
    expect(caaAllowsCertificates(['0 iodef "mailto:a@b.c"', '0 issuewild "digicert.com"']).warning).toBeNull();
  });

  it("is fine when Let's Encrypt or Google Trust Services is allowed", () => {
    expect(caaAllowsCertificates(['0 issue "digicert.com"', '0 issue "letsencrypt.org"']).ok).toBe(true);
    expect(caaAllowsCertificates(['0 issue "pki.goog; cansignhttpexchanges=yes"']).ok).toBe(true);
  });

  it("warns when CAA allows neither", () => {
    const r = caaAllowsCertificates(['0 issue "digicert.com"', '0 issue "sectigo.com"']);
    expect(r.ok).toBe(false);
    expect(r.warning).toMatch(/digicert\.com, sectigo\.com/);
    expect(r.warning).toMatch(/letsencrypt\.org/);
    expect(r.warning).toMatch(/pki\.goog/);
    expect(caaAllowsCertificates(['0 issue ";"']).ok).toBe(false);
  });

  it("reads the saved warning back from domain_records", () => {
    expect(readCaaWarning({ caaWarning: "x" })).toBe("x");
    expect(readCaaWarning({ caaWarning: null })).toBeNull();
    expect(readCaaWarning(null)).toBeNull();
  });
});
