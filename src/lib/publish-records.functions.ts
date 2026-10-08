/**
 * Versioned publish selection and post-publish verification (spec F).
 *
 * - `selectVersionForPublish` puts a chosen saved version back into the draft
 *   (exact restore, with a restore point first) so the owner can publish it.
 *   Publishing itself still goes through `activateProduction`, so the payment,
 *   readiness, draft-branch and role gates are never bypassed.
 * - `recordPublishAndSmoke` runs right after a successful publish: it records
 *   the publish in `publish_events` (server-written, member-readable) and
 *   fetches the live pages to confirm they really render.
 * - `listPublishEvents` returns the publish history with smoke results.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateSmoke, liveSiteUrl, previousProduction, smokePaths, type SmokeProbe } from "@/lib/publish-smoke";

const UUID = /^[0-9a-f-]{36}$/i;

export type PublishEvent = {
  id: string;
  version: number;
  sourceVersion: number | null;
  smokeStatus: "pending" | "passed" | "failed" | "skipped";
  smokeReport: { url?: string; checks?: { path: string; ok: boolean; problem: string | null; ms: number }[] };
  createdAt: string;
};

export const listPublishEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }): Promise<{ events: PublishEvent[] }> => {
    const { data: rows, error } = await (context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
      .from("publish_events")
      .select("id, version, source_version, smoke_status, smoke_report, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Couldn't load your publish history.");
    return {
      events: ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        version: Number(row["version"]),
        sourceVersion: row["source_version"] == null ? null : Number(row["source_version"]),
        smokeStatus: row["smoke_status"] as PublishEvent["smokeStatus"],
        smokeReport: (row["smoke_report"] ?? {}) as PublishEvent["smokeReport"],
        createdAt: String(row["created_at"]),
      })),
    };
  });

/**
 * Restores a chosen saved version into the draft so it can be published.
 * Manager+ only. A restore point of the current draft is saved first, so the
 * selection itself can always be undone. Nothing goes live here.
 */
export const selectVersionForPublish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; versionId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const versionId = String(input?.versionId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    if (!UUID.test(versionId)) throw new Error("Invalid version");
    return { organizationId, versionId };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const { data: version, error } = await context.supabase
      .from("website_versions")
      .select("id, version, generation, seo, pages")
      .eq("id", data.versionId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error("Couldn't read that version right now.");
    if (!version) throw new Error("That version is no longer available.");

    const { readWebsiteState, applyWebsiteRestore, planVersionRestore } = await import("@/lib/site-restore.functions");
    const plan = planVersionRestore(version as never);
    if (!plan.full) throw new Error("That version doesn't hold a full copy of the pages, so it can't be published as-is.");

    // Restore point of the current draft, saved as a version, before replacing it.
    const current = await readWebsiteState(context.supabase as never, data.organizationId);
    const { data: latest } = await context.supabase
      .from("website_versions")
      .select("version")
      .eq("organization_id", data.organizationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const backupVersion = Number(latest?.version ?? 0) + 1;
    const { error: backupError } = await context.supabase.from("website_versions").insert({
      organization_id: data.organizationId,
      version: backupVersion,
      label: `Draft before selecting version ${version.version}`,
      pages: current as never,
      created_by: context.userId,
    });
    if (backupError) throw new Error("Couldn't save your current draft first, so nothing was changed.");

    const result = await applyWebsiteRestore(context.supabase as never, data.organizationId, plan.full);
    if (Object.keys(plan.settings).length) {
      const { nextPublishState } = await import("@/lib/publish-state");
      const keepState = await nextPublishState(context.supabase as never, data.organizationId);
      await context.supabase
        .from("website_settings")
        .update({ ...plan.settings, review_state: "ready_for_review", publish_state: keepState } as never)
        .eq("organization_id", data.organizationId);
    }
    return { selectedVersion: Number(version.version), backupVersion, exact: result.exact };
  });

/**
 * Called right after a successful publish. Records the publish and runs the
 * smoke check against the live URL. Never throws for a failed check: the
 * result is stored and returned for the owner to see.
 */
export const recordPublishAndSmoke = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; version: number; sourceVersion?: number | null }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    const version = Math.trunc(Number(input?.version));
    if (!Number.isFinite(version) || version < 1) throw new Error("Invalid version");
    const source = input?.sourceVersion == null ? null : Math.trunc(Number(input.sourceVersion));
    return { organizationId, version, sourceVersion: source && source >= 1 ? source : null };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    // The version must really be this workspace's published version.
    const { data: published } = await context.supabase
      .from("website_versions")
      .select("version, published_at")
      .eq("organization_id", data.organizationId)
      .eq("version", data.version)
      .not("published_at", "is", null)
      .maybeSingle();
    if (!published) throw new Error("That version hasn't been published.");

    const [{ data: org }, { data: settings }] = await Promise.all([
      context.supabase.from("organizations").select("slug, name").eq("id", data.organizationId).maybeSingle(),
      context.supabase
        .from("website_settings")
        .select("custom_domain, dns_ok, ssl_ok")
        .eq("organization_id", data.organizationId)
        .maybeSingle(),
    ]);
    const slug = (org as { slug?: string } | null)?.slug;
    const origin = new URL(getRequest().url).origin;
    const base = slug
      ? liveSiteUrl({
          slug,
          customDomain: (settings as { custom_domain?: string | null } | null)?.custom_domain ?? null,
          dnsOk: (settings as { dns_ok?: boolean | null } | null)?.dns_ok ?? null,
          sslOk: (settings as { ssl_ok?: boolean | null } | null)?.ssl_ok ?? null,
          platformOrigin: origin,
        })
      : null;

    const probes: SmokeProbe[] = [];
    const { data: pageRows } = await context.supabase
      .from("website_pages")
      .select("slug, hidden, kind")
      .eq("organization_id", data.organizationId)
      .order("sort_order", { ascending: true });
    const paths = smokePaths((pageRows ?? []) as never);
    // Fresh copies at the edge first, so visitors and the check see this version.
    if (slug) {
      // Both addresses a visitor can use: the custom domain (once verified)
      // and the platform /s/<slug> copy. Never fails the publish.
      const { purgeEdgeCache, purgeTargets } = await import("@/lib/edge-cache.server");
      const purge = await purgeEdgeCache(
        purgeTargets({
          slug,
          paths,
          platformOrigin: origin,
          customDomain: (settings as { custom_domain?: string | null } | null)?.custom_domain ?? null,
          domainVerified: Boolean((settings as { dns_ok?: boolean | null } | null)?.dns_ok && (settings as { ssl_ok?: boolean | null } | null)?.ssl_ok),
        }),
      );
      if (purge.skipped) console.info("[publish] edge cache purge skipped:", purge.skipped);
    }
    if (base) {
      for (const path of paths) {
        const started = Date.now();
        try {
          const response = await fetch(`${base}${path === "/" ? "" : path}`, {
            redirect: "follow",
            signal: AbortSignal.timeout(10_000),
            headers: { "user-agent": "RevoraPublishSmoke/1.0" },
          });
          probes.push({
            path,
            status: response.status,
            contentType: response.headers.get("content-type"),
            body: (await response.text()).slice(0, 300_000),
            ms: Date.now() - started,
          });
        } catch (error) {
          probes.push({ path, status: 0, contentType: null, body: "", ms: Date.now() - started });
          console.warn("[publish-smoke] fetch failed", (error as Error)?.message);
        }
      }
    }
    const result = base
      ? evaluateSmoke(probes, { businessName: (org as { name?: string } | null)?.name ?? null })
      : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient).from("publish_events").insert({
      organization_id: data.organizationId,
      version: data.version,
      source_version: data.sourceVersion,
      published_by: context.userId,
      smoke_status: result ? result.status : "skipped",
      smoke_report: { url: base, checks: result?.checks ?? [] },
    });
    if (result?.status === "failed") {
      await supabaseAdmin.from("audit_logs").insert({
        organization_id: data.organizationId,
        actor_id: context.userId,
        action: "PUBLISH_SMOKE_FAILED",
        entity: "website",
        entity_id: data.organizationId,
        metadata: { version: data.version, checks: result.checks } as never,
      });
    }
    return { status: result?.status ?? "skipped", url: base, checks: result?.checks ?? [] };
  });

