import type { GmailApiMessage } from "./mime.server";

/**
 * Gmail API access for prospect outreach, from the four GMAIL_* secrets
 * (an OAuth client plus a refresh token for the sending mailbox). Without all
 * four, gmailConfig() is null and callers keep the Lovable email path.
 *
 * Transient provider errors (429, 5xx) are retried with exponential backoff,
 * at most GMAIL_MAX_ATTEMPTS attempts. A send retries only 429: a 5xx or a
 * dropped connection may come after Gmail accepted it, so it is reported as
 * gmail_transport_error (unconfirmed) and never resent here.
 */

export const GMAIL_SECRETS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_EMAIL"] as const;
export const GMAIL_MAX_ATTEMPTS = 3;
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 15_000;

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sender: string;
};

/** GMAIL_CLIENT_* may instead be saved under the GOOGLE_OAUTH_CLIENT_* names. */
const ALIASES: Partial<Record<(typeof GMAIL_SECRETS)[number], string>> = {
  GMAIL_CLIENT_ID: "GOOGLE_OAUTH_CLIENT_ID",
  GMAIL_CLIENT_SECRET: "GOOGLE_OAUTH_CLIENT_SECRET",
};

function readSecret(key: (typeof GMAIL_SECRETS)[number]): string {
  const direct = process.env[key]?.trim();
  if (direct) return direct;
  const alias = ALIASES[key];
  return (alias && process.env[alias]?.trim()) || "";
}

export function missingGmailSecrets(): string[] {
  return GMAIL_SECRETS.filter((key) => !readSecret(key));
}

export function mailingAddress(): string {
  return process.env["REVORA_MAILING_ADDRESS"]?.trim() ?? "";
}

export function gmailConfig(): GmailConfig | null {
  if (missingGmailSecrets().length) return null;
  const sender = readSecret("GMAIL_SENDER_EMAIL").toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(sender)) return null;
  return {
    clientId: readSecret("GMAIL_CLIENT_ID"),
    clientSecret: readSecret("GMAIL_CLIENT_SECRET"),
    refreshToken: readSecret("GMAIL_REFRESH_TOKEN"),
    sender,
  };
}

export function gmailNotConfiguredMessage(): string {
  const missing = missingGmailSecrets();
  return `Gmail isn't connected. Add these secrets in Lovable: ${(missing.length ? missing : [...GMAIL_SECRETS]).join(", ")}.`;
}

type Sleep = (ms: number) => Promise<void>;
let sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tests replace the backoff wait so they run instantly. */
export function setGmailSleepForTests(fn: Sleep | null): void {
  sleep = fn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

export const backoffMs = (attempt: number) => 500 * 2 ** (attempt - 1);
const transientStatus = (status: number) => status === 429 || status >= 500;

let cachedToken: { key: string; token: string; expiresAt: number } | null = null;

export function resetGmailTokenCache(): void {
  cachedToken = null;
}

export type GmailError = { ok: false; reason: string; status: number | null; transient: boolean };

async function accessToken(config: GmailConfig): Promise<{ ok: true; token: string } | GmailError> {
  const key = `${config.clientId}:${config.refreshToken.slice(-12)}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return { ok: true, token: cachedToken.token };
  for (let attempt = 1; attempt <= GMAIL_MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: "refresh_token",
        }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      if (attempt < GMAIL_MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, reason: "gmail_unavailable", status: null, transient: true };
    }
    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown };
      if (typeof data.access_token !== "string") return { ok: false, reason: "gmail_auth_failed", status: response.status, transient: false };
      cachedToken = { key, token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3000) * 1000 };
      return { ok: true, token: data.access_token };
    }
    await response.body?.cancel().catch(() => undefined);
    if (transientStatus(response.status) && attempt < GMAIL_MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
      continue;
    }
    return transientStatus(response.status)
      ? { ok: false, reason: response.status === 429 ? "rate_limited" : "gmail_unavailable", status: response.status, transient: true }
      : { ok: false, reason: "gmail_auth_failed", status: response.status, transient: false };
  }
  return { ok: false, reason: "gmail_unavailable", status: null, transient: true };
}

function errorFor(status: number): GmailError {
  if (status === 429) return { ok: false, reason: "rate_limited", status, transient: true };
  if (status >= 500) return { ok: false, reason: "gmail_unavailable", status, transient: true };
  if (status === 401 || status === 403) return { ok: false, reason: "gmail_auth_failed", status, transient: false };
  if (status === 404) return { ok: false, reason: "gmail_not_found", status, transient: false };
  return { ok: false, reason: "gmail_rejected", status, transient: false };
}

/**
 * One Gmail API call with backoff on 429/5xx. `idempotent` is off for sends:
 * a dropped connection or a 5xx may mean Gmail already accepted the message,
 * so only 429 (rejected before acceptance) is retried and the rest is
 * reported as an unconfirmed gmail_transport_error.
 */
async function gmailRequest<T>(
  config: GmailConfig,
  path: string,
  init: { method?: string; body?: unknown; idempotent: boolean },
): Promise<{ ok: true; data: T } | GmailError> {
  const token = await accessToken(config);
  if (!token.ok) return token;
  for (let attempt = 1; attempt <= GMAIL_MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        method: init.method ?? "GET",
        headers: {
          authorization: `Bearer ${token.token}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      if (init.idempotent && attempt < GMAIL_MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, reason: init.idempotent ? "gmail_unavailable" : "gmail_transport_error", status: null, transient: init.idempotent };
    }
    if (response.ok) return { ok: true, data: (await response.json().catch(() => ({}))) as T };
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401) resetGmailTokenCache();
    if (!init.idempotent && response.status >= 500) return { ok: false, reason: "gmail_transport_error", status: response.status, transient: false };
    if (transientStatus(response.status) && attempt < GMAIL_MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
      continue;
    }
    return errorFor(response.status);
  }
  return { ok: false, reason: "gmail_unavailable", status: null, transient: true };
}

export type GmailSendResult = { ok: true; id: string; threadId: string } | GmailError;

/** users.messages.send with a prebuilt base64url message; threadId keeps a reply in its thread. */
export async function sendGmailRaw(config: GmailConfig, raw: string, threadId?: string | null): Promise<GmailSendResult> {
  const result = await gmailRequest<{ id?: string; threadId?: string }>(config, "/messages/send", {
    method: "POST",
    body: { raw, ...(threadId ? { threadId } : {}) },
    idempotent: false,
  });
  if (!result.ok) return result;
  if (typeof result.data.id !== "string" || typeof result.data.threadId !== "string")
    return { ok: false, reason: "gmail_transport_error", status: null, transient: false };
  return { ok: true, id: result.data.id, threadId: result.data.threadId };
}

/** Every message of one thread, full payloads. */
export async function getGmailThread(
  config: GmailConfig,
  threadId: string,
): Promise<{ ok: true; messages: GmailApiMessage[] } | GmailError> {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(threadId)) return { ok: false, reason: "gmail_not_found", status: null, transient: false };
  const result = await gmailRequest<{ messages?: GmailApiMessage[] }>(config, `/threads/${threadId}?format=full`, { idempotent: true });
  if (!result.ok) return result;
  return { ok: true, messages: Array.isArray(result.data.messages) ? result.data.messages : [] };
}
