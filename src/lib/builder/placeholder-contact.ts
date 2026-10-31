/**
 * Render-time guard for placeholder contact details (audit P1-04).
 *
 * Sample sites and half-built profiles can carry made-up contact details: a 555
 * phone in any format, or an email on an example/test domain. The profile-driven
 * parts of a page (footer, contact blocks, forms, sticky bar) already read them
 * through `businessFacts`; this scrubs the same details out of the AI-authored
 * text and links stored inside a page's sections, header and footer, so the
 * visible page never shows them. Nothing is invented: the details are removed,
 * and a link that pointed at one is sent to the fallback destination.
 * Pure and dependency-light, so it is unit tested.
 */
import { isPlaceholderEmail, isPlaceholderPhone } from "@/lib/builder/presentation";

const PHONE_IN_TEXT = /\+?\(?\d[\d\s().-]{5,}\d/g;
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// A lead-in word that only made sense next to the removed detail.
const PHONE_LEAD = /(?:\b(?:call|phone|tel|telephone|text|dial)(?:\s+us)?(?:\s+(?:now|today|at|on))?\s*[:\-–]?\s*)?$/i;
const EMAIL_LEAD = /(?:\b(?:email|e-mail|mail)(?:\s+us)?(?:\s+(?:at|on))?\s*[:\-–]?\s*)?$/i;

/** Keys whose string values are visible words (never ids, urls or style values). */
const TEXT_KEYS = new Set([
  "text", "label", "alt", "ariaLabel", "title", "subtitle", "heading", "eyebrow", "body",
  "description", "caption", "quote", "question", "answer", "name", "value", "note", "cta",
]);
const LIST_KEYS = new Set(["items", "bullets", "lines", "tags"]);
const HREF_KEYS = new Set(["href", "url", "link"]);

function strip(text: string, re: RegExp, bad: (match: string) => boolean, lead: RegExp): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (!bad(m[0])) continue;
    const before = text.slice(last, at).replace(lead, "");
    out += before;
    last = at + m[0].length;
  }
  out += text.slice(last);
  return out;
}

/** Removes placeholder phones and emails from one visible string. */
export function scrubPlaceholderText(text: string): string {
  if (!/\d/.test(text) && !text.includes("@")) return text;
  let out = strip(text, PHONE_IN_TEXT, (m) => m.replace(/\D/g, "").length >= 7 && isPlaceholderPhone(m), PHONE_LEAD);
  out = strip(out, EMAIL_IN_TEXT, isPlaceholderEmail, EMAIL_LEAD);
  if (out === text) return text;
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\b(?:or|and)\s*(?=[.,;:!?]|$)/gi, "")
    .replace(/^\s*(?:or|and)\s+/i, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([?!.,;:])\s*[.,;:]+/g, "$1")
    .trim();
}

function placeholderHref(href: string): boolean {
  const value = href.trim();
  if (/^tel:/i.test(value)) return isPlaceholderPhone(decodeURIComponent(value.slice(4)));
  if (/^sms:/i.test(value)) return isPlaceholderPhone(decodeURIComponent(value.slice(4).split(/[?;]/)[0] ?? ""));
  if (/^mailto:/i.test(value)) return isPlaceholderEmail(decodeURIComponent(value.slice(7).split("?")[0] ?? ""));
  return false;
}

/**
 * Deep-copies a stored tree (section settings, header or footer) with every
 * placeholder phone/email removed from visible text and every tel:/mailto:/sms:
 * link to one replaced by `fallbackHref`. A link or button left with no words
 * reads "Contact us".
 */
export function scrubPlaceholderContact<T>(value: T, fallbackHref: string): T {
  const walk = (node: unknown, depth: number): unknown => {
    if (depth > 40 || node == null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
    const out: Record<string, unknown> = {};
    const source = node as Record<string, unknown>;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (HREF_KEYS.has(key) && typeof child === "string") {
        if (placeholderHref(child)) {
          out[key] = fallbackHref;
        } else out[key] = child;
      } else if (TEXT_KEYS.has(key) && typeof child === "string") {
        out[key] = scrubPlaceholderText(child);
      } else if (LIST_KEYS.has(key) && Array.isArray(child)) {
        out[key] = child
          .map((item) => (typeof item === "string" ? scrubPlaceholderText(item) : walk(item, depth + 1)))
          .filter((item, i) => !(typeof item === "string" && item === "" && child[i] !== ""));
      } else out[key] = walk(child, depth + 1);
    }
    const kind = out["type"];
    if ((kind === "link" || kind === "button") && typeof out["text"] === "string" && !out["text"].trim() && String(source["text"] ?? "").trim()) {
      out["text"] = "Contact us";
    }
    return out;
  };
  return walk(value, 0) as T;
}
