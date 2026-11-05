/**
 * Server side of preview-link passwords (LOV-6).
 *
 * The gate fails closed: if the secrets table cannot be read for any reason
 * other than "this feature's table does not exist yet" (the migration applies
 * on publish), the visitor is NOT let in. Nothing here ever returns draft data.
 */
import { clientIp, hashPreviewIp } from "@/lib/preview-telemetry.server";
import {
  PREVIEW_PASSWORD_MAX,
  spendVerifyTime,
  unlockCookieName,
  unlockProof,
  unlockProofMatches,
  verifyPreviewPassword,
} from "@/lib/preview-password";

/** Wrong guesses allowed per visitor (IP) per link, and per link overall, in each window. */
export const UNLOCK_MAX_PER_VISITOR = 6;
export const UNLOCK_MAX_PER_LINK = 40;
export const UNLOCK_WINDOW_SECONDS = 10 * 60;
/** How long a correct password is remembered in that browser. */
export const UNLOCK_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

type Db = {
  from(table: string): {
    select(columns: string): { eq(column: string, value: unknown): { maybeSingle(): PromiseLike<{ data: unknown; error: DbError | null }> } };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError | null }>;
};
type DbError = { code?: string; message?: string };

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

/** The table or function simply is not in the database yet (migration not published). */
export function isFeatureNotInstalled(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42883" || error.code === "PGRST205" || error.code === "PGRST202") return true;
  return /could not find the (table|function)|does not exist/i.test(error.message ?? "");
}

export function unlockSecret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env["PREVIEW_UNLOCK_SECRET"]?.trim() || env["PREVIEW_TELEMETRY_SECRET"]?.trim() || env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  return value || null;
}

export type PasswordState = { protected: false } | { protected: true; hash: string };

/** Throws on a real database error so callers fail closed. */
export async function readPasswordState(linkId: string, db?: Db): Promise<PasswordState> {
  const client = db ?? (await admin());
  const { data, error } = await client.from("website_preview_link_secrets").select("password_hash").eq("link_id", linkId).maybeSingle();
  if (error) {
    if (isFeatureNotInstalled(error)) return { protected: false };
    throw new Error("password state unavailable");
  }
  const hash = (data as { password_hash?: unknown } | null)?.password_hash;
  return typeof hash === "string" && hash ? { protected: true, hash } : { protected: false };
}

/**
 * Whether this request may see the link's content: true when the link has no
 * password, or the browser holds the unlock cookie for the current password.
 * Any error answers false.
 */
export async function previewAccessAllowed(
  token: string,
  linkId: string,
  deps: { readCookie?: (name: string) => string | undefined; state?: (id: string) => Promise<PasswordState>; secret?: string | null } = {},
): Promise<boolean> {
  try {
    const state = await (deps.state ?? readPasswordState)(linkId);
    if (!state.protected) return true;
    const readCookie = deps.readCookie ?? (await import("@tanstack/react-start/server")).getCookie;
    return await unlockProofMatches(deps.secret === undefined ? unlockSecret() : deps.secret, linkId, state.hash, readCookie(unlockCookieName(token)));
  } catch {
    return false;
  }
}

export type UnlockResult =
  | { ok: true }
  /** Same answer for a wrong password, an unknown or unprotected link, and any internal problem. */
  | { ok: false; reason: "wrong_password" | "rate_limited" };

type LinkRow = { id: string; expires_at: string; revoked: boolean };

/**
 * Checks a visitor's password. Counts the attempt first (per visitor and per
 * link, by HMAC, never the raw IP), and answers identically whether or not the
 * link exists so the form cannot be used to probe for links.
 */
export async function attemptUnlock(
  input: { token: string; password: string },
  deps: {
    ip?: string;
    db?: Db;
    secret?: string | null;
    setCookie?: (name: string, value: string, options: Record<string, unknown>) => void;
    now?: () => number;
  } = {},
): Promise<UnlockResult> {
  const db = deps.db ?? (await admin());
  const secret = deps.secret === undefined ? unlockSecret() : deps.secret;
  const ip = deps.ip ?? "unknown";
  const password = typeof input.password === "string" ? input.password.slice(0, PREVIEW_PASSWORD_MAX + 1) : "";

  const visitorKey = secret ? await hashPreviewIp(input.token, ip, secret) : null;
  const linkKey = secret ? await hashPreviewIp(input.token, "*", secret) : null;
  if (!visitorKey || !linkKey) {
    await spendVerifyTime(password);
    return { ok: false, reason: "wrong_password" };
  }
  const visitorOk = await db.rpc("preview_unlock_attempt", { p_key: `v:${visitorKey}`, p_max: UNLOCK_MAX_PER_VISITOR, p_window_seconds: UNLOCK_WINDOW_SECONDS });
  const linkOk = await db.rpc("preview_unlock_attempt", { p_key: `l:${linkKey}`, p_max: UNLOCK_MAX_PER_LINK, p_window_seconds: UNLOCK_WINDOW_SECONDS });
  if (visitorOk.error || linkOk.error) {
    await spendVerifyTime(password);
    return { ok: false, reason: "wrong_password" };
  }
  if (visitorOk.data !== true || linkOk.data !== true) return { ok: false, reason: "rate_limited" };

  const { data: linkData, error: linkError } = await db
    .from("website_preview_links")
    .select("id, expires_at, revoked")
    .eq("token", input.token)
    .maybeSingle();
  const link = linkError ? null : (linkData as LinkRow | null);
  const live = !!link && !link.revoked && new Date(link.expires_at).getTime() > (deps.now ?? Date.now)();
  let state: PasswordState = { protected: false };
  if (live && link) {
    try {
      state = await readPasswordState(link.id, db);
    } catch {
      state = { protected: false };
    }
  }
  if (!live || !link || !state.protected) {
    await spendVerifyTime(password);
    return { ok: false, reason: "wrong_password" };
  }
  if (!(await verifyPreviewPassword(password, state.hash))) return { ok: false, reason: "wrong_password" };

  const setCookie = deps.setCookie ?? (await import("@tanstack/react-start/server")).setCookie;
  const remaining = Math.floor((new Date(link.expires_at).getTime() - (deps.now ?? Date.now)()) / 1000);
  setCookie(unlockCookieName(input.token), await unlockProof(secret as string, link.id, state.hash), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, Math.min(UNLOCK_COOKIE_MAX_AGE_SECONDS, remaining)),
  });
  await db.rpc("preview_unlock_clear", { p_key: `v:${visitorKey}` });
  return { ok: true };
}

export { clientIp };
