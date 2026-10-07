/**
 * Post-publish smoke check (spec F).
 *
 * Pure evaluation of what the live site returned right after a publish. The
 * server function fetches the public URL(s); this module decides pass/fail so
 * the rules are unit tested and identical everywhere.
 *
 * A publish is never rolled back automatically on a failed smoke check (the
 * live version is already recorded and the previous one stays restorable);
 * the failure is recorded on publish_events and shown to the owner and admins.
 */

export type SmokeProbe = {
  path: string;
  status: number;
  contentType: string | null;
  body: string;
  ms: number;
};

export type SmokeResult = {
  status: "passed" | "failed";
  checks: { path: string; ok: boolean; problem: string | null; ms: number }[];
};

/** Template leaks that must never reach a live page. */
const LEAKS = [/\{\{\s*[a-z_.]+\s*\}\}/i, /lorem ipsum/i, /\bundefined\b<\//, /\[object Object\]/, /TODO:/];

export function evaluateSmoke(probes: readonly SmokeProbe[], expected: { businessName?: string | null } = {}): SmokeResult {
  const checks = probes.map((probe) => {
    let problem: string | null = null;
    if (probe.status < 200 || probe.status >= 400) problem = `HTTP ${probe.status}`;
    else if (!/text\/html/i.test(probe.contentType ?? "")) problem = "not an HTML page";
    else if (probe.body.length < 500) problem = "page is nearly empty";
    else if (LEAKS.some((leak) => leak.test(probe.body))) problem = "template placeholder text is visible";
    else if (!/<title>[^<]{2,}<\/title>/i.test(probe.body)) problem = "page has no title";
    else if (!/<link[^>]+rel=["']?stylesheet/i.test(probe.body) && !/<style[\s>]/i.test(probe.body)) problem = "page has no stylesheet";
    else if (
      probe.path === "/" &&
      expected.businessName &&
      !probe.body.toLowerCase().includes(expected.businessName.toLowerCase().slice(0, 40))
    )
      problem = "business name not found on the home page";
    return { path: probe.path, ok: problem === null, problem, ms: probe.ms };
  });
  return { status: checks.length > 0 && checks.every((c) => c.ok) ? "passed" : "failed", checks };
}

/** The public URL for a workspace's live site (custom domain only once DNS+SSL are verified). */
export function liveSiteUrl(input: {
  slug: string;
  customDomain?: string | null;
  dnsOk?: boolean | null;
  sslOk?: boolean | null;
  platformOrigin?: string;
}): string {
  const domain = input.customDomain?.trim().toLowerCase();
  if (domain && input.dnsOk && input.sslOk && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return `https://${domain}`;
  return `${(input.platformOrigin ?? "https://revoragrowthsystems.com").replace(/\/$/, "")}/s/${encodeURIComponent(input.slug)}`;
}

/**
 * The paths to smoke-test after a publish: the home page plus every visible
 * page (capped so a large site can't stall the publish response).
 */
export function smokePaths(pages: readonly { slug: string | null; hidden?: boolean | null; kind?: string | null }[], limit = 8): string[] {
  const paths = ["/"];
  for (const page of pages) {
    const slug = String(page.slug ?? "").trim();
    if (!slug || slug === "home" || page.hidden || page.kind === "thanks") continue;
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) continue;
    const path = `/${slug}`;
    if (!paths.includes(path)) paths.push(path);
    if (paths.length >= limit) break;
  }
  return paths;
}

/** The newest published production snapshot older than the current one. */
export function previousProduction<T extends { version: number; published_at: string | null; live: boolean }>(
  versions: readonly T[],
  currentVersion: number | null,
): T | null {
  const candidates = versions
    .filter((row) => row.live && row.published_at && (currentVersion === null || row.version < currentVersion))
    .sort((a, b) => b.version - a.version);
  return candidates[0] ?? null;
}

