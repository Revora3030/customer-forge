import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LoadingRows } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import {
  useBusinessProfile,
  useSaveBusinessProfile,
  useSaveWebsiteSettings,
  useServices,
  useWebsiteSettings,
} from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { canManage } from "@/lib/domain";
import { readSeo } from "@/lib/site-seo";
import { trackConversion } from "@/lib/conversion";

import { WebsiteReview } from "@/components/app/WebsiteReview";
import { InteractionHealth } from "@/components/app/InteractionHealth";
import { MemoryPanel } from "@/components/app/MemoryPanel";
import { StockPhotoPanel } from "@/components/app/StockPhotoPanel";
import { TemplateGalleryPanel } from "@/components/app/TemplateGalleryPanel";

import { BuilderWizard } from "@/components/app/BuilderWizard";
import { BuilderShell } from "@/components/app/BuilderShell";
import { Disclosure, OverlayPanel } from "@/components/app/BuilderTools";
import { BuilderHistoryProvider } from "@/lib/builder-history.hooks";
import { GroupTabs } from "@/components/app/BuilderGroups";
import { BuilderAssistant } from "@/components/app/BuilderAssistant";
import { BuilderNeeds, type BuilderNeed } from "@/components/app/BuilderNeeds";
import { builderNeedKeys, type BuilderNeedKey } from "@/lib/builder-needs";
import { useBuilderRequests } from "@/lib/builder-requests.hooks";
import { ConversionOptimizer } from "@/components/app/ConversionOptimizer";
import { normalizeBuilderMode } from "@/lib/builder-modes";

import { WebsiteStructure } from "@/components/app/WebsiteStructure";
import { LeadEngine } from "@/components/app/LeadEngine";
import { WebsiteProject } from "@/components/app/WebsiteProject";
import {
  EnvironmentBanner,
  ProductionLaunchModal,
  ProductionReadinessPanel,
} from "@/components/app/ProductionLaunch";
import { useLaunchFlow, useProductionReadiness, useProductionStatus } from "@/lib/production.hooks";
import { LaunchQualityCard } from "@/components/app/LaunchQualityCard";
import { useLaunchReview } from "@/lib/launch-review.hooks";
import { planQualityImprovements } from "@/lib/builder/quality-improvement-plan";
import { PublishRetryBar } from "@/components/app/PublishRetryBar";


import { EffectStudio } from "@/components/app/EffectStudio";
import { ImageStudio } from "@/components/app/ImageStudio";
import { readBackdrop, writeBackdrop } from "@/lib/site-effects";
import { SiteChatbot } from "@/components/app/SiteChatbot";
import { UpgradeStudio } from "@/components/app/UpgradeStudio";
import { RevoraGenius } from "@/components/app/RevoraGenius";
import { BuilderAudit } from "@/components/app/BuilderAudit";
import { BuilderCanvas } from "@/components/app/BuilderCanvas";
import { BuilderPreview } from "@/components/app/BuilderPreview";
import { MessageCircle, MousePointer2, Paintbrush, Sparkles } from "lucide-react";
import { PreFlightPanel } from "@/components/app/PreFlight";
import { preflight } from "@/lib/preflight";
import { usePreflightFacts } from "@/lib/preflight.hooks";
import { useSelfHeal } from "@/lib/self-heal.hooks";
import { ClientOnboardingFlow } from "@/components/app/ClientOnboardingFlow";

import { LaunchChecks } from "@/components/app/LaunchChecks";
import { VisualCheckPanel } from "@/components/app/VisualCheckPanel";
import { VisionReviewPanel } from "@/components/app/VisionReviewPanel";
import { SiteUpgradePanel } from "@/components/app/SiteUpgradePanel";
import { PortalAccess } from "@/components/app/PortalAccess";
import { PreviewLinks, PreviewSiteButton } from "@/components/app/PreviewLinks";
import { VersionDiff } from "@/components/app/VersionDiff";
import { DraftBranchPanel } from "@/components/app/DraftBranchPanel";
import { RestorePointPanel } from "@/components/app/RestorePointPanel";
import { PlatformEngine } from "@/components/app/PlatformEngine";
import { DesignIdentity } from "@/components/app/DesignIdentity";
import { recordHealth, snapshotFromPreflight } from "@/lib/site-health";
import type { Regression } from "@/lib/site-regression";
import { askAssistant } from "@/lib/assistant-bridge";
import {
  AiCopyAssistant,
  RevoraScorePanel,
  SiteEnginePanel,
  VersionHistory,
} from "@/components/app/SiteEngine";
import { BuildReportPanel, BusinessBriefPanel } from "@/components/app/BuildBrief";
import {
  BriefReviewPanel,
  EngineSelfTestPanel,
  MissingFactsPanel,
} from "@/components/app/BriefReview";
import { readBrief, readReport } from "@/lib/site-brief";
import {
  EDITABLE_COPY_FIELDS,
  growthRecommendations,
  readCopy,
  revoraScore,
} from "@/lib/site-engine";
import { useBuildReadiness, useScoreFacts } from "@/lib/site-engine.hooks";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { websiteQa, type WizardStepKey } from "@/lib/website-content";

