/**
 * Shared "may we fetch this URL?" helper on robots-parser 3.0.1 (MIT,
 * https://github.com/samclarke/robots-parser). Per-path, per-user-agent
 * allow/deny plus Sitemap lines. Used by Jarvis free checks (summarizeRobots),
 * the /analyze competitor audit (B12-6), and meant for B13-3 /remix and PAI-9.
 */
import robotsParser from "robots-parser";

export const REVORA_USER_AGENT = "RevoraAuditBot";

export type RobotsPolicy = {
  present: boolean;
  /** True when "/" is disallowed for every crawler ("*"). */
  blocksAllCrawlers: boolean;
  sitemaps: string[];
  /** Missing robots.txt = everything allowed. */
  isAllowed(url: string, userAgent?: string): boolean;
};

/** `robotsUrl` is the robots.txt address (used to resolve relative rules); `text` null = no robots.txt. */
export function parseRobots(robotsUrl: string, text: string | null): RobotsPolicy {
  if (text === null) {
    return { present: false, blocksAllCrawlers: false, sitemaps: [], isAllowed: () => true };
  }
  const robots = robotsParser(robotsUrl, text);
  let root = "/";
  try {
    root = new URL("/", robotsUrl).toString();
  } catch {
    // keep "/"
  }
  return {
    present: true,
    blocksAllCrawlers: robots.isDisallowed(root, "*") === true,
    sitemaps: robots.getSitemaps().slice(0, 10),
    // A URL robots-parser can't judge (other host) returns undefined: treat as not allowed.
    isAllowed: (url, userAgent = REVORA_USER_AGENT) => robots.isAllowed(url, userAgent) === true,
  };
}
