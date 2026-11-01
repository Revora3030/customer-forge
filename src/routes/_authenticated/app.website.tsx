import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminModelPicker } from "@/components/app/AdminModelPicker";
import { createFileRoute } from "@tanstack/react-router";
import { LoadingRows } from "@/components/app/Bits";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
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
import { SearchSettings } from "@/components/app/SearchSettings";
import { GoogleSearchGrowth } from "@/components/app/GoogleSearchGrowth";

import { BuilderWizard } from "@/components/app/BuilderWizard";
import { BuilderShell } from "@/components/app/BuilderShell";
import { MissingMenuBanner } from "@/components/app/MissingMenuBanner";
import { readSiteChrome } from "@/lib/builder/site-chrome";
import { blocksAutoBuild, jobIsActive, stopWaiting, stopWaitingMessage } from "@/lib/builder/job-liveness";
import { Disclosure, OverlayPanel } from "@/components/app/BuilderTools";
import { BuilderHistoryProvider } from "@/lib/builder-history.hooks";
import { GroupTabs } from "@/components/app/BuilderGroups";
import { orderGroups } from "@/components/app/builder-groups-utils";
import { BuilderAssistant } from "@/components/app/BuilderAssistant";
import { useBuilderRequests } from "@/lib/builder-requests.hooks";
import { actionPrompt, selectionPrefix, type PageContext } from "@/lib/builder/preview-bridge";
import { starterIdeasFor } from "@/lib/builder/industry-playbook";
import { isBareRebuildCommand } from "@/lib/builder/rebuild-intent";
import { sectionOfTarget } from "@/lib/builder/step-target";
import { liveStatusLine } from "@/lib/builder/live-status";
import { useBuildProgress } from "@/lib/builder/progress.hooks";
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
import { FactSourcesList } from "@/components/app/FactSourcesList";
import { buildFactSources } from "@/lib/builder/fact-sources";
import { useLaunchReview } from "@/lib/launch-review.hooks";
import { planQualityImprovements } from "@/lib/builder/quality-improvement-plan";
import { PublishRetryBar } from "@/components/app/PublishRetryBar";


import { ImageStudio } from "@/components/app/ImageStudio";
import { readBackdrop } from "@/lib/site-effects";
import { BuilderAudit } from "@/components/app/BuilderAudit";
import { BuilderPreview, type PreviewSelection } from "@/components/app/BuilderPreview";
import { Eye, History, MessageSquare, MoreHorizontal, Redo2, Settings2, Undo2 } from "lucide-react";
import { useBuilderHistory } from "@/lib/builder-history.hooks";
import { newTask } from "@/lib/builder-queue";
import { appliedThisSession } from "@/lib/builder/hydrate-tasks";
import { friendlyError } from "@/lib/user-error";
import type { BuilderAccessUiState } from "@/lib/builder-access-status";
import { PreFlightPanel } from "@/components/app/PreFlight";
import { preflight } from "@/lib/preflight";
import { usePreflightFacts } from "@/lib/preflight.hooks";
import { useSelfHeal } from "@/lib/self-heal.hooks";
import { ClientOnboardingFlow } from "@/components/app/ClientOnboardingFlow";

import { LaunchChecks } from "@/components/app/LaunchChecks";
import { VisualCheckPanel } from "@/components/app/VisualCheckPanel";
import { VisionReviewPanel } from "@/components/app/VisionReviewPanel";
import { ImageApprovalPanel } from "@/components/app/ImageApprovalPanel";
import { PublishVersionPanel } from "@/components/app/PublishVersionPanel";
import { LiveSyncPanel } from "@/components/app/LiveSyncPanel";
import { PortalAccess } from "@/components/app/PortalAccess";
import { PreviewLinks, PreviewSiteButton } from "@/components/app/PreviewLinks";
import { VersionDiff } from "@/components/app/VersionDiff";
import { DraftBranchPanel } from "@/components/app/DraftBranchPanel";
import { RestorePointPanel } from "@/components/app/RestorePointPanel";
import { ModelResponseLog } from "@/components/app/ModelResponseLog";

