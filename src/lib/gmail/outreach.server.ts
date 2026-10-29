import { base64UrlEncode, buildMimeMessage, newMessageId } from "./mime.server";
import { sendGmailRaw, type GmailConfig, type GmailError } from "./client.server";

/**
 * Sends one plain-text prospect email from the Gmail mailbox. No Reply-To is
 * set: replies must come back to the polled mailbox so the inbound job sees
 * them. Every message carries the one-click List-Unsubscribe headers.
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
