import { base64UrlEncode, buildMimeMessage, newMessageId } from "./mime.server";
import { sendGmailRaw, type GmailConfig, type GmailError } from "./client.server";

/**
 * Sends one plain-text prospect email from the Gmail mailbox. No Reply-To is
 * set: replies must come back to the polled mailbox so the inbound job sees
 * them. Every message carries the one-click List-Unsubscribe headers (RFC 8058
 * https one-click plus an RFC 2369 mailto to the polled mailbox).
 */
export type GmailOutreachInput = {
  to: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
  /** Replies: the Message-ID answered, earlier references, and Gmail's thread id. */
  inReplyTo?: string | null;
  references?: string[];
  threadId?: string | null;
};

/** Subject a mailto unsubscribe carries, so the reply poller can match it to the token. */
export const MAILTO_UNSUBSCRIBE_SUBJECT = "unsubscribe";
const OUTREACH_TOKEN = /\/unsubscribe\/outreach\/([A-Za-z0-9_-]{20,80})(?:[?#]|$)/;

/**
 * The RFC 2369 mailto alternative: a message to the polled mailbox whose
 * subject names the unsubscribe token ("unsubscribe <token>"), which the
 * prospect-replies job turns into a do-not-contact entry.
 */
export function unsubscribeMailto(sender: string, unsubscribeUrl: string): string {
  const token = unsubscribeUrl.match(OUTREACH_TOKEN)?.[1];
  const subject = token ? `${MAILTO_UNSUBSCRIBE_SUBJECT} ${token}` : MAILTO_UNSUBSCRIBE_SUBJECT;
  return `mailto:${sender}?subject=${encodeURIComponent(subject)}`;
}

/** The token in a mailto unsubscribe subject ("unsubscribe <token>", any Re:/Fwd: prefix), else null. */
export function mailtoUnsubscribeToken(subject: string | null | undefined): string | null {
  const match = (subject ?? "").trim().match(/^(?:(?:re|fwd?|aw)\s*:\s*)*unsubscribe\s+([A-Za-z0-9_-]{20,80})\s*$/i);
  return match?.[1] ?? null;
}

export type GmailOutreachResult = { ok: true; id: string; threadId: string; rfcMessageId: string } | GmailError;

export async function sendGmailOutreach(config: GmailConfig, input: GmailOutreachInput): Promise<GmailOutreachResult> {
  const rfcMessageId = newMessageId(config.sender);
  const mime = buildMimeMessage({
    from: config.sender,
    fromName: (process.env["REVORA_SENDER_NAME"]?.trim() || "Revora Growth Systems") === "Revora Growth Systems"
      ? "Revora Growth Systems"
      : `${process.env["REVORA_SENDER_NAME"]?.trim()} (Revora Growth Systems)`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    messageId: rfcMessageId,
    listUnsubscribeUrl: input.unsubscribeUrl,
    listUnsubscribeMailto: unsubscribeMailto(config.sender, input.unsubscribeUrl),
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? [],
  });
  if (!mime.includes('Content-Type: text/plain; charset="UTF-8"') || /text\/html/i.test(mime)) {
    return { ok: false, reason: "not_plain_text", status: null, transient: false };
  }
  const sent = await sendGmailRaw(config, base64UrlEncode(mime), input.threadId ?? null);
  if (!sent.ok) return sent;
  return { ok: true, id: sent.id, threadId: sent.threadId, rfcMessageId };
}