import { PlatformEngine } from "@/components/app/PlatformEngine";
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
import { AiTeamImages, AiTeamPages } from "@/components/app/AiTeamTabs";
import { HeroVideoPanel } from "@/components/app/HeroVideoPanel";
import {
  EDITABLE_COPY_FIELDS,
  growthRecommendations,
  readCopy,
  revoraScore,
} from "@/lib/site-engine";
import { useBuildReadiness, useSaveMissingFacts, useScoreFacts } from "@/lib/site-engine.hooks";
import { useCancelSiteEngine } from "@/lib/site-engine-cancel.hooks";
import {
  useEnsureFirstBuild,
  useGenerateSectionsFromText,
  useLatestGenerationJob,
} from "@/lib/site-engine.hooks";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { websiteQa, type WizardStepKey } from "@/lib/website-content";

/**
 * The settings groups, in the order an owner works in:
 * build → design → content → images → search → pages → checks → publish.
 * Enquiries stays available at the end; no capability was removed.
 */
const GROUP_ORDER = [
  "build",
  "design",
  "content",
  "images",
  "seo",
  "pages",
  "qa",
  "publish",
  "enquiries",
];

/** Old deep links and older group names land on the matching new door. */
const GROUP_ALIAS: Record<string, string> = {
  design: "design",
  look: "design",
  pages: "pages",
  launch: "publish",
  publish: "publish",
  ai: "content",
  assistant: "content",
  words: "content",
  photos: "images",
  images: "images",
  reports: "qa",
  qa: "qa",
  build: "build",
  seo: "seo",
  enquiries: "enquiries",
};

