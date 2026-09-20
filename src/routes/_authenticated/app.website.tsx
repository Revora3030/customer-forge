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
import { BuilderWizard } from "@/components/app/BuilderWizard";
import { BuilderShell, type BuilderSection } from "@/components/app/BuilderShell";
import { Disclosure, OverlayPanel } from "@/components/app/BuilderTools";
import { BuilderHistoryProvider } from "@/lib/builder-history.hooks";
import { EmptyHint, GroupTabs } from "@/components/app/BuilderGroups";
import { AiRequestPanel } from "@/components/app/AiRequestPanel";
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
import { PublishRetryBar } from "@/components/app/PublishRetryBar";

import { AssistantShowcase } from "@/components/app/AssistantShowcase";
import { EffectStudio } from "@/components/app/EffectStudio";
import { ImageStudio } from "@/components/app/ImageStudio";
import { readBackdrop, writeBackdrop } from "@/lib/site-effects";
import { SiteChatbot } from "@/components/app/SiteChatbot";
import { UpgradeStudio } from "@/components/app/UpgradeStudio";
import { RevoraGenius } from "@/components/app/RevoraGenius";
import { BuilderAudit } from "@/components/app/BuilderAudit";
import { BuilderCanvas } from "@/components/app/BuilderCanvas";
import { PreFlightPanel, ServiceStatusPanel } from "@/components/app/PreFlight";
import { claimStates } from "@/lib/claim-registry";
import { preflight } from "@/lib/preflight";
import { usePreflightFacts } from "@/lib/preflight.hooks";
import { useSelfHeal } from "@/lib/self-heal.hooks";
import { ClientOnboardingFlow } from "@/components/app/ClientOnboardingFlow";

