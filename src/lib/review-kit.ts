/**
 * Review kit helpers for the client dashboard: turn a pasted Google Place ID
 * or review URL into a link customers can open to leave a review, make a QR
 * code for it in the browser, and write a message the owner can send to their
 * own customers. Nothing here sends anything. The `qrcode` package (MIT) is
 * imported lazily so it is only downloaded when a QR code is asked for.
 */
import { googleReviewUrl } from "@/lib/google-review-link";

export type ReviewInputResult =
  | { ok: true; url: string; kind: "place_id" | "google_writereview" | "url" }
  | { ok: false; message: string };

/**
 * Accepts a Google Place ID (ChIJ...) or a full https review URL. A Google
 * writereview URL is rebuilt in its canonical form from its placeid.
 * Anything else must be a plain https link; other schemes are refused.
 */
export function parseReviewInput(input: string | null | undefined): ReviewInputResult {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, message: "Paste your Google Place ID or review link." };
  if (/\s/.test(raw)) return { ok: false, message: "That has spaces in it. Paste only the Place ID or the link." };

  const fromId = googleReviewUrl(raw);
  if (fromId) return { ok: true, url: fromId, kind: "place_id" };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, message: "That isn't a Place ID or a web link. Check it and try again." };
  }
  if (parsed.protocol !== "https:") return { ok: false, message: "The link must start with https://." };
  if (parsed.username || parsed.password) return { ok: false, message: "That link has a sign-in in it. Use the plain review link." };

  if (parsed.hostname === "search.google.com" && parsed.pathname.replace(/\/+$/, "") === "/local/writereview") {
    const canonical = googleReviewUrl(parsed.searchParams.get("placeid"));
    if (!canonical) return { ok: false, message: "That Google review link has no valid place ID in it." };
    return { ok: true, url: canonical, kind: "google_writereview" };
  }
  return { ok: true, url: parsed.toString(), kind: "url" };
}

/** Ready-to-copy message the owner can send to their own customers. */
export function reviewRequestTemplate(businessName: string | null | undefined, url: string): string {
  const name = String(businessName ?? "").trim() || "our business";
  return [
    "Hi [first name],",
    "",
    `Thank you for choosing ${name}! If you were happy with the work, would you take a minute to leave us a Google review? It really helps other people in the area find us.`,
    "",
    url,
    "",
    "Thank you,",
    name,
  ].join("\n");
}

/** A safe file name for the QR download. */
export function qrFileName(businessName: string | null | undefined, ext: "png" | "svg"): string {
  const base = String(businessName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "business"}-review-qr.${ext}`;
}

/** QR code as a PNG data URL, made in the browser (the link is never sent to an image service). */
export async function reviewQrPng(url: string, size = 768): Promise<string> {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toDataURL(url, { width: Math.min(1200, Math.max(128, Math.round(size))), margin: 2, errorCorrectionLevel: "M" });
}

/** QR code as an SVG string, for print. */
export async function reviewQrSvg(url: string): Promise<string> {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
}
