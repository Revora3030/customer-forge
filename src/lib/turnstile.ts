/**
 * Cloudflare Turnstile, shared by the browser widget and the server check.
 *
 * Turnstile only runs on hosts Revora owns and has registered on the widget
 * (the platform domain and the traffic domain, with their subdomains). A
 * customer's own domain can't be added to Revora's widget, so client sites on
 * custom domains keep the existing honeypot + ALTCHA + rate-limit defences.
 *
 * The site key is public by design and comes from the build environment
 * (`VITE_CLOUDFLARE_TURNSTILE_SITE_KEY`). With no site key, nothing renders
 * and the server never asks for a token: the forms work exactly as before.
 */
import { REVORA_ROOT, SITE_ROOT, normalizeHost } from "@/lib/revora-address";

/** The hidden input the widget writes its token into (Turnstile's default name). */
export const TURNSTILE_FIELD = "cf-turnstile-response";
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Turnstile tokens are at most 2048 characters. */
export const TURNSTILE_MAX_TOKEN = 2048;

/** The public site key, or "" when Turnstile isn't set up. */
export function turnstileSiteKey(env: Record<string, unknown> = import.meta.env ?? {}): string {
  const value = env["VITE_CLOUDFLARE_TURNSTILE_SITE_KEY"];
  return typeof value === "string" ? value.trim() : "";
}

/** True for the Revora-owned hosts registered on the Turnstile widget. */
export function turnstileHostAllowed(rawHost: string | null | undefined): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return false;
  return [REVORA_ROOT, SITE_ROOT].some((root) => host === root || host.endsWith(`.${root}`));
}

/** The token from a submitted form, or "" when the widget didn't run. */
export function turnstilePayload(form: FormData): string {
  const value = form.get(TURNSTILE_FIELD);
  return typeof value === "string" ? value.slice(0, TURNSTILE_MAX_TOKEN) : "";
}
