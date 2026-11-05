/**
 * Account-enumeration guard for the /auth email flows (magic link, password
 * reset, sign-up). Whatever Supabase Auth says about whether an address has
 * an account, the visitor sees the same neutral message, so the forms cannot
 * be used to test which emails are customers.
 */

export const NEUTRAL_MAGIC_LINK_MESSAGE =
  "If an account exists for that email, we sent a one-tap sign-in link. It works once and expires; if it doesn't arrive in a few minutes, check spam or try again.";

export const NEUTRAL_RESET_MESSAGE =
  "If an account exists for that email, we sent a secure reset link. It works once and expires; if it doesn't arrive in a few minutes, check spam or try again.";

export const NEUTRAL_SIGNUP_MESSAGE =
  "Check your email for a confirmation link before signing in. If you already have an account, sign in or reset your password.";

export const EMAIL_REQUEST_FAILED_MESSAGE =
  "We couldn't send that email right now. Check the address and your connection, then try again.";

/** Neutral toast text, shared by both link flows. */
export const NEUTRAL_LINK_TOAST = "Check your email.";

type AuthErrorLike = { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

/**
 * Supabase Auth answers that reveal whether an account exists. Unknown
 * emails with `shouldCreateUser: false` get "Signups not allowed for otp";
 * existing ones can get per-user rate limits ("you can only request this
 * after N seconds") that unknown ones never see; sign-up with an existing
 * address (when confirmations are off) gets "User already registered".
 */
const EXISTENCE_CODES = new Set([
  "otp_disabled",
  "signup_disabled",
  "user_not_found",
  "user_already_exists",
  "email_exists",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);
const EXISTENCE_MESSAGES =
  /signups? not allowed|user not found|already registered|already exists|for security purposes|rate limit/i;

/** True when an auth error would tell the visitor whether the email has an account. */
export function revealsAccountExistence(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as AuthErrorLike;
  if (typeof e.code === "string" && EXISTENCE_CODES.has(e.code)) return true;
  if (e.status === 429) return true;
  return typeof e.message === "string" && EXISTENCE_MESSAGES.test(e.message);
}

export type EmailRequestOutcome =
  { kind: "sent"; message: string } | { kind: "failed"; message: string };

/**
 * Outcome to show for a magic-link or reset-link request. Existence-revealing
 * errors are reported exactly like a success; anything else (network, bad
 * address) gets one generic failure that says nothing about the account.
 */
export function emailLinkOutcome(error: unknown, neutralMessage: string): EmailRequestOutcome {
  if (!error || revealsAccountExistence(error)) return { kind: "sent", message: neutralMessage };
  return { kind: "failed", message: EMAIL_REQUEST_FAILED_MESSAGE };
}

/**
 * In-Settings email change: the signed-in owner already has an account. The
 * risk is revealing whether the *new* address is already registered to
 * someone else (email_exists / already registered). Success and those
 * existence errors share one pending message; never say "taken" or "free".
 */
export const NEUTRAL_EMAIL_CHANGE_MESSAGE =
  "If that address can be used, we sent a confirmation link. Check the new inbox (and your current one). It works once and expires; if nothing arrives in a few minutes, try a different address or check spam.";

/**
 * Outcome for an email-change request after updateUser({ email }). Existence
 * answers (address already on another account, per-user send cooldowns) look
 * exactly like a sent confirmation.
 */
export function emailChangeOutcome(error: unknown): EmailRequestOutcome {
  return emailLinkOutcome(error, NEUTRAL_EMAIL_CHANGE_MESSAGE);
}
