import { createServerFn } from "@tanstack/react-start";
import { publishBlockReason } from "@/lib/builder/draft-branch";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { readWebsiteState } from "@/lib/site-restore.functions";

/**
 * Revora production activation.
 *
 * Two environments, one project:
 * - SANDBOX  — the full builder. Everything can be built, configured, tested,
 *   versioned and previewed here, during the free full-access window
 *   (GROWTH_SYSTEM.fullAccessTrialDays, 3 days) or after it.
 * - PRODUCTION — the live website, live domain and live customer-facing
 *   operations. Only unlocked once the $350 setup payment is verified.
 *
 * The gate is enforced in three independent places, so no browser-side change
 * can unlock production:
 * 1. Database trigger `private.guard_production_activation` on website_settings.
 * 2. These server functions (ownership + role + readiness + payment).
 * 3. The setup payment columns are writable only by verified payment webhooks
 *    and platform admins (`private.protect_org_billing_columns`).
 */

const orgIdValidator = (input: { organizationId: string }) => {
  const organizationId = String(input?.organizationId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
  return { organizationId };
};

export type SetupPaymentStatus = "unpaid" | "checkout_started" | "paid" | "failed" | "refunded";

export type ProductionStatus = {
  environment: "sandbox" | "production";
  accountStatus: "trial" | "active" | "expired" | "suspended" | "demo";
  setupPaymentStatus: SetupPaymentStatus;
  setupPaidAt: string | null;
  trialEndsAt: string | null;
  trialActive: boolean;
  /** Server clock — the countdown must never trust the device clock. */
  serverNow: string;
  unlocked: boolean;
  reason: string;
  liveSince: string | null;
  publishState: string;
};

export type ReadinessCheck = { key: string; label: string; ok: boolean; detail: string };

export type ProductionReadiness = {
  passed: boolean;
  unlocked: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
  /** The video-bar result behind the `video-bar` check, for the owner message and the quality log. */
  videoBar?: { score: number; bar: number; reason: string; mode: string; tradeSlug: string; failures: string[]; fixes: string[] };
};

export type ActivationResult = {
  activated: boolean;
  reason: string;
  version: number | null;
  publishState: string;
  readiness: ProductionReadiness;
};

/* --------------------------------- status --------------------------------- */

export const getProductionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orgIdValidator)
  .handler(async ({ data, context }): Promise<ProductionStatus> => {
    const { supabase } = context;
    // RLS: this read only succeeds for a member of this workspace.
    const { data: org, error } = await supabase
      .from("organizations")
      .select(
        "id, is_demo, is_suspended, subscription_status, trial_ends_at, created_at, setup_paid_at, setup_payment_status",
      )
      .eq("id", data.organizationId)
      .maybeSingle();
    if (error || !org) throw new Error("We couldn't verify your workspace.");

    const { data: settings } = await supabase
      .from("website_settings")
      .select("publish_state, published, last_published_at")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const { isTrialActive } = await import("@/lib/trial");
    const trialActive = isTrialActive(org as never);
    const setupPaymentStatus = ((org.setup_payment_status as SetupPaymentStatus | null) ??
      (org.setup_paid_at ? "paid" : "unpaid")) as SetupPaymentStatus;
    const paid = !!org.setup_paid_at || setupPaymentStatus === "paid";
    const { siteAccess } = await import("@/lib/site-access");
    const access = siteAccess(Object.assign({}, org, { id: data.organizationId }) as never);
    // Trial workspaces may publish too; the site goes offline if the trial
    // ends without the setup payment (see src/lib/site-access.ts).
    const unlocked = access.live;

    const accountStatus: ProductionStatus["accountStatus"] = org.is_suspended
      ? "suspended"
      : org.is_demo
        ? "demo"
        : paid || org.subscription_status === "active"
          ? "active"
          : trialActive
            ? "trial"
            : "expired";

    return {
      environment: unlocked && settings?.published ? "production" : "sandbox",
      accountStatus,
      setupPaymentStatus,
      setupPaidAt: org.setup_paid_at ?? null,
      trialEndsAt: org.trial_ends_at ?? null,
      trialActive,
      serverNow: new Date().toISOString(),
      unlocked,
      reason: org.is_suspended
        ? "This workspace is suspended."
        : access.reason === "trial"
          ? `You can publish during your free trial. Your site goes offline when the trial ends${access.offlineAt ? ` (${new Date(access.offlineAt).toUTCString()})` : ""} unless the ${usd(GROWTH_SYSTEM.setupPrice)} setup is paid. Nothing is deleted.`
          : unlocked
            ? "Production is unlocked."
            : `Your free trial has ended. Complete your ${usd(GROWTH_SYSTEM.setupPrice)} setup to put your website back online. Everything you've built is saved.`,
      liveSince: settings?.last_published_at ?? null,
      publishState: settings?.publish_state ?? "draft",
    };
  });

