/**
 * Picks a business's own public email out of page text (mailto links first).
 * Ignores platform/system addresses so we never email Facebook, Yelp, etc.
 * Returns null rather than guessing.
 */
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BLOCKED_DOMAIN =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|yelp\.com|nextdoor\.com|linktr\.ee|google\.com|sentry\.io|wixpress\.com|example\.com|domain\.com|email\.com|squareup\.com|thumbtack\.com|angi\.com|homeadvisor\.com|houzz\.com|bbb\.org|yellowpages\.com)$/i;
const BLOCKED_LOCAL = /^(noreply|no-reply|donotreply|privacy|abuse|support|security|legal|webmaster|postmaster)$/i;
const FILE_LIKE = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;

export function extractBusinessEmail(html: string): string | null {
  const decoded = html.replace(/&#64;|&#x40;|\\u0040/gi, "@").replace(/%40/g, "@");
  const mailto = [...decoded.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => m[1]!);
  const loose = decoded.match(EMAIL) ?? [];
  for (const raw of [...mailto, ...loose]) {
    const email = raw.trim().toLowerCase();
    const [local, domain] = email.split("@");
    if (!local || !domain || email.length > 200) continue;
    if (FILE_LIKE.test(email) || BLOCKED_DOMAIN.test(domain) || BLOCKED_LOCAL.test(local)) continue;
    if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/.test(email)) continue;
    return email;
  }
  return null;
}