import { LaunchChecks } from "@/components/app/LaunchChecks";
import { VisualCheckPanel } from "@/components/app/VisualCheckPanel";
import { PortalAccess } from "@/components/app/PortalAccess";
import { PreviewLinks, PreviewSiteButton } from "@/components/app/PreviewLinks";
import { VersionDiff } from "@/components/app/VersionDiff";
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
  const [section, setSection] = useState(normalizeBuilderMode(sectionParam));
  /** Older deep links (and panels that ask to jump) resolve to the four areas. */
  const goTo = (key: string) => {
    if (key === "answers" || key === "setup") {
      setSetupOpen(true);
      return;
    }
    if (key === "versions" || key === "history") {
      setHistoryOpen(true);
      return;
    }
    setSection(normalizeBuilderMode(key));
  };
  // A finding elsewhere can deep-link straight into the area that fixes it.
  useEffect(() => {
    if (sectionParam) setSection(normalizeBuilderMode(sectionParam));
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
    mediaCount: facts.data?.mediaCount ?? 0,
    headline: seo.headline ?? copy?.heroHeadline ?? null,
    metaDescription: seo.meta_description ?? null,
    backdrop: readBackdrop(generation ?? null),
  };

  /** Small pointer used inside the guided setup's structure/launch steps so the
   * real panels live in one place (the workspace sections) instead of twice. */
  const pointer = (label: string, why: string, key: string) => (
    <section className="panel p-4">
      <p className="text-[13px] font-medium">{label}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{why}</p>
      <Button className="mt-3" size="sm" variant="signal" onClick={() => goTo(key)}>
        Open {label.toLowerCase()}
      </Button>
    </section>
  );

  const openSetup = () => {
    setSetupOpen(true);
    setJump({ step: "business", nonce: Date.now() });
  };

  /** Nothing built yet: one request box and one publish button, nothing else. */
  const firstRun = (pages ?? []).length === 0;

  const sections: BuilderSection[] = [
    {
      key: "build",
      label: "Build",
      hint: firstRun ? "Ask for your website" : "Ask, preview, edit anything",
      node: firstRun ? (
        <div className="space-y-5">
          <EnvironmentBanner status={production} />
          <section className="panel p-4">
            <p className="text-[15px] font-medium">Describe your business.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Revora builds the pages, writes the words and sets up your enquiry form. You publish
              when it looks right.
            </p>
          </section>
          <AiRequestPanel
            organizationId={orgId ?? null}
            canManage={manage}
            onOpenAi={() => goTo("ai")}
          />
          <section className="panel p-4">
            <p className="text-[13px] font-medium">Then publish it</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Available as soon as your first page exists.
            </p>
            <Button className="mt-3" size="sm" variant="signal" disabled>
              Publish
            </Button>
          </section>
          <Disclosure label="Do it yourself instead" hint="Add pages and sections by hand">
            <EmptyHint
              title="Build it page by page."
              hint="Add your first page, then drop in sections yourself."
              actionLabel="Open pages"
              onAction={() => goTo("pages")}
            />
          </Disclosure>
        </div>
      ) : (
        <div className="space-y-5">
          <EnvironmentBanner status={production} />
          <AiRequestPanel
            organizationId={orgId ?? null}
            canManage={manage}
            onOpenAi={() => goTo("ai")}
          />
          {requiredCount > 0 && manage ? (
            <section className="panel border-accent/40 bg-accent/5 p-4">
              <p className="text-[13px] font-medium">
                {requiredCount} thing{requiredCount === 1 ? "" : "s"} needed
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Answer them once — Revora reuses them across your pages, buttons, forms and search
                settings.
              </p>
              <Button className="mt-3" variant="signal" size="sm" onClick={openSetup}>
                Complete setup
              </Button>
            </section>
          ) : null}
          <BuilderCanvas organizationId={orgId} pages={pages ?? []} canManage={manage} />

          <Disclosure label="Next steps" hint="Setup, payment and going live">
            <ClientOnboardingFlow
              organizationId={orgId}
              canManage={manage}
              contactPhone={(profile?.["phone"] as string | null) ?? null}
              contactEmail={(profile?.["email"] as string | null) ?? null}
              setupPaid={!!org?.setup_paid_at}
              publishState={settings?.publish_state ?? "draft"}
              buildReady={requiredCount === 0 && visibleSections > 0}
              requiredAnswers={requiredCount}
              isPublishing={launchFlow.isLaunching || saveSettings.isPending}
              onPublish={launchFlow.launch}
              onGoTo={goTo}
            />
          </Disclosure>
          <Disclosure label="Advanced" hint="Wording, project details and your Revora score">
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
            <BusinessBriefPanel brief={brief} />
            <WebsiteProject
              organizationId={orgId}
              businessName={org?.name ?? null}
              industry={
                (org?.industry as string | undefined) ?? (profile?.["industry"] as string) ?? null
              }
              slug={org?.slug ?? null}
              city={(profile?.["city"] as string) ?? null}
              publishState={settings?.publish_state ?? "draft"}
              lastPublishedAt={settings?.last_published_at ?? null}
              customDomain={settings?.custom_domain ?? null}
              domainStatus={settings?.domain_status ?? null}
              pagesCount={(pages ?? []).length}
              visibleSections={visibleSections}
              score={siteScore.score}
              onEdit={() => goTo("build")}
              onLaunchChecks={() => goTo("launch")}
            />
            <RevoraScorePanel
              score={siteScore.score}
              factors={siteScore.factors}
              recommendations={recommendations}
            />
          </Disclosure>
        </div>
      ),
    },
    {
      key: "design",
      label: "Design",
      hint: "Brand, layout and style",
      node: (
        <GroupTabs
          label="Design groups"
          groups={[
            {
              key: "brand",
              label: "Brand",
              node: (
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
                    goTo("ai");
                    askAssistant(instruction);
                  }}
                />
              ),
            },
            {
              key: "layout",
              label: "Layout",
              node: (
                <>
                  <section className="panel p-4">
                    <p className="text-[13px] font-medium">Layout, spacing and hierarchy</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Pick any section on the canvas to change its layout, width, spacing and
                      background — or describe the change and Revora applies it across the site.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => goTo("build")}>
                        Open canvas
                      </Button>
                      <Button
                        size="sm"
                        variant="signal"
                        disabled={!manage}
                        onClick={() => {
                          goTo("ai");
                          askAssistant(
                            "Improve the layout of my whole website: consistent content width, calmer section spacing, a clear hero, a tidy menu and footer, and a balanced grid for services and photos.",
                          );
                        }}
                      >
                        Improve my layout
                      </Button>
                    </div>
                  </section>
                  <ConversionOptimizer organizationId={orgId} />
                </>
              ),
            },
            {
              key: "visual",
              label: "Visual",
              node: (
                <EffectStudio
                  organizationId={orgId}
                  canManage={manage}
                  backdrop={readBackdrop(generation ?? null)}
                  onBackdrop={(backdrop) =>
                    saveSettings.mutate({ generation: writeBackdrop(generation ?? null, backdrop) })
                  }
                />
              ),
            },
            {
              key: "images",
              label: "Images",
              node: (
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
                  mediaCount={facts.data?.mediaCount ?? 0}
                  hasHeroImage={!!(profile?.["hero_image_url"] as string)}
                  onSetHero={(path) => saveProfile.mutate({ hero_image_url: path })}
                />
              ),
            },
            {
              key: "responsive",
              label: "Responsive",
              node: (
                <>
                  <section className="panel p-4">
                    <p className="text-[13px] font-medium">Phone, tablet and desktop</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Switch device on the canvas to see the real phone and tablet layouts, then let
                      Revora check every screen size and repair anything cut off or overlapping.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => goTo("build")}>
                        Open canvas
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => goTo("launch")}>
                        Run screen checks
                      </Button>
                      <Button
                        size="sm"
                        variant="signal"
                        disabled={!manage}
                        onClick={() => {
                          goTo("ai");
                          askAssistant(
                            "Fix how my website looks on a phone: nothing cut off or overlapping, readable text sizes, tappable buttons, a working menu and comfortable spacing between sections.",
                          );
                        }}
                      >
                        Fix mobile
                      </Button>
                    </div>
                  </section>
                  <InteractionHealth pages={pages ?? []} onFix={() => goTo("build")} />
                </>
              ),
            },
            {
              key: "advanced",
              label: "Advanced",
              node: (
                <>
                  <section className="panel p-4">
                    <p className="text-[13px] font-medium">Not sure what looks best?</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Revora can pick a cohesive look for your industry and apply it for you.
                    </p>
                    <Button className="mt-3" size="sm" variant="signal" onClick={() => goTo("ai")}>
                      Let Revora choose
                    </Button>
                  </section>
                  <Disclosure label="Every design control" hint="Backdrops, effects and imagery">
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
                  </Disclosure>
                </>
              ),
            },
          ]}
        />
      ),
    },
    {
      key: "pages",
      label: "Pages",
      hint: "Pages and sections",
      node: (
        <div className="space-y-5">
          <SiteEnginePanel organizationId={orgId} canManage={manage} hasCopy={!!copy} />
          <WebsiteStructure organizationId={orgId} canManage={manage} />
          <Disclosure label="Lead capture" hint="Forms, booking and enquiry buttons">
            <LeadEngine organizationId={orgId} canManage={manage} />
          </Disclosure>
        </div>
      ),
    },
    {
      key: "ai",
      label: "AI",
      hint: "Requests, photos, voice",
      node: (
        <div className="space-y-5">
          <SiteChatbot
            organizationId={orgId}
            canManage={manage}
            hasSections={visibleSections > 0}
            publishState={settings?.publish_state ?? "draft"}
            isPublishing={launchFlow.isLaunching || saveSettings.isPending}
            onPublishNow={launchFlow.launch}
          />
          <Disclosure
            label="Improve my website"
            hint="Revora checks your site and fixes what it finds"
          >
            <BuilderAudit organizationId={orgId} org={org ?? null} canManage={manage} />
          </Disclosure>
          <Disclosure label="Grow my business" hint="More calls, more quote requests, more trust">
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
        </div>
      ),
    },
    {
      key: "launch",
      label: "Launch",
      hint: "Checks and going live",
      node: (
        <GroupTabs
          label="Launch groups"
          groups={[
            {
              key: "health",
              label: "Health",
              node: (
                <>
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
                  <VisualCheckPanel
                    organizationId={orgId}
                    slug={org?.slug}
                    publishState={settings?.publish_state ?? "draft"}
                    canManage={manage}
                  />
                </>
              ),
            },
            {
              key: "publish",
              label: "Publish",
              node: (
                <>
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
                    publishState={settings?.publish_state ?? "draft"}
                    lastPublishedAt={settings?.last_published_at ?? null}
                    slug={org?.slug}
                    canManage={manage}
                    isPublishing={launchFlow.isLaunching || saveSettings.isPending}
                    onPublish={() => launchFlow.launch()}
                    onUnpublish={() =>
                      saveSettings.mutate({ publish_state: "unpublished", published: false })
                    }
                  />
                </>
              ),
            },
            {
              key: "previews",
              label: "Previews",
              node: (
                <>
                  <PreviewLinks organizationId={orgId} canManage={manage} />
                  <Disclosure
                    label="Client portal access"
                    hint="Let your client log in and see their own dashboard, pages and live site"
                  >
                    <PortalAccess organizationId={orgId} canManage={manage} />
                  </Disclosure>
                </>
              ),
            },
            {
              key: "reports",
              label: "Reports",
              node: (
                <>
                  <InteractionHealth pages={pages ?? []} onFix={() => goTo("build")} />
                  <Disclosure
                    label="Advanced reports & checks"
                    hint="Review, build report and platform checks"
                  >
                    <WebsiteReview
                      organizationId={orgId}
                      slug={org?.slug}
                      settings={settings}
                      canManage={manage}
                    />
                    <BuildReportPanel report={buildReport} />
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
                      publishState={settings?.publish_state ?? "draft"}
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
      ),
    },
  ];

  const publishState = settings?.publish_state ?? "draft";

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
          activeKey={section}
          onActiveKeyChange={goTo}
          sections={sections}
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
                  disabled={launchFlow.isLaunching}
                  onClick={launchFlow.launch}
                >
                  {launchFlow.isLaunching ? "Launching…" : "Launch"}
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
          <RestorePointPanel organizationId={orgId} canManage={manage} />
          <VersionHistory organizationId={orgId} canManage={manage} />
          <VersionDiff organizationId={orgId} />
        </OverlayPanel>
      </BuilderHistoryProvider>

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
            "Your pages, sections, copy and lead capture live in Build.",
            "build",
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
