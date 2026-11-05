/**
 * Post-publish verification, data part (TEN-06 item 25). Server only.
 *
 * - `verifyPublishedSite` scores one published version from what the caller
 *   already fetched (the publish flow passes its smoke probes, so the live
 *   pages are fetched once).
 * - `verifyLiveSite` is the standalone entry point: it fetches the live pages
 *   itself, so PAI-19 self-QA (or an admin tool) can re-check any workspace
 *   without publishing. Callers must already have checked who may run it.
 *
 * Neither sends anything by default. A caller that wants proof of delivery
 * passes `sendTestLead` (the setup checklist's labeled test lead, L12), whose
 * only message is the owner's own new-lead alert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { themeFromProfile } from "@/lib/builder/quality/video-publish-gate";
import { siteModelFromSnapshot, type SiteModel } from "@/lib/builder/quality/video-site-model";
import { evaluatePostPublish, type PostPublishResult } from "@/lib/post-publish-verify";
import { evaluateSmoke, labelChecks, smokePaths, smokeTargets, type SmokeProbe, type SmokeResult } from "@/lib/publish-smoke";
import { readFullSnapshot, type FullSnapshot } from "@/lib/site-restore";

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SendTestLead = () => Promise<{ alertedTo: string | null }>;

/** A stored published snapshot as a site model, or null when it can't be read. */
export function publishedSiteModel(pages: unknown, profile: Record<string, unknown> | null): SiteModel | null {
  const snapshot =
    readFullSnapshot(pages) ??
    (pages && typeof pages === "object" && Array.isArray((pages as { pages?: unknown }).pages) ? (pages as FullSnapshot) : null);
  if (!snapshot) return null;
  try {
    return siteModelFromSnapshot(snapshot, themeFromProfile(profile as never));
  } catch {
    return null;
  }
}

export async function verifyPublishedSite(
  supabase: SupabaseClient,
  input: { organizationId: string; version: number; smoke: SmokeResult | null; homeHtml: string | null; sendTestLead?: SendTestLead },
): Promise<PostPublishResult> {
  const db = supabase as unknown as Db;
  const [versionRow, profileRow] = await Promise.all([
    db.from("website_versions").select("pages").eq("organization_id", input.organizationId).eq("version", input.version).maybeSingle(),
    db.from("business_profiles").select("*").eq("organization_id", input.organizationId).maybeSingle(),
  ]);
  const profile = (profileRow.error ? null : profileRow.data ?? null) as Record<string, unknown> | null;
  const site = versionRow.error ? null : publishedSiteModel((versionRow.data as { pages?: unknown } | null)?.pages, profile);

  let testLead: { alertedTo: string | null } | null = null;
  if (input.sendTestLead) {
    try {
      testLead = await input.sendTestLead();
    } catch {
      testLead = { alertedTo: null };
    }
  }
  return evaluatePostPublish({
    smoke: input.smoke,
    homeHtml: input.homeHtml,
    profile: profile as never,
    site,
    testLead,
  });
}

/** Fetches one address with the same limits as the publish smoke check. */
export async function probeLivePage(url: string, path: string): Promise<SmokeProbe> {
  const started = Date.now();
  try {
    const response = await fetch(`${url}${path === "/" ? "" : path}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "RevoraPublishSmoke/1.0" },
    });
    return {
      path,
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: (await response.text()).slice(0, 300_000),
      ms: Date.now() - started,
    };
  } catch {
    return { path, status: 0, contentType: null, body: "", ms: Date.now() - started };
  }
}

/**
 * Standalone check of a workspace's live site (reused by PAI-19 self-QA).
 * Checks the newest published version unless `version` is given.
 */
export async function verifyLiveSite(
  supabase: SupabaseClient,
  input: { organizationId: string; platformOrigin: string; version?: number; sendTestLead?: SendTestLead },
  probe: (url: string, path: string) => Promise<SmokeProbe> = probeLivePage,
): Promise<PostPublishResult & { version: number | null }> {
  const db = supabase as unknown as Db;
  const [org, settings, pages, latest] = await Promise.all([
    db.from("organizations").select("slug, name").eq("id", input.organizationId).maybeSingle(),
    db.from("website_settings").select("custom_domain, dns_ok, ssl_ok").eq("organization_id", input.organizationId).maybeSingle(),
    db.from("website_pages").select("slug, hidden, kind").eq("organization_id", input.organizationId).order("sort_order", { ascending: true }),
    input.version
      ? Promise.resolve({ data: { version: input.version } })
      : db
          .from("website_versions")
          .select("version")
          .eq("organization_id", input.organizationId)
          .not("published_at", "is", null)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);
  const o = (org.data ?? {}) as { slug?: string | null; name?: string | null };
  const s = (settings.data ?? {}) as { custom_domain?: string | null; dns_ok?: boolean | null; ssl_ok?: boolean | null };
  const version = Number((latest.data as { version?: number } | null)?.version) || null;

  const { targets } = smokeTargets({
    slug: o.slug,
    customDomain: s.custom_domain ?? null,
    dnsOk: s.dns_ok ?? null,
    sslOk: s.ssl_ok ?? null,
    platformOrigin: input.platformOrigin,
  });
  const paths = smokePaths((pages.data ?? []) as never);
  const checks: SmokeResult["checks"] = [];
  let homeHtml: string | null = null;
  for (const target of targets) {
    const probes: SmokeProbe[] = [];
    for (const path of paths) probes.push(await probe(target.base, path));
    // The address visitors see first (custom domain once live) wins.
    const home = probes.find((p) => p.path === "/" && p.status >= 200 && p.status < 400);
    if (home) homeHtml = home.body;
    checks.push(...labelChecks(target.label, evaluateSmoke(probes, { businessName: o.name ?? null })));
  }
  const smoke: SmokeResult | null = targets.length ? { status: checks.length > 0 && checks.every((c) => c.ok) ? "passed" : "failed", checks } : null;
  if (!version) {
    return { ...evaluatePostPublish({ smoke, homeHtml, profile: null, site: null }), version: null };
  }
  const result = await verifyPublishedSite(supabase, {
    organizationId: input.organizationId,
    version,
    smoke,
    homeHtml,
    ...(input.sendTestLead ? { sendTestLead: input.sendTestLead } : {}),
  });
  return { ...result, version };
}
