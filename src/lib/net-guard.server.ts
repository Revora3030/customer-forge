/**
 * Guards server-side fetches of user-supplied hostnames (custom domains).
 *
 * Without this, a client could point a "custom domain" at localhost, a private
 * network address, or a cloud metadata endpoint and use our server as a proxy
 * into the internal network (SSRF).
 */

const BLOCKED_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".home.arpa",
  ".onion",
  ".test",
  ".invalid",
];
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

function isIpv4(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** True only for globally routable IPv4 addresses. */
export function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false; // multicast / reserved
  return true;
}

/**
 * A hostname is only fetchable when it is a real public DNS name — never an IP
 * literal, never an internal/reserved suffix.
 */
export function isFetchableHostname(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253) return false;
  if (h.includes(":") || h.includes("/") || h.includes("@")) return false;
  if (isIpv4(h)) return false;
  if (BLOCKED_HOSTS.has(h)) return false;
  if (BLOCKED_SUFFIXES.some((suffix) => h.endsWith(suffix))) return false;
  // Must be a dotted name with an alphabetic TLD of at least two letters.
  return /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(h);
}

/** True only for globally routable IPv6 addresses. */
export function isPublicIpv6(ip: string): boolean {
  const raw = ip.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").split("%")[0] ?? "";
  if (!raw.includes(":")) return false;
  // IPv4-mapped / IPv4-compatible forms inherit the IPv4 rules.
  const mapped = raw.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (mapped) return isPublicIpv4(mapped);
  if (raw === "::" || raw === "::1") return false; // unspecified + loopback
  if (/^f[cd][0-9a-f]{0,2}:/.test(raw)) return false; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]?:/.test(raw)) return false; // fe80::/10 link-local
  if (/^ff[0-9a-f]{0,2}:/.test(raw)) return false; // multicast
  if (/^(2001:db8|64:ff9b|100::|2002:)/.test(raw)) return false; // documentation / translation / discard
  return true;
}

/** True only for globally routable IPv4 or IPv6 addresses. */
export function isPublicAddress(ip: string): boolean {
  const value = ip.trim();
  return value.includes(":") ? isPublicIpv6(value) : isPublicIpv4(value);
}

/**
 * Every resolved address must be publicly routable before we fetch the host,
 * and there must be at least one — an unresolvable host is never fetched.
 */
export function areAddressesPublic(addresses: string[]): boolean {
  const list = addresses.map((ip) => ip.trim()).filter(Boolean);
  return list.length > 0 && list.every(isPublicAddress);
}

/** Throws when a hostname must not be fetched from the server. */
export function assertFetchableHostname(host: string): void {
  if (!isFetchableHostname(host)) throw new Error("That address can't be checked.");
}

type DnsJson = { Answer?: { type: number; data: string }[] };

/** Resolve through a fixed public DNS endpoint when a caller has no resolver. */
async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const query = async (type: "A" | "AAAA") => {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, redirect: "error" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as DnsJson;
    const expectedType = type === "A" ? 1 : 28;
    return (body.Answer ?? [])
      .filter((answer) => answer.type === expectedType)
      .map((answer) => answer.data.trim());
  };
  const [ipv4, ipv6] = await Promise.all([query("A"), query("AAAA")]);
  return [...ipv4, ...ipv6];
}

/**
 * The ONLY way server code should fetch a user-supplied address.
 *
 * Re-validates the parsed URL itself (so tricks like
 * `https://example.com@169.254.169.254/` can't slip past a check made on a
 * normalized string), refuses credentials, non-http(s) schemes and any host
 * that resolves to a private, loopback, link-local or metadata address, and
 * never follows redirects automatically so a public host can't bounce us
 * inward.
 */
export async function guardedFetch(
  rawUrl: string,
  init: RequestInit = {},
  resolve?: (hostname: string) => Promise<string[]>,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("That address isn't a valid web address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("Only web addresses starting with http or https can be checked.");
  if (parsed.username || parsed.password) throw new Error("That address can't be checked.");
  // Only the standard web ports: an arbitrary port would let a public hostname
  // be pointed at an internal service (e.g. :6379, :8080) on the same address.
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443")
    throw new Error("That address can't be checked.");
  assertFetchableHostname(parsed.hostname);
  const addresses = await (resolve ?? resolvePublicAddresses)(parsed.hostname).catch(
    () => [] as string[],
  );
  if (!areAddressesPublic(addresses)) throw new Error("Not a public address");
  // redirect stays last: a caller can never opt back into automatic following,
  // which would let a public host bounce the probe to an internal address.
  return fetch(parsed.toString(), { ...init, redirect: "manual" });
}
