import type { SupabaseClient } from "@supabase/supabase-js";
import { currentStoredGmail, runWithStoredGmail, type StoredGmail } from "./runtime";

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i;
const SECRET = /^[^\s\r\n]{8,512}$/;

export type GmailSettingsInput = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  senderEmail?: string;
  mailingAddress?: string;
};

export type GmailConnectionView = {
  configured: boolean;
  missingSecrets: string[];
  senderEmail: string | null;
  mailingAddressSet: boolean;
  source: "environment" | "saved" | "mixed" | "missing";
};

function cleanSecret(value: unknown, max = 300): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /[\r\n]/.test(text) || text.length > max) return "";
  return text;
}

export function parseStoredGmail(value: unknown): StoredGmail | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const stored: StoredGmail = {
    clientId: cleanSecret(row["clientId"], 200),
    clientSecret: cleanSecret(row["clientSecret"]),
    refreshToken: cleanSecret(row["refreshToken"], 512),
    sender: cleanSecret(row["senderEmail"], 200).toLowerCase(),
    mailingAddress: typeof row["mailingAddress"] === "string" ? row["mailingAddress"].replace(/[\r\n]+/g, " ").trim().slice(0, 300) : "",
  };
  if (!stored.clientId && !stored.clientSecret && !stored.refreshToken && !stored.sender && !stored.mailingAddress) return null;
  if (stored.sender && !EMAIL.test(stored.sender)) stored.sender = "";
  return stored;
}

export async function readStoredGmail(db: SupabaseClient): Promise<StoredGmail | null> {
  try {
    const { data, error } = await db.from("prospect_autopilot_settings").select("gmail").eq("id", 1).maybeSingle();
    if (error) return null;
    return parseStoredGmail((data as { gmail?: unknown } | null)?.gmail);
  } catch {
    return null;
  }
}

/** Runs `fn` with saved Gmail settings visible to gmailConfig() and outreachFooter(). */
export async function withStoredGmail<T>(db: SupabaseClient, fn: () => Promise<T> | T): Promise<T> {
  const stored = (await readStoredGmail(db)) ?? { clientId: "", clientSecret: "", refreshToken: "", sender: "", mailingAddress: "" };
  return runWithStoredGmail(stored, fn);
}

function merged(): StoredGmail {
  const saved = currentStoredGmail();
  return {
    clientId: process.env["GMAIL_CLIENT_ID"]?.trim() || saved.clientId,
    clientSecret: process.env["GMAIL_CLIENT_SECRET"]?.trim() || saved.clientSecret,
    refreshToken: process.env["GMAIL_REFRESH_TOKEN"]?.trim() || saved.refreshToken,
    sender: process.env["GMAIL_SENDER_EMAIL"]?.trim().toLowerCase() || saved.sender,
    mailingAddress: process.env["REVORA_MAILING_ADDRESS"]?.trim() || saved.mailingAddress,
  };
}

export function mergedGmailSecrets(): { clientId: string; clientSecret: string; refreshToken: string; sender: string } {
  const row = merged();
  return { clientId: row.clientId, clientSecret: row.clientSecret, refreshToken: row.refreshToken, sender: row.sender };
}

export function mergedMailingAddress(): string {
  return merged().mailingAddress;
}

const FIELD_NAMES = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_EMAIL"] as const;

export function missingMergedGmailSecrets(): string[] {
  const row = merged();
  const present: Record<(typeof FIELD_NAMES)[number], string> = {
    GMAIL_CLIENT_ID: row.clientId,
    GMAIL_CLIENT_SECRET: row.clientSecret,
    GMAIL_REFRESH_TOKEN: row.refreshToken,
    GMAIL_SENDER_EMAIL: row.sender,
  };
  return FIELD_NAMES.filter((key) => !present[key]);
}

export function gmailConnectionView(): GmailConnectionView {
  const saved = currentStoredGmail();
  const missing = missingMergedGmailSecrets();
  const envFields = [
    process.env["GMAIL_CLIENT_ID"]?.trim(),
    process.env["GMAIL_CLIENT_SECRET"]?.trim(),
    process.env["GMAIL_REFRESH_TOKEN"]?.trim(),
    process.env["GMAIL_SENDER_EMAIL"]?.trim(),
  ].filter(Boolean).length;
  const savedFields = [saved.clientId, saved.clientSecret, saved.refreshToken, saved.sender].filter(Boolean).length;
  const source = missing.length === 4 ? "missing" : envFields && savedFields ? "mixed" : envFields ? "environment" : savedFields ? "saved" : "missing";
  const sender = merged().sender;
  return {
    configured: missing.length === 0 && EMAIL.test(sender),
    missingSecrets: [...missing],
    senderEmail: EMAIL.test(sender) ? sender : null,
    mailingAddressSet: Boolean(merged().mailingAddress),
    source,
  };
}

function validatePatch(input: GmailSettingsInput, current: StoredGmail): StoredGmail {
  const next: StoredGmail = { ...current };
  if (input.clientId !== undefined) {
    const value = cleanSecret(input.clientId, 200);
    if (input.clientId.trim() && !value) throw new Error("Gmail client id looks invalid.");
    if (value) next.clientId = value;
  }
  if (input.clientSecret !== undefined) {
    const value = cleanSecret(input.clientSecret);
    if (input.clientSecret.trim() && (!value || !SECRET.test(value))) throw new Error("Gmail client secret looks invalid.");
    if (value) next.clientSecret = value;
  }
  if (input.refreshToken !== undefined) {
    const value = cleanSecret(input.refreshToken, 512);
    if (input.refreshToken.trim() && (!value || !SECRET.test(value))) throw new Error("Gmail refresh token looks invalid.");
    if (value) next.refreshToken = value;
  }
  if (input.senderEmail !== undefined) {
    const value = cleanSecret(input.senderEmail, 200).toLowerCase();
    if (input.senderEmail.trim() && !EMAIL.test(value)) throw new Error("Sender email looks invalid.");
    if (value) next.sender = value;
  }
  if (input.mailingAddress !== undefined) {
    const value = input.mailingAddress.replace(/[\r\n]+/g, " ").trim().slice(0, 300);
    if (input.mailingAddress.trim() && value.length < 8) throw new Error("Add the full mailing address.");
    if (value) next.mailingAddress = value;
  }
  return next;
}

/** Saves only the fields the founder pasted. Blank fields keep the saved value. Secrets are not returned. */
export async function saveGmailSettings(db: SupabaseClient, input: GmailSettingsInput, actorId: string): Promise<GmailConnectionView> {
  const current = (await readStoredGmail(db)) ?? { clientId: "", clientSecret: "", refreshToken: "", sender: "", mailingAddress: "" };
  const next = validatePatch(input, current);
  const { error } = await db.from("prospect_autopilot_settings").upsert({
    id: 1,
    gmail: {
      clientId: next.clientId,
      clientSecret: next.clientSecret,
      refreshToken: next.refreshToken,
      senderEmail: next.sender,
      mailingAddress: next.mailingAddress,
    },
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Couldn't save the Gmail connection. Apply the latest database migration, then try again.");
  await db.from("audit_logs").insert({
    organization_id: null,
    actor_id: actorId,
    action: "jarvis.gmail.connected",
    entity: "prospect_autopilot_settings",
    entity_id: null,
    metadata: { senderEmail: next.sender || null, mailingAddressSet: Boolean(next.mailingAddress) },
  });
  return runWithStoredGmail(next, () => gmailConnectionView());
}
