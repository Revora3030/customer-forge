/**
 * Decides whether /reset-password may set a new password without the current
 * one. Only a session that came from a password-reset email may do that: an
 * ordinary signed-in session (an unlocked laptop, a shared tablet) must prove
 * the current password first, or anyone at the device could take the account.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";

/** How long after the reset link was used the recovery session may skip re-auth. */
export const RECOVERY_WINDOW_SECONDS = 60 * 60;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const value: unknown = JSON.parse(atob(padded));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * True when the access token says the session was started by a password
 * recovery link within the recovery window. Supabase Auth records
 * `amr: [{ method: "recovery" }]` for PKCE recovery exchanges; the implicit
 * flow records "otp" (indistinguishable from a magic link), so for that flow
 * the PASSWORD_RECOVERY auth event is the signal (see rememberRecoverySession). This survives the auth client consuming the link before
 * the page's own listener is attached. The URL itself is never trusted: anyone
 * can type "#type=recovery" or "?code=x" onto the address of a signed-in tab.
 */
export function sessionIsRecovery(
  session: Pick<Session, "access_token"> | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!session?.access_token) return false;
  const amr = decodeJwtPayload(session.access_token)?.["amr"];
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (method !== "recovery") return false;
    if (typeof timestamp !== "number") return false;
    return nowSeconds - timestamp <= RECOVERY_WINDOW_SECONDS && timestamp <= nowSeconds + 60;
  });
}

const RECOVERY_SESSION_KEY = "revora:recovery-session";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionIdOf(session: Pick<Session, "access_token"> | null | undefined): string | null {
  if (!session?.access_token) return null;
  const id = decodeJwtPayload(session.access_token)?.["session_id"];
  return typeof id === "string" && id ? id : null;
}

/**
 * Called on the PASSWORD_RECOVERY event: remembers (for this tab only) which
 * auth session the reset link created, so a page refresh keeps the form
 * unlocked for that session and no other.
 */
export function rememberRecoverySession(
  storage: StorageLike | null | undefined,
  session: Pick<Session, "access_token"> | null | undefined,
): void {
  const id = sessionIdOf(session);
  if (!storage || !id) return;
  try {
    storage.setItem(RECOVERY_SESSION_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

export function forgetRecoverySession(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(RECOVERY_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Whether this session may set a new password without the current one: it
 * was started by a reset link (PASSWORD_RECOVERY seen in this tab, or a
 * recovery amr claim). Any other signed-in session must re-authenticate.
 */
export function isRecoverySession(
  storage: StorageLike | null | undefined,
  session: Pick<Session, "access_token"> | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!session) return false;
  if (sessionIsRecovery(session, nowSeconds)) return true;
  const id = sessionIdOf(session);
  if (!id || !storage) return false;
  try {
    return storage.getItem(RECOVERY_SESSION_KEY) === id;
  } catch {
    return false;
  }
}

export type PasswordChangeResult = { ok: true } | { ok: false; message: string };

type AuthLike = Pick<SupabaseClient["auth"], "signInWithPassword" | "updateUser">;

/**
 * Sets the new password. A recovery session sets it directly; any other
 * session must re-authenticate with the current password first, so a signed-in
 * device alone is never enough to change the password.
 */
export async function changePassword(
  auth: AuthLike,
  input: {
    recovery: boolean;
    email: string | null | undefined;
    currentPassword: string;
    newPassword: string;
  },
): Promise<PasswordChangeResult> {
  if (!input.recovery) {
    if (!input.email) {
      return {
        ok: false,
        message: "This account has no password to confirm. Request a reset link instead.",
      };
    }
    if (!input.currentPassword) {
      return { ok: false, message: "Enter your current password to continue." };
    }
    const { error: reauthError } = await auth.signInWithPassword({
      email: input.email,
      password: input.currentPassword,
    });
    if (reauthError) {
      return {
        ok: false,
        message: "Your current password is incorrect. Try again, or request a reset link.",
      };
    }
  }
  const { error } = await auth.updateUser({ password: input.newPassword });
  if (error) return { ok: false, message: error.message || "Could not update your password." };
  return { ok: true };
}
