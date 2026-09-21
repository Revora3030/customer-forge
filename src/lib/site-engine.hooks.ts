import { useEffect } from "react";
import { nextPublishState } from "@/lib/publish-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/paginate";
import {
  aiEditSiteCopy,
  pumpSiteEngineQueue,
  runSiteGeneration,
} from "@/lib/site-engine.functions";

/** Latest build job for the workspace; polls while a build is running. */
export function useLatestGenerationJob(organizationId: string | undefined) {
  const query = useQuery({
    queryKey: ["generation_job", organizationId],
    enabled: !!organizationId,
    refetchInterval: (q) => {
      const status = (q.state.data as { status?: string } | undefined)?.status;
      return status === "processing" || status === "queued" ? 1500 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generation_jobs")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fallback pump: if the scheduled worker hasn't picked the job up yet, ask the
  // server to advance the queue for this workspace. The database lease makes this
  // safe to call repeatedly — it never double-processes a job.
  const pump = useServerFn(pumpSiteEngineQueue);
  const status = (query.data as { status?: string } | null | undefined)?.status;
  useEffect(() => {
    if (!organizationId || status !== "queued") return;
    const timer = setTimeout(() => {
      void pump({ data: { organizationId } }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [organizationId, status, pump]);

  // When the background worker finishes, pull the new site copy into the UI.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status !== "completed") return;
    void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    void queryClient.invalidateQueries({ queryKey: ["website_versions"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [status, queryClient]);

  return query;
}

export function useRunSiteEngine(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const run = useServerFn(runSiteGeneration);
  return useMutation({
    mutationFn: async () => run({ data: { organizationId: organizationId! } }),
    onMutate: () => {
      void queryClient.invalidateQueries({ queryKey: ["generation_job", organizationId] });
    },
    onSuccess: () => {
      toast.message("Build queued", {
        description: "Revora is building your website — progress updates below.",
      });
      void queryClient.invalidateQueries({ queryKey: ["generation_job", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["generation_job", organizationId] });
      toast.error(friendlyError(error, "The build couldn't be queued. You can retry."));
    },
  });
}

export function useAiCopyEdit(organizationId: string | undefined) {
  const edit = useServerFn(aiEditSiteCopy);
  return useMutation({
    mutationFn: async (vars: { instruction: string; fields: Record<string, string> }) =>
      edit({ data: { organizationId: organizationId!, ...vars } }),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't rewrite that copy.")),
  });
}

/* ------------------------------- versions ------------------------------- */

export function useWebsiteVersions(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["website_versions", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_versions")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Snapshots the current draft as the next published version. */
export function useSnapshotWebsiteVersion(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (label?: string) => {
      const orgId = organizationId!;
      const [{ data: settings }, { data: last }, pages, sections] = await Promise.all([
        supabase.from("website_settings").select("*").eq("organization_id", orgId).maybeSingle(),
        supabase
          .from("website_versions")
          .select("version")
          .eq("organization_id", orgId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("website_pages")
          .select("id, slug, title, kind, seo_title, seo_description")
          .eq("organization_id", orgId)
          .order("sort_order"),
        supabase
          .from("website_sections")
          .select("id, page_id, kind, heading, subheading, body, sort_order, is_visible")
          .eq("organization_id", orgId)
          .order("sort_order"),
      ]);
      if (!settings) throw new Error("There's no website to snapshot yet.");
      const version = Number(last?.version ?? 0) + 1;
      // Every version also carries the structure, so two versions can be
      // compared section by section later on.
      const content = {
        pages: (pages.data ?? []).map((page) => ({
          ...page,
          sections: (sections.data ?? []).filter((section) => section.page_id === page.id),
        })),
      };
      const { error } = await supabase.from("website_versions").insert({
        organization_id: orgId,
        version,
        label: label ?? `Version ${version}`,
        template: settings.template,
        generation: settings.generation as never,
        seo: settings.seo as never,
        pages: { settings_pages: settings.pages ?? null, content } as never,
        published_at: new Date().toISOString(),
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
      if (error) throw error;
      return version;
    },
    onSuccess: (version) => {
      toast.success(`Saved as version ${version}.`);
      void queryClient.invalidateQueries({ queryKey: ["website_versions", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save this version.")),
  });
}

/** Restores a previous version into the working draft. Nothing is destroyed. */
export function useRestoreWebsiteVersion(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const orgId = organizationId!;
      const { data: snapshot, error: readError } = await supabase
        .from("website_versions")
        .select("*")
        .eq("id", versionId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (readError) throw readError;
      if (!snapshot) throw new Error("That version is no longer available.");

      const stored = snapshot.pages as { settings_pages?: unknown } | null;
      const settingsPages =
        stored && typeof stored === "object" && "settings_pages" in stored
          ? stored.settings_pages
          : snapshot.pages;

      const keepState = await nextPublishState(supabase, orgId);
      const { error } = await supabase.from("website_settings").upsert(
        {
          organization_id: orgId,
          template: snapshot.template ?? "default",
          generation: snapshot.generation as never,
          seo: snapshot.seo as never,
          pages: settingsPages as never,
          review_state: "ready_for_review",
          publish_state: keepState,
        } as never,
        { onConflict: "organization_id" },
      );
      if (error) throw error;
      return snapshot.version;
    },
    onSuccess: (version) => {
      toast.success(`Version ${version} restored into your draft. Review, then publish.`);
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't restore that version.")),
  });
}

/* --------------------------- score / recommendations --------------------------- */

/** Counts behind the Revora Website Score, read in one pass. */
export function useScoreFacts(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["score_facts", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const orgId = organizationId!;
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [services, media, reviews, social, forms, events, leads, bookings] = await Promise.all([
        supabase
          .from("services")
          .select("price, starting_price, bookable")
          .eq("organization_id", orgId)
          .eq("is_active", true),
        supabase
          .from("media")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        supabase.from("social_profiles").select("*").eq("organization_id", orgId).maybeSingle(),
        supabase
          .from("quote_forms")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("is_active", true),
        fetchAllRows<{ event_type: string }>((from, to) =>
          supabase
            .from("analytics_events")
            .select("event_type")
            .eq("organization_id", orgId)
            .gte("created_at", since)
            .range(from, to),
        ),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("created_at", since),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("created_at", since),
      ]);

      const rows = services.data ?? [];
      const s = (social.data ?? {}) as Record<string, unknown>;
      const socialLinks = [
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "google_business",
        "linkedin",
      ].filter((k) => typeof s[k] === "string" && String(s[k]).trim()).length;
      const eventRows = events.rows;
      const countOf = (type: string) => eventRows.filter((e) => e.event_type === type).length;

      return {
        servicesCount: rows.length,
        pricedServicesCount: rows.filter((r) => r.price != null || r.starting_price != null).length,
        bookableCount: rows.filter((r) => r.bookable).length,
        mediaCount: media.count ?? 0,
        reviewCount: reviews.count ?? 0,
        socialLinks,
        quoteFormCount: forms.count ?? 0,
        signals: {
          visitors: countOf("page_view"),
          leads: leads.count ?? 0,
          bookings: bookings.count ?? 0,
          callClicks: countOf("call_click"),
          formViews: countOf("quote_start") + countOf("booking_start"),
        },
      };
    },
  });
}

/* ------------------- brief review, missing facts, self-test ------------------- */

import {
  analyzeSiteBrief,
  getBuildReadiness,
  runSiteEngineCheck,
  saveMissingFacts,
  saveSiteBrief,
} from "@/lib/site-engine.functions";
import type { SiteBrief } from "@/lib/site-brief";

/** Real blanks, brief approval state and lead-capture QA for this workspace. */
export function useBuildReadiness(organizationId: string | undefined) {
  const readiness = useServerFn(getBuildReadiness);
  return useQuery({
    queryKey: ["build_readiness", organizationId],
    enabled: !!organizationId,
    queryFn: async () => readiness({ data: { organizationId: organizationId! } }),
  });
}

export function useAnalyzeBrief(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeSiteBrief);
  return useMutation({
    mutationFn: async () => analyze({ data: { organizationId: organizationId! } }),
    onSuccess: (result) => {
      if (result.aiError)
        toast.message("Prepared from your information", {
          description: "Revora's AI analysis wasn't available, so the brief was built from rules.",
        });
      else toast.success("Revora analysed your business — review the brief before building.");
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
      void queryClient.invalidateQueries({ queryKey: ["build_readiness", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't analyse your business.")),
  });
}

export function useSaveBrief(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveSiteBrief);
  return useMutation({
    mutationFn: async (vars: { brief: SiteBrief; approved: boolean }) =>
      save({
        data: { organizationId: organizationId!, brief: vars.brief, approved: vars.approved },
      }),
    onSuccess: (_r, vars) => {
      toast.success(vars.approved ? "Brief approved — Revora can build from it." : "Brief saved.");
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
      void queryClient.invalidateQueries({ queryKey: ["build_readiness", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save the brief.")),
  });
}

export function useSaveMissingFacts(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveMissingFacts);
  return useMutation({
    mutationFn: async (answers: Record<string, string>) =>
      save({ data: { organizationId: organizationId!, answers } }),
    onSuccess: () => {
      toast.success("Saved — Revora will use this in your website.");
      void queryClient.invalidateQueries({ queryKey: ["business_profile"] });
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
      void queryClient.invalidateQueries({ queryKey: ["build_readiness", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save your answers.")),
  });
}

/** Signed-in end-to-end check of the live AI call, QA and public preview. */
export function useSiteEngineCheck(organizationId: string | undefined) {
  const check = useServerFn(runSiteEngineCheck);
  return useMutation({
    mutationFn: async () => check({ data: { organizationId: organizationId! } }),
    onError: (error: Error) => toast.error(friendlyError(error, "The system check couldn't run.")),
  });
}
