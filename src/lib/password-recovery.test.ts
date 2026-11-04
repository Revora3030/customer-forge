import { describe, expect, it, vi } from "vitest";
import {
  RECOVERY_WINDOW_SECONDS,
  changePassword,
  forgetRecoverySession,
  isRecoverySession,
  rememberRecoverySession,
  sessionIsRecovery,
} from "./password-recovery";

const NOW = 1_800_000_000;

/** Unsigned test JWT: only the payload matters to these client-side checks. */
function jwt(payload: Record<string, unknown>): { access_token: string } {
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { access_token: `${b64({ alg: "HS256" })}.${b64(payload)}.sig` };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("sessionIsRecovery", () => {
  it("accepts a recent recovery amr (PKCE reset link)", () => {
    expect(sessionIsRecovery(jwt({ amr: [{ method: "recovery", timestamp: NOW - 60 }] }), NOW)).toBe(true);
  });

  it("rejects ordinary password, OAuth and magic-link (otp) sessions", () => {
    for (const method of ["password", "oauth", "otp", "magiclink"]) {
      expect(sessionIsRecovery(jwt({ amr: [{ method, timestamp: NOW - 60 }] }), NOW)).toBe(false);
    }
  });

  it("rejects a recovery amr older than the window", () => {
    const old = jwt({ amr: [{ method: "recovery", timestamp: NOW - RECOVERY_WINDOW_SECONDS - 1 }] });
    expect(sessionIsRecovery(old, NOW)).toBe(false);
  });

  it("rejects missing, malformed and timestamp-less tokens", () => {
    expect(sessionIsRecovery(null, NOW)).toBe(false);
    expect(sessionIsRecovery({ access_token: "" }, NOW)).toBe(false);
    expect(sessionIsRecovery({ access_token: "not.a-jwt.!!" }, NOW)).toBe(false);
    expect(sessionIsRecovery(jwt({ amr: [{ method: "recovery" }] }), NOW)).toBe(false);
    expect(sessionIsRecovery(jwt({ amr: "recovery" }), NOW)).toBe(false);
  });
});

describe("isRecoverySession", () => {
  const recoverySession = jwt({ session_id: "sess-reset", amr: [{ method: "otp", timestamp: NOW }] });
  const otherSession = jwt({ session_id: "sess-laptop", amr: [{ method: "password", timestamp: NOW }] });

  it("is false for an ordinary signed-in session (the bug: any session unlocked the form)", () => {
    expect(isRecoverySession(memoryStorage(), otherSession, NOW)).toBe(false);
  });

  it("is true only for the exact session that PASSWORD_RECOVERY announced, surviving a refresh", () => {
    const storage = memoryStorage();
    rememberRecoverySession(storage, recoverySession);
    expect(isRecoverySession(storage, recoverySession, NOW)).toBe(true);
    expect(isRecoverySession(storage, otherSession, NOW)).toBe(false);
    forgetRecoverySession(storage);
    expect(isRecoverySession(storage, recoverySession, NOW)).toBe(false);
  });

  it("is false without a session, and tolerates missing or throwing storage", () => {
    expect(isRecoverySession(memoryStorage(), null, NOW)).toBe(false);
    expect(isRecoverySession(null, recoverySession, NOW)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberRecoverySession(broken, recoverySession)).not.toThrow();
    expect(() => forgetRecoverySession(broken)).not.toThrow();
    expect(isRecoverySession(broken, recoverySession, NOW)).toBe(false);
  });
});

describe("changePassword", () => {
  const auth = (opts: { reauthFails?: boolean; updateFails?: boolean } = {}) => ({
    signInWithPassword: vi.fn(async () => ({
      data: {},
      error: opts.reauthFails ? { message: "Invalid login credentials" } : null,
    })),
    updateUser: vi.fn(async () => ({
      data: {},
      error: opts.updateFails ? { message: "Password is too weak" } : null,
    })),
  });
  type Auth = Parameters<typeof changePassword>[0];

  it("a recovery session sets the new password without re-authenticating", async () => {
    const a = auth();
    const result = await changePassword(a as unknown as Auth, {
      recovery: true,
      email: "owner@example.com",
      currentPassword: "",
      newPassword: "new-password-1",
    });
    expect(result).toEqual({ ok: true });
    expect(a.signInWithPassword).not.toHaveBeenCalled();
    expect(a.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
  });

  it("an ordinary session re-authenticates with the current password first", async () => {
    const a = auth();
    const result = await changePassword(a as unknown as Auth, {
      recovery: false,
      email: "owner@example.com",
      currentPassword: "old-password-1",
      newPassword: "new-password-1",
    });
    expect(result).toEqual({ ok: true });
    expect(a.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "old-password-1",
    });
    expect(a.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      a.updateUser.mock.invocationCallOrder[0]!,
    );
  });

  it("never updates the password when the current password is wrong or missing", async () => {
    const wrong = auth({ reauthFails: true });
    expect(
      await changePassword(wrong as unknown as Auth, {
        recovery: false,
        email: "owner@example.com",
        currentPassword: "guess",
        newPassword: "new-password-1",
      }),
    ).toMatchObject({ ok: false });
    expect(wrong.updateUser).not.toHaveBeenCalled();

    const missing = auth();
    expect(
      await changePassword(missing as unknown as Auth, {
        recovery: false,
        email: "owner@example.com",
        currentPassword: "",
        newPassword: "new-password-1",
      }),
    ).toEqual({ ok: false, message: "Enter your current password to continue." });
    expect(missing.signInWithPassword).not.toHaveBeenCalled();
    expect(missing.updateUser).not.toHaveBeenCalled();
  });

  it("refuses an ordinary session with no email to confirm against", async () => {
    const a = auth();
    const result = await changePassword(a as unknown as Auth, {
      recovery: false,
      email: null,
      currentPassword: "x",
      newPassword: "new-password-1",
    });
    expect(result).toMatchObject({ ok: false });
    expect(a.updateUser).not.toHaveBeenCalled();
  });

  it("surfaces an update failure", async () => {
    const a = auth({ updateFails: true });
    const result = await changePassword(a as unknown as Auth, {
      recovery: true,
      email: "owner@example.com",
      currentPassword: "",
      newPassword: "weak",
    });
    expect(result).toEqual({ ok: false, message: "Password is too weak" });
  });
});
