/** Pure routing rules shared by the preview click bridge and behavior tests. */
export function previewDestination(href: string, currentHref: string, slug: string): string | null {
  let current: URL;
  let target: URL;
  try {
    current = new URL(currentHref);
    target = new URL(href, current);
  } catch {
    return null;
  }
  const match = current.pathname.match(/^\/(draft|p)\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (!match || target.origin !== current.origin) return null;
  const base = `/${match[1]}/${match[2]}`;
  const publicBase = `/s/${encodeURIComponent(slug)}`;
  let rest: string;
  if (target.pathname === publicBase || target.pathname.startsWith(`${publicBase}/`)) {
    rest = target.pathname.slice(publicBase.length);
  } else if (target.pathname === base || target.pathname.startsWith(`${base}/`)) {
    rest = target.pathname.slice(base.length);
  } else if (/^\/(?:home\/?)?$/.test(target.pathname)) {
    rest = "";
  } else {
    // Never hijack platform navigation, another tenant, or another preview.
    return null;
  }
  rest = rest.replace(/^\/(?:home\/?)?$/, "");
  return `${base}${rest}${target.search}${target.hash}`;
}

export function decodeAnchor(hash: string): string {
  try { return decodeURIComponent(hash.replace(/^#/, "")); }
  catch { return hash.replace(/^#/, ""); }
}