const resolveGroup = (key: string | null | undefined) =>
  (key ? GROUP_ALIAS[key] : undefined) ?? "build";

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
      { property: "og:title", content: "Website builder — Revora" },
      {
        property: "og:description",
        content: "Build, review and publish your business website with Revora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const pagesQuery = useWebsiteContent(orgId);
  const pages = pagesQuery.data;

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
  const screenshotReference =
    generation?.["screenshotReference"] && typeof generation["screenshotReference"] === "object"
      ? (generation["screenshotReference"] as {
          applied?: boolean;
          source?: string | null;
          model?: string | null;
          warnings?: string[];
        })
      : null;
  const screenshotReferenceObservations =
    generation?.["screenshotReferenceObservations"] &&
    typeof generation["screenshotReferenceObservations"] === "object"
      ? (generation["screenshotReferenceObservations"] as Partial<Record<string, string[]>>)
      : null;
  const role = ws?.workspace?.role ?? "viewer";
  const manage = canManage(role);
  const canFreshRebuild = role === "owner" || role === "admin";
  const [jump, setJump] = useState<{ step: WizardStepKey; anchor?: string; nonce: number } | null>(
    null,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [advanced, setAdvanced] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Phones only load the preview when it's opened, so a hidden website isn't
  // running in the background of the chat (which can crash iPhone Safari).
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  /** The block the owner clicked in the preview, scoping their next message. */
  const [selected, setSelected] = useState<PreviewSelection | null>(null);
  /** The page open in the preview, so chat requests know what the owner is looking at. */
  const [viewingPage, setViewingPage] = useState<PageContext | null>(null);
  /** "Show in preview" from the chat: the section to scroll to and outline. */
  const [reveal, setReveal] = useState<{ id: string; nonce: number } | null>(null);

  /** One request engine for the whole workspace. */
  const superAdmin = useQuery({
    queryKey: ["self", "super-admin"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "super_admin").maybeSingle();
      return Boolean(data);
    },
    staleTime: 5 * 60_000,
  });
  const [pickedModel, setPickedModel] = useState<string | null>(null);
  const requests = useBuilderRequests({ organizationId: orgId ?? null, canManage: manage, pickedModel: superAdmin.data ? pickedModel : null });
  const queryClient = useQueryClient();
  // The newest real progress stage of the running request, floated on the preview.
  const activeTask = requests.tasks.find((task) => !task.tracking && (task.state === "planning" || task.state === "building"));
  const progress = useBuildProgress(orgId, Boolean(activeTask), activeTask?.id ?? null);
  const liveStatus = activeTask
    ? liveStatusLine(progress.latest?.stage ?? (activeTask.state === "building" ? "designing your change" : "planning the change"), selected?.label ?? null)
    : null;
  const firstBuild = useGenerateSectionsFromText(orgId);
  /** Stops a running build from the chat (managers and above): a build spends credits for as long as it runs. */
  const cancelBuild = useCancelSiteEngine(orgId);
  const latestJob = useLatestGenerationJob(orgId);
  useEnsureFirstBuild(orgId, {
    jobsLoaded: latestJob.isSuccess,
    // A build the owner cancelled counts too: an open builder must never
    // restart a build the owner stopped. So does one that failed in the last
    // day: it is not silently re-queued (and re-paid) each time the page opens.
    hasAnyJob: blocksAutoBuild((latestJob.data ?? null) as never),
    pageCount: pages ? (pages as unknown[]).length : undefined,
    canManage: manage,
    ready: !!readiness && readiness.requiredGaps.length === 0,
  });

  /** Verified access, for presentation only (the server re-checks every request). */
  const [accessState, setAccessState] = useState<BuilderAccessUiState>("checking");

  // A fresh rebuild deletes and re-creates every page. While it runs the
  // builder keeps showing the last real pages and stays in edit mode, instead
  // of flipping into the first-build screen whenever a refetch sees 0 pages.
  const latestRow = (latestJob.data ?? null) as {
    id?: string;
    status?: string;
    request_id?: string | null;
    error_message?: string | null;
    created_at?: string | null;
  } | null;
  const pendingBuild = (settings?.generation as { pendingBuild?: { mode?: unknown; jobId?: unknown } } | null | undefined)?.pendingBuild;
  const freshRebuildActive =
    jobIsActive(latestJob.data as never) && pendingBuild?.mode === "fresh_replace";
  // A fresh rebuild keeps the previous draft on screen until the new pages land;
  // say so on the preview, with the step the build is on, instead of looking stuck.
  const rebuildProgress = useBuildProgress(orgId, freshRebuildActive);
  const rebuildStatus = freshRebuildActive
    ? `Rebuilding — this is your previous draft${rebuildProgress.latest?.stage ? `. Now: ${rebuildProgress.latest.stage}` : ""}`.slice(0, 90)
    : null;
  const lastNonEmptyPages = useRef<NonNullable<typeof pages>>([]);
  if (pages && pages.length > 0) lastNonEmptyPages.current = pages;
  const shownPages = freshRebuildActive && !(pages ?? []).length ? lastNonEmptyPages.current : (pages ?? []);

  // A first build started from the chat is one request in the thread: the
  // build job reports its stages under that request's id (or the job id where
  // the job can't record one yet), and its end is saved under the same id.
  const [trackedBuild, setTrackedBuild] = useState<{ taskId: string; jobId: string | null } | null>(null);
  const [buildTick, setBuildTick] = useState(0);
  const { linkBuild } = requests;
  // Read through a ref: the function changes every render, and as an effect
  // dependency it would re-arm the stall timer below on every poll.
  const settleRef = useRef(requests.settleBuild);
  settleRef.current = requests.settleBuild;
  useEffect(() => {
    const settleBuild = settleRef.current;
    if (!trackedBuild?.jobId || !latestRow || latestRow.id !== trackedBuild.jobId) return undefined;
    linkBuild(trackedBuild.taskId, latestRow.request_id ?? latestRow.id);
    const status = latestRow.status;
    // A worker cut off mid-build leaves the row "processing" with a dead
    // lease, and a job no worker ever claims stays "queued" (jobLiveness never
    // calls that stalled). A build that failed an attempt goes back to "queued"
    // for its retry with its ORIGINAL created_at, so waiting time is counted
    // from when the retry was due, never from creation (that said "hasn't
    // started yet" about a build that had run for eleven minutes). Stop
    // tracking here; nothing is claimed about how it ended.
    const stop = stopWaiting(latestRow as never);
    if (stop) {
      settleBuild(trackedBuild.taskId, { ok: false, message: stopWaitingMessage(stop), retryBuild: true });
      setTrackedBuild(null);
      return undefined;
    }
    if (status !== "completed" && status !== "failed" && status !== "cancelled") {
      // An unchanged row doesn't re-run this effect, so look again shortly
      // (that is how a lease going stale is noticed).
      const timer = window.setTimeout(() => setBuildTick((tick) => tick + 1), 30_000);
      return () => window.clearTimeout(timer);
    }
    settleBuild(trackedBuild.taskId, status === "completed"
      ? { ok: true, message: "Your website draft is ready. Have a look in Preview, then tell me what to change." }
      : status === "cancelled"
        ? { ok: false, message: "The build was stopped before it finished. Nothing was published." }
        : {
            ok: false,
            retryBuild: true,
            message: friendlyError(
              new Error(latestRow.error_message ?? ""),
              "The build didn't finish. Nothing was published. Press Retry build to start it again.",
            ),
          });
    setTrackedBuild(null);
    return undefined;
  }, [trackedBuild, latestRow, linkBuild, buildTick]);

  /**
   * Starts a build as one request in the chat, from the owner's words to its
   * result, under one request id. The job records that id and the worker writes
   * its stages under it; jobs without one fall back to the job id.
   * `fresh` replaces the draft (backup first); the server re-checks the role.
   */
  const startTrackedBuild = async (text: string, fresh: boolean) => {
    const task = newTask(text);
    requests.remember([
      { role: "user", content: text },
      {
        role: "assistant",
        content: fresh
          ? "On it — replacing your draft with a fresh build. A backup is saved first and your live site isn't touched. I'll show you each step as it finishes."
          : "On it — I'm building your website now. I'll show you each step as it finishes.",
      },
    ], task.id);
    requests.trackBuild(task);
    try {
      // A bare "Fresh rebuild" has no design direction, so nothing is added to the brief.
      const started = await firstBuild.mutateAsync({
        requestId: task.id,
        ...(fresh && isBareRebuildCommand(text) ? {} : { instruction: text }),
        ...(fresh ? { fresh: true } : {}),
      });
      setTrackedBuild({ taskId: task.id, jobId: started?.jobId ?? null });
      if (!started?.jobId) requests.settleBuild(task.id, { ok: true, message: "Your build is queued. I'll keep working on it in the background." });
    } catch (error) {
      requests.settleBuild(task.id, {
        ok: false,
        retryBuild: true,
        message: friendlyError(error, "Revora couldn't start from that description. Your text is saved. Press Retry build to try again."),
      });
    }
  };

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
    setAdvanced(resolveGroup(mode));
  };
  // A finding elsewhere can deep-link straight into the area that fixes it.
  useEffect(() => {
    if (!sectionParam) return;
    const mode = normalizeBuilderMode(sectionParam);
    setAdvanced(mode === "build" ? null : resolveGroup(mode));
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
  /** Revora asks for what it still needs in the chat, one question at a time. */
  const saveFacts = useSaveMissingFacts(orgId);
  const [skippedFacts, setSkippedFacts] = useState<string[]>([]);
  const askable = (readiness?.gaps ?? []).filter((g) => g.field && !skippedFacts.includes(g.key));
  const factQuestion = askable.find((g) => g.required) ?? askable[0] ?? null;

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
  const failingChecks = preflightResult.checks.filter((check) => check.status === "fail");

  if (profileQuery.isLoading || settingsQuery.isLoading || pagesQuery.isLoading) return <LoadingRows rows={5} />;
  if (profileQuery.isError || settingsQuery.isError || pagesQuery.isError) return (
    <QueryErrorNotice title="Your website couldn't be loaded. Your saved work hasn't been removed." retrying={profileQuery.isFetching || settingsQuery.isFetching || pagesQuery.isFetching} retry={() => Promise.all([profileQuery.refetch(), settingsQuery.refetch(), pagesQuery.refetch()])} />
  );

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

  /**
   * Nothing built yet: one conversation and nothing else. A fresh rebuild in
   * progress is never a first run, even while its pages are being re-created.
   */
  const firstRun = !freshRebuildActive && (pages ?? []).length === 0;

  /**
   * Chat is the workspace. Preview stays beside it on desktop and one tap away
   * on mobile — including during the first build, where it shows the live
   * canvas skeleton until the first pages are written.
   */
  const storedChrome = readSiteChrome(generation);
  const buildActive = jobIsActive(latestJob.data as never);
  const missingMenu = !firstRun && !buildActive && (!storedChrome.header || !storedChrome.footer);
  const workspace = (
    <div className="min-w-0">
      {missingMenu && orgId ? <MissingMenuBanner organizationId={orgId} canManage={manage} hasHeader={Boolean(storedChrome.header)} hasFooter={Boolean(storedChrome.footer)} /> : null}
      {org?.slug ? (
        <div className="mb-2 lg:hidden">
          <div className="grid h-10 grid-cols-2 rounded-full bg-muted/40 p-1 text-sm" role="tablist" aria-label="Builder view">
            {([
              [false, "Chat", MessageSquare],
              [true, "Preview", Eye],
            ] as const).map(([isPreview, label, Icon]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={previewOpen === isPreview}
                onClick={() => setPreviewOpen(isPreview)}
                className={
                  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none " +
                  (previewOpen === isPreview ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
                }
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
        <div className={previewOpen ? "hidden lg:block" : "min-w-0 lg:sticky lg:top-20 lg:self-start"}>
          {superAdmin.data ? <AdminModelPicker value={pickedModel} onChange={setPickedModel} /> : null}
          <BuilderAssistant
            compact
            banner={
              <VisualCheckPanel
              compact
              organizationId={orgId}
              slug={org?.slug}
              publishState={publishState}
              canManage={manage}
              changeKey={(() => {
                // Only changes applied live here; restored history never
                // re-runs the screen check, its repair or an auto-revert.
                const done = appliedThisSession(requests.tasks);
                const last = done[done.length - 1];
                return last ? `${last.id}:${done.length}` : null;
              })()}
              revertVersion={(() => {
                const done = appliedThisSession(requests.tasks);
                return done[done.length - 1]?.snapshotVersion ?? null;
              })()}
              queueBusy={requests.busy}
              holdQueue={requests.holdQueue}
            />
            }
            selection={selected}
            pageContext={viewingPage}
            onReveal={(target) => {
              const id = sectionOfTarget(target, shownPages as never);
              if (!id) return;
              setReveal({ id, nonce: Date.now() });
              // On a phone the preview is its own tab.
              setPreviewOpen(true);
            }}
            {...(!firstRun && manage ? {
              onFreshRebuild: (instruction: string) => startTrackedBuild(instruction, true),
              canFreshRebuild,
              rebuildBusy: freshRebuildActive || jobIsActive(latestJob.data as never) || firstBuild.isPending,
            } : {})}
            {...(manage ? { onStopBuild: (jobId: string) => cancelBuild.mutate(jobId) } : {})}
            {...(manage ? { onRetryBuild: (instruction: string) => { void startTrackedBuild(instruction, false); } } : {})}
            stoppingBuild={cancelBuild.isPending}
            starterIdeas={starterIdeasFor((org?.industry as string | undefined) ?? null)}
            onClearSelection={() => setSelected(null)}
            onOpenHistory={() => setHistoryOpen(true)}
            onShowPreview={() => setPreviewOpen(true)}
            accessBlocked={accessState === "blocked"}
            publishState={publishState}
            organizationId={orgId ?? null}
            requests={requests}
            factQuestion={manage && factQuestion ? {
              key: factQuestion.key,
              label: factQuestion.label,
              prompt: factQuestion.prompt,
              required: factQuestion.required,
            } : null}
            onFactAnswer={async (key, answer) => {
              await saveFacts.mutateAsync({ [key]: answer });
              const label = factQuestion?.label ?? key;
              // Keep the question and answer in the saved conversation so the
              // chat is still there when the owner comes back, as one request.
              requests.remember([
                { role: "user", content: `${label}: ${answer}` },
                { role: "assistant", content: firstRun ? "Got it — saved. I'll keep going." : `Saved. I'll update your website with your ${label.toLowerCase()}.` },
              ], newTask(label).id);
              // Existing site: hand the new fact straight to the AI team.
              if (!firstRun) {
                requests.queue(`Update my website everywhere it's relevant with my ${label.toLowerCase()}: ${answer}`);
              }
            }}
            onFactSkip={(key) => setSkippedFacts((s) => [...s, key])}
            {...(firstRun ? {
              onFirstBuild: async (_instruction: string) => {
                const text = _instruction.trim();
                // Missing required facts are asked in the chat first; the
                // build starts on its own once they're saved.
                if (requiredCount > 0) {
                  if (text) requests.queue(text);
                  return;
                }
                const jobStatus = (latestJob.data as { status?: string } | null | undefined)?.status;
                const buildingAlready =
                  jobStatus === "queued" || jobStatus === "processing" || firstBuild.isPending;
                // A build is already under way: every message is a normal
                // conversation with Revora, so questions and greetings always
                // get a real answer instead of silence.
                if (buildingAlready) {
                  if (text) requests.queue(text);
                  return;
                }
                // Nothing typed (attachments only): never put words in the
                // owner's mouth; start the build as before.
                if (!text) {
                  await firstBuild.mutateAsync(undefined).catch(() => undefined);
                  return;
                }
                await startTrackedBuild(text, false);
              },
              firstBuildBusy: firstBuild.isPending,
            } : {})}

            businessName={org?.name ?? null}
            emptyTitle={firstRun ? "Describe your business" : "What would you like to change?"}
            emptyHint={firstRun ? "Tell me what you do, who you help and where you work. I’ll ask for anything I need, then design every page — no made-up details." : "Ask for any change in plain words — a new section, different photos, a fresh look. I keep the context of everything we’ve done."}
          />
        </div>
        {org?.slug && (previewOpen || isWide) ? (
          <div className={!previewOpen ? "hidden min-w-0 lg:block" : "min-w-0"}>
            <BuilderPreview
              slug={org.slug}
              businessName={org.name ?? null}
              livePublished={publishState === "published"}
              pages={shownPages}
              firstRun={firstRun}
              organizationId={orgId ?? null}
              refreshing={requests.refreshing}
              refreshRevision={requests.refreshRevision}
              selectedId={selected?.id ?? null}
              selectedPath={selected?.path ?? null}
              onPageChange={setViewingPage}
              reveal={reveal}
              liveStatus={liveStatus ?? rebuildStatus}
              onInlineSaved={() => {
                // The frame already shows the new words; refresh caches so
                // the canvas, history and chat context read the saved text.
                void queryClient.invalidateQueries({ queryKey: ["website_content", orgId] });
              }}
              onSelect={(pick) => {
                // A hover-menu action runs at once as a scoped request.
                if (pick.action && manage) {
                  requests.queue(`${selectionPrefix(pick)} ${actionPrompt(pick.action, pick)}`);
                  setSelected(pick);
                  return;
                }
                setSelected(pick);
                setPreviewOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <BuilderHistoryProvider organizationId={orgId}>
        <BuilderShell
          projectName={org?.name ?? "Your website"}
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
                ? "Saved to draft — Publish to update the live site"
                : "Changes save automatically"
          }
          sections={[{ key: "workspace", label: "Website", node: workspace }]}
          onAccessStateChange={setAccessState}
          actions={
            <>
              <Button size="icon-sm" variant="ghost" onClick={() => setMenuOpen(true)} aria-label="Website tools" title="Website tools">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
              {org ? (
                <PreviewSiteButton
                  organizationId={orgId}
                  slug={org.slug}
                  publishState={publishState}
                  compact
                />
              ) : null}
              {manage ? (
                <Button
                  size="sm"
                  variant="signal"
                  data-testid="builder-publish"
                  disabled={launchFlow.isLaunching || firstRun || freshRebuildActive}
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
          description="Every change Revora and your team made — and which model made it. Restore any earlier version."
          onClose={() => setHistoryOpen(false)}
        >
          <ModelResponseLog organizationId={orgId ?? undefined} />
          <DraftBranchPanel organizationId={orgId ?? null} canManage={manage} />
          <RestorePointPanel organizationId={orgId} canManage={manage} />
          <VersionHistory organizationId={orgId} canManage={manage} />
          <VersionDiff organizationId={orgId} />
          <PublishVersionPanel organizationId={orgId} canManage={manage} />
        </OverlayPanel>

        {/* Inside the history provider: on phones it also carries Undo/Redo. */}
        <OverlayPanel open={menuOpen} title="Website tools" onClose={() => setMenuOpen(false)}>
        <div className="grid gap-2">
          <MenuUndoRedo />
          <Button variant="outline" className="justify-start" onClick={() => { setMenuOpen(false); setSetupOpen(true); }}>
            <Settings2 className="size-4" /> Business details
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => { setMenuOpen(false); setHistoryOpen(true); }}>
            <History className="size-4" /> History and restore
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => { setMenuOpen(false); setAdvanced("build"); }}>
            <Settings2 className="size-4" /> All settings
          </Button>
        </div>
        </OverlayPanel>
      </BuilderHistoryProvider>

      {/* ------------------------ One advanced door ------------------------ */}
      <OverlayPanel
        open={advanced !== null}
        title="All settings"
        description="Grouped in the order you work in. Nothing here is required to publish."
        onClose={() => setAdvanced(null)}
      >
        <GroupTabs
          label="Settings groups"
          initialKey={resolveGroup(advanced)}
          groups={orderGroups([
            {
              key: "design",
              label: "Design",
              node: (
                <div className="panel space-y-3 p-4">
                  <p className="text-sm text-muted-foreground">
                    Your AI team designs every part of your website. Tell it what you want in the chat —
                    for example "make the top of my site feel more premium" — and it will design, check
                    and apply the change.
                  </p>
                  <Button
                    variant="signal"
                    disabled={!manage}
                    onClick={() => {
                      setAdvanced(null);
                      askAssistant("Review my website's design and make it look more premium. Keep every fact exactly as it is.");
                    }}
                  >
                    Ask my AI team to improve the design
                  </Button>
                  <HeroVideoPanel organizationId={orgId} disabled={!manage} />
                </div>
              ),
            },
            {
              key: "images",
              label: "Images",
              node: (
                <div className="space-y-3">
                  <HeroVideoPanel organizationId={orgId} disabled={!manage} />
                  <AiTeamImages canManage={manage} onSent={() => setAdvanced(null)} />
                </div>
              ),
            },
            {
              key: "enquiries",
              label: "Enquiries",
              node: (
                <>
                  <LeadEngine organizationId={orgId} canManage={manage} />
                  <ConversionOptimizer organizationId={orgId} />
                </>
              ),
            },
            {
              key: "build",
              label: "Build",
              node: (
                <>
                  <SiteEnginePanel
                    organizationId={orgId}
                    canManage={manage}
                    canFreshRebuild={canFreshRebuild}
                    hasCopy={!!copy}
                  />
                </>
              ),
            },
            {
              key: "seo",
              label: "Search",
              node: (
                <>
                  <SearchSettings
                    seo={seo}
                    businessName={org?.name ?? null}
                    previewUrl={
                      settings?.custom_domain
                        ? `https://${settings.custom_domain}/`
                        : org?.slug
                          ? `/s/${org.slug}`
                          : null
                    }
                    canManage={manage}
                    isSaving={saveSettings.isPending}
                    onSave={(next) => saveSettings.mutate({ seo: next })}
                  />
                  <Disclosure
                    label="Real Google results"
                    hint="Only for a website you have already verified in Google"
                  >
                    <GoogleSearchGrowth />
                  </Disclosure>
                </>
              ),
            },
            {
              key: "pages",
              label: "Pages",
              node: (
                <>
                  <AiTeamPages
                    organizationId={orgId}
                    pages={(pages ?? []) as { slug?: string | null; title?: string | null }[]}
                    canManage={manage}
                    onSent={() => setAdvanced(null)}
                  />
                  <InteractionHealth pages={pages ?? []} onFix={() => setAdvanced(null)} />
                </>
              ),
            },
            {
              key: "publish",
              label: "Publish",
              node: (
                <>
                  {launchReview ? (
                    <div className="space-y-2">
                      <FactSourcesList
                        rows={buildFactSources({
                          businessName: org?.name ?? null,
                          services: (services ?? []).map((s) => s.name),
                          city: (profile?.["city"] as string | null) ?? null,
                          serviceArea: (profile?.["service_area"] as string | null) ?? null,
                          email: (profile?.["email"] as string | null) ?? null,
                          phone: (profile?.["phone"] as string | null) ?? null,
                        })}
                      />
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
              key: "content",
              label: "Content",
              node: (
                <>
                  <Disclosure
                    label="Improve my website"
                    hint="Revora checks your site and fixes what it finds"
                  >
                    <BuilderAudit organizationId={orgId} org={org ?? null} canManage={manage} />
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
              key: "qa",
              label: "Checks",
              node: (
                <>
                  <VisualCheckPanel
                    organizationId={orgId}
                    slug={org?.slug}
                    publishState={publishState}
                    canManage={manage}
                    queueBusy={requests.busy}
                    holdQueue={requests.holdQueue}
                  />
                  <VisionReviewPanel
                    organizationId={orgId}
                    slug={org?.slug}
                    publishState={publishState}
                    canManage={manage}
                  />
                  <ImageApprovalPanel organizationId={orgId} canManage={manage} />
                  <LiveSyncPanel organizationId={orgId} canManage={manage} />
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
          ], GROUP_ORDER)}
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
          screenshotReference={screenshotReference}
          screenshotReferenceObservations={screenshotReferenceObservations}
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

/**
 * Phones: the topbar has no room for Undo/Redo, so the Website tools menu
 * offers the same draft edit history (useBuilderHistory). Hidden from `sm` up,
 * where the topbar shows them.
 */
function MenuUndoRedo() {
  const history = useBuilderHistory();
  return (
    <div className="grid grid-cols-2 gap-2 sm:hidden" role="group" aria-label="Draft edit history">
      <Button variant="outline" className="justify-start" disabled={!history.canUndo} onClick={history.undo}
        aria-label={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}>
        <Undo2 className="size-4" aria-hidden /> Undo
      </Button>
      <Button variant="outline" className="justify-start" disabled={!history.canRedo} onClick={history.redo}
        aria-label={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}>
        <Redo2 className="size-4" aria-hidden /> Redo
      </Button>
    </div>
  );
}
