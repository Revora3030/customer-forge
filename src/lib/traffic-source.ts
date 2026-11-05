/**
 * Groups a visit's recorded source into the five buckets shown in owner
 * analytics: Search, AI assistants, Social, Direct, Other websites.
 *
 * The one list of known sites lives here. It reads only what the site already
 * records (a utm_source tag, a referring address, or the words "direct" /
 * "referral"); it adds no tracking and never guesses. A bare "referral" with no
 * site name stays under Other websites because the site is unknown.
 */

export type TrafficBucket = "ai" | "search" | "social" | "direct" | "other";

export const TRAFFIC_BUCKET_ORDER: readonly TrafficBucket[] = ["search", "ai", "social", "direct", "other"];

export const TRAFFIC_BUCKET_LABEL: Record<TrafficBucket, string> = {
  search: "Search engines",
  ai: "AI assistants",
  social: "Social",
  direct: "Direct",
  other: "Other websites",
};

/** Hosts (and their subdomains) of AI assistants. */
export const AI_ASSISTANT_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
] as const;

const SEARCH_HOSTS = [
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "ecosia.org",
  "search.brave.com",
  "baidu.com",
  "yandex.com",
  "yandex.ru",
  "startpage.com",
] as const;

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "t.co",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "lnkd.in",
  "tiktok.com",
  "pinterest.com",
  "youtube.com",
  "reddit.com",
  "nextdoor.com",
] as const;

/** Short utm_source words people use instead of a full host. */
const BARE_WORDS: Record<string, TrafficBucket> = {
  chatgpt: "ai",
  openai: "ai",
  perplexity: "ai",
  claude: "ai",
  gemini: "ai",
  copilot: "ai",
  google: "search",
  bing: "search",
  duckduckgo: "search",
  yahoo: "search",
  facebook: "social",
  instagram: "social",
  twitter: "social",
  linkedin: "social",
  tiktok: "social",
  pinterest: "social",
  youtube: "social",
  reddit: "social",
  nextdoor: "social",
};

const DIRECT_WORDS = new Set(["", "direct", "website", "none", "(direct)", "(none)"]);

/** Lower-cased host of a source value, or null when it is not an address. */
function hostOf(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`;
  try {
    const host = new URL(candidate).hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

const matches = (host: string, list: readonly string[]) =>
  list.some((entry) => host === entry || host.endsWith(`.${entry}`));

export function classifyTrafficSource(source: string | null | undefined): TrafficBucket {
  let raw = (source ?? "").trim().toLowerCase();
  // Accept a pasted "utm_source=chatgpt.com".
  raw = raw.replace(/^utm_source=/, "");
  if (DIRECT_WORDS.has(raw)) return "direct";
  if (raw === "referral") return "other";
  const bare = BARE_WORDS[raw];
  if (bare) return bare;
  const host = hostOf(raw);
  if (!host) return "other";
  // Order matters: gemini.google.com and copilot.microsoft.com are AI, not
  // ordinary Google or Microsoft traffic.
  if (matches(host, AI_ASSISTANT_HOSTS)) return "ai";
  if (matches(host, SEARCH_HOSTS)) return "search";
  if (matches(host, SOCIAL_HOSTS)) return "social";
  return "other";
}

const PRIORITY: Record<TrafficBucket, number> = { ai: 5, search: 4, social: 3, other: 2, direct: 1 };

/**
 * Counts sessions per bucket. A session's bucket is the most specific source
 * any of its events recorded (an enquiry that carries utm_source=chatgpt.com
 * marks the whole session). Events with no session count once each.
 * Zero stays 0: only recorded data is counted.
 */
export function bucketSessions(
  events: ReadonlyArray<{ source: string | null; session_id: string | null }>,
): Record<TrafficBucket, number> {
  const bySession = new Map<string, TrafficBucket>();
  const totals: Record<TrafficBucket, number> = { search: 0, ai: 0, social: 0, direct: 0, other: 0 };
  for (const event of events) {
    const bucket = classifyTrafficSource(event.source);
    if (!event.session_id) {
      totals[bucket] += 1;
      continue;
    }
    const current = bySession.get(event.session_id);
    if (!current || PRIORITY[bucket] > PRIORITY[current]) bySession.set(event.session_id, bucket);
  }
  for (const bucket of bySession.values()) totals[bucket] += 1;
  return totals;
}
