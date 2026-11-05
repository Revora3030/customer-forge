/**
 * In-Settings email change. Re-authenticates with the current password (same
 * pattern as changePassword), then asks Supabase Auth to start a confirmed
 * email change. Existence-revealing Auth errors are normalized by
 * emailChangeOutcome so the UI never discloses whether the new address is
 * already registered.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMAIL_REQUEST_FAILED_MESSAGE,
  emailChangeOutcome,
  type EmailRequestOutcome,
} from "@/lib/auth-email-requests";
import { isValidEmailSyntax } from "@/lib/prospect-enrichment";

export type EmailChangeResult =
  | { ok: true; outcome: EmailRequestOutcome; pendingEmail: string | null }
  | { ok: false; message: string };

export type EmailChangeAuth = Pick<SupabaseClient["auth"], "signInWithPassword" | "updateUser">;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateChangeEmail(
  currentEmail: string | null | undefined,
  nextRaw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = normalizeEmail(nextRaw);
  if (!value) return { ok: false, message: "Enter the new email address." };
  if (!isValidEmailSyntax(value)) return { ok: false, message: "Enter a valid email address." };
  const current = currentEmail ? normalizeEmail(currentEmail) : "";
  if (current && value === current) return { ok: false, message: "That's already your email." };
  return { ok: true, value };
}

/**
 * Re-auth with the current password, then request the email change. On Auth
 * success or an existence-revealing error, returns ok with the neutral
 * pending message. Wrong password and network failures stay explicit.
 * `pendingEmail` is set only when Auth accepted the change (never on a
 * neutralized existence error), so the UI does not invent a pending address.
 */
export async function requestEmailChange(
  auth: EmailChangeAuth,
  input: {
    currentEmail: string | null | undefined;
    currentPassword: string;
    newEmail: string;
    emailRedirectTo: string;
  },
): Promise<EmailChangeResult> {
  const validated = validateChangeEmail(input.currentEmail, input.newEmail);
  if (!validated.ok) return { ok: false, message: validated.message };
  if (!input.currentEmail) {
    return {
      ok: false,
      message: "This account has no email to change from. Contact support.",
    };
  }
  if (!input.currentPassword) {
    return { ok: false, message: "Enter your current password to continue." };
  }

  const { error: reauthError } = await auth.signInWithPassword({
    email: input.currentEmail,
    password: input.currentPassword,
  });
  if (reauthError) {
    return {
      ok: false,
      message: "Your current password is incorrect. Try again, or request a reset link.",
    };
  }

  try {
    const { data, error } = await auth.updateUser(
      { email: validated.value },
      { emailRedirectTo: input.emailRedirectTo },
    );
    const outcome = emailChangeOutcome(error);
    const reported = data?.user?.new_email;
    const accepted =
      !error && typeof reported === "string" && reported
        ? reported
        : !error
          ? validated.value
          : null;
    return { ok: true, outcome, pendingEmail: outcome.kind === "sent" ? accepted : null };
  } catch {
    return { ok: false, message: EMAIL_REQUEST_FAILED_MESSAGE };
  }
}
