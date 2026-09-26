import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * REVORA SELF-HEALING — transactional repair runner.
 *
 * Order is always: read real state → snapshot → plan → apply → verify → report.
 * Every write records the exact previous value, so if any write fails the runner
 * puts the earlier values back before returning. Nothing is reported as fixed
 * unless the follow-up read shows the repair actually landed.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  planRepairs,
  describeRepairs,
  type HealComponent,
  type HealFacts,
  type HealPage,
  type HealSection,
  type Repair,
} from "@/lib/self-heal";
import { readSeo } from "@/lib/site-seo";
import { safeLinkUrl } from "@/lib/website-content";

export type SelfHealResult = {
  planned: number;
  fixed: string[];
  /** Repairs that could not be written — everything was rolled back. */
  failed: string[];
  rolledBack: boolean;
  /** Restore point created before any change, when there was work to do. */
  restoreLabel: string | null;
  summary: string;
  /** Findings still needing the owner, expressed as remaining planned repairs. */
  remaining: number;
};

type Db = Pick<SupabaseClient, "from">;

const orgIdOf = (input: { organizationId?: unknown }) => {
  const id = String(input?.organizationId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid workspace");
  return id;
};

async function loadState(supabase: Db, orgId: string) {
  const [pages, sections, components, profile, settings, services] = await Promise.all([
    supabase
      .from("website_pages")
      .select("id, slug, title, kind, is_visible, seo_title, seo_description")
      .eq("organization_id", orgId)
      .order("sort_order"),
    supabase
      .from("website_sections")
      .select("id, page_id, kind, heading, body, is_visible, sort_order")
      .eq("organization_id", orgId)
      .order("sort_order"),
    supabase
      .from("website_components")
      .select("id, section_id, kind, label, body, link_label, link_url, media_url")
      .eq("organization_id", orgId)
      .order("sort_order"),
    supabase
      .from("business_profiles")
      .select("phone, city, service_area")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase.from("website_settings").select("id, seo").eq("organization_id", orgId).maybeSingle(),
    supabase
      .from("services")
      .select("name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .limit(8),
  ]);
  if (pages.error) throw new Error("You don't have access to that workspace.");
  return {
    pages: (pages.data ?? []) as HealPage[],
    sections: (sections.data ?? []) as HealSection[],
    components: (components.data ?? []) as HealComponent[],
    profile: (profile.data ?? null) as {
      phone: string | null;
      city: string | null;
      service_area: string | null;
    } | null,
    settings: (settings.data ?? null) as { id: string; seo: unknown } | null,
    services: ((services.data ?? []) as { name: string }[]).map((s) => s.name),
  };
}

/**
 * Runs Revora's safe repairs for one workspace. Runs as the signed-in user, so
 * RLS keeps it inside workspaces they belong to.
 */
export const runSelfHeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; dryRun?: boolean }) => ({
    organizationId: orgIdOf(input),
    dryRun: input?.dryRun === true,
  }))
  .handler(async ({ data, context }): Promise<SelfHealResult> => {
    const supabase = context.supabase as unknown as Db;
    const userId = context.userId;
    const orgId = data.organizationId;

    const state = await loadState(supabase, orgId);
    const seo = readSeo(state.settings?.seo);
    const facts: HealFacts = {
      businessName: null,
      city: state.profile?.city ?? null,
      serviceArea: state.profile?.service_area ?? null,
      phone: state.profile?.phone ?? null,
      services: state.services,
      siteSeoTitle: seo.headline ?? null,
      siteSeoDescription: seo.meta_description ?? null,
    };
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    facts.businessName = (org as { name?: string } | null)?.name ?? null;

    const repairs = planRepairs(state.pages, state.sections, state.components, facts);
    if (!repairs.length || data.dryRun) {
      return {
        planned: repairs.length,
        fixed: [],
        failed: [],
        rolledBack: false,
        restoreLabel: null,
        summary: repairs.length
          ? `Revora can fix ${describeRepairs(repairs)}.`
          : "Nothing needs Revora's automatic repair right now.",
        remaining: repairs.length,
      };
    }

    // Restore point before the first write.
    const restoreLabel = `Before Revora's automatic repairs`;
    const { data: latest } = await supabase
      .from("website_versions")
      .select("version")
      .eq("organization_id", orgId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { snapshotContent } = await import("@/lib/website-content");
    const tree = state.pages.map((page) => ({
      ...page,
      sections: state.sections
        .filter((section) => section.page_id === page.id)
        .map((section) => ({ ...section, components: [] })),
    }));
    await supabase.from("website_versions").insert({
      organization_id: orgId,
      version: ((latest as { version?: number } | null)?.version ?? 0) + 1,
      label: restoreLabel,
      pages: snapshotContent(tree as never) as unknown as never,
      created_by: userId,
    });

    type Undo = () => PromiseLike<unknown>;
    const undo: Undo[] = [];
    const fixed: string[] = [];
    const failed: string[] = [];

    const apply = async (repair: Repair) => {
      if (repair.kind === "site_seo") {
        if (!state.settings?.id) throw new Error("no website settings row");
        const previous = { ...seo };
        const next =
          repair.field === "title"
            ? { ...previous, headline: repair.value }
            : { ...previous, meta_description: repair.value };
        const result = await supabase
          .from("website_settings")
          .update({ seo: next as never })
          .eq("id", state.settings.id);
        if (result?.error) throw result.error;
        undo.push(() =>
          supabase
            .from("website_settings")
            .update({ seo: previous as never })
            .eq("id", state.settings!.id),
        );
        return;
      }
      if (repair.kind === "page_seo") {
        const page = state.pages.find((p) => p.id === repair.id)!;
        const before = repair.field === "seo_title" ? page.seo_title : page.seo_description;
        const result = await supabase
          .from("website_pages")
          .update({ [repair.field]: repair.value })
          .eq("id", repair.id)
          .eq("organization_id", orgId);
        if (result?.error) throw result.error;
        undo.push(() =>
          supabase
            .from("website_pages")
            .update({ [repair.field]: before })
            .eq("id", repair.id),
        );
        return;
      }
      if (repair.kind === "section_heading") {
        const before = state.sections.find((s) => s.id === repair.id)?.heading ?? null;
        const result = await supabase
          .from("website_sections")
          .update({ heading: repair.value })
          .eq("id", repair.id)
          .eq("organization_id", orgId);
        if (result?.error) throw result.error;
        undo.push(() =>
          supabase.from("website_sections").update({ heading: before }).eq("id", repair.id),
        );
        return;
      }
      const component = state.components.find((c) => c.id === repair.id)!;
      const field = repair.kind === "component_alt" ? "label" : "link_url";
      const before = repair.kind === "component_alt" ? component.label : component.link_url;
      // Link targets are rendered as hrefs on the public site: re-sanitize on
      // write so only http(s)/mailto/tel/sms/relative targets can ever persist.
      const value = field === "link_url" ? safeLinkUrl(repair.value) : repair.value;
      const result = await supabase
        .from("website_components")
        .update({ [field]: value })
        .eq("id", repair.id)
        .eq("organization_id", orgId);
      if (result?.error) throw result.error;
      undo.push(() =>
        supabase
          .from("website_components")
          .update({ [field]: before })
          .eq("id", repair.id),
      );
    };

    for (const repair of repairs) {
      try {
        await apply(repair);
        fixed.push(repair.label);
      } catch (error) {
        console.error("[self-heal] repair failed", repair.kind, error);
        failed.push(repair.label);
        break; // all-or-nothing: stop at the first real failure
      }
    }

    // Any failure undoes the whole run, exactly.
    if (failed.length) {
      for (const revert of undo.reverse()) {
        try {
          await revert();
        } catch (error) {
          console.error("[self-heal] rollback step failed", error);
        }
      }
      return {
        planned: repairs.length,
        fixed: [],
        failed,
        rolledBack: true,
        restoreLabel,
        summary:
          "We couldn't finish those repairs, so nothing was changed. Your website is exactly as it was.",
        remaining: repairs.length,
      };
    }

    // Verify against a fresh read — never report a fix we can't see.
    const after = await loadState(supabase, orgId);
    const afterSeo = readSeo(after.settings?.seo);
    const remaining = planRepairs(after.pages, after.sections, after.components, {
      ...facts,
      siteSeoTitle: afterSeo.headline ?? null,
      siteSeoDescription: afterSeo.meta_description ?? null,
      city: after.profile?.city ?? null,
      serviceArea: after.profile?.service_area ?? null,
      phone: after.profile?.phone ?? null,
      services: after.services,
    });

    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: userId,
      action: "website.self_heal",
      entity: "website",
      metadata: { fixed: fixed.length, remaining: remaining.length },
    });

    return {
      planned: repairs.length,
      fixed,
      failed,
      rolledBack: false,
      restoreLabel,
      summary: remaining.length
        ? `Revora fixed ${fixed.length} item${fixed.length === 1 ? "" : "s"}. ${remaining.length} still need${remaining.length === 1 ? "s" : ""} your input.`
        : `Revora fixed ${fixed.length} item${fixed.length === 1 ? "" : "s"}. Nothing safe is left to repair.`,
      remaining: remaining.length,
    };
  });
