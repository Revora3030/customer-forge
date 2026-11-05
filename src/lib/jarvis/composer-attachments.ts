/**
 * JC-45: text files dropped, pasted or picked into the Jarvis composer, held to
 * the existing attachment policy (jarvis-attachments-policy.mjs): TXT/CSV/JSON
 * only, 1 MB each, at most 3 per message, secrets/emails/tokens redacted, and
 * wrapped in UNTRUSTED ATTACHMENT markers so Jarvis treats them as data.
 * Nothing is uploaded or stored; the redacted text rides inside the message,
 * which still has to fit the 4,000-character message limit.
 * Pictures keep their existing path (picture -> demo request).
 */
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_CHARS,
  MAX_SUMMARY_CHARS,
  buildAttachmentBlock,
  classifyUpload,
  decodeText,
  validateMessageBudget,
} from "@/lib/jarvis-attachments-policy.mjs";

export type FileLike = { name: string; type: string; size: number };
export type ComposerDoc = { id: string; name: string; mime: string; size: number; text: string };
export type Rejected = { name: string; reason: string };

const isPicture = (file: FileLike) => file.type.startsWith("image/");

/**
 * Splits dropped/pasted files: the first picture keeps the demo flow, text
 * documents that pass the policy are accepted (up to the per-message cap,
 * counting ones already attached), everything else gets a plain reason.
 */
export function sortComposerFiles<F extends FileLike>(files: readonly F[], alreadyAttached = 0): { picture: F | null; documents: F[]; rejected: Rejected[] } {
  let picture: F | null = null;
  const documents: F[] = [];
  const rejected: Rejected[] = [];
  for (const file of files) {
    if (isPicture(file)) {
      if (!picture) picture = file;
      else rejected.push({ name: file.name, reason: "One picture at a time." });
      continue;
    }
    const check = classifyUpload({ filename: file.name, mimeType: file.type, size: file.size });
    if (!check.ok) { rejected.push({ name: file.name, reason: check.reason }); continue; }
    if (check.kind !== "document") { rejected.push({ name: file.name, reason: "Only TXT, CSV and JSON files can be attached here." }); continue; }
    if (alreadyAttached + documents.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      rejected.push({ name: file.name, reason: `Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.` });
      continue;
    }
    documents.push(file);
  }
  return { picture, documents, rejected };
}

/** Reads bytes as UTF-8 text; binary or invalid text is refused, as on the server. */
export function readDocumentText(bytes: Uint8Array): { ok: true; text: string } | { ok: false; reason: string } {
  const decoded = decodeText(bytes);
  if (!decoded.ok) return { ok: false, reason: "That file isn't readable text." };
  if (!decoded.text.trim()) return { ok: false, reason: "That file is empty." };
  return { ok: true, text: decoded.text };
}

const nonce = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

/**
 * The message Jarvis receives: the owner's words, then each file inside
 * untrusted-attachment markers. Long files are trimmed (and marked "trimmed")
 * so the total fits `maxTotal`. Refuses rather than silently dropping files.
 */
export function composeWithDocuments(
  message: string,
  docs: readonly ComposerDoc[],
  opts: { maxTotal?: number; boundary?: string } = {},
): { ok: true; text: string } | { ok: false; reason: string } {
  if (!docs.length) return { ok: true, text: message };
  const budget = validateMessageBudget(message, docs.length);
  if (!budget.ok) return budget;
  const maxTotal = opts.maxTotal ?? MAX_MESSAGE_CHARS;
  const boundary = opts.boundary ?? nonce();
  const build = (perFile: number) =>
    message + buildAttachmentBlock(
      docs.map((d) => ({ name: d.name, mime: d.mime, size: d.size, status: d.text.length > perFile ? "trimmed" : "full", summary: d.text.slice(0, perFile) })),
      boundary,
    );
  let perFile = MAX_SUMMARY_CHARS;
  let text = build(perFile);
  while (text.length > maxTotal && perFile > 0) {
    perFile = Math.max(0, perFile - Math.max(50, Math.ceil((text.length - maxTotal) / docs.length)));
    text = build(perFile);
  }
  if (text.length > maxTotal || perFile < 100) {
    return { ok: false, reason: "That message is too long to send with these files. Shorten it or remove a file." };
  }
  return { ok: true, text };
}
