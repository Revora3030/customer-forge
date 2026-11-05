/**
 * LOV-12: optional authenticator-app (TOTP) sign-in codes, built on the auth
 * provider's free built-in MFA. Pure helpers only, so the rules are testable
 * without a browser or a live auth server.
 */

export type AssuranceLevel = "aal1" | "aal2" | null | undefined;

export interface AssuranceLevels {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
}

export interface FactorLike {
  id: string;
  factor_type?: string;
  status?: string;
  friendly_name?: string | null;
}

/**
 * True when this session signed in with a password/link only but the account
 * has a verified authenticator, so the 6-digit code is still owed. Accounts
 * without a factor (the default, including every $0 trial sign-up) are never
 * asked for a code.
 */
export function needsSecondFactor(levels: AssuranceLevels | null | undefined): boolean {
  if (!levels) return false;
  return levels.nextLevel === "aal2" && levels.currentLevel !== "aal2";
}

/** Verified authenticator-app factors; unverified ones are abandoned set-ups. */
export function verifiedTotpFactors<T extends FactorLike>(factors: readonly T[] | null | undefined): T[] {
  return (factors ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified");
}

/** Half-finished set-ups left behind by a closed tab; safe to clear before re-enrolling. */
export function unverifiedTotpFactors<T extends FactorLike>(factors: readonly T[] | null | undefined): T[] {
  return (factors ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified");
}

/**
 * The auth server answers with an error like "MFA enroll is disabled for TOTP"
 * until the project setting is switched on. That is "coming soon", not a fault.
 */
export function isTwoFactorUnavailable(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "";
  if (/^mfa_.*(disabled|not_enabled)/i.test(code)) return true;
  return /(mfa|totp|factor)[^.]{0,40}(disabled|not enabled)/i.test(message);
}

/** Digits only, at most six, so pasted codes like "123 456" still work. */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

export function isCompleteCode(input: string): boolean {
  return /^\d{6}$/.test(input);
}
