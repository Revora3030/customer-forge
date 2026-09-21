import { useEffect, useMemo, useState } from "react";
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
import { provisionWorkspace, recordAccountCreated } from "@/lib/platform-funnel.functions";
import { useStepScroll } from "@/lib/use-step-scroll";
import { smartIntakeValue } from "@/lib/intake-smart";
import { canonicalLink, ogUrl } from "@/lib/seo";

export const Route = createFileRoute("/get-started")({
  head: () => ({
    meta: [
      { title: "Start your Revora Growth System — $750 setup + $100/mo" },
      {
        name: "description",
        content:
          "Launch your Revora Growth System: $750 one-time setup, a first month free, then $100/month for website, CRM, booking, SEO and support.",
      },
      { property: "og:title", content: "Start your Revora Growth System" },
      {
        property: "og:description",
        content:
          "$750 one-time setup + first month free + $100/month afterward. One complete customer acquisition system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/get-started"),
    ],
    links: [canonicalLink("/get-started")],
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

const STEPS = ["Your information", "Order summary", "Payment"] as const;

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
        // Returning from account creation: go straight back to payment.
        if (restored.businessName.trim() && restored.email.trim() && restored.city.trim())
          setStep(2);
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

  useEffect(() => {
    if (session.data?.email && !intake.email) {
      setIntake((prev) => ({ ...prev, email: session.data!.email! }));
    }
  }, [session.data?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof GrowthSystemIntake) => (value: string) =>
    setIntake((prev) => ({ ...prev, [key]: value }));

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
    if (step !== 0 || !profileQuery.data || missing.length) return;
    setStep(2);
  }, [step, profileQuery.data, missing]);

  const goToSummary = () => {
    if (missing.length) {
      setError(`Add: ${missing.join(", ")}`);
      return;
    }
    setError(null);
    setStep(1);
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
  async function startFreeAccess() {
    setError(null);
    if (!signedIn) {
      navigate({ to: "/auth", search: { mode: "signup", redirect: "/get-started" } });
      return;
    }
    setStartingTrial(true);
    try {
      await ensureWorkspace();
      navigate({ to: "/app" });
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
    setProvisioning(true);
    try {
      await ensureWorkspace();
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

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        <p className="eyebrow">Get started</p>
        <h1 className="mt-2 font-display text-[clamp(1.6rem,5vw,2.3rem)] leading-tight font-semibold">
          {GROWTH_SYSTEM.headline}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          <span className="gold-hl">{usdExact(GROWTH_SYSTEM.setupPrice)} setup charged today</span>.
          Platform is{" "}
          <span className="gold-hl">
            {usdExact(0)} for your first {GROWTH_SYSTEM.trialDays} days
          </span>
          , then {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month unless canceled. One complete growth
          system — no packages to compare.
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          Just exploring? You get{" "}
          <span className="gold-hl">
            {GROWTH_SYSTEM.fullAccessWindow} of free full access
          </span>{" "}
          first — your answers below are saved as you type, so you can leave and come back anytime.
        </p>

        <ol className="mt-7 grid gap-2 sm:grid-cols-3" aria-label="Checkout steps">
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
          {step === 0 ? (
            <section className="panel mt-6 p-5">
              <h2 className="font-display text-[17px] font-semibold">
                Tell us about your business
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                This is what we use to build and configure your system — it takes about a minute.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full name"
                  value={intake.fullName}
                  onChange={set("fullName")}
                  autoComplete="name"
                  required
                />
                <Field
                  label="Business name"
                  value={intake.businessName}
                  onChange={set("businessName")}
                  autoComplete="organization"
                  required
                />
                <Field
                  label="Email"
                  type="email"
                  value={intake.email}
                  onChange={set("email")}
                  autoComplete="email"
                  required
                />
                <Field
                  label="Phone number"
                  type="tel"
                  value={intake.phone}
                  onChange={set("phone")}
                  autoComplete="tel"
                  required
                />
                <Field
                  label="Business website (optional)"
                  value={intake.website ?? ""}
                  onChange={set("website")}
                  placeholder="yourbusiness.com"
                />
                <Field
                  label="Business type"
                  value={intake.businessType}
                  onChange={set("businessType")}
                  placeholder="Mobile detailing, HVAC, landscaping…"
                  required
                />
                <Field
                  label="City"
                  value={intake.city}
                  onChange={set("city")}
                  autoComplete="address-level2"
                  required
                />
                <Field
                  label="State"
                  value={intake.state}
                  onChange={set("state")}
                  autoComplete="address-level1"
                  required
                />
                <div className="sm:col-span-2">
                  <Label htmlFor="services" className="text-[13px]">
                    Primary services <span aria-hidden="true">*</span>
                  </Label>
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
              {error ? (
                <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {error}
                </p>
              ) : null}
              <Button
                variant="signal"
                size="lg"
                className="mt-5 w-full sm:w-auto"
                onClick={goToSummary}
              >
                Continue to order summary <ArrowRight className="size-4" />
              </Button>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="panel mt-6 p-5">
              <h2 className="font-display text-[17px] font-semibold">Order summary</h2>
              <div className="mt-5 rounded-md border border-border">
                <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-[14px] font-medium">{GROWTH_SYSTEM.name}</p>
                    <p className="text-[13px] text-muted-foreground">{GROWTH_SYSTEM.setupLabel}</p>
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
                      $0 for 30 days
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
                {GROWTH_SYSTEM.explainer} Cancel anytime. No hidden fees.
              </p>
              <dl className="mt-5 grid gap-2 border-t border-border pt-4 text-[13px] sm:grid-cols-2">
                <Summary label="Name" value={intake.fullName} />
                <Summary label="Business" value={intake.businessName} />
                <Summary label="Email" value={intake.email} />
                <Summary label="Phone" value={intake.phone} />
                <Summary label="Business type" value={intake.businessType} />
                <Summary label="Location" value={`${intake.city}, ${intake.state}`} />
                {intake.website ? <Summary label="Website" value={intake.website} /> : null}
                <Summary label="Primary services" value={intake.services} />
              </dl>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" size="lg" onClick={() => setStep(0)}>
                  <ArrowLeft className="size-4" /> Edit information
                </Button>
                <Button variant="signal" size="lg" className="sm:flex-1" onClick={() => setStep(2)}>
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

          {step === 2 ? (
            <section className="mt-6 space-y-4">
              {payNow ? null : (
                <div className="panel p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <h2 className="font-display text-[17px] font-semibold">Payment</h2>
                  </div>
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {usdExact(GROWTH_SYSTEM.setupPrice)} one-time setup charged today. Your{" "}
                    {GROWTH_SYSTEM.trialDays}-day platform trial is free, then{" "}
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
                          <Link to="/auth" search={{ mode: "signup", redirect: "/get-started" }}>
                            Create account
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                          <Link to="/auth" search={{ mode: "signin", redirect: "/get-started" }}>
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

                  {step === 2 && error ? (
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
                    <Button variant="ghost" size="sm" className="mt-3" onClick={() => setStep(1)}>
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
          Questions before you start? {REVORA.phoneDisplay} ·{" "}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <Label htmlFor={id} className="text-[13px]">
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </Label>
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
