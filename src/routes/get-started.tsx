import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GrowthSystemCheckout } from "@/components/app/GrowthSystemCheckout";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import type { GrowthSystemIntake } from "@/lib/stripe.functions";
import { supabase } from "@/integrations/supabase/client";
import { isPaymentsConfigured } from "@/lib/stripe";
import { REVORA, revoraMailto } from "@/lib/brand";
import { getAttribution, trackConversion } from "@/lib/conversion";
import { trackTrialStarted } from "@/lib/google-ads";
import { provisionWorkspace, recordAccountCreated } from "@/lib/platform-funnel.functions";
import { useStepScroll } from "@/lib/use-step-scroll";
import { smartIntakeValue } from "@/lib/intake-smart";
import { breadcrumbSchema, canonicalLink, jsonLdScript, ogUrl, OG_IMAGE_META } from "@/lib/seo";
import { useServerFn } from "@tanstack/react-start";
import { claimProspectDemo, getProspectClaim } from "@/lib/prospect-claim.functions";
import {
  CLAIM_STORAGE_KEY,
  checkoutResumeRedirect,
  claimAwareRedirect,
  isClaimToken,
} from "@/lib/prospect-claim";
import { VoiceDictateButton } from "@/components/marketing/VoiceDictateButton";
import { DraftSitePreview } from "@/components/marketing/DraftSitePreview";
import { readStarter, starterFromMetadata } from "@/components/marketing/hero-starter-utils";
import { applyImportedFacts, importExistingWebsite } from "@/lib/site-import.functions";

