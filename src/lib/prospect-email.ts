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
    if (at < 1 || email.length > 200) continue;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (FILE_LIKE.test(email) || /^\.(png|jpe?g|gif|webp|svg|css|js)(?:\b|$)/i.test(candidate.suffix)) continue;
    if (!local || !domain || BLOCKED_DOMAIN.test(domain) || BLOCKED_LOCAL.test(local)) continue;
    if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/.test(email)) continue;
    return email;
  }
  return null;
}
