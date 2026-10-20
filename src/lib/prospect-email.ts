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

export function extractBusinessEmail(html: string): string | null {
  const decoded = html.replace(/&#64;|&#x40;|\\u0040/gi, "@").replace(/%40/g, "@");
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

const decodeEntities = (text: string) =>
  text.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");

/**
 * An email the business published in its profile page's meta tags (the
 * og/twitter description or a contact-data email tag), including the common
 * bracketed spellings "name [at] shop [dot] com". Only bracketed forms are
 * decoded, so ordinary prose ("call us at 5") is never turned into an address.
 */
export function extractMetaEmail(html: string): string | null {
  const contents: string[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attribute(tag, "property") ?? attribute(tag, "name") ?? attribute(tag, "itemprop") ?? "").trim().toLowerCase();
    if (!META_NAMES.has(key)) continue;
    const content = attribute(tag, "content");
    if (content) contents.push(decodeEntities(content));
  }
  for (const content of contents) {
    const deobfuscated = content
      .replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, "@")
      .replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, ".");
    const email = extractBusinessEmail(deobfuscated);
    if (email) return email;
  }
  return null;
}
