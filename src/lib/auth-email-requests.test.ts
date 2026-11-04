/**
 * Account enumeration (/auth) and the saved post-OAuth redirect (__root):
 * the email forms must answer the same way whether or not an account exists,
 * and only same-site paths may be followed after sign-in.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMAIL_REQUEST_FAILED_MESSAGE,
  NEUTRAL_MAGIC_LINK_MESSAGE,
  NEUTRAL_RESET_MESSAGE,
  emailLinkOutcome,
  revealsAccountExistence,
} from "@/lib/auth-email-requests";
import { isSafeRedirect } from "@/lib/prospect-claim";

/** Shapes Supabase Auth (GoTrue) returns for these cases. */
const unknownEmailOtp = {
  name: "AuthApiError",
  status: 422,
  code: "otp_disabled",
  message: "Signups not allowed for otp",
};
const legacyUnknownEmailOtp = { status: 400, message: "Signups not allowed for otp" };
const perUserCooldown = {
  status: 429,
  code: "over_email_send_rate_limit",
  message: "For security purposes, you can only request this after 42 seconds.",
};
const alreadyRegistered = {
  status: 422,
  code: "user_already_exists",
  message: "User already registered",
};
const network = { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" };
const badAddress = {
  status: 400,
  code: "validation_failed",
  message: "Unable to validate email address: invalid format",
};

describe("emailLinkOutcome", () => {
  it("reports an unknown email exactly like a sent link", () => {
    const sent = emailLinkOutcome(null, NEUTRAL_MAGIC_LINK_MESSAGE);
    expect(sent).toEqual({ kind: "sent", message: NEUTRAL_MAGIC_LINK_MESSAGE });
    expect(emailLinkOutcome(unknownEmailOtp, NEUTRAL_MAGIC_LINK_MESSAGE)).toEqual(sent);
    expect(emailLinkOutcome(legacyUnknownEmailOtp, NEUTRAL_MAGIC_LINK_MESSAGE)).toEqual(sent);
  });

  it("hides per-account cooldowns, which only existing accounts can hit", () => {
    expect(emailLinkOutcome(perUserCooldown, NEUTRAL_RESET_MESSAGE)).toEqual({
      kind: "sent",
      message: NEUTRAL_RESET_MESSAGE,
    });
  });

  it("shows one generic failure for real errors, never the raw auth message", () => {
    for (const error of [network, badAddress, new Error("boom")]) {
      expect(emailLinkOutcome(error, NEUTRAL_MAGIC_LINK_MESSAGE)).toEqual({
        kind: "failed",
        message: EMAIL_REQUEST_FAILED_MESSAGE,
      });
    }
  });

  it("neutral copy never says the link was definitely sent or echoes the address", () => {
    for (const m of [NEUTRAL_MAGIC_LINK_MESSAGE, NEUTRAL_RESET_MESSAGE]) {
      expect(m).toMatch(/^If an account exists for that email, we sent/);
    }
  });
});

describe("revealsAccountExistence", () => {
  it("flags sign-up's 'already registered' and leaves ordinary errors alone", () => {
    expect(revealsAccountExistence(alreadyRegistered)).toBe(true);
    expect(revealsAccountExistence({ code: "email_exists", message: "x" })).toBe(true);
    expect(
      revealsAccountExistence({ code: "weak_password", message: "Password is too weak" }),
    ).toBe(false);
    expect(revealsAccountExistence(null)).toBe(false);
    expect(revealsAccountExistence("Signups not allowed")).toBe(false);
  });
});

describe("/auth wiring", () => {
  const auth = readFileSync("src/routes/auth.tsx", "utf8");
  const fnBody = (name: string) => {
    const start = auth.indexOf(`async function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return auth.slice(start, auth.indexOf("\n  }\n", start));
  };

  it("magic link and reset never surface the raw Supabase error", () => {
    for (const name of ["handleMagicLink", "handleForgotPassword"]) {
      const body = fnBody(name);
      expect(body).toContain("emailLinkOutcome(");
      expect(body).not.toMatch(/throw (otp|reset)Error/);
      expect(body).not.toContain("err.message");
    }
  });

  it("sign-up treats 'already registered' like a pending confirmation", () => {
    const body = fnBody("handleEmail");
    expect(body).toContain("revealsAccountExistence(signUpError)");
    expect(body).toContain("setNotice(NEUTRAL_SIGNUP_MESSAGE)");
  });

  it("the sent notices use the neutral copy, not 'Link sent to {email}'", () => {
    expect(auth).not.toMatch(/Link sent to <span/);
    expect(auth).not.toMatch(/Reset link sent to <span/);
    expect(auth).toContain("{NEUTRAL_MAGIC_LINK_MESSAGE}");
    expect(auth).toContain("{NEUTRAL_RESET_MESSAGE}");
  });

  it("the ?redirect= param and the saved lle:redirect both use isSafeRedirect", () => {
    expect(auth).toMatch(/isSafeRedirect\(rawRedirect\)\s*\)\s*out\.redirect = rawRedirect;/);
    expect(auth).toContain(
      'sessionStorage.setItem("lle:redirect", isSafeRedirect(redirect) ? redirect : "/app")',
    );
  });
});

describe("__root saved redirect", () => {
  const root = readFileSync("src/routes/__root.tsx", "utf8");

  it("only follows lle:redirect when isSafeRedirect accepts it, and always clears it", () => {
    const start = root.indexOf('sessionStorage.getItem("lle:redirect")');
    expect(start).toBeGreaterThan(-1);
    const block = root.slice(start, root.indexOf("} catch", start));
    expect(block).toContain("if (isSafeRedirect(stored)) target = stored;");
    expect(block).toContain('if (stored !== null) sessionStorage.removeItem("lle:redirect");');
    expect(block).not.toContain('startsWith("/")');
  });

  it("isSafeRedirect rejects what the old startsWith('/') check let through", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/javascript:alert(1)",
      "/x\n//evil.com",
      "https://evil.com",
    ]) {
      expect(isSafeRedirect(bad)).toBe(false);
    }
    for (const ok of ["/app", "/get-started?claim=abc", "/oauth/consent?authorization_id=1"]) {
      expect(isSafeRedirect(ok)).toBe(true);
    }
  });
});