export const Route = createFileRoute("/get-started")({
  validateSearch: (search: Record<string, unknown>): { claim?: string; pay?: "now" } => ({
    ...(isClaimToken(search["claim"]) ? { claim: search["claim"] } : {}),
    // `pay=now` resumes checkout after sign-up / email confirmation.
    ...(search["pay"] === "now" ? { pay: "now" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Start with Revora Growth Systems — $350 setup + $100/mo" },
      {
        name: "description",
        content:
          "Start with Revora Growth Systems: $350 setup, first month free, then $100/month for website, CRM, booking, SEO and support.",
      },
      { property: "og:title", content: "Start with Revora Growth Systems" },
      {
        property: "og:description",
        content:
          "$350 setup, first month free, then $100/month. One complete customer acquisition system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/get-started"),
      ...OG_IMAGE_META,
    ],
    links: [canonicalLink("/get-started")],
    scripts: [jsonLdScript(breadcrumbSchema([{ name: "Revora", path: "/" }, { name: "Get started", path: "/get-started" }]))],
  }),
  component: GetStarted,
});

const STORAGE_KEY = "revora.getstarted.intake";

const EMPTY: GrowthSystemIntake = {
  fullName: "",
  businessName: "",
  email: "",
  phone: "",
  website: "",
  businessType: "",
  city: "",
  state: "",
  services: "",
};

const STEPS = ["Your business", "Draft preview", "Order summary", "Payment"] as const;
const STEP_QUICK = 0;
const STEP_PREVIEW = 1;
const STEP_SUMMARY = 2;
const STEP_PAYMENT = 3;

function GetStarted() {
  const [step, setStep] = useState(0);
  const stepRef = useStepScroll<HTMLDivElement>(step);
  const [intake, setIntake] = useState<GrowthSystemIntake>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [payNow, setPayNow] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const loadClaim = useServerFn(getProspectClaim);
  const claimDemo = useServerFn(claimProspectDemo);
  // A Jarvis demo being claimed. Kept in localStorage so it survives sign-up,
  // email confirmation in a new tab, and Google sign-in redirects.
  const [claimToken, setClaimToken] = useState<string | null>(null);
  useEffect(() => {
    let token: string | null = search.claim ?? null;
    try {
      if (token) localStorage.setItem(CLAIM_STORAGE_KEY, token);
      else {
        const saved = localStorage.getItem(CLAIM_STORAGE_KEY);
        token = isClaimToken(saved) ? saved : null;
      }
    } catch {
      /* storage unavailable: the URL token still works */
    }
    setClaimToken(token);
  }, [search.claim]);
  const forgetClaim = () => {
    try {
      localStorage.removeItem(CLAIM_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setClaimToken(null);
  };
  const claimInfo = useQuery({
    queryKey: ["get-started", "claim", claimToken],
    enabled: Boolean(claimToken),
    queryFn: () => loadClaim({ data: { token: claimToken! } }),
    retry: false,
  });
  const claiming = Boolean(claimToken && claimInfo.data?.claimable);

  const session = useQuery({
    queryKey: ["get-started", "session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user)
        return { userId: null as string | null, organizationId: null as string | null };
      const { data: membership } = await supabase
        .from("memberships")
        .select("organization_id, role")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      // Already paying? The Pay button must never lead into a Stripe iframe
      // that can only fail with "workspace already has a subscription".
      let hasActiveSubscription = false;
      if (membership?.organization_id) {
        // Only a real (live) Stripe subscription counts as "already paying" —
        // sandbox rows must never block a real customer's checkout.
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("organization_id", membership.organization_id)
          .eq("payment_provider", "stripe")
          .eq("environment", "live")
          .in("status", ["active", "trialing"])
          .limit(1);
        hasActiveSubscription = (subs ?? []).length > 0;
      }
      return {
        userId: data.user.id,
        organizationId: membership?.organization_id ?? null,
        email: data.user.email ?? null,
        hasActiveSubscription,
      };
    },
  });

  // The org may already have everything Revora needs (from a prior session, a
  // different device, or the dashboard's own business-info panel) — reuse it
  // instead of asking the client to retype their business details.
  const profileQuery = useQuery({
    queryKey: ["get-started", "profile", session.data?.organizationId],
    enabled: Boolean(session.data?.organizationId),
    queryFn: async () => {
      const orgId = session.data!.organizationId!;
      const [{ data: org }, { data: profile }] = await Promise.all([
        supabase.from("organizations").select("name, industry").eq("id", orgId).maybeSingle(),
        supabase
          .from("business_profiles")
          .select("owner_name, owner_email, email, phone, website, city, state, description")
          .eq("organization_id", orgId)
          .maybeSingle(),
      ]);
      return { org, profile };
    },
  });

  // Restore anything typed before signing in, so nothing is re-entered.
  useEffect(() => {
    trackConversion("signup_started");
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const restored = { ...EMPTY, ...(JSON.parse(saved) as GrowthSystemIntake) };
        setIntake(restored);
        // Returning from account creation: go straight back to payment if
        // everything checkout needs is saved, otherwise to the draft preview.
        if (restored.businessName.trim() && restored.email.trim() && restored.city.trim() && restored.phone.trim())
          setStep(STEP_PAYMENT);
        else if (restored.businessName.trim() && restored.businessType.trim() && restored.city.trim())
          setStep(STEP_PREVIEW);
      }
    } catch {
      /* ignore unreadable drafts */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intake));
    } catch {
      /* storage unavailable */
    }
  }, [intake]);

  useEffect(() => {
    if (session.data?.organizationId) setOrganizationId(session.data.organizationId);
  }, [session.data?.organizationId]);

  // What the visitor typed on the homepage (or told Jarvis) and the name they
  // signed up with fill empty fields, so nobody types the same thing twice.
  // The starter stays saved for onboarding, which clears it.
  useEffect(() => {
    const localStarter = readStarter();
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      // Same device: localStorage. Another device (email confirmed elsewhere):
      // the copy saved on the account at sign-up.
      const starter = localStarter ?? starterFromMetadata(meta);
      const signupName = typeof meta["full_name"] === "string" ? meta["full_name"].slice(0, 120) : "";
      setIntake((prev) => ({
        ...prev,
        fullName: prev.fullName || signupName,
        email: prev.email || data.user?.email || "",
        businessName: prev.businessName || starter?.businessName || "",
        businessType: prev.businessType || starter?.industry || "",
        website: prev.website || starter?.website || "",
        services: prev.services || starter?.about || "",
      }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fill in anything the org already has on file — never overwrite something
  // the client already typed (or restored from a saved draft) this session.
  useEffect(() => {
    if (!profileQuery.data) return;
    const { org, profile } = profileQuery.data;
    setIntake((prev) => ({
      ...prev,
      fullName: prev.fullName || profile?.owner_name || "",
      businessName: prev.businessName || org?.name || "",
      email: prev.email || profile?.owner_email || profile?.email || "",
      phone: prev.phone || profile?.phone || "",
      website: prev.website || profile?.website || "",
      businessType: prev.businessType || org?.industry || "",
      city: prev.city || profile?.city || "",
      state: prev.state || profile?.state || "",
      services: prev.services || profile?.description || "",
    }));
  }, [profileQuery.data]);

  // Pre-fill what the demo already knows; never overwrite anything typed.
  useEffect(() => {
    const info = claimInfo.data;
    if (!info?.claimable) return;
    setIntake((prev) => ({
      ...prev,
      businessName: prev.businessName || info.businessName || "",
      businessType: prev.businessType || info.industry || "",
      phone: prev.phone || info.phone || "",
      city: prev.city || info.city || "",
      state: prev.state || info.state || "",
      services: prev.services || info.services.join(", "),
    }));
  }, [claimInfo.data]);

  useEffect(() => {
    if (session.data?.email && !intake.email) {
      setIntake((prev) => ({ ...prev, email: session.data!.email! }));
    }
  }, [session.data?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof GrowthSystemIntake) => (value: string) =>
    setIntake((prev) => ({ ...prev, [key]: value }));

  // The three answers needed for the free draft preview and the free trial.
  const quickMissing = useMemo(() => {
    const problems: string[] = [];
    if (!intake.businessName.trim()) problems.push("Business name");
    if (!intake.businessType.trim()) problems.push("What you do");
    if (!intake.city.trim()) problems.push("City");
    return problems;
  }, [intake.businessName, intake.businessType, intake.city]);

  // Everything the paid checkout needs (collected only when paying).
  const missing = useMemo(() => {
    const problems: string[] = [];
    if (!intake.fullName.trim()) problems.push("Full name");
    if (!intake.businessName.trim()) problems.push("Business name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(intake.email.trim())) problems.push("Email");
    if (intake.phone.replace(/\D/g, "").length < 10) problems.push("Phone number");
    if (!intake.businessType.trim()) problems.push("Business type");
    if (!intake.city.trim()) problems.push("City");
    if (!intake.state.trim()) problems.push("State");
    if (!intake.services.trim()) problems.push("Primary services");
    return problems;
  }, [intake]);

  // Everything required is already on file — skip straight to payment instead
  // of re-asking for it. Still editable: "Edit information" goes back.
  useEffect(() => {
    if (step !== STEP_QUICK || !profileQuery.data || missing.length) return;
    setStep(STEP_PAYMENT);
  }, [step, profileQuery.data, missing]);

  const goToPreview = () => {
    if (quickMissing.length) {
      setError(`Add: ${quickMissing.join(", ")}`);
      return;
    }
    setError(null);
    setStep(STEP_PREVIEW);
  };

  const goToPayment = () => {
    if (missing.length) {
      setError(`Add: ${missing.join(", ")}`);
      return;
    }
    setError(null);
    setStep(STEP_PAYMENT);
  };

  const signedIn = Boolean(session.data?.userId);
  const cardsReady = isPaymentsConfigured();
  const alreadySubscribed = Boolean(session.data?.hasActiveSubscription);

  /**
   * A brand-new account has no workspace yet (that normally happens during
   * onboarding), which used to block checkout entirely. Provisioning runs in a
   * single server-side transaction and is idempotent: refreshes, retries and
   * double clicks always return the SAME workspace instead of creating another.
   */
  async function ensureWorkspace(): Promise<string> {
    if (organizationId) return organizationId;
    const existing = session.data?.organizationId ?? null;
    if (claiming && existing)
      throw new Error(
        "This account already has a Revora workspace. Sign up with a different email to claim this website, or contact us and we'll move it for you.",
      );
    if (existing) {
      setOrganizationId(existing);
      return existing;
    }
    const attribution = getAttribution();
    // Authoritative account record (one row per auth user, database-enforced).
    await recordAccountCreated({
      data: {
        landingPath: attribution?.landingPath ?? null,
        referrer: attribution?.referrer ?? null,
        utmSource: attribution?.utmSource ?? null,
        utmCampaign: attribution?.utmCampaign ?? null,
      },
    }).catch(() => undefined);

    if (claiming && claimToken) {
      const { organizationId: claimed } = await claimDemo({ data: { token: claimToken } });
      forgetClaim();
      setOrganizationId(claimed);
      return claimed;
    }

    const { organizationId: provisioned } = await provisionWorkspace({
      data: {
        name: intake.businessName.trim() || "My business",
        industry: intake.businessType.trim() || null,
        email: intake.email.trim() || null,
        phone: intake.phone.trim() || null,
        city: intake.city.trim() || null,
        state: intake.state.trim() || null,
        website: intake.website?.trim() || null,
        description: intake.services.trim() || null,
      },
    });

    setOrganizationId(provisioned);
    return provisioned;
  }

  /** Start the free full-access trial: provision the workspace, then open the app. */
  // A visitor who gave their current website gets its details (contact,
  // hours, services, logo, photo) added to the new workspace, into empty
  // fields only, without waiting on it.
  const readSite = useServerFn(importExistingWebsite);
  const saveSiteFacts = useServerFn(applyImportedFacts);
  function importWebsiteInBackground(orgId: string) {
    const website = intake.website?.trim() ?? "";
    if (website.length < 4) return;
    void (async () => {
      try {
        const result = await readSite({ data: { url: website } });
        if (result.ok) await saveSiteFacts({ data: { organizationId: orgId, url: result.url, facts: result.facts } });
      } catch {
        /* the owner can import it later from Settings */
      }
    })();
  }

  async function startFreeAccess() {
    setError(null);
    if (!signedIn) {
      // The claim token rides in the redirect so it survives email confirmation
      // or a magic link opened in another browser (empty localStorage).
      navigate({ to: "/auth", search: { mode: "signup", redirect: claimAwareRedirect(claimToken) } });
      return;
    }
    setStartingTrial(true);
    try {
      const wasClaim = claiming;
      const orgId = await ensureWorkspace();
      if (!wasClaim && orgId) importWebsiteInBackground(orgId);
      // The trial genuinely starts here — tell Google Ads the ad worked.
      void trackTrialStarted();
      // A claimed demo already has a website: open it in the builder.
      navigate({ to: wasClaim ? "/app/website" : "/app" });
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "We could not start your free access. Please try again.",
      );
    } finally {
      setStartingTrial(false);
    }
  }

  async function startPayment() {
    setError(null);
    if (!signedIn) {
      // Paying needs an account. Send the visitor to sign-up with `pay=now` in
      // the redirect so checkout resumes on its own once they are signed in.
      navigate({
        to: "/auth",
        search: { mode: "signup", redirect: checkoutResumeRedirect(claimToken) },
      });
      return;
    }
    setProvisioning(true);
    try {
      const orgId = await ensureWorkspace();
      if (!claiming && orgId) importWebsiteInBackground(orgId);
      setPayNow(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "We could not prepare your workspace. Please try again.",
      );
    } finally {
      setProvisioning(false);
    }
  }

  // Back from sign-up / email confirmation with `pay=now`: resume checkout
  // once, as soon as the account is known. Missing details send the visitor to
  // the form first instead of a checkout that would reject them.
  const resumedPayment = useRef(false);
  useEffect(() => {
    if (search.pay !== "now" || resumedPayment.current) return;
    if (session.isLoading || !signedIn) return;
    if (profileQuery.isLoading || (claimToken && claimInfo.isLoading)) return;
    resumedPayment.current = true;
    navigate({
      to: "/get-started",
      search: search.claim ? { claim: search.claim } : {},
      replace: true,
    });
    if (alreadySubscribed || !cardsReady) {
      setStep(STEP_PAYMENT);
      return;
    }
    if (missing.length) {
      setStep(STEP_SUMMARY);
      setError(`Add: ${missing.join(", ")} — then continue to payment.`);
      return;
    }
    setStep(STEP_PAYMENT);
    void startPayment();
    // startPayment is recreated each render; this runs once per pay=now visit.
  }, [search.pay, search.claim, session.isLoading, profileQuery.isLoading, signedIn, claimToken, claimInfo.isLoading, alreadySubscribed, cardsReady, missing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        {claiming ? (
          <div role="status" className="mb-6 rounded-lg border border-primary/40 bg-primary/10 p-4 text-[13.5px]">
            <p className="font-semibold">
              You're claiming the website built for {claimInfo.data?.businessName ?? "your business"}.
            </p>
            <p className="mt-1 text-muted-foreground">
              We've filled in what we already know. Create your account and the site moves into your own
              workspace with {GROWTH_SYSTEM.fullAccessWindow} of free full access.
            </p>
          </div>
        ) : claimToken && claimInfo.data && !claimInfo.data.claimable ? (
          <div role="alert" className="mb-6 rounded-lg border border-border bg-card p-4 text-[13.5px]">
            This website link can no longer be claimed. It may already be claimed, or the link expired.{" "}
            <button type="button" className="underline" onClick={forgetClaim}>
              Start fresh instead
            </button>
          </div>
        ) : null}
        <p className="eyebrow">Get started</p>
        <h1 className="mt-2 font-editorial text-balance text-[clamp(1.6rem,5vw,2.3rem)] leading-tight">
          {GROWTH_SYSTEM.headline}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          <span className="gold-hl">{usdExact(GROWTH_SYSTEM.setupPrice)} setup</span>.
          Platform{" "}
          <span className="gold-hl">{GROWTH_SYSTEM.firstMonthFree}</span>, then{" "}
          {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month unless canceled. One complete growth
          system — no packages to compare.
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          Just exploring? You get{" "}
          <span className="gold-hl">
            {GROWTH_SYSTEM.fullAccessWindow} of free full access
          </span>{" "}
          first, with no card needed. Answer three quick questions and see a free draft of your site
          before you sign up. Your answers are saved as you type.
        </p>

        <ol className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Steps">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] ${
                step === index
                  ? "border-primary/50 bg-primary/10 font-semibold text-primary"
                  : step > index
                    ? "border-border bg-card text-muted-foreground"
                    : "border-border text-muted-foreground"
              }`}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]">
                {step > index ? <Check className="size-3 text-primary" /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div ref={stepRef}>
          {step === STEP_QUICK ? (
            <section className="panel mt-6 p-5">
              <h2 className="font-display text-[17px] font-semibold">Tell us about your business</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Three quick answers and you'll see a free draft of your website. No account needed yet.
              </p>
              <form
                className="mt-5 grid gap-4 sm:grid-cols-2"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  goToPreview();
                }}
              >
                <div className="sm:col-span-2">
                  <Field
                    label="Business name"
                    value={intake.businessName}
                    onChange={set("businessName")}
                    autoComplete="organization"
                    required
                  />
                </div>
                <Field
                  label="What you do"
                  value={intake.businessType}
                  onChange={set("businessType")}
                  placeholder="Mobile detailing, HVAC, landscaping…"
                  required
                  dictate
                />
                <Field
                  label="City"
                  value={intake.city}
                  onChange={set("city")}
                  autoComplete="address-level2"
                  required
                />
                {error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive sm:col-span-2"
                  >
                    {error}
                  </p>
                ) : null}
                <div className="sm:col-span-2">
                  <Button type="submit" variant="signal" size="lg" className="w-full sm:w-auto">
                    See my free draft <ArrowRight className="size-4" />
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          {step === STEP_PREVIEW ? (
            <section className="mt-6 space-y-4" aria-labelledby="draft-preview-heading">
              <div className="panel p-5">
                <h2 id="draft-preview-heading" className="font-display text-[17px] font-semibold">
                  Your free draft preview
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Built from the three answers you just gave. This is a draft for illustration; your real
                  site is built from your details and fully editable.
                </p>
                <div className="mt-4">
                  <DraftSitePreview
                    businessName={intake.businessName}
                    businessType={intake.businessType}
                    city={intake.city}
                    state={intake.state}
                    services={intake.services}
                  />
                </div>
                <Button variant="ghost" size="sm" className="mt-3" onClick={() => setStep(STEP_QUICK)}>
                  <ArrowLeft className="size-4" /> Change my answers
                </Button>
              </div>
              <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
                <p className="text-[13px] font-semibold">
                  <span className="gold-text">Like it?</span> Start your {GROWTH_SYSTEM.fullAccessWindowAdjective} free trial, no card needed
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Create your account to open your workspace with the website builder, leads, quotes, bookings,
                  automations and analytics unlocked for {GROWTH_SYSTEM.fullAccessWindow}. Your answers are saved.
                </p>
                {error ? (
                  <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    variant="signal"
                    size="lg"
                    className="h-auto w-full py-3 leading-snug whitespace-normal sm:w-auto"
                    disabled={startingTrial}
                    onClick={startFreeAccess}
                  >
                    <Sparkles className="size-4" aria-hidden="true" />{" "}
                    {startingTrial
                      ? "Opening your workspace…"
                      : signedIn
                        ? `Start ${GROWTH_SYSTEM.fullAccessWindow} free, no card`
                        : `Create account: ${GROWTH_SYSTEM.fullAccessWindow} free, no card`}
                  </Button>
                  <Button variant="outline" size="lg" className="w-full sm:w-auto" onClick={() => setStep(STEP_SUMMARY)}>
                    Or launch now: {usdExact(GROWTH_SYSTEM.setupPrice)} setup <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {step === STEP_SUMMARY ? (
            <section className="panel mt-6 p-5">
              <h2 className="font-display text-[17px] font-semibold">Order summary</h2>
              <div className="mt-5 rounded-md border border-border">
                <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-[14px] font-medium">{GROWTH_SYSTEM.name}</p>
                    <p className="text-[13px] text-muted-foreground">Implementation and customization of your system.</p>
                  </div>
                  <p className="tnum text-[15px] font-semibold whitespace-nowrap">
                    {usdExact(GROWTH_SYSTEM.setupPrice)}
                  </p>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-[14px] font-medium">Monthly subscription</p>
                    <p className="text-[13px] text-muted-foreground">
                      {GROWTH_SYSTEM.monthlyLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-[15px] font-semibold whitespace-nowrap text-primary">
                      First month free
                    </p>
                    <p className="tnum text-[13px] whitespace-nowrap text-muted-foreground">
                      {GROWTH_SYSTEM.trialDays} days after setup
                    </p>
                    <p className="tnum text-[13px] whitespace-nowrap text-muted-foreground">
                      then {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month
                    </p>
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <p className="text-[13px] font-medium">Charged today</p>
                  <p className="tnum text-[17px] font-semibold">
                    {usdExact(GROWTH_SYSTEM.setupPrice)}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                {usdExact(GROWTH_SYSTEM.setupPrice)} setup, charged today. Your first month of the {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month platform fee is free, and your first monthly payment is charged 30 days later unless canceled. Cancel anytime. No hidden fees.
              </p>
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="font-display text-[15px] font-semibold">Details for your order</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Needed only to launch now. Skip this and use the free trial below if you're not paying yet.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" value={intake.fullName} onChange={set("fullName")} autoComplete="name" required />
                  <Field label="Email" type="email" value={intake.email} onChange={set("email")} autoComplete="email" required />
                  <Field label="Phone number" type="tel" value={intake.phone} onChange={set("phone")} autoComplete="tel" required />
                  <Field label="State" value={intake.state} onChange={set("state")} autoComplete="address-level1" required />
                  <div className="sm:col-span-2">
                    <Field
                      label="Business website (optional)"
                      value={intake.website ?? ""}
                      onChange={set("website")}
                      placeholder="yourbusiness.com"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-start justify-between gap-2">
                      <Label htmlFor="services" className="text-[13px]">
                        Primary services <span aria-hidden="true">*</span>
                      </Label>
                      <VoiceDictateButton
                        value={intake.services}
                        onText={(text) => set("services")(text)}
                        label="primary services"
                      />
                    </div>
                    <textarea
                      id="services"
                      value={intake.services}
                      onChange={(event) => set("services")(event.target.value)}
                      rows={3}
                      className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Interior + exterior detailing, ceramic coating, fleet cleaning"
                      required
                    />
                  </div>
                </div>
                <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
                  <Summary label="Business" value={intake.businessName} />
                  <Summary label="What you do" value={intake.businessType} />
                  <Summary label="City" value={intake.city} />
                </dl>
              </div>
              {error ? (
                <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" size="lg" onClick={() => setStep(STEP_PREVIEW)}>
                  <ArrowLeft className="size-4" /> Back to my draft
                </Button>
                <Button variant="signal" size="lg" className="sm:flex-1" onClick={goToPayment}>
                  Continue to secure payment <ArrowRight className="size-4" />
                </Button>
              </div>
              <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-4">
                <p className="text-[13px] font-semibold">
                  <span className="gold-text">Not paying yet?</span> Start your{" "}
                  {GROWTH_SYSTEM.fullAccessWindow} of free full access
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Your business info is saved and your workspace opens instantly — website builder,
                  leads, quotes, bookings, automations and analytics, all unlocked for{" "}
                  {GROWTH_SYSTEM.fullAccessWindow}. No card required.
                </p>
                <Button
                  variant="signal"
                  size="lg"
                  className="mt-3 h-auto w-full py-3 leading-snug whitespace-normal sm:w-auto"
                  disabled={startingTrial}
                  onClick={startFreeAccess}
                >
                  <Sparkles className="size-4" aria-hidden="true" />{" "}
                  {startingTrial
                    ? "Opening your workspace…"
                    : signedIn
                      ? `Start ${GROWTH_SYSTEM.fullAccessWindow} free — no card`
                      : `Create account — ${GROWTH_SYSTEM.fullAccessWindow} free`}
                </Button>
              </div>
            </section>
          ) : null}

          {step === STEP_PAYMENT ? (
            <section className="mt-6 space-y-4">
              {payNow ? null : (
                <div className="panel p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <h2 className="font-display text-[17px] font-semibold">Payment</h2>
                  </div>
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {usdExact(GROWTH_SYSTEM.setupPrice)} setup, charged today. Platform{" "}
                    {GROWTH_SYSTEM.firstMonthFree}, then{" "}
                    {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month automatically unless canceled.
                    Payments are processed securely by our payment provider — Revora never sees your
                    card details.
                  </p>

                  {session.isLoading ? (
                    <p className="mt-4 text-[13px] text-muted-foreground">Checking your account…</p>
                  ) : !signedIn ? (
                    <div className="mt-4 rounded-md border border-border bg-muted/30 p-4">
                      <p className="text-[13px] font-medium">Create your Revora account to pay</p>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        Your details are saved on this device, so nothing is re-entered. After
                        creating your account you'll come straight back here to complete payment.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button asChild variant="signal" size="lg">
                          <Link to="/auth" search={{ mode: "signup", redirect: checkoutResumeRedirect(claimToken) }}>
                            Create account
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                          <Link to="/auth" search={{ mode: "signin", redirect: checkoutResumeRedirect(claimToken) }}>
                            I already have an account
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : alreadySubscribed ? (
                    <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-4">
                      <p className="text-[13px] font-medium">
                        Your workspace already has an active Revora subscription.
                      </p>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        There's nothing else to pay here. Manage your plan, payment method or
                        invoices from billing.
                      </p>
                      <Button asChild variant="signal" size="lg" className="mt-3">
                        <Link to="/app/billing">Manage subscription</Link>
                      </Button>
                    </div>
                  ) : !cardsReady ? (
                    <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                      Card checkout is not configured for this build yet, so no payment can be
                      taken. Contact{" "}
                      <a className="underline" href={revoraMailto("Revora checkout")}>
                        {REVORA.email}
                      </a>
                      .
                    </p>
                  ) : payNow ? null : (
                    <Button
                      variant="signal"
                      size="lg"
                      className="mt-4 h-auto w-full py-3 leading-snug whitespace-normal sm:w-auto"
                      disabled={provisioning}
                      onClick={startPayment}
                    >
                      <Lock className="size-4" />{" "}
                      {provisioning
                        ? "Preparing your workspace…"
                        : `Pay ${usdExact(GROWTH_SYSTEM.setupPrice)} today`}
                    </Button>
                  )}

                  {step === STEP_PAYMENT && error ? (
                    <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                      {error}
                    </p>
                  ) : null}

                  {!payNow && !alreadySubscribed ? (
                    <>
                      <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-4">
                        <p className="text-[13px] font-semibold">
                          <span className="gold-text">Not paying yet?</span> Start your{" "}
                          {GROWTH_SYSTEM.fullAccessWindow} of free full access
                        </p>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          Your business info is saved and your workspace opens instantly — website
                          builder, leads, quotes, bookings, automations and analytics, all unlocked
                          for {GROWTH_SYSTEM.fullAccessWindow}. No card required.
                        </p>
                        <Button
                          variant="signal"
                          size="lg"
                          className="mt-3 h-auto w-full py-3 leading-snug whitespace-normal sm:w-auto"
                          disabled={startingTrial}
                          onClick={startFreeAccess}
                        >
                          <Sparkles className="size-4" aria-hidden="true" />{" "}
                          {startingTrial
                            ? "Opening your workspace…"
                            : signedIn
                              ? `Start ${GROWTH_SYSTEM.fullAccessWindow} free — no card`
                              : `Create account — ${GROWTH_SYSTEM.fullAccessWindow} free`}
                        </Button>
                      </div>
                    </>
                  ) : null}

                  {!payNow ? (
                    <Button variant="ghost" size="sm" className="mt-3" onClick={() => setStep(STEP_SUMMARY)}>
                      <ArrowLeft className="size-4" /> Back to summary
                    </Button>
                  ) : null}
                </div>
              )}

              {payNow && signedIn && cardsReady && !alreadySubscribed && organizationId ? (
                <GrowthSystemCheckout
                  organizationId={organizationId}
                  intake={intake}
                  onClose={() => setPayNow(false)}
                />
              ) : null}
            </section>
          ) : null}
        </div>

        <p className="mt-8 text-[13px] text-muted-foreground">
          Questions before you start?{" "}
          <a className="text-primary hover:underline" href={revoraMailto("Revora Growth System")}>
            {REVORA.email}
          </a>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
  dictate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  dictate?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <Label htmlFor={id} className="text-[13px]">
          {label} {required ? <span aria-hidden="true">*</span> : null}
        </Label>
        {dictate ? <VoiceDictateButton value={value} onText={onChange} label={label} /> : null}
      </div>
      <Input
        id={id}
        className="mt-1.5"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined}
        autoCapitalize={type === "email" ? "none" : "words"}
        spellCheck={type === "email" ? false : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          const key =
            type === "tel"
              ? "phone"
              : type === "email"
                ? "email"
                : autoComplete === "address-level2"
                  ? "city"
                  : autoComplete === "organization"
                    ? "name"
                    : "other";
          onChange(smartIntakeValue(key, event.target.value));
        }}
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="">{value || "—"}</dd>
    </div>
  );
}
