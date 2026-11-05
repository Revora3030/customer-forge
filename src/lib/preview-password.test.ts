import { describe, expect, it } from "vitest";
import {
  hashPreviewPassword,
  parseNewPreviewPassword,
  PREVIEW_PASSWORD_MAX,
  PREVIEW_PASSWORD_MIN,
  unlockCookieName,
  unlockProof,
  unlockProofMatches,
  verifyPreviewPassword,
} from "./preview-password";
import { previewLinkInput } from "./preview-links";

const ORG = "11111111-2222-3333-4444-555555555555";

describe("preview link password rules", () => {
  it("no password asked for means none", () => {
    expect(parseNewPreviewPassword(undefined)).toBeNull();
    expect(parseNewPreviewPassword(null)).toBeNull();
    expect(parseNewPreviewPassword("")).toBeNull();
    expect(previewLinkInput({ organizationId: ORG })).not.toHaveProperty("password");
  });

  it("needs at least 8 characters and at most 128", () => {
    expect(() => parseNewPreviewPassword("1234567")).toThrow(/at least 8/);
    expect(parseNewPreviewPassword("a".repeat(PREVIEW_PASSWORD_MIN))).toBe("a".repeat(PREVIEW_PASSWORD_MIN));
    expect(() => parseNewPreviewPassword("a".repeat(PREVIEW_PASSWORD_MAX + 1))).toThrow(/at most 128/);
    expect(() => previewLinkInput({ organizationId: ORG, password: "short" })).toThrow(/at least 8/);
    expect(previewLinkInput({ organizationId: ORG, password: "long enough pw" })).toMatchObject({ password: "long enough pw" });
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPreviewPassword("correct horse battery");
    expect(stored.startsWith("pbkdf2$100000$")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(await verifyPreviewPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPreviewPassword("correct horse batterz", stored)).toBe(false);
    expect(await verifyPreviewPassword("", stored)).toBe(false);
  });

  it("salts every hash differently", async () => {
    expect(await hashPreviewPassword("same password")).not.toBe(await hashPreviewPassword("same password"));
  });

  it("rejects stored values it does not understand", async () => {
    for (const bad of ["", "plain", "pbkdf2$1$x", "md5$1$a$b", "pbkdf2$99999999$AAAA$AAAA", "pbkdf2$100000$!!$!!"]) {
      expect(await verifyPreviewPassword("anything at all", bad)).toBe(false);
    }
  });
});

describe("unlock cookie proof", () => {
  it("names the cookie per link", () => {
    expect(unlockCookieName("abc".repeat(20))).toBe(`rvpv_${"abc".repeat(20).slice(0, 40)}`);
  });

  it("matches only for the same link, hash and secret", async () => {
    const proof = await unlockProof("secret-one", "link-1", "hash-a");
    expect(await unlockProofMatches("secret-one", "link-1", "hash-a", proof)).toBe(true);
    expect(await unlockProofMatches("secret-two", "link-1", "hash-a", proof)).toBe(false);
    expect(await unlockProofMatches("secret-one", "link-2", "hash-a", proof)).toBe(false);
    // Changing the password changes the hash, so old cookies stop working.
    expect(await unlockProofMatches("secret-one", "link-1", "hash-b", proof)).toBe(false);
    expect(await unlockProofMatches("secret-one", "link-1", "hash-a", undefined)).toBe(false);
    expect(await unlockProofMatches(null, "link-1", "hash-a", proof)).toBe(false);
  });
});

describe("LOV-6 migration", () => {
  it("keeps hashes and attempt counters out of every browser role", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261101040000_preview_link_passwords.sql", "utf8");
    expect(sql).toMatch(/ALTER TABLE public\.website_preview_link_secrets ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.website_preview_link_secrets FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*\b(anon|authenticated)\b/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    // Additive only: nothing dropped or rewritten.
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/i);
  });
});
