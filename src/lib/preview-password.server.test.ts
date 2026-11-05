import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { attemptUnlock, isFeatureNotInstalled, previewAccessAllowed, readPasswordState } from "./preview-password.server";
import { hashPreviewPassword, unlockCookieName, unlockProof } from "./preview-password";

type Row = Record<string, unknown>;
const TOKEN = "tokentokentokentoken1234";
const SECRET = "test-secret-value";
const NOW = Date.parse("2026-11-01T12:00:00Z");

function makeDb(opts: { links?: Row[]; secrets?: Row[]; secretsError?: { code?: string; message?: string }; attemptAllowed?: (key: string) => boolean }) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: (column: string, value: unknown) => ({
            maybeSingle: async () => {
              if (table === "website_preview_link_secrets" && opts.secretsError) return { data: null, error: opts.secretsError };
              const rows = table === "website_preview_links" ? (opts.links ?? []) : (opts.secrets ?? []);
              return { data: rows.find((row) => row[column] === value) ?? null, error: null };
            },
          }),
        }),
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "preview_unlock_attempt") return { data: (opts.attemptAllowed ?? (() => true))(String(args["p_key"])), error: null };
      return { data: null, error: null };
    },
  };
  return { db: db as never, rpcCalls };
}

const liveLink = { id: "link-1", token: TOKEN, expires_at: "2026-11-02T12:00:00Z", revoked: false };
let hash: string;
beforeEach(async () => {
  hash = await hashPreviewPassword("open sesame 1");
});

describe("previewAccessAllowed", () => {
  it("lets a link without a password straight in", async () => {
    expect(await previewAccessAllowed(TOKEN, "link-1", { state: async () => ({ protected: false }), readCookie: () => undefined, secret: SECRET })).toBe(true);
  });

  it("keeps a protected link closed without the cookie", async () => {
    expect(await previewAccessAllowed(TOKEN, "link-1", { state: async () => ({ protected: true, hash }), readCookie: () => undefined, secret: SECRET })).toBe(false);
  });

  it("keeps it closed for a wrong or stale cookie", async () => {
    const cookie = await unlockProof(SECRET, "link-1", "some-older-hash");
    expect(await previewAccessAllowed(TOKEN, "link-1", { state: async () => ({ protected: true, hash }), readCookie: () => cookie, secret: SECRET })).toBe(false);
    expect(await previewAccessAllowed(TOKEN, "link-1", { state: async () => ({ protected: true, hash }), readCookie: () => "garbage", secret: SECRET })).toBe(false);
  });

  it("opens for the cookie that matches the current password", async () => {
    const cookie = await unlockProof(SECRET, "link-1", hash);
    const read = vi.fn(() => cookie);
    expect(await previewAccessAllowed(TOKEN, "link-1", { state: async () => ({ protected: true, hash }), readCookie: read, secret: SECRET })).toBe(true);
    expect(read).toHaveBeenCalledWith(unlockCookieName(TOKEN));
  });

  it("fails closed when the password state cannot be read, or there is no secret", async () => {
    expect(await previewAccessAllowed(TOKEN, "link-1", { state: async () => { throw new Error("db down"); }, readCookie: () => undefined, secret: SECRET })).toBe(false);
    const cookie = await unlockProof(SECRET, "link-1", hash);
    expect(await previewAccessAllowed(TOKEN, "link-1", { state: async () => ({ protected: true, hash }), readCookie: () => cookie, secret: null })).toBe(false);
  });
});

describe("readPasswordState", () => {
  it("reads no row as unprotected and a hash as protected", async () => {
    expect(await readPasswordState("link-1", makeDb({ secrets: [] }).db)).toEqual({ protected: false });
    expect(await readPasswordState("link-1", makeDb({ secrets: [{ link_id: "link-1", password_hash: hash }] }).db)).toEqual({ protected: true, hash });
  });

  it("treats a table that is not published yet as unprotected, but any other error as a failure", async () => {
    expect(await readPasswordState("link-1", makeDb({ secretsError: { code: "PGRST205", message: "Could not find the table" } }).db)).toEqual({ protected: false });
    await expect(readPasswordState("link-1", makeDb({ secretsError: { code: "XX000", message: "boom" } }).db)).rejects.toThrow();
    expect(isFeatureNotInstalled({ code: "42P01" })).toBe(true);
    expect(isFeatureNotInstalled({ code: "57014", message: "timeout" })).toBe(false);
  });
});

