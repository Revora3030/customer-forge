/**
 * URL allow-list for Jarvis page checks. Only https Revora hosts or a
 * customer custom domain that is verified and published may be fetched, so
 * the model cannot aim a check at internal or arbitrary hosts (SSRF).
 */
export const REVORA_HOSTS = ["revoragrowthsystems.com", "www.revoragrowthsystems.com"] as const;
export const DEFAULT_TARGET = "https://revoragrowthsystems.com/";

export function parseCandidateUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 300) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

/** Resolves the target. `isVerifiedDomain` checks customer domains. Returns null when not allowed. */
export async function resolveAllowedTarget(
  raw: unknown,
  isVerifiedDomain: (host: string) => Promise<boolean>,
): Promise<string | null> {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_TARGET;
  const u = parseCandidateUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if ((REVORA_HOSTS as readonly string[]).includes(host)) return u.toString();
  return (await isVerifiedDomain(host)) ? u.toString() : null;
}