/**
 * One-click "Revert live site": visitors go back to the previous production
 * version immediately. The previous snapshot is copied as a NEW production
 * version (the newest live snapshot is what visitors are served), so nothing
 * is deleted and the revert itself can be reverted. The draft is untouched.
 * Owner/admin/manager only; RLS scopes every read and write to the workspace.
 */
export const revertLiveSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const { data: rows, error } = await context.supabase
      .from("website_versions")
      .select("id, version, published_at, pages, seo, generation")
      .eq("organization_id", data.organizationId)
      .not("published_at", "is", null)
      .order("version", { ascending: false })
      .limit(20);
    if (error) throw new Error("Couldn't read your published versions right now.");
    const live = (rows ?? []).map((row) => ({
      ...row,
      version: Number(row.version),
      live: (row.pages as Record<string, unknown> | null)?.["live_format"] === 1,
    }));
    const current = live.find((row) => row.live) ?? null;
    if (!current) throw new Error("This website hasn't been published yet.");
    const target = previousProduction(live, current.version);
    if (!target) throw new Error("There's no earlier live version to go back to.");

    const { data: latest } = await context.supabase
      .from("website_versions")
      .select("version")
      .eq("organization_id", data.organizationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = Number(latest?.version ?? 0) + 1;
    const publishedAt = new Date().toISOString();
    const { error: insertError } = await context.supabase.from("website_versions").insert({
      organization_id: data.organizationId,
      version: nextVersion,
      label: `Production v${nextVersion} (reverted to v${target.version})`,
      generation: (target.generation ?? {}) as never,
      seo: (target.seo ?? {}) as never,
      pages: target.pages as never,
      published_at: publishedAt,
      created_by: context.userId,
    });
    if (insertError) throw new Error("Couldn't revert the live site. Nothing changed — try again.");
    await context.supabase
      .from("website_settings")
      .update({ last_published_at: publishedAt } as never)
      .eq("organization_id", data.organizationId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: "LIVE_SITE_REVERTED",
      entity: "website",
      entity_id: data.organizationId,
      metadata: { from_version: current.version, to_version: target.version, new_version: nextVersion } as never,
    });
    return { version: nextVersion, restoredFrom: target.version, replaced: current.version };
  });

