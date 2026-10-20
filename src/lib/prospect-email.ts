/**
 * Extracts a business's public contact email from page markup.
 * Addresses are never guessed; platform, placeholder, and system addresses
 * are skipped so a listing provider's own address is not treated as the prospect.
 */
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BLOCKED_DOMAIN =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|yelp\.com|nextdoor\.com|linktr\.ee|google\.com|sentry\.io|wixpress\.com|example\.com|domain\.com|email\.com|squareup\.com|thumbtack\.com|angi\.com|homeadvisor\.com|houzz\.com|bbb\.org|yellowpages\.com)$/i;
const BLOCKED_LOCAL = /^(noreply|no-reply|donotreply|privacy|abuse|support|security|legal|webmaster|postmaster)$/i;
const FILE_LIKE = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;

/** A listing/social platform's or placeholder domain: never the business's own mailbox. */
export function isPlatformEmailDomain(domain: string): boolean {
  return BLOCKED_DOMAIN.test(domain.trim().toLowerCase());
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  commat: "@",
  period: ".",
};

/**
 * Decodes HTML entities (named, decimal and hex), "%40" and "@" in ONE
 * pass: each match is replaced by its literal text and the output is never
 * scanned again, so "&amp;#64;" reads as the text "&#64;" (no double unescape).
 * Numeric entities are decoded only for printable ASCII; anything else is kept.
 */
export function decodeEmailText(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));|%40|\\u0040/gi, (match: string, dec?: string, hex?: string, name?: string) => {
    if (dec !== undefined || hex !== undefined) {
      const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex!, 16);
      return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : match;
    }
    if (name !== undefined) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    return "@";
  });
}

/**
 * The bracketed spellings a business uses to hide its address from scrapers:
 * "(at)", "{at}", "[at]" and "(dot)", "{dot}", "[dot]", case-insensitive, with
 * optional spaces inside matching brackets ("[ at ]"). A bare " at " or " dot "
 * in prose is never touched, so "call us at 5" or "meet at the shop dot com"
 * stays prose. It only rewrites what the business published; it never builds an address.
 */
export function deobfuscateEmailText(text: string): string {
  // Bounded spacing keeps this linear on whitespace-heavy pages (an unbounded
  // leading \s* restarts at every space of a long run).
  return text
    .replace(/[ \t]{0,3}(?:\([ \t]{0,3}at[ \t]{0,3}\)|\{[ \t]{0,3}at[ \t]{0,3}\}|\[[ \t]{0,3}at[ \t]{0,3}\])[ \t]{0,3}/gi, "@")
    .replace(/[ \t]{0,3}(?:\([ \t]{0,3}dot[ \t]{0,3}\)|\{[ \t]{0,3}dot[ \t]{0,3}\}|\[[ \t]{0,3}dot[ \t]{0,3}\])[ \t]{0,3}/gi, ".");
}

/** The first acceptable address in text that is already decoded (never decoded again here). */
function findBusinessEmail(decoded: string): string | null {
  const mailto = [...decoded.matchAll(/mailto:([^"'?\s>]+)/gi)].map((match) => match[1]!);
  const loose = [...decoded.matchAll(new RegExp(EMAIL.source, "gi"))].map((match) => ({
    raw: match[0],
    suffix: decoded.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 8),
  }));

  for (const candidate of [...mailto.map((raw) => ({ raw, suffix: "" })), ...loose]) {
    const email = candidate.raw.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    if (at < 1 || email.length > 160) continue;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (FILE_LIKE.test(email) || /^\.(png|jpe?g|gif|webp|svg|css|js)(?:\b|$)/i.test(candidate.suffix)) continue;
    if (!local || !domain || BLOCKED_DOMAIN.test(domain) || BLOCKED_LOCAL.test(local)) continue;
    if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/.test(email)) continue;
    return email;
  }
  return null;
}

/**
 * A mailto link or visible address on the page. Entity-encoded ("&#64;",
 * "&#x40;", "&#46;"), percent-encoded ("%40") and bracketed ("[at]", "(dot)")
 * spellings are decoded first, once. Bracketed spellings are read only outside
 * <meta> tags: those belong to extractMetaEmail, which reads just the listed
 * contact/description tags (so a bracketed keywords tag is never an address).
 */
export function extractBusinessEmail(html: string): string | null {
  const direct = findBusinessEmail(decodeEmailText(html));
  if (direct) return direct;
  return findBusinessEmail(deobfuscateEmailText(decodeEmailText(html.replace(/<meta\b[^>]*>/gi, " "))));
}

const META_NAMES = new Set([
  "description",
  "og:description",
  "twitter:description",
  "og:email",
  "email",
  "business:contact_data:email",
  "profile:email",
]);

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match ? (match[2] ?? match[3] ?? "") : null;
}

/**
 * An email the business published in its profile page's meta tags (the
 * og/twitter description or a contact-data email tag), including the
 * entity-encoded and bracketed spellings "name [at] shop [dot] com". Only
 * bracketed forms are decoded, so ordinary prose ("call us at 5") is never
 * turned into an address.
 */
export function extractMetaEmail(html: string): string | null {
  const contents: string[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attribute(tag, "property") ?? attribute(tag, "name") ?? attribute(tag, "itemprop") ?? "").trim().toLowerCase();
    if (!META_NAMES.has(key)) continue;
    const content = attribute(tag, "content");
    // Decoded once here; findBusinessEmail never decodes again.
    if (content) contents.push(deobfuscateEmailText(decodeEmailText(content)));
  }
  for (const content of contents) {
    const email = findBusinessEmail(content);
    if (email) return email;
  }
  return null;
}
