import { createServerFn } from "@tanstack/react-start";
import { publishBlockReason } from "@/lib/builder/draft-branch";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";

/**
 * Revora production activation.
 *
 * Two environments, one project:
 * - SANDBOX  — the full builder. Everything can be built, configured, tested,
 *   versioned and previewed here, on a free 1-day access window or after it.
 * - PRODUCTION — the live website, live domain and live customer-facing
 *   operations. Only unlocked once the $750 setup payment is verified.
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
  .inputValidator(orgIdValidator)
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
    const unlocked = !org.is_suspended && (paid || !!org.is_demo);

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
        : unlocked
          ? "Production is unlocked."
          : `Complete your one-time ${usd(GROWTH_SYSTEM.setupPrice)} setup to launch your website.`,
      liveSince: settings?.last_published_at ?? null,
      publishState: settings?.publish_state ?? "draft",
    };
  });

/* -------------------------------- readiness ------------------------------- */

async function gatherReadiness(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  organizationId: string,
): Promise<ProductionReadiness> {
  const [org, profile, settings, pages, sections, services] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, is_demo, is_suspended, setup_paid_at, setup_payment_status")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("phone, email, city, service_area, description")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("website_settings")
      .select("seo, custom_domain, domain_status, publish_state")
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
  const pageRows = pages.data ?? [];
  const visibleSections = (sections.data ?? []).filter((s) => s.is_visible);
  const captureKinds = new Set(["quote", "booking", "contact", "cta", "sticky_cta"]);
  const paid = !!org.data?.setup_paid_at || org.data?.setup_payment_status === "paid";
  const unlocked = !org.data?.is_suspended && (paid || !!org.data?.is_demo);

  // Real audit of the rendered website: broken contact details, unfinished copy
  // or unsupported claims stop a publish instead of reaching customers.
  const { auditWorkspaceWebsite } = await import("@/lib/builder/quality.server");
  const quality = await auditWorkspaceWebsite(supabase as never, organizationId);

  const checks: ReadinessCheck[] = [
    {
      key: "ownership",
      label: "Website belongs to this account",
      ok: !!org.data,
      detail: org.data ? "Verified against your workspace." : "We couldn't verify ownership.",
    },
    {
      key: "payment",
      label: "Setup payment verified",
      ok: unlocked,
      detail: unlocked
        ? `Your ${usd(GROWTH_SYSTEM.setupPrice)} setup is confirmed.`
        : `Production stays locked until the ${usd(GROWTH_SYSTEM.setupPrice)} setup payment is confirmed by the payment provider.`,
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
      ok: visibleSections.some((s) => captureKinds.has(String(s.kind))),
      detail: "A quote form, booking block or contact section must be live.",
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
      key: "quality",
      label: "Website quality check",
      // Both layers must pass: clean content AND a real-browser measurement at
      // 95+. A score built only from stored text can never prove the pages
      // look right, so an unmeasured website does not pass.
      ok: quality.productionReady,
      detail: !quality.ready
        ? (quality.blockers[0]?.detail ??
          `Quality score ${quality.score}/100 — a few pages still need work.`)
        : !quality.measured
          ? "The content passes. Now run the visual check so Revora can measure the pages on real phone and desktop screen sizes."
          : !quality.productionReady
            ? (quality.issues.find((item) => item.severity === "blocker")?.detail ??
              `Measured quality score ${quality.score}/100 — 95 is needed before launch. Fix the findings from the visual check and run it again.`)
            : `Quality score ${quality.score}/100, verified in a real browser at phone and desktop sizes.`,
    },
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
  };
}

export const checkProductionReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgIdValidator)
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
  .inputValidator(orgIdValidator)
  .handler(async ({ data, context }): Promise<ActivationResult> => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;

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

    const readiness = await gatherReadiness(supabase, orgId);
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
        reason: `Complete your one-time ${usd(GROWTH_SYSTEM.setupPrice)} setup to publish your website, connect your domain and go live. Everything you've built stays saved.`,
        version: null,
        publishState: "draft",
        readiness,
      };
    }

    if (!readiness.passed) {
      await audit("PUBLISH_BLOCKED", { reason: "readiness_failed", blockers: readiness.blockers });
      return {
        activated: false,
        reason: "A few things need attention before this website can go live.",
        version: null,
        publishState: "draft",
        readiness,
      };
    }

    await audit("PUBLISH_ATTEMPTED", { role });

    // Snapshot: the live site is a permanent production version, so later edits
    // happen in draft and previous production versions are never destroyed.
    const [{ data: settings }, { data: latest }] = await Promise.all([
      supabase
        .from("website_settings")
        .select("template, generation, seo, pages")
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("website_versions")
        .select("version")
        .eq("organization_id", orgId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const nextVersion = Number(latest?.version ?? 0) + 1;
    const publishedAt = new Date().toISOString();

    await supabase.from("website_versions").insert({
      organization_id: orgId,
      version: nextVersion,
      label: `Production v${nextVersion}`,
      template: settings?.template ?? null,
      generation: settings?.generation ?? {},
      seo: settings?.seo ?? {},
      pages: settings?.pages ?? {},
      published_at: publishedAt,
      created_by: userId,
    });

    // The database trigger independently re-checks the setup payment here.
    const { error: publishError } = await supabase
      .from("website_settings")
      .update({
        publish_state: "published",
        published: true,
        last_published_at: publishedAt,
        review_state: "approved",
      })
      .eq("organization_id", orgId);

    if (publishError) {
      await audit("DEPLOYMENT_FAILED", { message: publishError.message });
      throw new Error(
        publishError.message.includes("PRODUCTION_LOCKED")
          ? `Complete your one-time ${usd(GROWTH_SYSTEM.setupPrice)} setup to launch this website.`
          : "We couldn't take the website live. Nothing was lost — try again in a moment.",
      );
    }

    await audit("PRODUCTION_ACTIVATED", { version: nextVersion, published_at: publishedAt });

    return {
      activated: true,
      reason: "Your website is live. Future edits stay in draft until you publish them.",
      version: nextVersion,
      publishState: "published",
      readiness,
    };
  });
