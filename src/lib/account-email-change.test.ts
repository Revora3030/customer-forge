import { describe, expect, it, vi } from "vitest";
import {
  normalizeEmail,
  requestEmailChange,
  validateChangeEmail,
  type EmailChangeAuth,
} from "@/lib/account-email-change";
import { NEUTRAL_EMAIL_CHANGE_MESSAGE } from "@/lib/auth-email-requests";

describe("validateChangeEmail", () => {
  it("normalizes and accepts a new address", () => {
    expect(validateChangeEmail("old@ex.com", "  New@Ex.COM ")).toEqual({
      ok: true,
      value: "new@ex.com",
    });
    expect(normalizeEmail("  A@B.Co ")).toBe("a@b.co");
  });

  it("rejects empty, invalid, and same-as-current", () => {
    expect(validateChangeEmail("a@b.co", "   ").ok).toBe(false);
    expect(validateChangeEmail("a@b.co", "not-an-email").ok).toBe(false);
    expect(validateChangeEmail("a@b.co", "A@B.CO").ok).toBe(false);
    expect(validateChangeEmail("a@b.co", "A@B.CO")).toMatchObject({
      message: expect.stringMatching(/already your email/i),
    });
  });
});

describe("requestEmailChange", () => {
  function auth(opts: {
    reauthFails?: boolean;
    updateError?: { code?: string; message?: string; status?: number } | null;
    newEmail?: string | null;
  } = {}) {
    return {
      signInWithPassword: vi.fn(async () => ({
        data: { session: null, user: null },
        error: opts.reauthFails ? { message: "Invalid login credentials" } : null,
      })),
      updateUser: vi.fn(async () => ({
        data: {
          user: opts.updateError
            ? null
            : { new_email: opts.newEmail === undefined ? "new@ex.com" : opts.newEmail },
        },
        error: opts.updateError ?? null,
      })),
    };
  }

  const base = {
    currentEmail: "old@ex.com",
    currentPassword: "secret-pass",
    newEmail: "new@ex.com",
    emailRedirectTo: "https://app.example/app/settings",
  };

  it("re-authenticates then updates email with redirect", async () => {
    const a = auth();
    const result = await requestEmailChange(a as unknown as EmailChangeAuth, base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toEqual({ kind: "sent", message: NEUTRAL_EMAIL_CHANGE_MESSAGE });
      expect(result.pendingEmail).toBe("new@ex.com");
    }
    expect(a.signInWithPassword).toHaveBeenCalledWith({
      email: "old@ex.com",
      password: "secret-pass",
    });
    expect(a.updateUser).toHaveBeenCalledWith(
      { email: "new@ex.com" },
      { emailRedirectTo: base.emailRedirectTo },
    );
  });

  it("stops on wrong password without calling updateUser", async () => {
    const a = auth({ reauthFails: true });
    const result = await requestEmailChange(a as unknown as EmailChangeAuth, base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/incorrect/i);
    expect(a.updateUser).not.toHaveBeenCalled();
  });

  it("treats email_exists like a sent confirmation (enumeration-safe)", async () => {
    const a = auth({
      updateError: { code: "email_exists", message: "Email address already registered", status: 422 },
    });
    const result = await requestEmailChange(a as unknown as EmailChangeAuth, base);
    expect(result).toEqual({
      ok: true,
      outcome: { kind: "sent", message: NEUTRAL_EMAIL_CHANGE_MESSAGE },
      pendingEmail: null,
    });
  });

  it("returns a generic failure for network errors", async () => {
    const network = {
      signInWithPassword: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
      updateUser: vi.fn(async () => ({
        data: { user: null },
        error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" },
      })),
    };
    const result = await requestEmailChange(network as unknown as EmailChangeAuth, base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.kind).toBe("failed");
      expect(result.outcome.message).not.toMatch(/exists|registered|taken/i);
    }
  });

  it("never echoes existence language in the success path message", () => {
    expect(NEUTRAL_EMAIL_CHANGE_MESSAGE).not.toMatch(/already (registered|taken|in use)/i);
    expect(NEUTRAL_EMAIL_CHANGE_MESSAGE).toMatch(/^If that address can be used/);
  });
});