/* -------------------------------- readiness ------------------------------- */

async function gatherReadiness(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  organizationId: string,
  options: { liveEdit?: boolean } = {},
): Promise<ProductionReadiness> {
  const [org, profile, settings, pages, sections, services] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, is_demo, is_suspended, setup_paid_at, setup_payment_status, trial_ends_at, created_at, subscription_status")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("phone, email, city, service_area, description")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("website_settings")
      .select("seo, generation, generated_at, review_state, custom_domain, domain_status, publish_state")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("website_pages")
      .select("id, slug, is_visible")
      .eq("organization_id", organizationId),
    supabase
      .from("website_sections")
      .select("id, kind, is_visible")
      .eq("organization_id", organizationId),
    supabase
      .from("services")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);

  const p = (profile.data ?? {}) as Record<string, unknown>;
  const seo = (settings.data?.seo ?? {}) as Record<string, unknown>;
  const generation = (settings.data?.generation ?? {}) as Record<string, unknown>;
  const creative = generation["firstBuildCreative"];
  const report = generation["report"];
  const imagery = report && typeof report === "object" ? (report as Record<string, unknown>)["imagery"] : null;
  const imageStatus = imagery && typeof imagery === "object" ? String((imagery as Record<string, unknown>)["generatedStatus"] ?? "") : "";
  const aiEvidence = Boolean(settings.data?.generated_at && creative && typeof creative === "object");
  const imageEvidence = ["generated", "owner_photos"].includes(imageStatus);
  const pageRows = pages.data ?? [];
  const visibleSections = (sections.data ?? []).filter((s) => s.is_visible);
  const captureKinds = new Set(["quote", "booking", "contact", "cta", "sticky_cta"]);
  const { readSiteChrome } = await import("@/lib/builder/site-chrome");
  const siteChrome = readSiteChrome(settings.data?.generation ?? null);
  const hasChrome = Boolean(siteChrome.header && siteChrome.footer);
  const { siteAccess } = await import("@/lib/site-access");
  const access = siteAccess(org.data ? (Object.assign({}, org.data, { id: organizationId }) as never) : null);
  const unlocked = access.live;

  // Real audit of the rendered website: broken contact details, unfinished copy
  // or unsupported claims stop a publish instead of reaching customers.
  const { auditWorkspaceWebsite } = await import("@/lib/builder/quality.server");
  const quality = await auditWorkspaceWebsite(supabase as never, organizationId);
  const { QUALITY_BAND_LABEL, weakestTeamArea } = await import("@/lib/builder/quality");

  // Video bar: the site must reach the reference-video quality bar before it can go live (server-side, so the Publish
  // button, the builder's straight-to-live apply and Jarvis live edits all meet it).
  const videoBar = await evaluateVideoBarCheck(supabase, organizationId, options.liveEdit === true);

  const checks: ReadinessCheck[] = [
    {
      key: "ownership",
      label: "Website belongs to this account",
      ok: !!org.data,
      detail: org.data ? "Verified against your workspace." : "We couldn't verify ownership.",
    },
    {
      key: "payment",
      label: "Setup paid or free trial active",
      ok: unlocked,
      detail:
        access.reason === "trial"
          ? `Free trial active: you can publish now. The site goes offline when the trial ends unless the ${usd(GROWTH_SYSTEM.setupPrice)} setup is paid.`
          : unlocked
            ? `Your ${usd(GROWTH_SYSTEM.setupPrice)} setup is confirmed.`
            : `Your free trial has ended. Publishing resumes once the ${usd(GROWTH_SYSTEM.setupPrice)} setup payment is confirmed.`,
    },
    {
      key: "business",
      label: "Business details present",
      ok: !!(org.data?.name && (p["phone"] || p["email"])),
      detail: "Business name plus a phone number or email so customers can reach you.",
    },
    {
      key: "area",
      label: "Service area set",
      ok: !!(p["city"] || p["service_area"]),
      detail: "Used across your pages and local search settings.",
    },
    {
      key: "pages",
      label: "Pages built and visible",
      ok: pageRows.some((page) => page.is_visible),
      detail: `${pageRows.length} page${pageRows.length === 1 ? "" : "s"} built.`,
    },
    {
      key: "sections",
      label: "Live sections on your pages",
      ok: visibleSections.length >= 3,
      detail: `${visibleSections.length} section${visibleSections.length === 1 ? "" : "s"} visible.`,
    },
    {
      key: "capture",
      label: "A way for customers to enquire",
      // A visible contact page always renders the working message form.
      ok:
        visibleSections.some((s) => captureKinds.has(String(s.kind))) ||
        pageRows.some((page) => page.is_visible && ["contact", "contact-us", "get-in-touch"].includes(String(page.slug))),
      detail: "A quote form, booking block, contact section or contact page (with its message form) must be live.",
    },
    {
      key: "navigation",
      label: "Menu bar and footer designed",
      ok: hasChrome,
      detail: hasChrome
        ? "Visitors can move between every page from the menu and footer."
        : "This site has no menu bar or footer yet, so visitors can't move between pages. Use “Design my menu & footer” in the builder.",
    },
    {
      key: "services",
      label: "At least one active service",
      ok: (services.data ?? []).length > 0,
      detail: `${(services.data ?? []).length} active service${(services.data ?? []).length === 1 ? "" : "s"}.`,
    },
    {
      key: "seo",
      label: "Search settings filled in",
      ok: !!(seo["headline"] && seo["meta_description"]),
      detail: "Headline and meta description are used by Google and social previews.",
    },
    {
      key: "ai-evidence",
      label: "AI design evidence recorded",
      ok: aiEvidence,
      detail: aiEvidence
        ? "The AI-authored design contract is attached to this website."
        : "Run the AI website build so its design contract is recorded before launch.",
    },
    {
      key: "image-evidence",
      label: "Website pictures verified",
      ok: imageEvidence,
      detail: imageEvidence
        ? "Generated or owner-supplied pictures are recorded with the build."
        : "Add owner photos or complete AI picture generation before launch.",
    },
    {
      key: "review",
      label: "Website approved",
      ok: settings.data?.review_state === "approved",
      detail:
        settings.data?.review_state === "approved"
          ? "The current website has been approved."
          : "Review and approve the website before launch.",
    },
    {
      key: "quality",
      label: "Website quality check",
      // Both layers must pass: clean content and concrete browser evidence.
      // A stored-text score alone can never prove the pages render safely.
      ok: quality.productionReady,
      detail: !quality.ready
        ? (quality.blockers[0]?.detail ??
          `Quality score ${quality.score}/100 — ${QUALITY_BAND_LABEL[quality.band]}. ${weakestTeamArea(quality.team)}`.trim())
        : !quality.measured
          ? "The content passes. Now run the visual check so Revora can measure the pages on real phone and desktop screen sizes."
          : !quality.productionReady
            ? (quality.issues.find((item) => item.severity === "blocker")?.detail ??
              "The browser check found launch blockers. Fix those findings and run it again.")
            : `Quality score ${quality.score}/100 (${QUALITY_BAND_LABEL[quality.band]}), verified in a real browser at phone and desktop sizes.`,
    },
    videoBar.check,
    {
      key: "suspension",
      label: "No account holds",
      ok: !org.data?.is_suspended,
      detail: org.data?.is_suspended ? "This workspace is on hold." : "Account in good standing.",
    },
  ];

  return {
    passed: checks.every((c) => c.ok),
    unlocked,
    checks,
    blockers: checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`),
    ...(videoBar.summary ? { videoBar: videoBar.summary } : {}),
  };
}

/**
 * The `video-bar` readiness check. Fails closed when the score cannot be computed and the gate is enforcing.
 * Never throws.
 */
async function evaluateVideoBarCheck(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  organizationId: string,
  liveEdit: boolean,
): Promise<{ check: ReadinessCheck; summary: ProductionReadiness["videoBar"] | null }> {
  const label = "Website meets the quality bar";
  const { gateMode, decidePublish, readinessDetail, ownerBlockMessage } = await import("@/lib/builder/quality/video-publish-gate");
  const mode = gateMode();
  if (mode === "off") return { check: { key: "video-bar", label, ok: true, detail: "Quality bar check is switched off." }, summary: null };
  try {
    const { scoreWorkspaceVideoBar } = await import("@/lib/builder/quality/video-publish-gate.server");
    const { ownerFixList } = await import("@/lib/builder/quality/video-score");
    const result = await scoreWorkspaceVideoBar(supabase, organizationId, { withPrevious: liveEdit });
    const decision = decidePublish({ score: result.score.score, bar: result.score.bar, mode, liveEdit, previousScore: result.previousScore });
    return {
      check: { key: "video-bar", label, ok: decision.ok, detail: decision.ok ? readinessDetail(result.score, decision, result.previousScore) : ownerBlockMessage(result.score) },
      summary: {
        score: result.score.score,
        bar: result.score.bar,
        reason: decision.reason,
        mode,
        tradeSlug: result.tradeSlug,
        failures: result.score.criteria.filter((c) => !c.met).map((c) => c.id),
        fixes: ownerFixList(result.score),
      },
    };
  } catch {
    const ok = mode !== "enforce";
    return {
      check: { key: "video-bar", label, ok, detail: ok ? "The quality bar could not be checked just now. Publishing is still allowed." : "The quality bar could not be checked just now, so the website was not published. Try again in a moment." },
      summary: null,
    };
  }
}

export const checkProductionReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orgIdValidator)
  .handler(({ data, context }) => gatherReadiness(context.supabase, data.organizationId));

/* ------------------------------- activation ------------------------------- */

/**
 * Moves the client's existing project from sandbox to production. Nothing is
 * rebuilt, reset or deleted: the same pages, media, CRM, automations, SEO and
 * version history become the live site, and a permanent production version is
 * recorded so future edits happen in draft.
 */
export const activateProduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; videoBarOverrideReason?: string }) => {
    const { organizationId } = orgIdValidator(input);
    const reason = typeof input?.videoBarOverrideReason === "string" ? input.videoBarOverrideReason.trim().slice(0, 500) : "";
    return { organizationId, videoBarOverrideReason: reason };
  })
  .handler(({ data, context }) =>
    publishSiteNow(context.supabase, context.userId, data.organizationId, data.videoBarOverrideReason ? { videoBarOverride: { reason: data.videoBarOverrideReason } } : {}),
  );

/**
 * The one publish path: role check, payment/readiness gates, a permanent
 * production snapshot, then the live switch. Used by the Publish button and by
 * the builder's straight-to-live apply, so both keep the same gates.
 */
export async function publishSiteNow(
  supabase: Parameters<typeof gatherReadiness>[0],
  userId: string,
  orgId: string,
  options: { liveEdit?: boolean; videoBarOverride?: { reason: string } } = {},
): Promise<ActivationResult> {
  {
    const context = { supabase };

    // Ownership + role, verified server-side. Never trust a browser-supplied id.
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    const role = membership?.role ?? null;
    if (!role || !["owner", "admin", "manager"].includes(role))
      throw new Error("Only an owner, admin or manager can launch this website.");

    const readiness = await gatherReadiness(supabase, orgId, { liveEdit: options.liveEdit === true });
    const audit = async (action: string, metadata: Record<string, unknown>) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: userId,
        action,
        entity: "website",
        entity_id: orgId,
        metadata: metadata as never,
      });
    };

    const { data: openDraft } = await supabase
      .from("website_branches")
      .select("label")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .maybeSingle();
    const draftBlock = publishBlockReason(openDraft as { label: string } | null);
    if (draftBlock) {
      await audit("PUBLISH_BLOCKED", { reason: "draft_open", role });
      return {
        activated: false,
        reason: draftBlock,
        version: null,
        publishState: "draft",
        readiness,
      };
    }

    if (!readiness.unlocked) {
      await audit("PUBLISH_BLOCKED", { reason: "setup_payment_required", role });
      return {
        activated: false,
        reason: `Your free trial has ended. Complete your ${usd(GROWTH_SYSTEM.setupPrice)} setup to publish your website and connect your domain. Everything you've built stays saved.`,
        version: null,
        publishState: "draft",
        readiness,
      };
    }

    // The video bar is the one check a platform admin may override, with a written reason, and only when nothing
    // else is failing. Every override and every denied attempt is logged.
    const videoCheck = readiness.checks.find((c) => c.key === "video-bar");
    const videoFailed = !!videoCheck && !videoCheck.ok;
    const otherFailed = readiness.checks.some((c) => !c.ok && c.key !== "video-bar");
    let overridden = false;
    if (!readiness.passed && videoFailed && !otherFailed && options.videoBarOverride?.reason) {
      const { assertSuperAdmin } = await import("@/lib/admin.server");
      const isAdmin = await assertSuperAdmin(supabase as never, userId).then(() => true, () => false);
      if (isAdmin) {
        overridden = true;
        await audit("PUBLISH_VIDEO_BAR_OVERRIDE", { reason: options.videoBarOverride.reason, video_bar: readiness.videoBar ?? null, live_edit: options.liveEdit === true });
      } else {
        await audit("PUBLISH_VIDEO_BAR_OVERRIDE_DENIED", { video_bar: readiness.videoBar ?? null });
      }
    }

    if (!readiness.passed && !overridden) {
      await audit("PUBLISH_BLOCKED", {
        reason: videoFailed && !otherFailed ? "video_bar_below_bar" : "readiness_failed",
        blockers: readiness.blockers,
        ...(readiness.videoBar ? { video_bar: readiness.videoBar } : {}),
      });
      return {
        activated: false,
        // Owner-facing: when the quality bar is the only thing in the way, say exactly what to fix.
        reason: videoFailed && !otherFailed && videoCheck ? videoCheck.detail : "A few things need attention before this website can go live.",
        version: null,
        publishState: "draft",
        readiness,
      };
    }

    await audit("PUBLISH_ATTEMPTED", { role });

    // Snapshot: the live site is a permanent production version, so later edits
    // happen in draft and previous production versions are never destroyed.
    const [{ data: settings }, { data: latest }, contentSnapshot] = await Promise.all([
      supabase
        .from("website_settings")
        .select("generation, seo, pages")
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("website_versions")
        .select("version")
        .eq("organization_id", orgId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      readWebsiteState(context.supabase as never, orgId),
    ]);
    const nextVersion = Number(latest?.version ?? 0) + 1;
    const publishedAt = new Date().toISOString();

    // The production version must exist before the site is marked live, and
    // a failed snapshot must stop the launch rather than publish with no
    // matching version to return to.
    const { error: versionError } = await supabase.from("website_versions").insert({
      organization_id: orgId,
      version: nextVersion,
      label: `Production v${nextVersion}`,
      generation: settings?.generation ?? {},
      seo: settings?.seo ?? {},
      // `live_format` marks this copy as the one visitors are served until
      // the next publish (see loadLiveSnapshot).
      pages: {
        ...contentSnapshot,
        live_format: 1,
        settings_pages: settings?.pages ?? null,
      } as never,
      published_at: publishedAt,
      created_by: userId,
    });
    if (versionError) {
      await audit("DEPLOYMENT_FAILED", { message: versionError.message, stage: "snapshot" });
      throw new Error("We couldn't save this version of your website, so it was not published. Try again in a moment.");
    }

    // The database trigger independently re-checks the setup payment here.
    // `.select()` returns the rows actually changed: an update that matched no
    // website_settings row (or was filtered out) would otherwise report "live"
    // while the public-form gate (ORG_NOT_PUBLIC) still refuses every lead.
    const { data: publishedRows, error: publishError } = await supabase
      .from("website_settings")
      .update({
        publish_state: "published",
        published: true,
        last_published_at: publishedAt,
        review_state: "approved",
      })
      .eq("organization_id", orgId)
      .select("organization_id, published, publish_state");

    if (!publishError && !publishMarkedLive(publishedRows)) {
      await audit("DEPLOYMENT_FAILED", { message: "publish_update_matched_no_row", stage: "publish" });
      throw new Error("We couldn't take the website live. Nothing was lost — try again in a moment.");
    }

    if (publishError) {
      await audit("DEPLOYMENT_FAILED", { message: publishError.message });
      throw new Error(
        publishError.message.includes("PRODUCTION_LOCKED")
          ? `Complete your ${usd(GROWTH_SYSTEM.setupPrice)} setup to launch this website.`
          : "We couldn't take the website live. Nothing was lost — try again in a moment.",
      );
    }

    await audit("PRODUCTION_ACTIVATED", { version: nextVersion, published_at: publishedAt });

    // Tell Bing and the other IndexNow engines about the published pages. It
    // never throws and is throttled per site, so it cannot fail this launch.
    await import("@/lib/indexnow-site.server")
      .then(({ submitPublishedSiteToIndexNow }) => submitPublishedSiteToIndexNow(orgId))
      .catch(() => undefined);

    return {
      activated: true,
      reason: options.liveEdit
        ? "Your change is live."
        : "Your website is live. Changes Revora makes from now on go straight to the live site, with an undo point saved before each one.",
      version: nextVersion,
      publishState: "published",
      readiness,
    };
  }
}

/**
 * True when the publish update really left this workspace in a state the
 * public-submission gate accepts (website_settings.published or
 * publish_state 'published'), so a "your website is live" answer is never
 * given while visitor forms would still be refused.
 */
export function publishMarkedLive(
  rows: ReadonlyArray<{ published?: boolean | null; publish_state?: string | null }> | null | undefined,
): boolean {
  return (rows ?? []).some((row) => row.published === true || row.publish_state === "published");
}
