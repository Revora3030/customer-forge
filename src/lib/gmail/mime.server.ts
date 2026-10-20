/**
 * RFC 5322 message building and Gmail payload reading for prospect outreach.
 *
 * Gmail's users.messages.send takes the whole message as base64url in `raw`,
 * so every header is ours to set: From, the one-click List-Unsubscribe pair
 * (RFC 8058) and, for replies, In-Reply-To/References so the reply lands in
 * the prospect's existing thread. Header values never carry CR/LF, so text
 * from a prospect or the AI can't inject headers.
 */

export type MimeMessage = {
  from: string;
  /** Display name for From; quoted and encoded as needed. */
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  /** Our own Message-ID, without angle brackets added twice. */
  messageId: string;
  replyTo?: string | null;
  listUnsubscribeUrl?: string | null;
  /** Message-ID of the message being answered (threading). */
  inReplyTo?: string | null;
  /** Earlier Message-IDs of the thread, oldest first. */
  references?: string[];
  date?: Date;
};

/** base64url without padding, as Gmail's `raw` field expects. */
export function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

/** One header line's value: no CR/LF (header injection), trimmed, bounded. */
export function headerValue(value: string, max = 900): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** RFC 2047 encoded-word for non-ASCII header text (subjects, display names). */
export function encodeHeaderWord(value: string): string {
  const clean = headerValue(value);
  // Printable ASCII passes through unencoded.
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** `<id@host>` form; accepts an id with or without brackets. */
export function angleId(id: string): string {
  const bare = headerValue(id, 400).replace(/^<|>$/g, "");
  return `<${bare}>`;
}

function mailbox(address: string, name?: string | null): string {
  const email = headerValue(address, 254).replace(/[<>",;\s]/g, "");
  if (!name?.trim()) return email;
  const display = encodeHeaderWord(name);
  const quoted = display.startsWith("=?") ? display : `"${display.replace(/["\\]/g, "")}"`;
  return `${quoted} <${email}>`;
}

/** A fresh RFC 5322 Message-ID on the sender's domain. */
export function newMessageId(senderEmail: string): string {
  const domain = senderEmail.split("@")[1]?.replace(/[^a-z0-9.-]/gi, "") || "revoragrowthsystems.com";
  return `<revora.${crypto.randomUUID()}@${domain}>`;
}

const wrap76 = (base64: string) => base64.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");

/** The full RFC 5322 message (CRLF line endings), plain text, base64 body. */
export function buildMimeMessage(message: MimeMessage): string {
  const headers: string[] = [
    `From: ${mailbox(message.from, message.fromName)}`,
    `To: ${mailbox(message.to)}`,
    `Subject: ${encodeHeaderWord(message.subject)}`,
    `Date: ${(message.date ?? new Date()).toUTCString()}`,
    `Message-ID: ${angleId(message.messageId)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (message.replyTo) headers.push(`Reply-To: ${mailbox(message.replyTo)}`);
  if (message.inReplyTo) headers.push(`In-Reply-To: ${angleId(message.inReplyTo)}`);
  const references = [...(message.references ?? []), ...(message.inReplyTo ? [message.inReplyTo] : [])].map(angleId);
  const uniqueRefs = [...new Set(references)].slice(-20);
  if (uniqueRefs.length) headers.push(`References: ${uniqueRefs.join(" ")}`);
  if (message.listUnsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${headerValue(message.listUnsubscribeUrl, 500)}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }
  const body = wrap76(Buffer.from(message.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64"));
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}

/** The `raw` field for users.messages.send. */
export function buildRawMessage(message: MimeMessage): string {
  return base64UrlEncode(buildMimeMessage(message));
}

/* ------------------------------------------------------------------------ */
/* Reading Gmail API message payloads                                        */
/* ------------------------------------------------------------------------ */

export type GmailPayloadPart = {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
};

export type GmailApiMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPayloadPart;
};

export type ParsedGmailMessage = {
  id: string;
  threadId: string;
  receivedAt: Date;
  from: string | null;
  fromRaw: string;
  subject: string;
  messageId: string | null;
  references: string[];
  snippet: string;
  text: string;
  autoSubmitted: boolean;
};

export function payloadHeader(payload: GmailPayloadPart | undefined, name: string): string | null {
  const wanted = name.toLowerCase();
  const value = payload?.headers?.find((header) => header.name?.toLowerCase() === wanted)?.value;
  return typeof value === "string" ? value : null;
}

/** The bare address in "Name <a@b.com>" or "a@b.com". */
export function addressOf(value: string | null | undefined): string | null {
  const raw = value ?? "";
  const bracket = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = (bracket?.[1] ?? raw.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0] ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(candidate) ? candidate : null;
}

function findText(part: GmailPayloadPart | undefined, type: string): string | null {
  if (!part) return null;
  if (part.mimeType?.toLowerCase() === type && part.body?.data) return base64UrlDecode(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findText(child, type);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Plain text of an HTML mail part. A character walk rather than tag regexes:
 * anything inside a tag is dropped, as is the content of <script>/<style>
 * (whatever their closing tag looks like), and <br>/</p>/</div> become line
 * breaks. Only the result is read as text; it is never rendered as HTML.
 */
function stripHtml(html: string): string {
  let out = "";
  let index = 0;
  let skipUntil: string | null = null;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) {
      if (!skipUntil) out += html.slice(index);
      break;
    }
    if (!skipUntil) out += html.slice(index, open);
    const close = html.indexOf(">", open + 1);
    if (close === -1) break;
    const name = (/^<\s*(\/?)\s*([a-z0-9]+)/i.exec(html.slice(open, close + 1)) ?? []).slice(1).join("").toLowerCase();
    if (skipUntil) {
      if (name === skipUntil) skipUntil = null;
    } else if (name === "script" || name === "style") {
      skipUntil = `/${name}`;
    } else if (name === "br" || name === "/p" || name === "/div") {
      out += "\n";
    } else {
      out += " ";
    }
    index = close + 1;
  }
  // "&amp;" last, so "&amp;lt;" reads as the text "&lt;", not "<".
  return out
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");
}

/**
 * The new text of a reply: quoted history ("> ..." lines, an "On ... wrote:"
 * line, and everything from a forwarded/original-message divider) removed.
 * Text typed below or between the "> " lines of an "On ... wrote:" block (a
 * bottom-posted or interleaved reply) is kept; when unmarked history follows
 * that line (HTML-only mail), everything after it is cut.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  // "header": just past an "On ... wrote:" line; "quote": inside its "> " block.
  let state: "text" | "header" | "quote" = "text";
  for (const line of lines) {
    if (/^\s*-{2,}\s*(Original Message|Forwarded message)\s*-{2,}/i.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && out.length) break;
    if (/^\s*On .{3,200} wrote:\s*$/i.test(line)) {
      state = "header";
      continue;
    }
    if (/^\s*>/.test(line)) {
      if (state === "header") state = "quote";
      continue;
    }
    // A signature or server footer under the quoted history ends the reply:
    // a list footer's "unsubscribe" must never read as the prospect's stop.
    if (state === "quote" && /^\s*(--\s*|_{5,}\s*)$/.test(line)) break;
    if (state !== "text" && !line.trim()) continue;
    if (state === "header") break;
    state = "text";
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseGmailMessage(message: GmailApiMessage): ParsedGmailMessage | null {
  if (!message.id || !message.threadId) return null;
  const payload = message.payload;
  const fromRaw = payloadHeader(payload, "From") ?? "";
  const plain = findText(payload, "text/plain");
  const html = plain === null ? findText(payload, "text/html") : null;
  const full = plain ?? (html ? stripHtml(html) : "") ?? "";
  const references = (payloadHeader(payload, "References") ?? "").match(/<[^<>\s]+>/g) ?? [];
  const autoSubmitted = (payloadHeader(payload, "Auto-Submitted") ?? "no").toLowerCase() !== "no" ||
    Boolean(payloadHeader(payload, "X-Autoreply")) ||
    /^(bulk|junk|list|auto_reply)$/i.test(payloadHeader(payload, "Precedence") ?? "");
  const internal = Number(message.internalDate);
  return {
    id: message.id,
    threadId: message.threadId,
    receivedAt: Number.isFinite(internal) && internal > 0 ? new Date(internal) : new Date(0),
    from: addressOf(fromRaw),
    fromRaw: headerValue(fromRaw, 300),
    subject: headerValue(payloadHeader(payload, "Subject") ?? "", 300),
    messageId: payloadHeader(payload, "Message-ID") ?? payloadHeader(payload, "Message-Id"),
    references,
    snippet: headerValue(message.snippet ?? "", 300),
    text: stripQuotedReply(full).slice(0, 4000),
    autoSubmitted,
  };
}
