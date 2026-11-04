import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LoadingRows, PageHead } from "@/components/app/Bits";
import { GrowthCommandCenter } from "@/components/app/GrowthCommandCenter";
import { SiteAuditor } from "@/components/app/SiteAuditor";
import { IntakeHub } from "@/components/app/IntakeHub";
import {
  useBusinessProfile,
  useSaveBusinessProfile,
  useSaveWebsiteSettings,
  useServices,
  useUpdateOrganization,
  useWebsiteSettings,
} from "@/lib/queries";
import {
  useRunSiteEngine,
  useScoreFacts,
  useSnapshotWebsiteVersion,
} from "@/lib/site-engine.hooks";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { useWorkspace } from "@/lib/use-tenant";
import { canManage } from "@/lib/domain";
import { useLaunchFlow } from "@/lib/production.hooks";
import { readSeo } from "@/lib/site-seo";
import { readCopy } from "@/lib/site-engine";
import type { AutoFixKey, GrowthAuditInput } from "@/lib/growth-command";
import { buildGrowthAuditInput } from "@/lib/growth-audit-input";
import { auditStructure, type LivePageResult } from "@/lib/site-audit";
import {
  CONVERSION_GOALS,
  conversionGaps,
  normalizeGoal,
  type ConversionContext,
  type ConversionGoal,
} from "@/lib/conversion-engine";
import { proposeUpgrades, type UpgradeProposal } from "@/lib/auto-upgrade";
import {
  useApplyUpgrade,
  useBatchFix,
  useUndoUpgrade,
  useLiveAudit,
  type AppliedUpgrade,
} from "@/lib/auto-upgrade.hooks";

import type { IntakeValues } from "@/lib/intake-map";

