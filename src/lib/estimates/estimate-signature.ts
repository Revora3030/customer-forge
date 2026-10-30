/**
 * Audit-trail helpers for a customer's "Sign & approve" on an estimate. Shared
 * by the browser (hash shown and sent) and the server (hash recomputed and
 * stored). Nothing here touches the network.
 */
import type { DocumentModel } from "@/lib/estimates/printable-estimate";

export const MAX_SIGNATURE_PNG_BYTES = 300_000;
export const MAX_DOCUMENT_JSON = 64_000;
const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type EstimateSignature = {
  /** data:image/png;base64,… as drawn on the pad. */
  dataUrl: string;
  signerName: string;
  /** ISO timestamp. */
  signedAt: string;
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Stable JSON of exactly what the customer saw (validation problems excluded). */
export function canonicalDocumentJson(doc: DocumentModel): string {
  const { problems: _problems, ...rest } = doc;
  return JSON.stringify(sortKeys(rest));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Decodes a pad PNG, refusing anything that is not a small real PNG. */
export function signaturePngBytes(dataUrl: string): Uint8Array | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_PREFIX)) return null;
  const b64 = dataUrl.slice(PNG_PREFIX.length);
  if (!b64 || b64.length > Math.ceil((MAX_SIGNATURE_PNG_BYTES * 4) / 3) + 4) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < PNG_MAGIC.length || bytes.length > MAX_SIGNATURE_PNG_BYTES) return null;
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return null;
  return bytes;
}

export function cleanSignerName(name: unknown): string {
  return String(name ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** True when the table or bucket from migration 20261030120000 isn't live yet. */
export function isMissingSchema(message: string | undefined | null, code?: string | null): boolean {
  if (code === "42P01" || code === "PGRST205") return true;
  return /estimate_signatures|bucket not found|does not exist|schema cache/i.test(String(message ?? ""));
}
