/**
 * Server-side Cloudflare Turnstile check for the public lead forms.
 *
 * Fail-open by design, like ALTCHA (src/lib/altcha.server.ts): a lost real
 * lead costs more than a bot that slips through, and the honeypot, ALTCHA and
 * the IP/contact rate limits still apply.
 *  - secret or site key missing, or a host not on the widget -> "skipped"
 *    (logged once per isolate; the form works exactly as today)
 *  - no token, or an expired/already-used token (a retry)      -> "missing"
 *  - siteverify unreachable, slow, or a Cloudflare-side error   -> "unavailable"
 *  - Cloudflare says the token is bad                           -> "invalid"
 *  - success                                                    -> "verified"
 *
 * The secret is only read from `CLOUDFLARE_TURNSTILE_SECRET_KEY`; nothing is
 * hard-coded. siteverify is a fixed Cloudflare endpoint, never a
 * visitor-supplied address, so it doesn't need net-guard's SSRF checks.
 */
import { TURNSTILE_MAX_TOKEN, turnstileHostAllowed, turnstileSiteKey } from "@/lib/turnstile";
import type { AltchaVerdict } from "@/lib/altcha.server";

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 4_000;

export type TurnstileVerdict = "verified" | "missing" | "invalid" | "unavailable" | "skipped";

type Env = Record<string, string | undefined>;

let warnedUnconfigured = false;

/** Secret + site key both present. Either one alone means "not set up". */
export function turnstileConfigured(env: Env = process.env, buildEnv: Record<string, unknown> = import.meta.env ?? {}): boolean {
  const secret = env["CLOUDFLARE_TURNSTILE_SECRET_KEY"]?.trim();
  const siteKey = turnstileSiteKey(buildEnv) || turnstileSiteKey(env);
  return !!secret && !!siteKey;
}

// Codes that mean "this token can't be checked again", not "a bot forged it":
// a visitor retrying after a rate-limit or validation error resubmits a used
// token, which must fall back to the other checks rather than be dropped.
const RETRY_CODES = new Set(["timeout-or-duplicate"]);
// Codes that mean our configuration or Cloudflare is at fault.
const SERVER_SIDE_CODES = new Set(["missing-input-secret", "invalid-input-secret", "bad-request", "internal-error"]);

export async function verifyTurnstileToken(
  token: unknown,
  options: {
    host: string;
    ip?: string | null;
    env?: Env;
    buildEnv?: Record<string, unknown>;
    fetchImpl?: typeof fetch;
  },
): Promise<TurnstileVerdict> {
  const env = options.env ?? process.env;
  if (!turnstileConfigured(env, options.buildEnv)) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn("turnstile: CLOUDFLARE_TURNSTILE_SECRET_KEY or VITE_CLOUDFLARE_TURNSTILE_SITE_KEY not set; lead forms use honeypot + ALTCHA + rate limits only");
    }
    return "skipped";
  }
  if (!turnstileHostAllowed(options.host)) return "skipped";
  const raw = typeof token === "string" ? token.trim() : "";
  if (!raw) return "missing";
  if (raw.length > TURNSTILE_MAX_TOKEN) return "invalid";
  const body = new URLSearchParams({ secret: env["CLOUDFLARE_TURNSTILE_SECRET_KEY"]!.trim(), response: raw });
  // Only a real edge-supplied address is forwarded (never the "edge:host" fallback).
  if (options.ip && !options.ip.startsWith("edge:")) body.set("remoteip", options.ip);
  try {
    const response = await (options.fetchImpl ?? fetch)(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("turnstile: siteverify HTTP", response.status);
      return "unavailable";
    }
    const result = (await response.json()) as { success?: unknown; "error-codes"?: unknown };
    if (result.success === true) return "verified";
    const codes = Array.isArray(result["error-codes"]) ? result["error-codes"].map(String) : [];
    if (codes.some((code) => SERVER_SIDE_CODES.has(code))) {
      console.warn("turnstile: siteverify rejected our request", codes.join(","));
      return "unavailable";
    }
    if (codes.length > 0 && codes.every((code) => RETRY_CODES.has(code))) return "missing";
    return "invalid";
  } catch (error) {
    console.warn("turnstile: siteverify unreachable", error instanceof Error ? error.name : "error");
    return "unavailable";
  }
}

/**
 * Whether a submission goes through, given both captcha verdicts.
 * Only a token Cloudflare rejected, or a missing token with no other proof
 * that a real browser ran the form, is dropped (silently, like the honeypot).
 */
export function leadCaptchaDecision(turnstile: TurnstileVerdict, altcha: AltchaVerdict): "accept" | "drop" {
  if (altcha === "invalid") return "drop";
  switch (turnstile) {
    case "verified":
    case "skipped":
    case "unavailable":
      return "accept";
    case "invalid":
      return "drop";
    case "missing":
      // Widget blocked, still loading, or a retry with a used token: accept
      // when ALTCHA proved a browser did the work, or ALTCHA itself is down.
      return altcha === "verified" || altcha === "unavailable" ? "accept" : "drop";
  }
}

/** Test hook: reset the once-per-isolate warning. */
export function __resetTurnstileWarning() {
  warnedUnconfigured = false;
}