describe("attemptUnlock", () => {
  const base = { ip: "203.0.113.9", secret: SECRET, now: () => NOW };

  it("sets the unlock cookie for the right password", async () => {
    const setCookie = vi.fn();
    const { db, rpcCalls } = makeDb({ links: [liveLink], secrets: [{ link_id: "link-1", password_hash: hash }] });
    expect(await attemptUnlock({ token: TOKEN, password: "open sesame 1" }, { ...base, db, setCookie })).toEqual({ ok: true });
    expect(setCookie).toHaveBeenCalledTimes(1);
    const [name, value, options] = setCookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe(unlockCookieName(TOKEN));
    expect(value).toBe(await unlockProof(SECRET, "link-1", hash));
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(rpcCalls.some((call) => call.fn === "preview_unlock_clear")).toBe(true);
  });

  it("counts by HMAC, never the raw IP or token", async () => {
    const { db, rpcCalls } = makeDb({ links: [liveLink], secrets: [{ link_id: "link-1", password_hash: hash }] });
    await attemptUnlock({ token: TOKEN, password: "nope nope nope" }, { ...base, db, setCookie: vi.fn() });
    const keys = rpcCalls.filter((call) => call.fn === "preview_unlock_attempt").map((call) => String(call.args["p_key"]));
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).not.toContain("203.0.113.9");
      expect(key).not.toContain(TOKEN);
    }
  });

  it("answers a wrong password without a cookie", async () => {
    const setCookie = vi.fn();
    const { db } = makeDb({ links: [liveLink], secrets: [{ link_id: "link-1", password_hash: hash }] });
    expect(await attemptUnlock({ token: TOKEN, password: "wrong password" }, { ...base, db, setCookie })).toEqual({ ok: false, reason: "wrong_password" });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("answers an unknown link, an unprotected link, an expired link and a revoked link exactly like a wrong password", async () => {
    const cases: Row[][] = [[], [liveLink], [{ ...liveLink, expires_at: "2026-10-31T12:00:00Z" }], [{ ...liveLink, revoked: true }]];
    for (const links of cases) {
      const setCookie = vi.fn();
      const secrets = links.length && links[0] !== liveLink ? [{ link_id: "link-1", password_hash: hash }] : [];
      const { db } = makeDb({ links, secrets });
      expect(await attemptUnlock({ token: TOKEN, password: "open sesame 1" }, { ...base, db, setCookie })).toEqual({ ok: false, reason: "wrong_password" });
      expect(setCookie).not.toHaveBeenCalled();
    }
  });

  it("stops after too many tries, per visitor and per link, even for the right password", async () => {
    for (const prefix of ["v:", "l:"]) {
      const setCookie = vi.fn();
      const { db } = makeDb({ links: [liveLink], secrets: [{ link_id: "link-1", password_hash: hash }], attemptAllowed: (key) => !key.startsWith(prefix) });
      expect(await attemptUnlock({ token: TOKEN, password: "open sesame 1" }, { ...base, db, setCookie })).toEqual({ ok: false, reason: "rate_limited" });
      expect(setCookie).not.toHaveBeenCalled();
    }
  });

  it("never lets anyone in when there is no server secret", async () => {
    const setCookie = vi.fn();
    const { db } = makeDb({ links: [liveLink], secrets: [{ link_id: "link-1", password_hash: hash }] });
    expect(await attemptUnlock({ token: TOKEN, password: "open sesame 1" }, { ...base, db, setCookie, secret: null })).toEqual({ ok: false, reason: "wrong_password" });
    expect(setCookie).not.toHaveBeenCalled();
  });
});
