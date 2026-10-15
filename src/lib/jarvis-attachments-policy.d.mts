export declare const JARVIS_ATTACHMENT_BUCKET: string;
export declare const MAX_IMAGE_BYTES: number;
export declare const MAX_TEXT_BYTES: number;
export declare const MAX_ATTACHMENTS_PER_MESSAGE: number;
export declare const MAX_SUMMARY_CHARS: number;
export declare const MAX_STORED_SUMMARY_CHARS: number;
export declare const MAX_MESSAGE_CHARS: number;
export declare const MAX_MESSAGE_CHARS_WITH_ATTACHMENTS: number;
export declare const DEFAULT_MONTHLY_UPLOADS: number;
export type AttachmentKind = "image" | "document";
export type ClassifiedUpload =
  | { ok: true; ext: string; mime: string; kind: AttachmentKind; maxBytes: number }
  | { ok: false; reason: string };
export declare function isUuid(value: unknown): value is string;
export declare function extensionOf(filename: unknown): string | null;
export declare function classifyUpload(input: unknown): ClassifiedUpload;
export declare function storagePathFor(userId: string, id: string, ext: string): string;
export declare function parseOwnedPath(
  userId: string,
  path: unknown,
): { id: string; ext: string; mime: string; kind: AttachmentKind } | null;
export declare function sniffImage(bytes: Uint8Array): string | null;
export declare function decodeText(bytes: Uint8Array): { ok: true; text: string } | { ok: false };
export declare function redactAttachmentText(value: unknown, limit?: number): string;
export declare function safeDisplayName(name: unknown): string;
export declare function remainingUploads(
  row: { period_start?: unknown; uploads_used?: unknown; monthly_limit?: unknown } | null,
  now?: Date,
  defaultLimit?: number,
): { remaining: number; limit: number };
export declare function validateMessageBudget(
  message: unknown,
  attachmentCount: number,
): { ok: true } | { ok: false; reason: string };
export declare function buildAttachmentBlock(
  items: { name: unknown; mime: unknown; size: unknown; status: unknown; summary: unknown }[],
  nonce: string,
): string;