export const Route = createFileRoute("/_authenticated/app/command")({
  head: () => ({
    meta: [
      { title: "AI Growth Command Center — Revora" },
      { property: "og:title", content: "AI Growth Command Center — Revora" },
      { property: "og:description", content: "Audit, improve, connect and repair your whole website and growth system from one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Audit, improve, connect and repair your whole website and growth system from one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenterPage,
});

function CommandCenterPage() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const manage = canManage(ws?.workspace?.role ?? "viewer");
  const launchFlow = useLaunchFlow(orgId);

  const profileQuery = useBusinessProfile(orgId);
  const settingsQuery = useWebsiteSettings(orgId);
  const { data: services } = useServices(orgId);
  const { data: pages } = useWebsiteContent(orgId);
  const facts = useScoreFacts(orgId);

  const saveSettings = useSaveWebsiteSettings(orgId);
  const runEngine = useRunSiteEngine(orgId);
  const snapshot = useSnapshotWebsiteVersion(orgId);
  const [busyFix, setBusyFix] = useState<AutoFixKey | null>(null);

  const profile = profileQuery.data as Record<string, unknown> | null | undefined;
  const settings = settingsQuery.data;
  const seo = readSeo(settings?.seo);
  const generation = (settings?.generation ?? null) as Record<string, unknown> | null;
  const copy = readCopy(generation?.["copy"]);

  const isLoadingWorkspace = profileQuery.isLoading || settingsQuery.isLoading;

  const input: GrowthAuditInput = buildGrowthAuditInput({
    businessName: org?.name,
    profile,
    seo,
    copy,
    facts: facts.data,
    servicesLength: (services ?? []).length,
    pages,
    publishState: settings?.publish_state,
    domainStatus: settings?.domain_status,
  });

  /* ---------------- Auditor · conversion engine · auto-upgrades ---------------- */

  const selectedGoals = Array.isArray(profile?.["website_goals"])
    ? (profile["website_goals"] as unknown[]).filter((goal): goal is string => typeof goal === "string")
    : [];
  const goal =
    normalizeGoal(org?.conversion_goal ?? null) ??
    selectedGoals.map((selected) => normalizeGoal(selected)).find((selected) => selected !== null) ??
    null;

  const conversionCtx: ConversionContext = {
    phone: input.phone,
    smsCapable: !!input.phone,
    bookableCount: input.bookableCount,
    quoteFormCount: input.quoteFormCount,
    paymentsEnabled: (services ?? []).some(
      (service) => Number(service.price ?? service.starting_price ?? 0) > 0,
    ),
    email: input.email,
    slug: org?.slug ?? null,
  };

  const structure = useMemo(
    () =>
      auditStructure({
        pages: pages ?? [],
        goal,
        metaDescription: seo.meta_description ?? null,
        headline: seo.headline ?? null,
      }),
    [pages, goal, seo.meta_description, seo.headline],
  );

  const sectionKinds = (pages ?? []).flatMap((page) =>
    page.sections.filter((section) => section.is_visible).map((section) => section.kind),
  );
  const gaps = conversionGaps(
    goal,
    conversionCtx,
    sectionKinds,
    (copy?.faqs ?? []).map((faq) => faq.question),
  );

  const proposals = useMemo(
    () =>
      proposeUpgrades(structure.issues, {
        goal,
        copyHeadline: copy?.heroHeadline ?? null,
        copyMetaDescription: copy?.metaDescription ?? null,
        copyPrimaryCta: copy?.primaryCta ?? null,
        headline: seo.headline ?? null,
        metaDescription: seo.meta_description ?? null,
        primaryCtaLabel: seo.primary_cta_label ?? null,
        publishState: settings?.publish_state ?? "draft",
        pages: (pages ?? []).map((page) => ({
          id: page.id,
          title: page.title,
          slug: page.slug,
          seo_title: page.seo_title,
          seo_description: page.seo_description,
          noindex: page.noindex,
        })),
        businessName: org?.name ?? null,
        city: input.city,
      }),
    [structure.issues, goal, copy, seo, settings?.publish_state, pages, org?.name, input.city],
  );

  const liveAudit = useLiveAudit(orgId);
  const applyUpgrade = useApplyUpgrade(orgId, seo as unknown as Record<string, unknown>);
  const undoUpgrade = useUndoUpgrade(orgId);
  const batchFix = useBatchFix(orgId, seo as unknown as Record<string, unknown>);

  const [live, setLive] = useState<LivePageResult[] | null>(null);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<AppliedUpgrade | null>(null);
  const saveProfile = useSaveBusinessProfile(orgId);
  const updateOrg = useUpdateOrganization();

  // Every hook above runs on every render; the loading gate must come after them
  // so hook order stays identical before and after the workspace queries settle.
  if (isLoadingWorkspace) return <LoadingRows rows={5} />;

  const scanLive = async () => {
    const result = await liveAudit.mutateAsync();
    setLive(result.pages ?? []);
    setLiveNote(result.note ?? null);
  };

  const runUpgrade = async (proposal: UpgradeProposal) => {
    if (!manage || !proposal.applyable) return;
    setApplyingId(proposal.id);
    try {
      setLastApplied(await applyUpgrade.mutateAsync(proposal));
    } finally {
      setApplyingId(null);
    }
  };

  /**
   * "Fix all critical issues" / "Optimise entire website". One checkpoint, then
   * every safe change in order, then the affected pages are re-scanned so the
   * score and the finding list reflect the new state.
   */
  const runBatch = async (mode: "critical" | "all") => {
    if (!manage) return;
    const criticalKinds = new Set(
      structure.issues
        .filter((issue) => issue.severity === "critical")
        .map((issue) => issue.upgrade),
    );
    const selected =
      mode === "critical"
        ? proposals.filter((proposal) => criticalKinds.has(proposal.kind))
        : proposals;
    const result = await batchFix.mutateAsync({
      proposals: selected,
      label: mode === "critical" ? "Fix all critical issues" : "Optimise entire website",
    });
    if (result.restore) setLastApplied(result.restore);
    if (live) await scanLive();
  };

  /* ------------------------------ One-input intake ---------------------------- */

  const goalLabel = goal ? (CONVERSION_GOALS.find((entry) => entry.value === goal)?.label ?? "") : "";

  const intakeValues: IntakeValues = {
    name: org?.name ?? "",
    description: input.description ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    city: input.city ?? "",
    service_area: input.serviceArea ?? "",
    primary_goal: goalLabel,
  };

  const saveIntake = async (patch: IntakeValues) => {
    if (!manage || !orgId) return;
    if (patch["name"] && patch["name"] !== org?.name) {
      await updateOrg.mutateAsync({ id: orgId, patch: { name: patch["name"] } });
    }
    const normalizedPrimaryGoal = normalizeGoal(patch["primary_goal"] ?? null);
    const profilePatch: Record<string, unknown> = {
      description: patch["description"] ?? null,
      phone: patch["phone"] ?? null,
      email: patch["email"] ?? null,
      city: patch["city"] ?? null,
      service_area: patch["service_area"] ?? null,
    };
    if (normalizedPrimaryGoal) {
      const websiteGoalByConversion: Record<ConversionGoal, string> = {
        call: "call",
        text: "text",
        book: "book",
        quote: "quote",
        buy: "purchase",
        lead: "lead",
      };
      const nextGoal = websiteGoalByConversion[normalizedPrimaryGoal];
      const rest = selectedGoals.filter((selected) => normalizeGoal(selected) !== normalizedPrimaryGoal);
      profilePatch["website_goals"] = [nextGoal, ...rest];
    }
    await saveProfile.mutateAsync(profilePatch);
    if (normalizedPrimaryGoal) {
      const storedGoalByConversion: Partial<Record<ConversionGoal, string>> = {
        call: "calls",
        book: "bookings",
        quote: "quotes",
        buy: "purchases",
      };
      const storedGoal = storedGoalByConversion[normalizedPrimaryGoal] ?? null;
      if ((org?.conversion_goal ?? null) !== storedGoal)
        await updateOrg.mutateAsync({ id: orgId, patch: { conversion_goal: storedGoal } });
    }
  };

  const applyFix = async (key: AutoFixKey) => {
    if (!manage) return;
    setBusyFix(key);
    try {
      // Safe AI: keep a restorable version before Revora changes saved content.
      if (key !== "generate_site") {
        try {
          await snapshot.mutateAsync(`Before auto fix: ${key}`);
        } catch {
          /* snapshotting is best effort — never block the fix */
        }
      }
      if (key === "generate_site") await runEngine.mutateAsync();

      if (key === "apply_cta" && copy?.primaryCta) {
        await saveSettings.mutateAsync({ seo: { ...seo, primary_cta_label: copy.primaryCta } });
      }
      if (key === "apply_meta" && copy) {
        await saveSettings.mutateAsync({
          seo: {
            ...seo,
            meta_description: seo.meta_description || copy.metaDescription,
            headline: seo.headline || copy.heroHeadline,
          },
        });
      }
      if (key === "publish_site") {
        launchFlow.launch();
      }
    } finally {
      setBusyFix(null);
    }
  };

  return (
    <div className="product-page">
      <PageHead
        eyebrow="Revora AI"
        title="What should we improve?"
        purpose="Choose an outcome. Revora checks what is saved, recommends the next move, and keeps every change reversible."
      />

      <GrowthCommandCenter
        input={input}
        canManage={manage}
        isRefreshing={facts.isFetching || settingsQuery.isFetching}
        busyFix={busyFix}
        onRefresh={() => {
          void facts.refetch();
          void settingsQuery.refetch();
          void profileQuery.refetch();
        }}
        onAutoFix={(key) => void applyFix(key)}
      />

      <IntakeHub
        values={intakeValues}
        canManage={manage}
        isSaving={saveProfile.isPending || updateOrg.isPending || saveSettings.isPending}
        onSave={(patch) => void saveIntake(patch)}
      />

      <SiteAuditor
        structureIssues={structure.issues}
        pageScores={structure.pageScores}
        goal={goal}
        conversionCtx={conversionCtx}
        conversionGaps={gaps}
        proposals={proposals}
        live={live}
        liveNote={liveNote}
        isScanning={liveAudit.isPending}
        canManage={manage}
        applyingId={applyingId}
        lastApplied={lastApplied}
        isUndoing={undoUpgrade.isPending}
        isBatchRunning={batchFix.isPending}
        onScanLive={() => void scanLive()}
        onApply={(proposal) => void runUpgrade(proposal)}
        onBatchFix={(mode) => void runBatch(mode)}

        onUndo={() => {
          if (lastApplied)
            void undoUpgrade.mutateAsync(lastApplied).then(() => setLastApplied(null));
        }}
      />
    </div>
  );
}
