export function portalJoinUrl(code: string, origin?: string) {
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${base}/portal?code=${encodeURIComponent(code)}`;
}