/** Old deep links land on the matching door in the simplified workspace. */
const ADVANCED_GROUP: Record<string, string> = {
  design: "look",
  pages: "pages",
  launch: "launch",
  ai: "assistant",
};

export const Route = createFileRoute("/_authenticated/app/website")({
  // Deep links from audit findings land on the exact builder area that fixes them.
  validateSearch: (search: Record<string, unknown>): { section?: string } =>
    typeof search["section"] === "string" ? { section: search["section"] as string } : {},

  head: () => ({
    meta: [
      { title: "Website builder — Revora" },
      {
        name: "description",
        content: "Build, review and publish your business website step by step.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WebsitePage,
});

function WebsitePage() {
  const { section: sectionParam } = Route.useSearch();
  const { data: ws } = useWorkspace();

  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const profileQuery = useBusinessProfile(orgId);
  const settingsQuery = useWebsiteSettings(orgId);
  const { data: services } = useServices(orgId);
  const saveSettings = useSaveWebsiteSettings(orgId);
  const saveProfile = useSaveBusinessProfile(orgId);
  const { data: pages } = useWebsiteContent(orgId);

  const profile = profileQuery.data as Record<string, unknown> | null | undefined;
  const settings = settingsQuery.data;
  const seo = readSeo(settings?.seo);
  const { data: readiness } = useBuildReadiness(orgId);
  const facts = useScoreFacts(orgId);
  const preflightFacts = usePreflightFacts(orgId);
  const selfHeal = useSelfHeal(orgId);
  const generation = (settings?.generation ?? null) as Record<string, unknown> | null;
  const copy = readCopy(generation?.["copy"]);
  const brief = readBrief(generation?.["brief"]);
  const buildReport = readReport(generation?.["report"]);
  const manage = canManage(ws?.workspace?.role ?? "viewer");
  const [jump, setJump] = useState<{ step: WizardStepKey; anchor?: string; nonce: number } | null>(
    null,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [advanced, setAdvanced] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"build" | "chat" | "edit" | "visual">("build");

  /** One request engine for the whole workspace. */
  const requests = useBuilderRequests({ organizationId: orgId ?? null, canManage: manage });

  /** Older deep links (and panels that ask to jump) resolve to the new doors. */
  const goTo = (key: string) => {
    if (key === "answers" || key === "setup") {
      setSetupOpen(true);
      return;
    }
    if (key === "versions" || key === "history") {
      setHistoryOpen(true);
      return;
    }
    const mode = normalizeBuilderMode(key);
    if (mode === "build") {
      setAdvanced(null);
      return;
    }
    setAdvanced(ADVANCED_GROUP[mode] ?? "pages");
  };
  // A finding elsewhere can deep-link straight into the area that fixes it.
  useEffect(() => {
    if (!sectionParam) return;
    const mode = normalizeBuilderMode(sectionParam);
    setAdvanced(mode === "build" ? null : (ADVANCED_GROUP[mode] ?? "pages"));
  }, [sectionParam]);

  // Builder → publish completion: one "opened" per workspace per browser
  // session, so the published count can be read as a share of real attempts.
  useEffect(() => {
    if (!orgId) return;
    const key = `revora.builder.opened.${orgId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable — record it anyway */
    }
    trackConversion("builder_opened", { metadata: { organization_id: orgId } });
  }, [orgId]);

  const requiredCount = (readiness?.requiredGaps ?? []).length;

  // One server-verified launch path for every publish button on this page.
  const { data: production } = useProductionStatus(orgId);
  const { data: productionReadiness } = useProductionReadiness(orgId);
  const { data: launchReview } = useLaunchReview(orgId);

  const launchFlow = useLaunchFlow(orgId);

  const servicesCount = facts.data?.servicesCount ?? (services ?? []).length;
  const pricedCount = facts.data?.pricedServicesCount ?? 0;
  const captureCount = (facts.data?.quoteFormCount ?? 0) + (facts.data?.bookableCount ?? 0);
  const visibleSections = (pages ?? []).reduce(
    (sum, page) => sum + page.sections.filter((s) => s.is_visible).length,
    0,
  );

  const siteScore = revoraScore({
    profile: profileQuery.data,
    seo,
    servicesCount,
    pricedServicesCount: pricedCount,
    mediaCount: facts.data?.mediaCount ?? 0,
    reviewCount: facts.data?.reviewCount ?? 0,
    socialLinks: facts.data?.socialLinks ?? 0,
    quoteFormCount: facts.data?.quoteFormCount ?? 0,
    bookableCount: facts.data?.bookableCount ?? 0,
    hasCopy: !!copy,
  });
  const recommendations = growthRecommendations(
    siteScore,
    facts.data?.signals ?? { visitors: 0, leads: 0, bookings: 0, callClicks: 0, formViews: 0 },
  );

  const qa = websiteQa({
    businessName: org?.name ?? null,
    phone: (profile?.["phone"] as string) ?? null,
    email: (profile?.["email"] as string) ?? null,
    city: (profile?.["city"] as string) ?? null,
    serviceArea: (profile?.["service_area"] as string) ?? null,
    description: (profile?.["description"] as string) ?? null,
    servicesCount,
    pagesCount: (pages ?? []).length,
    visibleSectionsCount: visibleSections,
    metaDescription: seo.meta_description ?? null,
    headline: seo.headline ?? copy?.heroHeadline ?? null,
    hasCopy: !!copy,
    photoCount: facts.data?.mediaCount ?? 0,
    captureCount,
    reviewState: settings?.review_state ?? null,
  });

  // REVORA PRE-FLIGHT™ — real pre-publish verification over the live workspace.
  const domainVerified = ["connected", "ssl_active"].includes(settings?.domain_status ?? "");
  const preflightResult = preflight({
    pages: pages ?? [],
    businessName: org?.name ?? null,
    phone: (profile?.["phone"] as string) ?? null,
    email: (profile?.["email"] as string) ?? null,
    city: (profile?.["city"] as string) ?? null,
    serviceArea: (profile?.["service_area"] as string) ?? null,
    description: (profile?.["description"] as string) ?? null,
    logoUrl: (profile?.["logo_url"] as string) ?? null,
    hasHours: preflightFacts.data?.hasHours ?? false,
    servicesCount,
    pricedServicesCount: pricedCount,
    bookableCount: facts.data?.bookableCount ?? 0,
    quoteFormCount: facts.data?.quoteFormCount ?? 0,
    quoteQuestionCount: preflightFacts.data?.quoteQuestionCount ?? null,
    mediaCount: facts.data?.mediaCount ?? 0,
    analyticsConfigured: (facts.data?.signals?.visitors ?? 0) > 0,
    notifiesOwner: preflightFacts.data?.notifiesOwner ?? false,
    followUpAutomations: preflightFacts.data?.followUpAutomations ?? 0,
    seoTitle: seo.headline ?? copy?.heroHeadline ?? null,
    seoDescription: seo.meta_description ?? null,
    publicHost: domainVerified ? (settings?.custom_domain ?? null) : null,
    httpsVerified: domainVerified,
    canPublish: production?.unlocked !== false,
    canPublishReason: production?.unlocked === false ? (production?.reason ?? null) : null,
  });

  // Regression watch: compare this real check against the previous one for this
  // workspace and tell the owner what got worse. Recorded in an effect only.
  const [regressions, setRegressions] = useState<Regression[]>([]);
  const preflightReady = !preflightFacts.isLoading && !!orgId && (pages ?? []).length > 0;
  const healthSignature = `${preflightResult.score}:${(pages ?? []).length}:${visibleSections}:${
    preflightResult.checks.filter((c) => c.status === "fail").length
  }`;
  useEffect(() => {
    if (!preflightReady || !orgId) return;
    const snapshot = snapshotFromPreflight(preflightResult, {
      pages: (pages ?? []).map((page) => ({
        slug: page.slug,
        visibleSections: page.sections.filter((section) => section.is_visible).length,
      })),
      ctas: (pages ?? []).reduce(
        (sum, page) =>
          sum +
          page.sections.reduce(
            (inner, section) =>
              inner +
              section.components.filter((component) => component.is_visible && !!component.link_url)
                .length,
            0,
          ),
        0,
      ),
      forms: (pages ?? []).reduce(
        (sum, page) =>
          sum +
          page.sections.filter(
            (section) => section.is_visible && /form|book|quote|contact/.test(section.kind),
          ).length,
        0,
      ),
      publicHttps: domainVerified,
    });
    setRegressions(recordHealth(orgId, snapshot).regressions);
    // Signature keeps this to one record per meaningful health change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preflightReady, healthSignature]);

  const copyFields = copy
    ? Object.fromEntries(
        EDITABLE_COPY_FIELDS.map((f) => [
          f.key,
          String((copy as Record<string, unknown>)[f.key] ?? ""),
        ]),
      )
    : {};

  const openSetup = () => {
    setSetupOpen(true);
    setJump({ step: "business", nonce: Date.now() });
  };

  const publishState = settings?.publish_state ?? "draft";

  /** Only what this website actually needs, in the owner's words. */
  const mediaCount = facts.data?.mediaCount ?? 0;
  const brandSet = Boolean(profile?.["primary_color"]) && Boolean(profile?.["logo_url"]);
  const failingChecks = preflightResult.checks.filter((check) => check.status === "fail");
  const needKeys = builderNeedKeys({
    canManage: manage,
    requiredAnswers: requiredCount,
    pagesCount: (pages ?? []).length,
    mediaCount,
    brandSet,
    publishState,
    domainVerified,
    captureCount,
    failingChecks: failingChecks.length,
  });
  const needCopy: Record<BuilderNeedKey, BuilderNeed> = {
    answers: {
      key: "answers",
      title: `${requiredCount} thing${requiredCount === 1 ? "" : "s"} needed before you go live`,
      body: "Answer them once — Revora reuses them across your pages, buttons, forms and search settings.",
      actionLabel: "Answer them",
      onAction: openSetup,
      blocking: true,
    },
    photos: {
      key: "photos",
      title: "Add your photos",
      body: "Your own pictures of your work make the biggest difference to how your site feels.",
      actionLabel: "Add photos",
      onAction: () => setAdvanced("photos"),
    },
    look: {
      key: "look",
      title: "Choose your look",
      body: "Set your logo and colour so every page matches your business.",
      actionLabel: "Choose your look",
      onAction: () => setAdvanced("look"),
    },
    domain: {
      key: "domain",
      title: "Connect your own web address",
      body: "Your site is live on the Revora address. Connecting your own address looks more professional.",
      actionLabel: "Connect it",
      onAction: () => setAdvanced("launch"),
    },
    enquiries: {
      key: "enquiries",
      title: "Enquiries have nowhere to go",
      body: "Add an enquiry form or a booking option so customers can actually reach you.",
      actionLabel: "Set up enquiries",
      onAction: () => setAdvanced("enquiries"),
    },
    broken: {
      key: "broken",
      title:
        failingChecks.length === 1
          ? "1 thing looks wrong"
          : `${failingChecks.length} things look wrong`,
      body: failingChecks
        .slice(0, 2)
        .map((check) => check.label)
        .join(" · "),
      actionLabel: "Let Revora fix it",
      onAction: () => setAdvanced("launch"),
    },
  };
  const needs: BuilderNeed[] = needKeys.map((key) => needCopy[key]);

  if (profileQuery.isLoading || settingsQuery.isLoading) return <LoadingRows rows={5} />;

  const geniusFacts = {
    businessName: org?.name ?? null,
    industry: (org?.industry as string | undefined) ?? null,
    city: (profile?.["city"] as string) ?? null,
    state: (profile?.["state"] as string) ?? null,
    serviceArea: (profile?.["service_area"] as string) ?? null,
    phone: (profile?.["phone"] as string) ?? null,
    email: (profile?.["email"] as string) ?? null,
    guarantee: (profile?.["guarantee"] as string) ?? null,
    services: (services ?? []).map((s) => ({ name: s.name, price: s.starting_price ?? null })),
    reviewCount: facts.data?.reviewCount ?? 0,
    mediaCount,
    headline: seo.headline ?? copy?.heroHeadline ?? null,
    metaDescription: seo.meta_description ?? null,
    backdrop: readBackdrop(generation ?? null),
  };

  /** Small pointer used inside the guided setup so real panels live in one place. */
  const pointer = (label: string, why: string, key: string) => (
    <section className="panel p-4">
      <p className="text-[13px] font-medium">{label}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{why}</p>
      <Button className="mt-3" size="sm" variant="signal" onClick={() => goTo(key)}>
        Open {label.toLowerCase()}
      </Button>
    </section>
  );

  /** Nothing built yet: one conversation and nothing else. */
  const firstRun = (pages ?? []).length === 0;

  const workspaceModes = [
    { key: "build" as const, label: "Build", icon: Sparkles },
    { key: "chat" as const, label: "Chat", icon: MessageCircle },
    { key: "edit" as const, label: "Edit", icon: MousePointer2 },
    { key: "visual" as const, label: "Visual Edit", icon: Paintbrush },
  ];

  /** The whole workspace: the real preview first, with complexity revealed only when requested. */
  const workspace = (
    <div className="space-y-3">
      <div className="flex items-center gap-1 overflow-x-auto rounded-md border border-border bg-card/70 p-1" role="tablist" aria-label="Builder mode">
        {workspaceModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <Button
              key={mode.key}
              type="button"
              size="sm"
              variant={workspaceMode === mode.key ? "secondary" : "ghost"}
              role="tab"
              data-testid={`builder-mode-${mode.key}`}
              aria-selected={workspaceMode === mode.key}
              onClick={() => setWorkspaceMode(mode.key)}
              className="shrink-0"
            >
              <Icon className="size-4" aria-hidden />
              {mode.label}
            </Button>
          );
        })}
      </div>

      <EnvironmentBanner status={production} />
      <BuilderNeeds needs={needs} />

      {firstRun ? (
        <div className="mx-auto max-w-3xl">
          <BuilderAssistant
            organizationId={orgId ?? null}
            requests={requests}
            onOpenExtras={() => setAdvanced("assistant")}
            emptyTitle="Describe your business"
            emptyHint="Revora builds the pages, writes the words and sets up your enquiry form. You publish when it looks right."
          />
          <section className="panel p-5 text-center">
            <p className="text-[14px] font-medium">Your website will appear here</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Describe your business on the left and Revora builds your first pages. You can also
              add pages yourself.
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => setAdvanced("pages")}
            >
              Add a page myself
            </Button>
          </section>
        </div>
      ) : workspaceMode === "build" ? (
        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          {org?.slug ? (
            <BuilderPreview slug={org.slug} pages={pages ?? []} refreshing={requests.refreshing} />
          ) : null}
          <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
            <BuilderAssistant
              compact
              organizationId={orgId ?? null}
              requests={requests}
              onOpenExtras={() => setAdvanced("assistant")}
              emptyTitle="Tell Revora what to change"
              emptyHint="Ask for anything — a new page, better wording, a fresh look, more enquiries."
            />
          </div>
        </div>
      ) : workspaceMode === "chat" ? (
        <div className="mx-auto max-w-3xl">
          <BuilderAssistant
            organizationId={orgId ?? null}
            requests={requests}
            onOpenExtras={() => setAdvanced("assistant")}
            emptyTitle="Tell Revora what to change"
            emptyHint="Ask for anything — a new page, better wording, a fresh look, more enquiries."
          />
        </div>
      ) : (
        <div className="min-w-0">
          <BuilderCanvas
            organizationId={orgId}
            pages={pages ?? []}
            canManage={manage}
            refreshing={requests.refreshing}
            editingMode={workspaceMode === "visual" ? "visual" : "content"}
            onRewriteSection={(target) =>
              // One press turns the selected block into a normal request, so the
              // owner never has to describe the rest of the website again.
              requests.queue(
                `Improve the ${target.sectionLabel.toLowerCase()} section on the ${target.pageTitle} page. Keep every fact, name, price and phone number exactly as it is, and keep it consistent with the rest of the website's look.`,
              )
            }
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => setAdvanced("pages")}>
          Advanced settings
        </Button>
        <span className="text-[11.5px] text-muted-foreground">
          Pages, look, photos, enquiries, launch checks and reports.
        </span>
      </div>
    </div>
  );

  return (
    <>
      <BuilderHistoryProvider organizationId={orgId}>
        <BuilderShell
          projectName={org?.name ? `${org.name} · website` : "Your website"}
          statusLabel={
            publishState === "published"
              ? "Live"
              : publishState === "unpublished"
                ? "Unpublished"
                : "Draft"
          }
          statusTone={publishState === "published" ? "live" : "draft"}
          saveLabel={
            saveSettings.isPending || saveProfile.isPending
              ? "Saving…"
              : settings?.last_published_at && publishState === "published"
                ? "Changes saved"
                : "Changes save automatically"
          }
          sections={[{ key: "workspace", label: "Website", node: workspace }]}
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
                History
              </Button>
              {org ? (
                <PreviewSiteButton
                  organizationId={orgId}
                  slug={org.slug}
                  publishState={publishState}
                />
              ) : null}
              {manage ? (
                <Button
                  size="sm"
                  variant="signal"
                  data-testid="builder-publish"
                  disabled={launchFlow.isLaunching || firstRun}
                  onClick={launchFlow.launch}
                >
                  {launchFlow.isLaunching ? "Publishing…" : "Publish"}
                </Button>
              ) : null}
            </>
          }
        />

        <OverlayPanel
          open={historyOpen}
          title="History"
          description="Every change Revora and your team made — restore any earlier version."
          onClose={() => setHistoryOpen(false)}
        >
          <DraftBranchPanel organizationId={orgId ?? null} canManage={manage} />
          <RestorePointPanel organizationId={orgId} canManage={manage} />
          <VersionHistory organizationId={orgId} canManage={manage} />
          <VersionDiff organizationId={orgId} />
        </OverlayPanel>
      </BuilderHistoryProvider>

      {/* ------------------------ One advanced door ------------------------ */}
      <OverlayPanel
        open={advanced !== null}
        title="Advanced settings"
        description="Every detailed control, in one place. Nothing here is required."
        onClose={() => setAdvanced(null)}
      >
        <GroupTabs
          key={advanced ?? "pages"}
          label="Advanced groups"
          initialKey={advanced ?? "pages"}
          groups={[
            {
              key: "pages",
              label: "Pages",
              node: (
                <>
                  <SiteEnginePanel organizationId={orgId} canManage={manage} hasCopy={!!copy} />
                  <TemplateGalleryPanel
                    canManage={manage}
                    industry={(profile?.["industry"] as string) ?? null}
                    description={(profile?.["description"] as string) ?? null}
                    businessName={org?.name ?? null}
                  />
                  <WebsiteStructure organizationId={orgId} canManage={manage} />
                </>
              ),

            },
            {
              key: "look",
              label: "Look",
              node: (
                <>
                  <DesignIdentity
                    organizationId={orgId ?? ""}
                    facts={{
                      businessName: org?.name ?? null,
                      industry:
                        (org?.industry as string | undefined) ??
                        (profile?.["industry"] as string) ??
                        null,
                      city: (profile?.["city"] as string) ?? null,
                      serviceArea: (profile?.["service_area"] as string) ?? null,
                      services: (services ?? []).map((service) => String(service.name ?? "")),
                      certifications: (profile?.["certifications"] as string) ?? null,
                      awards: (profile?.["awards"] as string) ?? null,
                      phone: (profile?.["phone"] as string) ?? null,
                      email: (profile?.["email"] as string) ?? null,
                      hasHours: Boolean(profile?.["hours"]),
                    }}
                    onRestyle={(instruction: string) => {
                      setAdvanced(null);
                      askAssistant(instruction);
                    }}
                  />
                  <EffectStudio
                    organizationId={orgId}
                    canManage={manage}
                    backdrop={readBackdrop(generation ?? null)}
                    onBackdrop={(backdrop) =>
                      saveSettings.mutate({
                        generation: writeBackdrop(generation ?? null, backdrop),
                      })
                    }
                  />
                  <SiteUpgradePanel organizationId={orgId} canManage={manage} />
                  <ConversionOptimizer organizationId={orgId} />
                </>
              ),
            },
            {
              key: "photos",
              label: "Photos",
              node: (
                <>
                  <ImageStudio
                    organizationId={orgId}
                    canManage={manage}
                    businessName={org?.name ?? null}
                    industry={(profile?.["industry"] as string) ?? null}
                    city={(profile?.["city"] as string) ?? null}
                    primaryColor={(profile?.["primary_color"] as string) ?? null}
                    accentColor={(profile?.["accent_color"] as string) ?? null}
                    services={(services ?? []).map((service) => ({
                      name: String(service.name ?? ""),
                    }))}
                    mediaCount={mediaCount}
                    hasHeroImage={!!(profile?.["hero_image_url"] as string)}
                    onSetHero={(path) => saveProfile.mutate({ hero_image_url: path })}
                  />
                  <StockPhotoPanel
                    organizationId={orgId}
                    canManage={manage}
                    industry={(profile?.["industry"] as string) ?? null}
                  />
                </>
              ),

            },
            {
              key: "enquiries",
              label: "Enquiries",
              node: <LeadEngine organizationId={orgId} canManage={manage} />,
            },
            {
              key: "launch",
              label: "Launch",
              node: (
                <>
                  {launchReview ? (
                    <div className="space-y-2">
                      <LaunchQualityCard
                        report={launchReview.report}
                        {...(manage
                          ? {
                              onImprove: (dimension) => {
                                const plan = planQualityImprovements(launchReview.report, 5).find(
                                  (item) => item.id === `quality-${dimension}`,
                                );
                                if (plan) askAssistant(plan.instruction);
                              },
                            }
                          : {})}
                      />
                      <ul className="panel space-y-1.5 p-3">
                        {launchReview.evidence.map((item) => (
                          <li key={item.key} className="flex gap-2 text-[12px]">
                            <span
                              aria-hidden
                              className={
                                item.state === "measured" ? "text-primary" : "text-muted-foreground"
                              }
                            >
                              {item.state === "measured" ? "✓" : "–"}
                            </span>
                            <span className="text-muted-foreground">{item.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <PreFlightPanel
                    result={preflightResult}
                    isChecking={preflightFacts.isLoading}
                    canPublish={manage && production?.unlocked !== false}
                    isPublishing={launchFlow.isLaunching}
                    onPublish={() => launchFlow.launch()}
                    {...(manage ? { onSelfHeal: () => selfHeal.mutate() } : {})}
                    isHealing={selfHeal.isPending}
                    healSummary={selfHeal.data?.summary ?? null}
                    regressions={regressions}
                  />
                  <ProductionReadinessPanel
                    readiness={productionReadiness}
                    status={production}
                    onLaunch={launchFlow.launch}
                    isLaunching={launchFlow.isLaunching}
                    canManage={manage}
                    result={launchFlow.result}
                  />
                  <LaunchChecks
                    checks={qa.checks}
                    blockers={qa.blockers}
                    passed={qa.passed}
                    publishState={publishState}
                    lastPublishedAt={settings?.last_published_at ?? null}
                    slug={org?.slug}
                    canManage={manage}
                    isPublishing={launchFlow.isLaunching || saveSettings.isPending}
                    onPublish={() => launchFlow.launch()}
                    onUnpublish={() =>
                      saveSettings.mutate({ publish_state: "unpublished", published: false })
                    }
                  />
                  <Disclosure label="Next steps" hint="Setup, payment and going live">
                    <ClientOnboardingFlow
                      organizationId={orgId}
                      canManage={manage}
                      contactPhone={(profile?.["phone"] as string | null) ?? null}
                      contactEmail={(profile?.["email"] as string | null) ?? null}
                      setupPaid={!!org?.setup_paid_at}
                      publishState={publishState}
                      buildReady={requiredCount === 0 && visibleSections > 0}
                      requiredAnswers={requiredCount}
                      isPublishing={launchFlow.isLaunching || saveSettings.isPending}
                      onPublish={launchFlow.launch}
                      onGoTo={goTo}
                    />
                  </Disclosure>
                  <Disclosure
                    label="Preview links and client access"
                    hint="Share the draft, or let your client log in"
                  >
                    <PreviewLinks organizationId={orgId} canManage={manage} />
                    <PortalAccess organizationId={orgId} canManage={manage} />
                  </Disclosure>
                </>
              ),
            },
            {
              key: "assistant",
              label: "Assistant extras",
              node: (
                <>
                  <SiteChatbot
                    organizationId={orgId}
                    canManage={manage}
                    hasSections={visibleSections > 0}
                    publishState={publishState}
                    isPublishing={launchFlow.isLaunching || saveSettings.isPending}
                    onPublishNow={launchFlow.launch}
                  />
                  <Disclosure
                    label="Improve my website"
                    hint="Revora checks your site and fixes what it finds"
                  >
                    <BuilderAudit organizationId={orgId} org={org ?? null} canManage={manage} />
                  </Disclosure>
                  <Disclosure
                    label="Grow my business"
                    hint="More calls, more quote requests, more trust"
                  >
                    <UpgradeStudio
                      organizationId={orgId}
                      canManage={manage}
                      pages={pages ?? []}
                      facts={{
                        ...geniusFacts,
                        primaryColor: (profile?.["primary_color"] as string) ?? null,
                      }}
                    />
                  </Disclosure>
                  <Disclosure label="Build a full website for me" hint="Describe it, Revora writes it">
                    <RevoraGenius
                      organizationId={orgId}
                      canManage={manage}
                      pages={pages ?? []}
                      facts={geniusFacts}
                    />
                  </Disclosure>
                  <Disclosure label="Wording" hint="Edit the words Revora wrote">
                    <AiCopyAssistant
                      organizationId={orgId}
                      fields={copyFields}
                      canManage={manage}
                      onApply={(patch) =>
                        saveSettings.mutate({
                          generation: { ...(generation ?? {}), copy: { ...(copy ?? {}), ...patch } },
                        })
                      }
                    />
                  </Disclosure>
                </>
              ),
            },
            {
              key: "reports",
              label: "Reports",
              node: (
                <>
                  <VisualCheckPanel
                    organizationId={orgId}
                    slug={org?.slug}
                    publishState={publishState}
                    canManage={manage}
                  />
                  <VisionReviewPanel
                    organizationId={orgId}
                    slug={org?.slug}
                    publishState={publishState}
                    canManage={manage}
                  />
                  <InteractionHealth pages={pages ?? []} onFix={() => setAdvanced(null)} />
                  <MemoryPanel organizationId={orgId ?? null} canManage={manage} />
                  <RevoraScorePanel
                    score={siteScore.score}
                    factors={siteScore.factors}
                    recommendations={recommendations}
                  />
                  <Disclosure
                    label="More reports and checks"
                    hint="Review, brief, build report and platform checks"
                  >
                    <WebsiteReview
                      organizationId={orgId}
                      slug={org?.slug}
                      settings={settings}
                      canManage={manage}
                    />
                    <BusinessBriefPanel brief={brief} />
                    <BuildReportPanel report={buildReport} />
                    <WebsiteProject
                      organizationId={orgId}
                      businessName={org?.name ?? null}
                      industry={
                        (org?.industry as string | undefined) ??
                        (profile?.["industry"] as string) ??
                        null
                      }
                      slug={org?.slug ?? null}
                      city={(profile?.["city"] as string) ?? null}
                      publishState={publishState}
                      lastPublishedAt={settings?.last_published_at ?? null}
                      customDomain={settings?.custom_domain ?? null}
                      domainStatus={settings?.domain_status ?? null}
                      pagesCount={(pages ?? []).length}
                      visibleSections={visibleSections}
                      score={siteScore.score}
                      onEdit={() => setAdvanced(null)}
                      onLaunchChecks={() => setAdvanced("launch")}
                    />
                    <EngineSelfTestPanel organizationId={orgId} />
                    <PlatformEngine
                      businessName={org?.name ?? null}
                      slug={org?.slug ?? null}
                      profile={profile}
                      services={(services ?? []).map((s) => ({
                        name: s.name,
                        description: s.description,
                        price: s.starting_price,
                        bookable: s.bookable,
                      }))}
                      seo={{
                        title: seo.headline ?? null,
                        description: seo.meta_description ?? null,
                        headline: seo.headline ?? copy?.heroHeadline ?? null,
                      }}
                      pages={pages ?? []}
                      publishState={publishState}
                      canManage={manage}
                      isPublishing={launchFlow.isLaunching || saveSettings.isPending}
                      onPublish={() => launchFlow.launch()}
                    />
                  </Disclosure>
                </>
              ),
            },
          ]}
        />
      </OverlayPanel>

      <OverlayPanel
        open={setupOpen}
        title="Setup"
        description="Answer these once. Revora reuses them across your whole website."
        onClose={() => setSetupOpen(false)}
      >
        <MissingFactsPanel organizationId={orgId} gaps={readiness?.gaps ?? []} canManage={manage} />
        <BriefReviewPanel organizationId={orgId} brief={brief} canManage={manage} />
        <BuilderWizard
          organizationId={orgId}
          org={org}
          profile={profile}
          servicesCount={servicesCount}
          pricedCount={pricedCount}
          canManage={manage}
          jumpTo={jump}
          structureSlot={pointer(
            "Pages & content",
            "Your pages, sections and wording live in Advanced settings.",
            "pages",
          )}
          launchSlot={pointer(
            "Launch",
            "Readiness checks, previews and going live are handled in Launch.",
            "launch",
          )}
        />
      </OverlayPanel>

      <ProductionLaunchModal
        open={launchFlow.lockedOpen}
        onClose={launchFlow.closeLocked}
        reason={launchFlow.result?.reason ?? null}
      />

      {/* A publish that broke on a glitch stays recoverable, not a dead end. */}
      <PublishRetryBar
        message={launchFlow.retryable}
        isRetrying={launchFlow.isLaunching}
        onRetry={launchFlow.retry}
        onDismiss={launchFlow.dismissRetry}
      />
    </>
  );
}
