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
  ".localdomain",
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
  if (!isIpv4(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b, c] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 88 && c === 99) return false; // deprecated relay
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmark
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
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
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) &&
    h.split(".").every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

/** True only for globally routable IPv6 addresses. */
export function isPublicIpv6(ip: string): boolean {
  const raw = ip.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  // URL parsing validates and canonicalizes compressed and mapped forms.
  let normalized: string;
  try { normalized = new URL(`http://[${raw}]/`).hostname.slice(1, -1); }
  catch { return false; }
  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const words = (halves.length === 2
    ? [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right]
    : left).map(word => parseInt(word, 16));
  if (words.length !== 8 || words.some(word => !Number.isFinite(word))) return false;
  // Check hexadecimal mapped IPv4 too, e.g. ::ffff:7f00:1, not just dotted text.
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    const high = words[6]!, low = words[7]!;
    return isPublicIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  const first = words[0]!, second = words[1]!;
  // Conservative global-unicast allowlist excludes local, multicast, translation,
  // unspecified and deprecated IPv4-compatible addresses.
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2002) return false; // 6to4 may encapsulate private IPv4
  if (first === 0x3fff && second < 0x1000) return false; // documentation
  if (first === 0x2001 && (second < 0x200 || second === 0xdb8)) return false;
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
  if (!isFetchableHostname(host)) throw new UnsafeOutboundUrlError("That address can't be checked.");
}

export class UnsafeOutboundUrlError extends Error {
  override name = "UnsafeOutboundUrlError";
}

type DnsJson = { Answer?: { type: number; data: string }[] };

/** Resolve through a fixed public DNS endpoint when a caller has no resolver. */
async function resolvePublicAddresses(hostname: string, signal: AbortSignal): Promise<string[]> {
  const query = async (type: "A" | "AAAA") => {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, redirect: "error", signal },
    );
    if (!response.ok) throw new Error("DNS lookup temporarily unavailable.");
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
 * inward. This is defense in depth, not connection-level DNS pinning: a
 * production egress policy/approved endpoint list is still recommended.
 */
export async function guardedFetch(
  rawUrl: string,
  init: RequestInit = {},
  resolve?: (hostname: string, signal: AbortSignal) => Promise<string[]>,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeOutboundUrlError("That address isn't a valid web address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new UnsafeOutboundUrlError("Only web addresses starting with http or https can be checked.");
  if (parsed.username || parsed.password) throw new UnsafeOutboundUrlError("That address can't be checked.");
  // Only the standard web ports: an arbitrary port would let a public hostname
  // be pointed at an internal service (e.g. :6379, :8080) on the same address.
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443")
    throw new UnsafeOutboundUrlError("That address can't be checked.");
  assertFetchableHostname(parsed.hostname);
  const signal = init.signal ?? AbortSignal.timeout(10_000);
  signal.throwIfAborted();
  const dnsSignal = AbortSignal.any([signal, AbortSignal.timeout(3_000)]);
  const addresses = await (resolve ?? resolvePublicAddresses)(parsed.hostname, dnsSignal);
  signal.throwIfAborted();
  if (!areAddressesPublic(addresses)) throw new UnsafeOutboundUrlError("Not a public address");
  // redirect stays last: a caller can never opt back into automatic following,
  // which would let a public host bounce the probe to an internal address.
  return fetch(parsed.toString(), { ...init, signal, redirect: "manual" });
}
